// ── state.js ──────────────────────────────────────────────────

let state = {
  employees:       [],
  volunteers:      [],
  defaultSchedule: {},
  schedule:        {},
  volAvailability: {},
  absences:        {},
  leaveRequests:   [],
  swapRequests:    [],
  holidays:        {},
  empDaysOff:      {},
  empHourCap:      {},
  currentWeekMon:  null,
  currentDateISO:  null,
  currentDow:      null,
  mode:            'live',
  meta:            {}
};

let undoStack = [];

// ── PIN Auth ──────────────────────────────────────────────────
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function verifyPin(pin) {
  if (!HARDCODEDPINHASH || HARDCODEDPINHASH === 'PASTE_YOUR_HASH_HERE') return false;
  const h = await hashPin(pin);
  return h === HARDCODEDPINHASH;
}

function hasPinSet() {
  return !!HARDCODEDPINHASH && HARDCODEDPINHASH !== 'PASTE_YOUR_HASH_HERE';
}

async function setPinHash(pin) {}
function migrateLegacyPin() {}

// ── Persistence ───────────────────────────────────────────────
function saveLocal() {
  try {
    const snap = JSON.stringify(state);
    localStorage.setItem('smPro_data', snap);
    const slot = Date.now() % 3;
    localStorage.setItem(`smPro_bk${slot}`, snap);
    localStorage.setItem(`smPro_bkts${slot}`, Date.now());
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
        const ts = parseInt(localStorage.getItem(`smPro_bkts${i}`)) || 0;
        const bk = localStorage.getItem(`smPro_bk${i}`);
        if (bk && ts > bestTs) { best = bk; bestTs = ts; }
      }
      if (best) raw = best;
    }
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function persistAll(key) {
  saveLocal();
  if (key) markDirty(key);
  pushToFirebase();
}

// ── Undo ──────────────────────────────────────────────────────
function pushUndo(label, snapshot) {
  undoStack.push({ label, snapshot: JSON.parse(JSON.stringify(snapshot)) });
  if (undoStack.length > 20) undoStack.shift();
}

function undoLastChange() {
  if (!undoStack.length) return;
  const { snapshot } = undoStack.pop();
  Object.assign(state, snapshot);
  persistAll();
  renderAll();
  hideToast();
}

// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
}

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr()   { return toDateStr(new Date()); }

// ── Day Off Helpers ───────────────────────────────────────────
function getEmpDaysOff(empId) {
  // FIX: check both state.empDaysOff (legacy) and emp.daysOff (canonical)
  const emp = state.employees.find(e => e.id === empId);
  return emp?.daysOff || state.empDaysOff?.[empId] || [];
}

// FIX: isEmpDayOff removed from state.js — canonical version lives in schedule.js.
// It is defined there and loaded first, so all callers share one implementation.

function getEmpHourCap(empId) {
  const emp = state.employees.find(e => e.id === empId);
  return emp?.hourCap || state.empHourCap?.[empId] || DEFAULTHRSCAP;
}

// ── Absence Helpers ───────────────────────────────────────────
function autoCleanAbsences() {
  if (!state.absences) return;
  const today = todayStr();
  // FIX: only delete dates strictly BEFORE today (not today itself),
  // and only run if we have a clear today reference to avoid clock skew issues.
  Object.keys(state.absences).forEach(iso => {
    if (iso < today) delete state.absences[iso];
  });
}

// ── Init ──────────────────────────────────────────────────────
function initState() {
  const saved = loadLocal();
  if (saved) {
    ['employees','volunteers','defaultSchedule','schedule',
     'volAvailability','absences','leaveRequests','swapRequests',
     'holidays','empDaysOff','empHourCap'].forEach(k => {
      if (saved[k] !== undefined) state[k] = saved[k];
    });
  }
  // FIX: only auto-clean on first load, not on every Firebase reload,
  // to avoid wiping absences that haven't synced yet.
  // autoCleanAbsences is called once here; Firebase reloads skip it.
  autoCleanAbsences();
  initHolidays();
  localStorage.removeItem('smPro_adminPin');
  localStorage.removeItem('smPro_adminPinHash');

  let cfg = HARDCODEDCONFIG;
  try {
    const savedCfg = localStorage.getItem('smPro_fbConfig');
    if (savedCfg) {
      const parsed = JSON.parse(savedCfg);
      if (parsed.apiKey && parsed.databaseURL) cfg = parsed;
    }
  } catch(e) {}
  if (cfg.apiKey && cfg.databaseURL) initFirebase(cfg);
}

// ── Midnight re-render ────────────────────────────────────────
// FIX: scheduleMidnightRefresh is defined canonically in ui.js.
// Removed duplicate definition here to avoid double-scheduling.
