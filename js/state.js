let state = {
  employees:       [],
  volunteers:      [],
  defaultSchedule: {},
  schedule:        {},
  volAvailability: {},
  absences:        {},
  leaveRequests:   [],
  swapRequests:    [],
  currentWeekMon:  '',
  currentDateISO:  '',
  currentDow:      '',
  mode:            'live',
  meta:            {}
};

let _undoStack = [];

// ── Persistence ───────────────────────────────────────────────
function saveLocal() {
  try {
    const snap = JSON.stringify(state);
    localStorage.setItem('smPro_data', snap);
    const slot = Date.now() % 3;
    localStorage.setItem(`smPro_bk_${slot}`, snap);
    localStorage.setItem(`smPro_bk_ts_${slot}`, Date.now());
    sessionStorage.setItem('smPro_session', snap);
  } catch(e) { console.warn('saveLocal failed', e); }
}

function loadLocal() {
  try {
    let raw = localStorage.getItem('smPro_data');
    if (!raw) raw = sessionStorage.getItem('smPro_session');
    if (!raw) {
      let best = null, bestTs = 0;
      for (let i = 0; i < 3; i++) {
        const ts = parseInt(localStorage.getItem(`smPro_bk_ts_${i}`) || 0);
        const bk = localStorage.getItem(`smPro_bk_${i}`);
        if (bk && ts > bestTs) { best = bk; bestTs = ts; }
      }
      if (best) raw = best;
    }
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function persistAll() {
  saveLocal();
  pushToFirebase();
}

// ── Undo ──────────────────────────────────────────────────────
function pushUndo(label, snapshot) {
  _undoStack.push({ label, snapshot: JSON.parse(JSON.stringify(snapshot)) });
  if (_undoStack.length > 20) _undoStack.shift();
}

function undoLastChange() {
  if (!_undoStack.length) return;
  const { snapshot } = _undoStack.pop();
  Object.assign(state, snapshot);
  persistAll();
  renderAll();
  hideToast();
}

// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function toDateStr(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateStr(new Date());
}

// ── Init ──────────────────────────────────────────────────────
function initState() {
  // Load local cache first so app shows instantly
  const saved = loadLocal();
  if (saved) {
    ['employees','volunteers','defaultSchedule','schedule',
     'volAvailability','absences','leaveRequests','swapRequests'].forEach(k => {
      if (saved[k] !== undefined) state[k] = saved[k];
    });
  }

  // Always connect Firebase using hardcoded config
  // If user saved a custom config via UI, use that instead
  let cfg = HARDCODED_CONFIG;
  try {
    const savedCfg = localStorage.getItem('smPro_fbConfig');
    if (savedCfg) {
      const parsed = JSON.parse(savedCfg);
      // Only use saved config if it has a valid key
      if (parsed.apiKey && parsed.databaseURL) cfg = parsed;
    }
  } catch(e) { /* use hardcoded */ }

  if (cfg.apiKey && cfg.databaseURL) {
    initFirebase(cfg);
  }
}
