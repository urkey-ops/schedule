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
// Fixed: use crypto.randomUUID() instead of Date.now + Math.random
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
}

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr()   { return toDateStr(new Date()); }

// ── Shared Hours Calculation (single source of truth) ─────────
// Moved here from schedule.js and staff.js — both were identical duplicates
function calcScheduledHrsWeek(empId) {
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  let total = 0;
  for (let d = 0; d < 7; d++) {
    const day = new Date(mon);
    day.setDate(day.getDate() + d);
    const iso = toDateStr(day);
    if (isEmpDayOff(empId, iso)) continue;
    TIMESLOTS.forEach((_, si) => {
      const { loc } = getResolvedLoc(iso, si, empId);
      if (loc !== 'off' && loc !== 'vac') total += SLOTHRS[si];
    });
  }
  return Math.round(total * 10) / 10;
}

// ── Day Off Helpers ───────────────────────────────────────────
function getEmpDaysOff(empId) {
  return state.empDaysOff?.[empId] || [];
}

function isEmpDayOff(empId, iso) {
  const dow = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const days = getEmpDaysOff(empId);
  if (!days.includes(dow)) return false;
  // Fixed: only active swaps unlock a day-off
  const swapped = state.swapRequests?.some(s =>
    s.empId === empId && s.fromDate === iso && s.status === 'active'
  );
  return !swapped;
}

function getEmpHourCap(empId) {
  return state.empHourCap?.[empId] || DEFAULTHRSCAP;
}

// ── Absence Helpers ───────────────────────────────────────────
function autoCleanAbsences() {
  const today = todayStr();
  if (!state.absences) return;
  // Fixed: only delete dates strictly BEFORE today, not today itself
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
function scheduleMidnightRefresh() {
  const now  = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    state.currentDateISO = todayStr();
    state.currentDow     = DAYSSHORT[(new Date().getDay() + 6) % 7];
    renderAll();
    scheduleMidnightRefresh(); // reschedule for next midnight
  }, msUntilMidnight);
}
