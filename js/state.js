let state = {
  employees: [],   // [{ id, name, fallback, blocked:[], status, annual, sick }]
  volunteers: [],  // [{ id, name, note, days:{} }]
  defaults: {},    // { dow: { slotIdx: { empId: locVal } } }
  overrides: {},   // { weekKey: { dayIdx: { slotIdx: { empId: locVal } } } }
  absences: {},    // { dateStr: { empId: bool } }
  leave: [],       // [{ id, empId, type, from, to, note, status }]
  swaps: [],       // [{ id, empId, from, to, note }]
  meta: { pin: DEFAULT_PIN }
};

let _undoStack = [];

// ── Persistence ──────────────────────────────────────────────
function saveLocal() {
  const snap = JSON.stringify(state);
  localStorage.setItem('smPro_data', snap);
  // Rolling 3-slot backup
  const slot = Date.now() % 3;
  localStorage.setItem(`smPro_bk_${slot}`, snap);
  localStorage.setItem(`smPro_bk_ts_${slot}`, Date.now());
  // Session mirror
  sessionStorage.setItem('smPro_session', snap);
}

function loadLocal() {
  let raw = localStorage.getItem('smPro_data');
  if (!raw) {
    // Try session mirror first
    raw = sessionStorage.getItem('smPro_session');
    if (raw) { console.warn('Restored from session mirror'); }
  }
  if (!raw) {
    // Try rolling backups
    let best = null, bestTs = 0;
    for (let i = 0; i < 3; i++) {
      const ts  = parseInt(localStorage.getItem(`smPro_bk_ts_${i}`) || 0);
      const bk  = localStorage.getItem(`smPro_bk_${i}`);
      if (bk && ts > bestTs) { best = bk; bestTs = ts; }
    }
    if (best) {
      const restore = confirm('⚠️ Main data missing. Restore from backup?');
      if (restore) raw = best;
    }
  }
  return raw ? JSON.parse(raw) : null;
}

function persistAll() {
  saveLocal();
  pushToFirebase(); // no-op if firebase not connected
}

// ── Undo ──────────────────────────────────────────────────────
function pushUndo(label, snapshot) {
  _undoStack.push({ label, snapshot: JSON.parse(JSON.stringify(snapshot)) });
  if (_undoStack.length > 20) _undoStack.shift();
}

function undoLastChange() {
  if (!_undoStack.length) return;
  const { label, snapshot } = _undoStack.pop();
  Object.assign(state, snapshot);
  persistAll();
  renderAll();
  hideToast();
}

// ── Helpers ───────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function weekKey(dateObj) {
  const d = new Date(dateObj);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7)); // Monday
  return d.toISOString().slice(0,10);
}

function dateOfDayInWeek(wKey, dayIdx) {
  const base = new Date(wKey + 'T00:00:00');
  base.setDate(base.getDate() + dayIdx);
  return base;
}

function toDateStr(dateObj) { return dateObj.toISOString().slice(0,10); }

function todayStr() { return toDateStr(new Date()); }

// ── Init ──────────────────────────────────────────────────────
function initState() {
  const saved = loadLocal();
  if (saved) Object.assign(state, saved);

  // Load Firebase config if saved
  const fbCfg = localStorage.getItem('smPro_fbConfig');
  if (fbCfg) {
    try { initFirebase(JSON.parse(fbCfg)); } catch(e) { console.error('Firebase init failed', e); }
  }
}
