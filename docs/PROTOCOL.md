# EarthSonar Controller Protocol

The EarthSonar controller is an Arduino with:

- one joystick,
- one potentiometer,
- one push button,
- four vibration motors.

It talks to the EarthSonar web page (https://earthsonar.vercel.app) over a USB cable through the browser's
[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API). The
connection needs no server, no Wi-Fi and no drivers beyond the standard Arduino USB serial.

The website works fully without the controller. The controller is an extra, tactile layer.

Firmware: [`firmware/earthsonar_controller/earthsonar_controller.ino`](../firmware/earthsonar_controller/earthsonar_controller.ino)

---

## 1. Serial settings

| Setting | Value |
|---|---|
| Baud rate | **115200** |
| Format | 8 data bits, no parity, 1 stop bit (8N1) |
| Encoding | plain ASCII |
| Line ending | `\n` (the receiver also accepts and ignores `\r`) |
| Maximum line length | 31 characters; longer lines are discarded |

Browser requirements:

- desktop **Chrome or Edge** only;
- the page must be opened over `https://` or from `localhost`;
- **close the Arduino IDE Serial Monitor**, because only one program can hold the port.

---

## 2. Design rules

1. **Every message carries the full state** of one thing, never a delta. A lost or corrupted
   line is simply replaced by the next one.
2. Fields are separated by commas. The first field is a single uppercase letter: the message
   type.
3. Receivers **ignore** unknown types, wrong field counts and non-numeric values. They never
   crash and never reply with errors.
4. Numbers are clamped to their documented range on both sides.
5. **Motor safety timeout:** if the board receives no `M` line for **500 ms**, it switches all
   motors off. The page must keep sending `M` lines (at about 20–30 Hz) while vibration is
   wanted.

---

## 3. Board → page

| Message | Fields | Range | When sent |
|---|---|---|---|
| `H,EarthSonar,1` | name, protocol version | — | Once after boot, and as a reply to `?` |
| `J,x,y` | joystick X and Y | −100…100 each, 0 at rest | When either value changes by ≥ 3, and at least every 250 ms |
| `P,v` | potentiometer | 0…1000 | When it changes by ≥ 8, and at least every 250 ms |
| `B,id,state` | button id, state | id: `1` main button, `2` joystick press; state: `1` pressed, `0` released | On every debounced change (20 ms debounce) |

Details:

- **Joystick axes.** `x` is positive to the **east (right)**. `y` is positive to the
  **north (up)**. A dead zone of ±8 around the center is reported as 0. If the stick is
  mounted rotated, fix it with the `INVERT_X`, `INVERT_Y` and `SWAP_XY` flags in the firmware,
  not on the page.
- **Potentiometer.** The page maps `0…1000` onto its own list. For example, night-lights years
  2012…2023 are 12 equal steps.
- **Buttons.** The page acts on `state = 1` (press). Releases are sent so the page can detect a
  long press if it wants to.

## 4. Page → board

| Message | Fields | Range | Meaning |
|---|---|---|---|
| `M,n,e,s,w` | motor strength north, east, south, west | 0…255 each | Sets the PWM duty of all four motors. Refreshes the 500 ms safety timer. |
| `S` | — | — | Stop: all motors off immediately. |
| `?` | — | — | Ask the board to identify itself; it answers `H,EarthSonar,1`. |

Motors spin only above a minimum duty, about 60–90 depending on the motor. The **firmware**
handles this: any non-zero value is mapped onto `MOTOR_MIN_DUTY…255`, so the page can send
smooth 0…255 values.

With fewer motors, connect only what you have:

| Motors fitted | What the page sends | What you feel |
|---|---|---|
| 1 | `n` | Overall data value |
| 2 | `w` (left) and `e` (right) | Stereo, like the sound |
| 4 | all four | Tactile compass |

---

## 5. Example session

`>` is page → board, `<` is board → page.

```
< H,EarthSonar,1          board has booted
> ?                       page connected, asks who is there
< H,EarthSonar,1
< J,0,0                   periodic state
< P,412
< J,0,57                  stick pushed up (north)
< J,0,100
< B,1,1                   main button pressed  -> page starts a ring scan
< B,1,0
> M,0,180,0,40            data strong to the east, weak to the west
> M,0,200,0,35
> M,20,140,10,0
< P,655                   knob turned -> page changes the year
> M,0,0,0,0
> S                       page stops the scan
```

A corrupted line such as `J,1` (garbled) or `M,300,x` is ignored. The next valid line restores
the correct state.

---

## 6. Wiring (Arduino Uno / Nano, 5 V)

### 6.1 Pin map

| Part | Part pin | Arduino pin |
|---|---|---|
| Joystick | VRx | **A0** |
| Joystick | VRy | **A1** |
| Joystick | SW (press) | **D2** (internal pull-up, pressed = LOW) |
| Joystick | +5V / GND | 5V / GND |
| Potentiometer | wiper (middle) | **A2** |
| Potentiometer | outer legs | 5V and GND |
| Push button | one leg | **D4** (internal pull-up, pressed = LOW) |
| Push button | other leg | GND |
| Motor North driver | transistor base via 1 kΩ | **D3** (PWM) |
| Motor East driver | transistor base via 1 kΩ | **D5** (PWM) |
| Motor South driver | transistor base via 1 kΩ | **D6** (PWM) |
| Motor West driver | transistor base via 1 kΩ | **D9** (PWM) |
| Status LED | built-in | D13 (lights while any motor is on) |

On these boards D3, D5, D6 and D9 are all PWM-capable.

### 6.2 One motor driver (repeat four times)

```
                 +5V (USB for 1–2 motors, external 5 V supply for 4)
                  │
                  ├──────────────┐
                  │              │
              [22–33 Ω]       ──┴──  1N4007 or 1N4148
                  │           ──▲──  (cathode stripe toward +5V)
               (MOTOR)          │
                  │              │
                  ├──────────────┘
                  │
                  C
   Dx ──[1 kΩ]──B   NPN 2N2222 or S8050
                  E
                  │
                 GND  (common with Arduino GND)
```

- **Motor:** 3 V coin vibration motor. The 22–33 Ω series resistor drops 5 V to roughly 3 V.
- **Diode:** goes across the motor (in parallel), cathode to +5 V. It absorbs the voltage spike
  when the motor switches off.
- **Transistor:** NPN, emitter to GND, collector to the motor, base to the Arduino pin through
  1 kΩ.
- **Power:** take motor power from the **5V** rail, never from a signal pin or from 3.3V.

### 6.3 Power budget

- One coin motor draws roughly 60–100 mA. Check your motor's datasheet.
- **1–2 motors:** USB power is fine.
- **4 motors:** use a separate 5 V supply (a USB power bank or a 5 V adapter) for the motor
  rail, and **connect its GND to the Arduino GND**. Without a common ground the transistors
  will not switch.

---

## 7. Testing without the website

1. Open the Arduino IDE Serial Monitor at 115200 baud with "Newline" line ending.
2. Move the stick, turn the knob and press the buttons. You should see `J`, `P` and `B` lines.
3. Type `M,255,0,0,0` and press Enter. The north motor buzzes for 0.5 s, then the safety
   timeout stops it.
4. Type `?`. The board answers `H,EarthSonar,1`.
5. **Close the Serial Monitor** before connecting from the website.
