// ── core/state.js ─────────────────────────────────────────────

let state = {
  employees        : [],
  volunteers       : [],
  defaultSchedule  : {},
  shifts           : {},
  earlyGate        : {},
  volAvailability  : {},
  absences         : {},
  leaveRequests    : [],
  swapRequests     : [],
  publishedWeeks   : {},
  auditLog         : [],
  broadcastMsg     : null,
  empNotes         : {},
  locNotes         : {},
  shiftConfirmations: {},
  holidays         : {},
  empDaysOff       : {},
  empHourCap       : {},
  currentWeekMon   : null,
  currentDateISO   : null,
  currentDow       : null,
  mode             : 'live',
  meta             : {},
};

// ── PIN Auth ──────────────────────────────────────────────────
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function verifyPin(pin) {
  if (!HARDCODEDPINHASH || HARDCODEDPINHASH === 'PASTE_YOUR_HASH_HERE') return false;
  return (await hashPin(pin)) === HARDCODEDPINHASH;
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
  resetIdleTimer();
}

// ── Helpers ───────────────────────────────────────────────────
function getEmpDaysOff(empId) {
  const emp = state.employees.find(e => e.id === empId);
  return emp?.daysOff || state.empDaysOff?.[empId] || [];
}

function getEmpHourCap(empId) {
  const emp = state.employees.find(e => e.id === empId);
  return emp?.hourCap || state.empHourCap?.[empId] || DEFAULTHRSCAP;
}

function getNextWeekMon() {
  const d = new Date(state.currentWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + 7);
  return toDateStr(d);
}

// ── Absence helpers ───────────────────────────────────────────
function autoCleanAbsences() {
  if (!state.absences) return;
  const cutoff = toDateStr(
    new Date(new Date(todayStr() + 'T00:00:00').getTime() - 7 * 86400000)
  );
  Object.keys(state.absences).forEach(iso => {
    if (iso < cutoff) delete state.absences[iso];
  });
}

function autoCleanLocNotes() {
  if (!state.locNotes) return;
  const cutoff = toDateStr(
    new Date(new Date(todayStr() + 'T00:00:00').getTime() - 14 * 86400000)
  );
  Object.keys(state.locNotes).forEach(iso => {
    if (iso < cutoff) delete state.locNotes[iso];
  });
}

// ── Admin session ─────────────────────────────────────────────
function saveAdminSession() { localStorage.setItem('smPro_adminSession', '1'); }

function clearAdminSession() {
  localStorage.removeItem('smPro_adminSession');
  sessionStorage.removeItem('smPro_adminSession');
}

function hasAdminSession() {
  return !!(localStorage.getItem('smPro_adminSession') ||
            sessionStorage.getItem('smPro_adminSession'));
}

// ── Init ──────────────────────────────────────────────────────
function initState() {
  const saved = loadLocal();
  if (saved) {
    [
      'employees','volunteers','defaultSchedule','shifts','earlyGate',
      'volAvailability','absences','leaveRequests','swapRequests',
      'publishedWeeks','auditLog','broadcastMsg','empNotes','locNotes',
      'shiftConfirmations','holidays','empDaysOff','empHourCap',
    ].forEach(k => { if (saved[k] !== undefined) state[k] = saved[k]; });

    if (saved.schedule && !saved.shifts) migrateSlotScheduleToShifts(saved.schedule);
  }

  if (!state.currentWeekMon)  state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  if (!state.currentDateISO)  state.currentDateISO = todayStr();
  if (!state.currentDow)      state.currentDow     = DAYSSHORT[(new Date().getDay()+6)%7];
  if (!state.publishedWeeks)  state.publishedWeeks  = {};
  if (!state.auditLog)        state.auditLog        = [];
  if (!state.empNotes)        state.empNotes        = {};
  if (!state.locNotes)        state.locNotes        = {};
  if (!state.shiftConfirmations) state.shiftConfirmations = {};
  if (!state.swapRequests)    state.swapRequests    = [];

  autoCleanAbsences();
  autoCleanLocNotes();
  initHolidays();

  localStorage.removeItem('smPro_adminPin');
  localStorage.removeItem('smPro_adminPinHash');
  localStorage.removeItem('smPro_draft_nextweek');

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

// ── Migration helper ──────────────────────────────────────────
function migrateSlotScheduleToShifts(oldSchedule) {
  if (!oldSchedule) return;
  Object.entries(oldSchedule).forEach(([iso, slots]) => {
    if (!slots) return;
    const empBlocks = {};
    Object.entries(slots).forEach(([si, empMap]) => {
      const slotMins = DISPLAY_START_MINS + parseInt(si) * SLOT_DURATION_MINS;
      Object.entries(empMap || {}).forEach(([empId, loc]) => {
        if (!empBlocks[empId]) empBlocks[empId] = [];
        empBlocks[empId].push({ si: parseInt(si), slotMins, loc });
      });
    });
    const shifts = [];
    Object.entries(empBlocks).forEach(([empId, blocks]) => {
      blocks.sort((a, b) => a.si - b.si);
      let cur = null;
      blocks.forEach(b => {
        if (cur && b.loc === cur.loc && b.slotMins === cur.end) {
          cur.end = b.slotMins + SLOT_DURATION_MINS;
        } else {
          if (cur) shifts.push(cur);
          cur = { id: uid(), empId, loc: b.loc, start: b.slotMins, end: b.slotMins + SLOT_DURATION_MINS };
        }
      });
      if (cur) shifts.push(cur);
    });
    if (shifts.length) state.shifts[iso] = shifts;
  });
}
