/* ============================================================
   RepCount — interval rep trainer
   Vanilla JS. No build step, no dependencies, offline-first.
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const KEY_CFG = 'repcount.config.v1';
  const KEY_HISTORY = 'repcount.history.v1';
  const KEY_SETTINGS = 'repcount.settings.v1';

  const LIMITS = {
    work: { min: 5, max: 300, step: 5, unit: 's', label: 'Work' },
    rest: { min: 0, max: 300, step: 5, unit: 's', label: 'Rest' },
    sets: { min: 1, max: 20, step: 1, unit: '', label: 'Sets' },
    target: { min: 1, max: 99, step: 1, unit: '', label: 'Rep target' },
  };

  const PRESETS = {
    classic: { work: 30, rest: 20, sets: 4, target: 15 },
    tabata: { work: 20, rest: 10, sets: 8, target: 10 },
    minute: { work: 60, rest: 30, sets: 3, target: 30 },
  };

  const DEFAULT_CFG = { ...PRESETS.classic };
  const DEFAULT_SETTINGS = { sound: true, vibrate: true, wake: true };

  /* ── storage ─────────────────────────────────────────────── */

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — app still works for this session */
    }
  }

  let cfg = Object.assign({}, DEFAULT_CFG, load(KEY_CFG, DEFAULT_CFG));
  let settings = Object.assign({}, DEFAULT_SETTINGS, load(KEY_SETTINGS, DEFAULT_SETTINGS));
  let history = load(KEY_HISTORY, []);
  if (!Array.isArray(history)) history = [];

  for (const key of Object.keys(LIMITS)) {
    const lim = LIMITS[key];
    cfg[key] = Math.min(lim.max, Math.max(lim.min, Math.round(Number(cfg[key]) || DEFAULT_CFG[key])));
  }

  /* ── sound ───────────────────────────────────────────────── */

  const Sound = {
    ctx: null,
    unlocked: false,
    ensure() {
      if (!settings.sound) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          this.ctx = new AC();
        } catch {
          return null;
        }
      }
      const ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      // iOS only unlocks Web Audio after a silent buffer starts inside a gesture.
      if (!this.unlocked) {
        try {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          this.unlocked = true;
        } catch {
          /* ignore */
        }
      }
      return ctx;
    },
    tone(freq, dur = 0.09, { type = 'sine', vol = 0.16, delay = 0, slide = null } = {}) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },
    rep() { this.tone(1050, 0.045, { type: 'triangle', vol: 0.07 }); },
    tick() { this.tone(700, 0.05, { type: 'square', vol: 0.045 }); },
    go() { this.tone(880, 0.16, { type: 'sine', vol: 0.16 }); },
    rest() { this.tone(520, 0.2, { type: 'sine', vol: 0.13, slide: 400 }); },
    done() {
      [660, 880, 1170].forEach((f, i) => this.tone(f, 0.16, { delay: i * 0.13, vol: 0.15 }));
    },
  };

  function buzz(pattern) {
    if (!settings.vibrate) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }

  /* ── dom refs ────────────────────────────────────────────── */

  const el = {
    app: $('#app'),
    screens: {
      setup: $('#screen-setup'),
      workout: $('#screen-workout'),
      summary: $('#screen-summary'),
      history: $('#screen-history'),
    },
    val: {
      work: $('#val-work'),
      rest: $('#val-rest'),
      sets: $('#val-sets'),
      target: $('#val-target'),
    },
    planLine: $('#planLine'),
    startMeta: $('#startMeta'),
    miniStats: $('#miniStats'),
    statWorkouts: $('#statWorkouts'),
    statReps: $('#statReps'),
    statBest: $('#statBest'),
    installCard: $('#installCard'),
    installHint: $('#installHint'),

    setMeter: $('#setMeter'),
    phasePill: $('#phasePill'),
    ringWrap: $('.ring-wrap'),
    ringProgress: $('#ringProgress'),
    timeText: $('#timeText'),
    phaseSub: $('#phaseSub'),
    repPad: $('#repPad'),
    repCount: $('#repCount'),
    repTarget: $('#repTarget'),
    repFill: $('#repFill'),
    tapHint: $('#tapHint'),
    controls: $('.workout-controls'),
    btnPause: $('#btnPause'),
    pauseLabel: $('#pauseLabel'),
    btnSkip: $('#btnSkip'),
    btnMinus: $('#btnMinus'),
    btnEnd: $('#btnEnd'),
    btnSound: $('#btnSound'),

    sumEyebrow: $('#summaryEyebrow'),
    sumTitle: $('#summaryTitle'),
    sumTotal: $('#sumTotal'),
    sumLine: $('#sumLine'),
    sumSets: $('#sumSets'),
    sumDuration: $('#sumDuration'),
    sumTargets: $('#sumTargets'),
    sumBest: $('#sumBest'),

    historyTotals: $('#historyTotals'),
    historyList: $('#historyList'),

    sheet: $('#sheetBackdrop'),
    setSound: $('#setSound'),
    setVibrate: $('#setVibrate'),
    setWake: $('#setWake'),
    toast: $('#toast'),
  };

  const RING_R = 118;
  const RING_C = 2 * Math.PI * RING_R;

  /* ── helpers ─────────────────────────────────────────────── */

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function fmtDur(sec) {
    if (sec < 60) return `${sec}s`;
    if (sec % 60 === 0) return `${sec / 60} min`;
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(d)) / 86400000);
    if (days === 0) return { top: 'Today', sub: time };
    if (days === 1) return { top: 'Yesterday', sub: time };
    return {
      top: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      sub: time,
    };
  }

  function toast(msg, ms = 2600) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove('is-on'), ms);
  }

  /* ── navigation ──────────────────────────────────────────── */

  let screen = 'setup';

  function showScreen(name) {
    screen = name;
    for (const [key, node] of Object.entries(el.screens)) {
      node.classList.toggle('is-active', key === name);
    }
    el.app.dataset.screen = name;
    const active = el.screens[name];
    if (active) active.scrollTop = 0;
    if (name === 'setup') renderSetup();
    if (name === 'history') renderHistory();
    if (name === 'summary') renderSummary();
  }

  /* ── setup screen ────────────────────────────────────────── */

  function stepValue(field, dir) {
    const lim = LIMITS[field];
    cfg[field] = clamp(cfg[field] + dir * lim.step, lim.min, lim.max);
    save(KEY_CFG, cfg);
    renderSetup();
  }

  function renderSetup() {
    for (const [field, node] of Object.entries(el.val)) {
      const lim = LIMITS[field];
      node.innerHTML = `${cfg[field]}${lim.unit ? `<span>${lim.unit}</span>` : ''}`;
    }

    const restText = cfg.rest > 0 ? `${fmtDur(cfg.rest)} rest` : 'no rest';
    el.planLine.textContent =
      `${cfg.sets} set${cfg.sets > 1 ? 's' : ''} · ${fmtDur(cfg.work)} work · ${restText} · target ${cfg.target} reps`;

    const totalSec = cfg.sets * cfg.work + Math.max(0, cfg.sets - 1) * cfg.rest;
    el.startMeta.textContent = `≈ ${fmtDur(Math.round(totalSec / 5) * 5)} total`;

    $$('.preset').forEach((btn) => {
      const p = PRESETS[btn.dataset.preset];
      const match = p && p.work === cfg.work && p.rest === cfg.rest && p.sets === cfg.sets && p.target === cfg.target;
      btn.classList.toggle('is-active', Boolean(match));
      btn.setAttribute('aria-pressed', String(Boolean(match)));
    });

    el.statWorkouts.textContent = history.length;
    el.statReps.textContent = history.reduce((sum, h) => sum + (Number(h.total) || 0), 0);
    el.statBest.textContent = history.reduce((best, h) => Math.max(best, ...(h.reps || [0])), 0);
    el.miniStats.hidden = history.length === 0;
  }

  $$('.setting').forEach((card) => {
    const field = card.dataset.field;
    $$('.step-btn', card).forEach((btn) => {
      const dir = Number(btn.dataset.step);
      let holdTimer = null;
      let repeatTimer = null;

      const stop = () => {
        clearTimeout(holdTimer);
        clearInterval(repeatTimer);
        holdTimer = repeatTimer = null;
      };

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button > 0) return;
        stepValue(field, dir);
        holdTimer = setTimeout(() => {
          repeatTimer = setInterval(() => stepValue(field, dir), 85);
        }, 420);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  });

  $$('.preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      cfg = { ...preset };
      save(KEY_CFG, cfg);
      renderSetup();
      Sound.tone(900, 0.05, { vol: 0.08 });
    });
  });

  /* ── workout engine ──────────────────────────────────────── */

  let session = null;
  let wakeLock = null;

  function startSession() {
    session = {
      cfg: { ...cfg },
      reps: Array.from({ length: cfg.sets }, () => 0),
      setIndex: 0,
      phase: 'work',
      phaseDuration: cfg.work * 1000,
      remaining: cfg.work * 1000,
      deadline: 0,
      paused: false,
      startedAt: Date.now(),
      endedAt: null,
      saved: false,
      transition: false,
      lastCue: null,
      early: false,
    };

    Sound.ensure();
    resetEnd();
    showScreen('workout');
    beginPhase('work', cfg.work * 1000, true);
    requestWakeLock();
  }

  function beginPhase(phase, ms, silent = false) {
    session.phase = phase;
    session.phaseDuration = ms;
    session.remaining = ms;
    session.deadline = Date.now() + ms;
    session.paused = false;
    session.lastCue = null;

    el.screens.workout.dataset.phase = phase;
    el.phasePill.textContent = phase === 'work' ? 'Work' : 'Rest';
    el.btnPause.setAttribute('aria-label', phase === 'work' ? 'Pause workout' : 'Pause rest');
    el.btnSkip.textContent = phase === 'work' ? 'Skip' : 'Skip rest';
    el.btnSkip.setAttribute('aria-label', phase === 'work' ? 'Skip to rest' : 'Skip rest');

    if (!silent) {
      if (phase === 'work') { Sound.go(); buzz([26, 40, 26]); }
      else { Sound.rest(); buzz(18); }
    }

    renderWorkout();
  }

  function togglePause() {
    if (!session || session.phase === 'done') return;
    if (session.paused) {
      session.paused = false;
      session.deadline = Date.now() + session.remaining;
      el.pauseLabel.textContent = 'Pause';
      el.btnPause.setAttribute('aria-label', 'Pause workout');
    } else {
      session.remaining = Math.max(0, session.deadline - Date.now());
      session.paused = true;
      el.pauseLabel.textContent = 'Resume';
      el.btnPause.setAttribute('aria-label', 'Resume workout');
    }
    renderWorkout();
  }

  function tick() {
    if (!session || session.phase === 'done') return;
    if (session.paused) return;

    session.remaining = Math.max(0, session.deadline - Date.now());
    renderWorkout();

    if (session.phase === 'work' && !session.paused) {
      const sec = Math.ceil(session.remaining / 1000);
      if (sec > 0 && sec <= 3 && session.lastCue !== sec) {
        session.lastCue = sec;
        Sound.tick();
        buzz(12);
      }
    }

    if (session.remaining <= 0) endPhase();
  }

  function endPhase() {
    if (!session || session.transition || session.phase === 'done') return;
    session.transition = true;

    if (session.phase === 'work') {
      const isLast = session.setIndex >= session.cfg.sets - 1;
      if (isLast) {
        finishSession();
      } else if (session.cfg.rest <= 0) {
        session.setIndex += 1;
        beginPhase('work', session.cfg.work * 1000);
      } else {
        beginPhase('rest', session.cfg.rest * 1000);
      }
    } else if (session.phase === 'rest') {
      session.setIndex += 1;
      beginPhase('work', session.cfg.work * 1000);
    }

    session.transition = false;
  }

  function skipPhase() {
    if (!session || session.phase === 'done') return;
    if (session.phase === 'work') {
      endPhase();
    } else {
      session.setIndex += 1;
      beginPhase('work', session.cfg.work * 1000);
    }
  }

  function addRep(delta) {
    if (!session || session.phase !== 'work' || session.paused) return;
    const i = session.setIndex;
    const next = clamp(session.reps[i] + delta, 0, 999);
    if (next === session.reps[i]) return;
    session.reps[i] = next;

    if (delta > 0) {
      Sound.rep();
      buzz(8);
      el.repPad.classList.add('is-hit');
      setTimeout(() => el.repPad.classList.remove('is-hit'), 130);
      el.repCount.classList.remove('is-pop');
      void el.repCount.offsetWidth;
      el.repCount.classList.add('is-pop');
    }
    renderWorkout();
  }

  function finishSession(early = false) {
    if (!session || session.phase === 'done') return;
    if (early) session.early = true;
    session.phase = 'done';
    session.endedAt = Date.now();
    releaseWakeLock();
    Sound.done();
    buzz([40, 50, 40, 50, 80]);

    const rec = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `s_${Date.now()}`,
      at: session.endedAt,
      startedAt: session.startedAt,
      durationMs: Math.max(0, session.endedAt - session.startedAt),
      config: { ...session.cfg },
      reps: [...session.reps],
      total: session.reps.reduce((a, b) => a + b, 0),
      early: Boolean(early),
    };
    history.unshift(rec);
    history = history.slice(0, 200);
    save(KEY_HISTORY, history);
    session.saved = true;
    session.record = rec;

    renderSummary();
    showScreen('summary');
  }

  function renderWorkout() {
    if (!session) return;
    const inRest = session.phase === 'rest';
    const i = Math.min(session.setIndex, session.cfg.sets - 1);
    const reps = session.reps[i] || 0;

    el.setMeter.textContent = `Set ${i + 1} / ${session.cfg.sets}`;
    el.timeText.textContent = fmtClock(session.remaining);
    el.phasePill.textContent = session.paused ? 'Paused' : inRest ? 'Rest' : 'Work';

    const ratio = session.phaseDuration > 0 ? session.remaining / session.phaseDuration : 0;
    el.ringProgress.style.strokeDashoffset = String(RING_C * (1 - clamp(ratio, 0, 1)));

    el.ringWrap.classList.toggle(
      'is-urgent',
      session.phase === 'work' && !session.paused && session.remaining <= 5000 && session.remaining > 0
    );

    el.phaseSub.textContent = session.paused
      ? 'paused'
      : inRest
        ? `next: set ${session.setIndex + 2} · ${session.cfg.target} reps`
        : `target ${session.cfg.target} reps`;

    el.repCount.textContent = String(reps);
    el.repTarget.textContent = String(session.cfg.target);
    el.repFill.style.setProperty('--p', `${Math.min(100, (reps / session.cfg.target) * 100)}%`);

    const disabled = inRest || session.paused;
    el.repPad.disabled = disabled;
    el.btnMinus.disabled = disabled;
    el.btnMinus.disabled = disabled;
    el.tapHint.textContent = session.paused ? 'paused' : inRest ? 'resting' : 'tap';
    el.repPad.setAttribute('aria-label', inRest ? 'Resting' : `Add one rep, ${reps} of ${session.cfg.target}`);

    el.btnPause.hidden = inRest;
    el.btnMinus.hidden = inRest;
    el.controls.classList.toggle('is-rest', inRest);
  }

  function requestWakeLock() {
    if (!settings.wake || !('wakeLock' in navigator) || !session) return;
    if (document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => { wakeLock = null; });
    }).catch(() => { /* unsupported or denied */ });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session && session.phase !== 'done') {
      requestWakeLock();
      tick();
    }
  });

  /* ── controls ────────────────────────────────────────────── */

  el.repPad.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    addRep(1);
  });

  el.btnMinus.addEventListener('click', () => addRep(-1));
  el.btnPause.addEventListener('click', togglePause);
  el.btnSkip.addEventListener('click', skipPhase);

  let endArmed = false;
  let endTimer = null;

  function resetEnd() {
    endArmed = false;
    clearTimeout(endTimer);
    el.btnEnd.textContent = 'End';
    el.btnEnd.classList.remove('is-armed');
  }

  el.btnEnd.addEventListener('click', () => {
    if (!endArmed) {
      endArmed = true;
      el.btnEnd.textContent = 'Confirm';
      el.btnEnd.classList.add('is-armed');
      endTimer = setTimeout(resetEnd, 2600);
      return;
    }
    resetEnd();
    finishSession(true);
  });

  el.btnSound.addEventListener('click', () => {
    settings.sound = !settings.sound;
    save(KEY_SETTINGS, settings);
    el.btnSound.classList.toggle('is-muted', !settings.sound);
    el.btnSound.setAttribute('aria-pressed', String(settings.sound));
    toast(settings.sound ? 'Sound on' : 'Sound off');
    if (settings.sound) Sound.tone(880, 0.06, { vol: 0.1 });
  });

  /* ── summary ─────────────────────────────────────────────── */

  function renderSummary() {
    if (!session || !session.record) return;
    const rec = session.record;
    const sets = rec.config.sets;
    const hits = rec.reps.filter((r) => r >= rec.config.target).length;
    const best = rec.reps.length ? Math.max(...rec.reps) : 0;

    el.sumEyebrow.textContent = rec.early ? 'Session ended early' : 'Session complete';
    el.sumTitle.textContent = hits === sets ? 'Target smashed.' : hits >= Math.ceil(sets / 2) ? 'Solid work.' : 'Reps logged.';
    el.sumTotal.textContent = String(rec.total);
    el.sumLine.textContent =
      `${sets} set${sets > 1 ? 's' : ''} · ${fmtDur(rec.config.work)} work / ${rec.config.rest > 0 ? fmtDur(rec.config.rest) + ' rest' : 'no rest'}`;
    el.sumDuration.textContent = fmtClock(rec.durationMs);
    el.sumTargets.textContent = `${hits}/${sets}`;
    el.sumBest.textContent = String(best);

    el.sumSets.innerHTML = '';
    rec.reps.forEach((reps, idx) => {
      const chip = document.createElement('div');
      chip.className = `set-chip${reps >= rec.config.target ? ' shot' : ''}`;
      chip.setAttribute('role', 'listitem');
      chip.innerHTML = `<b>${reps}</b><small>set ${idx + 1}</small>`;
      el.sumSets.appendChild(chip);
    });
  }

  $('#btnRepeat').addEventListener('click', () => startSession());
  $('#btnDone').addEventListener('click', () => showScreen('setup'));

  /* ── history ─────────────────────────────────────────────── */

  function renderHistory() {
    const totalReps = history.reduce((sum, h) => sum + (Number(h.total) || 0), 0);
    const best = history.reduce((m, h) => Math.max(m, ...(h.reps || [0])), 0);

    el.historyTotals.innerHTML = `
      <div><strong>${history.length}</strong><span>workouts</span></div>
      <div><strong>${totalReps}</strong><span>total reps</span></div>
      <div><strong>${best}</strong><span>best set</span></div>`;

    el.historyList.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No workouts yet. Finish a session and it lands here — stored on this device only.';
      el.historyList.appendChild(empty);
      return;
    }

    history.forEach((rec) => {
      const when = fmtDate(rec.at);
      const item = document.createElement('div');
      item.className = 'history-item';
      const sets = rec.config?.sets ?? rec.reps?.length ?? 1;
      const work = rec.config?.work ?? 30;
      const rest = rec.config?.rest ?? 0;
      item.innerHTML = `
        <div class="hi-date">
          <b>${when.top} · ${when.sub}</b>
          <span>${sets} × ${fmtDur(work)} work${rest ? ` · ${fmtDur(rest)} rest` : ''}</span>
        </div>
        <div class="hi-reps"><b>${rec.total}</b><span>reps</span></div>
        <button class="hi-del" aria-label="Delete this workout" data-id="${rec.id}">×</button>`;
      el.historyList.appendChild(item);
    });
  }

  el.historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('.hi-del');
    if (!btn) return;
    const id = btn.dataset.id;
    history = history.filter((h) => h.id !== id);
    save(KEY_HISTORY, history);
    renderHistory();
    renderSetup();
    toast('Workout deleted');
  });

  let clearArmed = false;
  let clearTimer = null;
  $('#btnClearHistory').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!history.length) return toast('Nothing to clear');
    if (!clearArmed) {
      clearArmed = true;
      btn.textContent = 'Sure?';
      clearTimer = setTimeout(() => { clearArmed = false; btn.textContent = 'Clear'; }, 2600);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    btn.textContent = 'Clear';
    history = [];
    save(KEY_HISTORY, history);
    renderHistory();
    renderSetup();
    toast('History cleared');
  });

  $('#btnHistory').addEventListener('click', () => showScreen('history'));
  $('#btnHistoryBack').addEventListener('click', () => showScreen('setup'));

  /* ── settings sheet ──────────────────────────────────────── */

  function openSheet() {
    el.setSound.checked = Boolean(settings.sound);
    el.setVibrate.checked = Boolean(settings.vibrate);
    el.setWake.checked = Boolean(settings.wake);
    el.sheet.hidden = false;
  }

  function closeSheet() { el.sheet.hidden = true; }

  $('#btnSettings').addEventListener('click', openSheet);
  $('#btnCloseSheet').addEventListener('click', closeSheet);
  el.sheet.addEventListener('click', (e) => { if (e.target === el.sheet) closeSheet(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.sheet.hidden) closeSheet();
  });

  const toggleMap = [
    [el.setSound, 'sound'],
    [el.setVibrate, 'vibrate'],
    [el.setWake, 'wake'],
  ];
  for (const [input, key] of toggleMap) {
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      save(KEY_SETTINGS, settings);
      if (key === 'sound' && input.checked) Sound.tone(980, 0.06, { vol: 0.1 });
      if (key === 'wake' && !input.checked) releaseWakeLock();
      if (key === 'wake' && input.checked && session && session.phase !== 'done') requestWakeLock();
    });
  }

  /* ── install / PWA ───────────────────────────────────────── */

  let deferredPrompt = null;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function showInstallCard(hint) {
    if (isStandalone) return;
    el.installCard.hidden = false;
    if (hint) el.installHint.textContent = hint;
  }

  if (!isStandalone && isIOS) {
    showInstallCard('Tap Share, then “Add to Home Screen” for the full-screen app.');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallCard('Add RepCount to your home screen — full screen, offline.');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    el.installCard.hidden = true;
    toast('RepCount installed');
  });

  el.installCard.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferredPrompt = null;
      if (outcome === 'accepted') el.installCard.hidden = true;
      return;
    }
    if (isIOS) {
      toast('Share ➔ Add to Home Screen', 4200);
    } else {
      toast('Open your browser menu and choose “Install app”', 4200);
    }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
    });
  }

  /* ── unlock audio on first gesture ───────────────────────── */

  const unlock = () => {
    Sound.ensure();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  /* ── boot ────────────────────────────────────────────────── */

  $('#btnStart').addEventListener('click', () => startSession());

  el.btnSound.classList.toggle('is-muted', !settings.sound);
  el.btnSound.setAttribute('aria-pressed', String(settings.sound));
  el.screens.workout.dataset.phase = 'work';
  renderSetup();
  showScreen('setup');
  setInterval(tick, 100);
})();
