let state = {
  employees: [],
  volunteers: [],
  defaultSchedule: {},
  schedule: {},
  volAvailability: {},
  absences: {},
  leaveRequests: [],
  swapRequests: [],
  holidays: {},
  empDaysOff: {},
  empHourCap: {},
  currentWeekMon: '',
  currentDateISO: '',
  currentDow: '',
  mode: 'live',
  meta: {}
};

let _undoStack = [];

// ── PIN Auth ──────────────────────────────────────────────────
// PIN hash lives in config.js as HARDCODED_PIN_HASH.
// To generate a new hash, run in browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpin'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
// Then paste the result into config.js as HARDCODED_PIN_HASH.

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function verifyPin(pin) {
  if (!HARDCODED_PIN_HASH || HARDCODED_PIN_HASH === 'PASTE_YOUR_HASH_HERE') return false;
  const h = await hashPin(pin);
  return h === HARDCODED_PIN_HASH;
}

function hasPinSet() {
  return !!(HARDCODED_PIN_HASH && HARDCODED_PIN_HASH !== 'PASTE_YOUR_HASH_HERE');
}

// No-ops — kept so nothing else in codebase breaks if called
async function setPinHash(pin) {}
function _migrateLegacyPin() {}

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

// key is optional — if provided, only that slice is flagged dirty for Firebase
function persistAll(key) {
  saveLocal();
  if (key) markDirty(key);
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function toDateStr(d) { return d.toISOString().slice(0,10); }
function todayStr() { return toDateStr(new Date()); }

// ── Day Off Helpers ───────────────────────────────────────────
function getEmpDaysOff(empId) {
  return state.empDaysOff?.[empId] || [];
}

function isEmpDayOff(empId, iso) {
  const dow = DAYS_SHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const days = getEmpDaysOff(empId);
  if (!days.includes(dow)) return false;
  const swapped = state.swapRequests?.some(s => s.empId === empId && s.fromDate === iso);
  return !swapped;
}

function getEmpHourCap(empId) {
  return state.empHourCap?.[empId] || DEFAULT_HRS_CAP;
}

// ── Absence Helpers ───────────────────────────────────────────
function autoCleanAbsences() {
  const today = todayStr();
  if (!state.absences) { state.absences = {}; return; }
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

  autoCleanAbsences();
  initHolidays();

  // Clean up any legacy PIN keys from localStorage — no longer used
  localStorage.removeItem('smPro_adminPin');
  localStorage.removeItem('smPro_adminPinHash');

  let cfg = HARDCODED_CONFIG;
  try {
    const savedCfg = localStorage.getItem('smPro_fbConfig');
    if (savedCfg) {
      const parsed = JSON.parse(savedCfg);
      if (parsed.apiKey && parsed.databaseURL) cfg = parsed;
    }
  } catch(e) { /* use hardcoded */ }

  if (cfg.apiKey && cfg.databaseURL) initFirebase(cfg);
}
