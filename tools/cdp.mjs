// Minimal headless-Chrome driver over the DevTools Protocol. No dependencies: Node 22 has a
// built-in WebSocket. Shared by the tools in this folder.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else listeners.forEach((l) => l(msg));
  };
  const opened = new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return {
    opened,
    send,
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
    /** Evaluates an expression in the page and returns its value. */
    eval: async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value,
    /** Polls an expression until it is truthy; returns elapsed ms or null on timeout. */
    async until(expression, timeoutMs = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (await this.eval(expression)) return Date.now() - t0;
        await sleep(50);
      }
      return null;
    },
  };
}

/** Starts headless Chrome with a throwaway profile; returns { c, close }. */
export async function launch(port = 9333) {
  const profileDir = mkdtempSync(join(tmpdir(), 'es-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome did not start'); }
  const c = client(wsUrl);
  await c.opened;
  return {
    c,
    async close() {
      c.close();
      chrome.kill();
      await sleep(500);
      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
    },
  };
}
