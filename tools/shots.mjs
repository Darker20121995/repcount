/* Headless verification driver for RepCount (CDP over Edge).
   Usage: node tools/shots.mjs  (Edge running with --remote-debugging-port=9222)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`${BASE}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP target not found');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.logs = [];
  }
  async open() {
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const frames = (d.stackTrace?.callFrames || [])
          .map((f) => `${f.functionName || '(anon)'} ${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1}`)
          .join(' | ');
        this.errors.push(`${d.exception?.description || d.text}${frames ? `\n    at ${frames}` : ''}`);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        this.logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const file = path.join(SHOTS, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }
}

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

const cdp = new CDP((await findPage()).webSocketDebuggerUrl);
await cdp.open();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
try {
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
} catch {
  console.log('note: Network.setBypassServiceWorker unavailable; clearing caches instead');
}
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(1400);

// fresh state (and drop any old service worker cache so we test current files)
await cdp.eval(`localStorage.clear();`);
await cdp.eval(`(async () => {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
})()`);
await cdp.send('Page.reload');
await sleep(1400);

const setupState = await cdp.eval(`({
  active: document.querySelector('#screen-setup').classList.contains('is-active'),
  work: document.querySelector('#val-work').textContent,
  rest: document.querySelector('#val-rest').textContent,
  plan: document.querySelector('#planLine').textContent,
  total: document.querySelector('#startMeta').textContent,
  overflowX: document.documentElement.scrollWidth > window.innerWidth
})`);
check('setup renders', setupState.active && setupState.work === '30s' && setupState.rest === '20s', JSON.stringify(setupState));
check('setup has no horizontal overflow', setupState.overflowX === false);
await cdp.shot('01-setup');

// settings sheet
await cdp.eval(`document.querySelector('#btnSettings').click()`);
await sleep(450);
await cdp.shot('02-settings');
const sheetOpen = await cdp.eval(`!document.querySelector('#sheetBackdrop').hidden`);
check('settings sheet opens', sheetOpen);
await cdp.eval(`document.querySelector('#btnCloseSheet').click()`);
await sleep(300);

// start workout
await cdp.eval(`document.querySelector('#btnStart').click()`);
await sleep(1150);
const started = await cdp.eval(`({
  active: document.querySelector('#screen-workout').classList.contains('is-active'),
  phase: document.querySelector('#phasePill').textContent,
  time: document.querySelector('#timeText').textContent,
  set: document.querySelector('#setMeter').textContent,
  target: document.querySelector('#repTarget').textContent
})`);
check('workout starts at 30s set 1', started.active && started.phase === 'Work' && /0:2[89]/.test(started.time) && started.set === 'Set 1 / 4', JSON.stringify(started));
await cdp.shot('03-workout-start');

// reps
const reps = await cdp.eval(`(() => {
  const pad = document.querySelector('#repPad');
  for (let i = 0; i < 12; i++) {
    pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7, pointerType: 'touch' }));
  }
  return {
    count: document.querySelector('#repCount').textContent,
    fill: document.querySelector('#repFill').style.getPropertyValue('--p'),
    aria: pad.getAttribute('aria-label')
  };
})()`);
check('twelve taps count twelve reps', reps.count === '12', JSON.stringify(reps));
await sleep(350);
await cdp.shot('04-workout-reps');

// pause freezes the clock
await cdp.eval(`document.querySelector('#btnPause').click()`);
const t1 = await cdp.eval(`document.querySelector('#timeText').textContent`);
await sleep(1100);
const t2 = await cdp.eval(`document.querySelector('#timeText').textContent`);
const pausedLabel = await cdp.eval(`document.querySelector('#pauseLabel').textContent`);
check('pause freezes clock', t1 === t2 && pausedLabel === 'Resume', `${t1} -> ${t2}, label ${pausedLabel}`);
await cdp.shot('05-paused');
await cdp.eval(`document.querySelector('#btnPause').click()`);
await sleep(300);

// skip to rest
await cdp.eval(`document.querySelector('#btnSkip').click()`);
await sleep(500);
const resting = await cdp.eval(`({
  phase: document.querySelector('#phasePill').textContent,
  time: document.querySelector('#timeText').textContent,
  skip: document.querySelector('#btnSkip').textContent,
  padDisabled: document.querySelector('#repPad').disabled,
  hint: document.querySelector('#phaseSub').textContent
})`);
check('skip enters rest with pad locked', resting.phase === 'Rest' && resting.padDisabled === true && resting.skip === 'Skip rest', JSON.stringify(resting));
await cdp.shot('06-rest');

// skip rest -> set 2
await cdp.eval(`document.querySelector('#btnSkip').click()`);
await sleep(450);
const set2 = await cdp.eval(`document.querySelector('#setMeter').textContent`);
check('rest skip advances to set 2', set2 === 'Set 2 / 4', set2);
await cdp.eval(`localStorage.setItem('repcount.probe', '1')`);

// end early -> summary
await cdp.eval(`document.querySelector('#btnEnd').click()`);
const armed = await cdp.eval(`document.querySelector('#btnEnd').textContent`);
check('end requires a second tap', armed === 'Confirm', armed);
await cdp.eval(`document.querySelector('#btnEnd').click()`);
await sleep(800);
const summary = await cdp.eval(`({
  active: document.querySelector('#screen-summary').classList.contains('is-active'),
  total: document.querySelector('#sumTotal').textContent,
  targets: document.querySelector('#sumTargets').textContent,
  chips: [...document.querySelectorAll('.set-chip b')].map(n => n.textContent),
  stored: JSON.parse(localStorage.getItem('repcount.history.v1') || '[]').length
})`);
check('summary totals and storage', summary.active && summary.total === '12' && summary.stored === 1, JSON.stringify(summary));
await cdp.shot('07-summary');

// history
await cdp.eval(`document.querySelector('#btnDone').click()`);
await sleep(400);
await cdp.eval(`document.querySelector('#btnHistory').click()`);
await sleep(450);
const hist = await cdp.eval(`({
  items: document.querySelectorAll('.history-item').length,
  totals: document.querySelector('#historyTotals').textContent.replace(/\\s+/g, ' ').trim()
})`);
check('history lists the session', hist.items === 1, JSON.stringify(hist));
await cdp.shot('08-history');
await cdp.eval(`document.querySelector('#btnHistoryBack').click()`);
await sleep(350);

// persistence after reload
await cdp.send('Page.reload');
await sleep(1400);
const persisted = await cdp.eval(`({
  items: JSON.parse(localStorage.getItem('repcount.history.v1') || '[]').length,
  miniVisible: !document.querySelector('#miniStats').hidden,
  workouts: document.querySelector('#statWorkouts').textContent
})`);
check('history survives reload', persisted.items === 1 && persisted.miniVisible && persisted.workouts === '1', JSON.stringify(persisted));

// full run with short config (5s work / 5s rest / 2 sets / 3 reps)
await cdp.eval(`localStorage.setItem('repcount.config.v1', JSON.stringify({work:5, rest:5, sets:2, target:3})); location.reload();`);
await sleep(1200);
await cdp.eval(`document.querySelector('#btnStart').click()`);
await sleep(700);
await cdp.eval(`(() => { const p = document.querySelector('#repPad'); for (let i=0;i<3;i++) p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:9,pointerType:'touch'})); })()`);
await sleep(6000);
const phaseAfterWork = await cdp.eval(`document.querySelector('#phasePill').textContent`);
check('short work auto-advances to rest', phaseAfterWork === 'Rest', phaseAfterWork);
await sleep(5800);
const phaseAfterRest = await cdp.eval(`({ phase: document.querySelector('#phasePill').textContent, set: document.querySelector('#setMeter').textContent })`);
check('rest auto-advances to set 2', phaseAfterRest.phase === 'Work' && phaseAfterRest.set === 'Set 2 / 2', JSON.stringify(phaseAfterRest));
await cdp.eval(`(() => { const p = document.querySelector('#repPad'); for (let i=0;i<2;i++) p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:9,pointerType:'touch'})); })()`);
await sleep(6200);
const finalSummary = await cdp.eval(`({
  active: document.querySelector('#screen-summary').classList.contains('is-active'),
  total: document.querySelector('#sumTotal').textContent,
  targets: document.querySelector('#sumTargets').textContent,
  chips: [...document.querySelectorAll('.set-chip b')].map(n => n.textContent)
})`);
check('auto-run finishes with 5 reps, 1/2 targets', finalSummary.active && finalSummary.total === '5' && finalSummary.targets === '1/2', JSON.stringify(finalSummary));
await cdp.shot('09-summary-autorun');

// iPhone SE size check
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 360, height: 640, deviceScaleFactor: 2, mobile: true, screenWidth: 360, screenHeight: 640,
});
await cdp.eval(`document.querySelector('#btnDone').click()`);
await sleep(500);
const small = await cdp.eval(`({
  overflowX: document.documentElement.scrollWidth > window.innerWidth,
  startVisible: (() => { const r = document.querySelector('#btnStart').getBoundingClientRect(); return r.bottom <= window.innerHeight + 1; })(),
  scrollable: document.querySelector('#screen-setup').scrollHeight > document.querySelector('#screen-setup').clientHeight
})`);
check('small screen: no h-overflow, start reachable', small.overflowX === false && small.startVisible, JSON.stringify(small));
await cdp.shot('10-small-setup');

// offline app-shell check (fresh SW install, then airplane mode)
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
try {
  await cdp.send('Network.setBypassServiceWorker', { bypass: false });
} catch {}
await cdp.eval(`(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
})()`);
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(900);
const swState = await cdp.eval(`Promise.race([
  navigator.serviceWorker.ready.then((r) => r.active.state).catch((e) => 'error:' + e.message),
  new Promise((res) => setTimeout(() => res('timeout'), 9000))
])`);
check('service worker activates', swState === 'activated', swState);

// A fresh navigation after activation is the reliable way to become SW-controlled.
await cdp.send('Page.reload');
let controlled = { ctrl: false };
for (let i = 0; i < 30; i++) {
  await sleep(200);
  controlled = await cdp.eval(`({
    ctrl: Boolean(navigator.serviceWorker.controller),
    href: location.href,
    setup: Boolean(document.querySelector('#screen-setup'))
  })`);
  if (controlled.ctrl) break;
}
check('service worker controls the page', controlled.ctrl, JSON.stringify(controlled));
await cdp.shot('11-online');

await cdp.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
let offline = { setup: false };
for (let i = 0; i < 24; i++) {
  await sleep(250);
  try {
    offline = await cdp.eval(`({
      setup: Boolean(document.querySelector('#screen-setup') && document.querySelector('#screen-setup').classList.contains('is-active')),
      start: Boolean(document.querySelector('#btnStart')),
      href: location.href,
      title: document.title
    })`);
  } catch {
    offline = { setup: false, href: 'evaluation failed' };
  }
  if (offline.setup) break;
}
check('app boots offline from cache', offline.setup && offline.start, JSON.stringify(offline));
await cdp.shot('12-offline');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
await sleep(400);

// workout layout on a short phone
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 360, height: 640, deviceScaleFactor: 2, mobile: true, screenWidth: 360, screenHeight: 640,
});
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(1200);
await cdp.eval(`document.querySelector('#btnStart').click()`);
await sleep(800);
const workoutFit = await cdp.eval(`(() => {
  const pad = document.querySelector('#repPad').getBoundingClientRect();
  const ctrls = document.querySelector('.workout-controls').getBoundingClientRect();
  const ring = document.querySelector('.ring-wrap').getBoundingClientRect();
  return {
    vh: window.innerHeight,
    padBottom: Math.round(pad.bottom),
    ctrlBottom: Math.round(ctrls.bottom),
    ringTop: Math.round(ring.top),
    fits: ctrls.bottom <= window.innerHeight + 1 && ring.top >= 0
  };
})()`);
check('workout fits short screen', workoutFit.fits, JSON.stringify(workoutFit));
await cdp.shot('13-workout-small');

// cleanup demo history + restore defaults
try {
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await sleep(900);
  await cdp.eval(`localStorage.clear()`);
} catch {
  console.log('note: cleanup skipped (page not available)');
}

console.log('\nconsole errors:', cdp.errors.length ? cdp.errors : 'none');
console.log('console logs:', cdp.logs.length ? cdp.logs : 'none');
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
