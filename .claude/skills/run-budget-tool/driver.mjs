#!/usr/bin/env node
// Headless driver for the budget tool web UI.
//
// Boots the API + Vite dev server (--serve) against a throwaway copy of the demo DB, launches
// Chrome headless, and runs a line-oriented script over the Chrome DevTools Protocol. No npm
// deps: raw WebSocket (global since Node 22) + the browser already on the machine.
//
// This is agent tooling, not product surface — see .claude/skills/run-budget-tool/SKILL.md.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB_PORT = 5001;
const API_PORT = 8100;

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);

const serve = flag('serve');
const headed = flag('headed');
const verbose = flag('verbose');
const base = opt('base', `http://localhost:${WEB_PORT}`);
const outDir = path.resolve(opt('out', '/tmp/budget-shots'));
const scriptFile = opt('script', '-');
const dbOpt = opt('db', 'demo'); // demo | fresh | <path>
const timeoutMs = Number(opt('timeout', 15000));

// ---------------------------------------------------------------- utils

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const kids = [];

async function waitForHttp(url, label, ms = 40000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`${label} did not come up at ${url}`);
    await sleep(200);
  }
}

function spawnChild(label, cmd, args, env) {
  const c = spawn(cmd, args, {
    cwd: REPO,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = (buf) => {
    if (verbose) process.stderr.write(`[${label}] ${buf}`);
  };
  c.stdout.on('data', tag);
  c.stderr.on('data', tag);
  kids.push(c);
  return c;
}

function cleanup() {
  for (const c of kids) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// ---------------------------------------------------------------- CDP

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  on(fn) {
    this.handlers.push(fn);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launchChrome() {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error(`no Chrome found. Set CHROME=/path/to/chrome. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(path.join(tmpdir(), 'budget-chrome-'));
  spawnChild('chrome', exe, [
    ...(headed ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ]);
  await waitForHttp(`http://127.0.0.1:${port}/json/version`, 'chrome', 20000);
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      log(`[page-error] ${d.exception?.description ?? d.text}`);
      pageErrors.push(d.exception?.description ?? d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      if (verbose || type === 'error' || type === 'warning') log(`[console.${type}] ${text}`);
      if (type === 'error') pageErrors.push(text);
    }
  });
  return { cdp, sessionId };
}

const pageErrors = [];

// ---------------------------------------------------------------- page helpers

let cdp, sid;

async function evaluate(expr, { awaitPromise = true } = {}) {
  const r = await cdp.send(
    'Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise, userGesture: true },
    sid,
  );
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

// Selector language: a CSS selector, or `text=<substring>` which picks the smallest visible
// element whose trimmed text contains the substring (buttons/links/labels win ties).
const FIND = `(sel) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  if (!sel.startsWith('text=')) return document.querySelector(sel);
  const want = sel.slice(5).toLowerCase();
  const all = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], label, summary, li, th, td, h1, h2, h3, span, div')]
    .filter((el) => vis(el) && (el.innerText ?? '').trim().toLowerCase().includes(want));
  if (!all.length) return null;
  const rank = (el) => (/^(BUTTON|A|SUMMARY|LABEL)$/.test(el.tagName) || el.getAttribute('role') ? 0 : 1);
  all.sort((a, b) => rank(a) - rank(b) || (a.innerText ?? '').length - (b.innerText ?? '').length);
  return all[0];
}`;

const findExpr = (sel) => `(${FIND})(${JSON.stringify(sel)})`;

async function waitFor(sel, ms = timeoutMs) {
  const until = Date.now() + ms;
  for (;;) {
    const ok = await evaluate(`!!${findExpr(sel)}`);
    if (ok) return;
    if (Date.now() > until) throw new Error(`timed out waiting for ${sel}`);
    await sleep(120);
  }
}

async function click(sel) {
  await waitFor(sel);
  const box = await evaluate(`(() => {
    const el = ${findExpr(sel)};
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 },
      sid,
    );
  }
  await sleep(80);
}

async function focus(sel) {
  await waitFor(sel);
  await evaluate(`(() => { const el = ${findExpr(sel)}; el.scrollIntoView({block:'center'}); el.focus(); })()`);
}

async function typeInto(sel, text) {
  await focus(sel);
  await cdp.send('Input.insertText', { text }, sid);
  await sleep(50);
}

// React controlled inputs ignore `el.value = x`; go through the native setter + input event.
async function clearInput(sel) {
  await focus(sel);
  await evaluate(`(() => {
    const el = ${findExpr(sel)};
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' }, // text ⇒ native form submit
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
};

// The text goes IN the keyDown (Puppeteer-style), never as a separate `char` event: a standalone
// char bypasses preventDefault, so `key a` would both switch to Add *and* leak "a" into the
// autofocused amount field, and `key Enter` in the category filter would both pick the match and
// submit the form. Bundled into keyDown, the app's preventDefault suppresses the default action.
async function pressKey(name) {
  const k = KEYS[name] ??
    (name.length === 1
      ? { key: name, code: `Key${name.toUpperCase()}`, keyCode: name.toUpperCase().charCodeAt(0), text: name }
      : null);
  if (!k) throw new Error(`unknown key ${name}`);
  const base = { ...k, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: k.text ? 'keyDown' : 'rawKeyDown' }, sid);
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp', text: undefined }, sid);
  await sleep(80);
}

let viewport = { w: 1280, h: 900 };

async function setSize(w, h) {
  viewport = { w, h };
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: 2, mobile: w < 640, screenWidth: w, screenHeight: h },
    sid,
  );
  // Mobile layout keys off pointer/hover media queries as well as width.
  // maxTouchPoints must be 1..16 even when disabling — 0 is rejected outright.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: w < 640, maxTouchPoints: 5 }, sid);
  await sleep(150);
}

async function shot(name, full = false) {
  mkdirSync(outDir, { recursive: true });
  // captureBeyondViewport is silently ignored while a device-metrics override is active (and the
  // driver always has one, for `size`), so a full-page shot means: grow the viewport to the scroll
  // height, capture, shrink back. 12000px cap — taller than that and Chrome returns a blank image.
  const { w, h } = viewport;
  if (full) {
    const tall = Math.min(await evaluate('document.documentElement.scrollHeight'), 12000);
    if (tall > h) {
      await setSize(w, tall);
      await sleep(250);
    }
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
  if (full && viewport.h !== h) await setSize(w, h);
  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  log(`shot ${file}`);
  return file;
}

async function goto(target) {
  const url = /^https?:/.test(target) ? target : base.replace(/\/$/, '') + (target.startsWith('/') ? target : `/${target}`);
  await cdp.send('Page.navigate', { url }, sid);
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(`document.readyState === 'complete'`)) break;
    } catch {
      /* navigating */
    }
    if (Date.now() > until) throw new Error(`navigation to ${url} did not complete`);
    await sleep(150);
  }
  // The app fetches its whole ledger before painting anything but the shell.
  await waitFor('#root > *').catch(() => {});
}

// ---------------------------------------------------------------- servers

function startServers() {
  let dbPath;
  if (dbOpt === 'demo' || dbOpt === 'fresh') {
    const dir = mkdtempSync(path.join(tmpdir(), 'budget-db-'));
    dbPath = path.join(dir, 'run.db');
    if (dbOpt === 'demo') copyFileSync(path.join(REPO, 'data/budget-demo.db'), dbPath);
  } else {
    dbPath = path.resolve(dbOpt);
  }
  log(`[serve] db=${dbPath}`);
  spawnChild('api', process.execPath, ['apps/api/src/index.ts'], { BUDGET_DB: dbPath, PORT: String(API_PORT) });
  spawnChild('web', 'npm', ['-w', '@budget/web', 'run', 'dev']);
  return Promise.all([
    waitForHttp(`http://localhost:${API_PORT}/api/bootstrap`, 'api'),
    waitForHttp(`http://localhost:${WEB_PORT}/`, 'vite'),
  ]).then(() => log(`[serve] api :${API_PORT} · web :${WEB_PORT}`));
}

// ---------------------------------------------------------------- script runner

// Selectors routinely contain spaces (`#root > *`, `[aria-label="Filter categories"]`), so a
// command's argument is the raw remainder of the line. Only `type` needs a split, and there the
// selector may be quoted: type "[aria-label='Filter categories']" nic
const unquote = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);

function splitSelArg(arg) {
  const m = /^(?:"([^"]*)"|'([^']*)'|(\S+))\s*([\s\S]*)$/.exec(arg);
  if (!m) throw new Error(`expected "<selector> <value>", got: ${arg}`);
  return [m[1] ?? m[2] ?? m[3], m[4]];
}

async function runLine(line) {
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = line.slice(cmd.length).trim();
  switch (cmd) {
    case 'goto':
      return goto(arg || '/');
    case 'size': {
      const [w, h] = rest.map(Number);
      return setSize(w, h);
    }
    case 'wait':
      return waitFor(unquote(arg));
    case 'waitgone': {
      const sel = unquote(arg);
      const until = Date.now() + timeoutMs;
      for (;;) {
        if (!(await evaluate(`!!${findExpr(sel)}`))) return;
        if (Date.now() > until) throw new Error(`${sel} still present`);
        await sleep(120);
      }
    }
    case 'click':
      return click(unquote(arg));
    case 'type': {
      const [sel, text] = splitSelArg(arg);
      return typeInto(sel, text);
    }
    case 'clear':
      return clearInput(unquote(arg));
    case 'key':
      return pressKey(arg);
    case 'sleep':
      return sleep(Number(arg));
    case 'text': {
      const v = await evaluate(`(() => { const el = ${findExpr(unquote(arg))}; return el ? el.innerText : null; })()`);
      log(v);
      return;
    }
    case 'eval': {
      const v = await evaluate(`(async () => (${arg}))()`);
      log(typeof v === 'string' ? v : JSON.stringify(v));
      return;
    }
    case 'shot':
      return shot(rest[0] ?? 'shot', rest[1] === 'full');
    case 'expect': {
      const ok = await evaluate(`(async () => (${arg}))()`);
      if (!ok) throw new Error(`expect failed: ${arg}`);
      log(`ok ${arg}`);
      return;
    }
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}

async function readStdin() {
  let out = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) out += chunk;
  return out;
}

async function main() {
  const src = scriptFile === '-' ? await readStdin() : await readFile(path.resolve(scriptFile), 'utf8');
  const lines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (serve) await startServers();
  ({ cdp, sessionId: sid } = await launchChrome());
  await setSize(1280, 900);

  let failed = 0;
  for (const line of lines) {
    log(`> ${line}`);
    try {
      await runLine(line);
    } catch (err) {
      failed++;
      log(`FAIL ${line}\n  ${err.message}`);
      try {
        await shot(`fail-${failed}`);
      } catch {
        /* browser may be gone */
      }
      break;
    }
  }
  if (pageErrors.length) log(`\n${pageErrors.length} page error(s) — first: ${pageErrors[0]}`);
  cleanup();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`driver error: ${err.stack ?? err.message}`);
  cleanup();
  process.exit(2);
});
