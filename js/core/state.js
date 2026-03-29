// ── core/state.js ─────────────────────────────────────────────

let state = {
  employees       : [],
  volunteers      : [],
  defaultSchedule : {},
  schedule        : {},
  volAvailability : {},
  absences        : {},
  leaveRequests   : [],
  swapRequests    : [],
  holidays        : {},
  empDaysOff      : {},
  empHourCap      : {},
  currentWeekMon  : null,
  currentDateISO  : null,
  currentDow      : null,
  mode            : 'live',
  meta            : {},
  // ── Schedule Wizard ──────────────────────────────────────────
  draftSchedule   : {},   // iso → { blocks[], score, gaps[], locked }
  draftBlocks     : {},   // iso → Block[] working copy
  lunchWaves      : {},   // iso → { wave1: [empId], wave2: [empId] }
  wizardEarlyGate : {},   // iso → empId  (who does 6-9am Gate)
  wizardMaintenance: null, // empId or null
};

let undoStack = [];

// ── PIN Auth ──────────────────────────────────────────────────
async function hashPin(pin) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(pin)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(pin) {
  if (!HARDCODEDPINHASH || HARDCODEDPINHASH === 'PASTE_YOUR_HASH_HERE') return false;
  const h = await hashPin(pin);
  return h === HARDCODEDPINHASH;
}

function hasPinSet() {
  return !!HARDCODEDPINHASH && HARDCODEDPINHASH !== 'PASTE_YOUR_HASH_HERE';
}

function setPinHash(pin) {}
function migrateLegacyPin() {}

// ── Persistence ───────────────────────────────────────────────
function saveLocal() {
  try {
    const snap = JSON.stringify(state);
    localStorage.setItem('smPro_data', snap);
    const slot = Date.now() % 3;
    localStorage.setItem(`smPro_bk${slot}`,   snap);
    localStorage.setItem(`smPro_bkts${slot}`, Date.now());
    sessionStorage.setItem('smPro_session',   snap);
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
  undoStack.push({
    label,
    snapshot: JSON.parse(JSON.stringify(snapshot))
  });
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

// ── Day Off helpers ───────────────────────────────────────────
function getEmpDaysOff(empId) {
  const emp = state.employees.find(e => e.id === empId);
  return emp?.daysOff || state.empDaysOff?.[empId] || [];
}

function getEmpHourCap(empId) {
  const emp = state.employees.find(e => e.id === empId);
  return emp?.hourCap || state.empHourCap?.[empId] || DEFAULTHRSCAP;
}

// ── Absence helpers ───────────────────────────────────────────
function autoCleanAbsences() {
  if (!state.absences) return;
  const today = todayStr();
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

  // ── Restore unfinished wizard draft from localStorage ─────────
try {
  const savedDraft = localStorage.getItem('smPro_draft_nextweek');
  if (savedDraft) {
    const parsed = JSON.parse(savedDraft);
    if (parsed.draftSchedule) state.draftSchedule  = parsed.draftSchedule;
    if (parsed.draftBlocks)   state.draftBlocks    = parsed.draftBlocks;
    if (parsed.lunchWaves)    state.lunchWaves     = parsed.lunchWaves;
    if (parsed.wizardEarlyGate) state.wizardEarlyGate = parsed.wizardEarlyGate;
    if (parsed.wizardMaintenance !== undefined)
      state.wizardMaintenance = parsed.wizardMaintenance;
  }
} catch(e) {}

  // ✅ Guard: ensure currentWeekMon is always valid before any render
  if (!state.currentWeekMon) {
    state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  }
  if (!state.currentDateISO) {
    state.currentDateISO = todayStr();
  }
  if (!state.currentDow) {
    state.currentDow = DAYSSHORT[(new Date().getDay() + 6) % 7];
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

  if (cfg && cfg.apiKey && cfg.databaseURL) initFirebase(cfg);
}
