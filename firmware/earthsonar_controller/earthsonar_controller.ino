const unsigned long BAUD = 115200;

const uint8_t PIN_JOY_X   = A0;
const uint8_t PIN_JOY_Y   = A1;
const uint8_t PIN_POT     = A2;
const uint8_t PIN_JOY_SW  = 2;
const uint8_t PIN_BUTTON  = 4;
const uint8_t PIN_LED     = 13;

const uint8_t MOTOR_PINS[4] = {3, 5, 6, 9};

const uint8_t MOTOR_MIN_DUTY = 70;

const bool INVERT_X = false;
const bool INVERT_Y = true;
const bool SWAP_XY  = false;

const int  JOY_DEADZONE      = 8;
const int  JOY_CHANGE_MIN    = 3;
const int  POT_CHANGE_MIN    = 8;
const unsigned long STATE_REPEAT_MS    = 250;
const unsigned long MOTOR_TIMEOUT_MS   = 500;
const unsigned long DEBOUNCE_MS        = 20;


int joyCenterX = 512;
int joyCenterY = 512;
int lastJoyX = 9999, lastJoyY = 9999;
int lastPot = -9999;
unsigned long lastJoySent = 0, lastPotSent = 0;

struct Button {
  uint8_t pin;
  uint8_t id;
  bool stable;
  bool lastRead;
  unsigned long changedAt;
};
Button buttons[2] = {
  {PIN_BUTTON, 1, false, false, 0},
  {PIN_JOY_SW, 2, false, false, 0},
};

uint8_t motorDuty[4] = {0, 0, 0, 0};
unsigned long lastMotorCmd = 0;

char lineBuf[32];
uint8_t lineLen = 0;
bool lineOverflow = false;


int readAveraged(uint8_t pin) {
  long sum = 0;
  for (uint8_t i = 0; i < 4; i++) sum += analogRead(pin);
  return (int)(sum / 4);
}

int axisToUnits(int raw, int center) {
  long v;
  if (raw >= center) v = (long)(raw - center) * 100 / max(1, 1023 - center);
  else               v = (long)(raw - center) * 100 / max(1, center);
  v = constrain(v, -100, 100);
  if (abs(v) <= JOY_DEADZONE) v = 0;
  return (int)v;
}

void applyMotors() {
  bool any = false;
  for (uint8_t i = 0; i < 4; i++) {
    uint8_t d = motorDuty[i];
    if (d > 0) {
      d = map(d, 1, 255, MOTOR_MIN_DUTY, 255);
      any = true;
    }
    analogWrite(MOTOR_PINS[i], d);
  }
  digitalWrite(PIN_LED, any ? HIGH : LOW);
}

void stopMotors() {
  for (uint8_t i = 0; i < 4; i++) motorDuty[i] = 0;
  applyMotors();
}

void sendHello() {
  Serial.println(F("H,EarthSonar,1"));
}

bool parseUint(const char* s, long& out) {
  if (*s == '\0') return false;
  long v = 0;
  for (; *s; s++) {
    if (*s < '0' || *s > '9') return false;
    v = v * 10 + (*s - '0');
    if (v > 100000) return false;
  }
  out = v;
  return true;
}

void handleLine(char* line) {
  if (line[0] == '?' && line[1] == '\0') { sendHello(); return; }
  if (line[0] == 'S' && line[1] == '\0') { stopMotors(); return; }
  if (line[0] == 'M' && line[1] == ',') {
    uint8_t commas = 0;
    for (char* q = line; *q; q++) if (*q == ',') commas++;
    if (commas != 4) return;
    long vals[4];
    uint8_t n = 0;
    char* p = line + 2;
    while (n < 4) {
      char* comma = strchr(p, ',');
      if (comma) *comma = '\0';
      if (!parseUint(p, vals[n])) return;
      n++;
      if (!comma) break;
      p = comma + 1;
    }
    if (n != 4) return;
    for (uint8_t i = 0; i < 4; i++) motorDuty[i] = (uint8_t)constrain(vals[i], 0, 255);
    lastMotorCmd = millis();
    applyMotors();
  }
}

void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!lineOverflow && lineLen > 0) {
        lineBuf[lineLen] = '\0';
        handleLine(lineBuf);
      }
      lineLen = 0;
      lineOverflow = false;
      continue;
    }
    if (lineLen < sizeof(lineBuf) - 1) lineBuf[lineLen++] = c;
    else lineOverflow = true;
  }
}

void pollJoystick(unsigned long now) {
  int rx = readAveraged(PIN_JOY_X);
  int ry = readAveraged(PIN_JOY_Y);
  int x = axisToUnits(rx, joyCenterX);
  int y = axisToUnits(ry, joyCenterY);
  if (SWAP_XY) { int t = x; x = y; y = t; }
  if (INVERT_X) x = -x;
  if (INVERT_Y) y = -y;

  bool changed = abs(x - lastJoyX) >= JOY_CHANGE_MIN || abs(y - lastJoyY) >= JOY_CHANGE_MIN;
  if ((x == 0 && lastJoyX != 0) || (y == 0 && lastJoyY != 0)) changed = true;
  if (changed || now - lastJoySent >= STATE_REPEAT_MS) {
    Serial.print(F("J,")); Serial.print(x); Serial.print(','); Serial.println(y);
    lastJoyX = x; lastJoyY = y; lastJoySent = now;
  }
}

void pollPot(unsigned long now) {
  int v = (int)((long)readAveraged(PIN_POT) * 1000 / 1023);
  if (abs(v - lastPot) >= POT_CHANGE_MIN || now - lastPotSent >= STATE_REPEAT_MS) {
    if (v < POT_CHANGE_MIN) v = 0;
    if (v > 1000 - POT_CHANGE_MIN) v = 1000;
    Serial.print(F("P,")); Serial.println(v);
    lastPot = v; lastPotSent = now;
  }
}

void pollButtons(unsigned long now) {
  for (uint8_t i = 0; i < 2; i++) {
    Button& b = buttons[i];
    bool pressed = digitalRead(b.pin) == LOW;
    if (pressed != b.lastRead) { b.lastRead = pressed; b.changedAt = now; }
    if (pressed != b.stable && now - b.changedAt >= DEBOUNCE_MS) {
      b.stable = pressed;
      Serial.print(F("B,")); Serial.print(b.id); Serial.print(','); Serial.println(pressed ? 1 : 0);
    }
  }
}


void setup() {
  Serial.begin(BAUD);
  pinMode(PIN_JOY_SW, INPUT_PULLUP);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(MOTOR_PINS[i], OUTPUT);
    analogWrite(MOTOR_PINS[i], 0);
  }
  joyCenterX = readAveraged(PIN_JOY_X);
  joyCenterY = readAveraged(PIN_JOY_Y);
  sendHello();
}

void loop() {
  unsigned long now = millis();
  readSerial();
  if (lastMotorCmd != 0 && now - lastMotorCmd > MOTOR_TIMEOUT_MS) {
    stopMotors();
    lastMotorCmd = 0;
  }
  pollJoystick(now);
  pollPot(now);
  pollButtons(now);
  delay(10);
}
