// ── domain/shifts.js ─────────────────────────────────────────
// All shift storage is: state.shifts[iso] = [{ id, empId, loc, start, end }]
// start / end are minutes from midnight (e.g. 9*60 = 540 = 09:00)

// ── Helpers ───────────────────────────────────────────────────
function minsToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function HHMMtoMins(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function shiftsForDay(iso) {
  return state.shifts?.[iso] || [];
}

function baseRotaShifts(iso) {
  // Returns shifts derived from the base rota (defaultSchedule) for this date.
  // defaultSchedule[dow][empId] = [{ loc, start, end }]
  const dow = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const empRota = state.defaultSchedule?.[dow] || {};
  const shifts = [];
  Object.entries(empRota).forEach(([empId, blocks]) => {
    (blocks || []).forEach(b => {
      shifts.push({ id: `base-${empId}-${b.start}`, empId, loc: b.loc,
                    start: b.start, end: b.end, isBase: true });
    });
  });
  return shifts;
}

// Resolved shifts for a day: base rota merged with overrides.
// An override replaces ALL base shifts for that employee on that day
// if any override exists for them; otherwise base rota is used.
function getResolvedShifts(iso) {
  const overrides   = shiftsForDay(iso);
  const base        = baseRotaShifts(iso);
  const overrideEmp = new Set(overrides.map(s => s.empId));

  const baseFiltered = base.filter(s => !overrideEmp.has(s.empId));

  // Also fold in early gate
  const earlyEmpId = state.earlyGate?.[iso];
  const earlyShift = earlyEmpId
    ? [{ id: `early-${iso}`, empId: earlyEmpId, loc: 'gate',
         start: EARLY_GATE_START, end: EARLY_GATE_END, isEarlyGate: true }]
    : [];

  // Filter out base/override gate shifts during early window for early gate person
  const all = [...earlyShift, ...overrides, ...baseFiltered];
  return all.filter(s => {
    if (!earlyEmpId) return true;
    if (s.isEarlyGate) return true;
    // For the early gate person, remove any shift that overlaps the early window
    if (s.empId === earlyEmpId &&
        s.start < EARLY_GATE_END && s.end > EARLY_GATE_START) {
      return false;
    }
    return true;
  });
}

// Who is at a given location at a given time (mins)?
// Returns array of employees currently there.
function getLocAtTime(iso, loc, timeMins) {
  if (loc === 'off' || loc === 'vac') return [];
  const shifts = getResolvedShifts(iso);
  return shifts
    .filter(s => s.loc === loc && s.start <= timeMins && s.end > timeMins)
    .map(s => state.employees.find(e => e.id === s.empId))
    .filter(Boolean);
}

// What location is an employee at right now?
function getEmpLocAtTime(iso, empId, timeMins) {
  if (isOnLeave(empId, iso))    return 'vac';
  if (isEmpDayOff(empId, iso))  return 'off';
  if (state.absences?.[iso]?.[empId]) return 'off';

  const shifts = getResolvedShifts(iso);
  const match  = shifts.find(s =>
    s.empId === empId && s.start <= timeMins && s.end > timeMins
  );
  if (match) return match.loc;

  const emp = state.employees.find(e => e.id === empId);
  return emp?.fallback || 'off';
}

// Current slot index for display grid alignment
function currentSlotIdx() {
  const mins = nowMins();
  if (mins < DISPLAY_START_MINS || mins >= DISPLAY_END_MINS) return -1;
  return Math.floor((mins - DISPLAY_START_MINS) / SLOT_DURATION_MINS);
}

// ── CRUD ──────────────────────────────────────────────────────
function addShift(iso, empId, loc, startMins, endMins) {
  if (!state.shifts)       state.shifts       = {};
  if (!state.shifts[iso])  state.shifts[iso]  = [];

  // Validate against location operating hours
  const locH = LOC_HOURS[loc];
  if (locH) {
    if (startMins < locH.open)  startMins = locH.open;
    if (endMins   > locH.close) endMins   = locH.close;
    if (startMins >= endMins) return null;
  }

  // Remove any existing shift for this employee that overlaps this time range
  state.shifts[iso] = state.shifts[iso].filter(s =>
    s.empId !== empId || s.end <= startMins || s.start >= endMins
  );

  const shift = { id: uid(), empId, loc, start: startMins, end: endMins };
  state.shifts[iso].push(shift);
  state.shifts[iso].sort((a, b) => a.start - b.start || a.empId.localeCompare(b.empId));
  persistAll('shifts');
  return shift;
}

function removeShift(iso, shiftId) {
  if (!state.shifts?.[iso]) return;
  state.shifts[iso] = state.shifts[iso].filter(s => s.id !== shiftId);
  if (!state.shifts[iso].length) delete state.shifts[iso];
  persistAll('shifts');
}

function updateShift(iso, shiftId, changes) {
  const shift = state.shifts?.[iso]?.find(s => s.id === shiftId);
  if (!shift) return;
  Object.assign(shift, changes);
  persistAll('shifts');
}

// Set early gate person for a day
function setEarlyGate(iso, empId) {
  if (!state.earlyGate) state.earlyGate = {};
  if (empId) {
    state.earlyGate[iso] = empId;
  } else {
    delete state.earlyGate[iso];
  }
  persistAll('earlyGate');
}

// ── Base rota CRUD ────────────────────────────────────────────
// defaultSchedule[dow][empId] = [{ loc, start, end }]

function setBaseShift(dow, empId, loc, startMins, endMins) {
  if (!state.defaultSchedule)          state.defaultSchedule          = {};
  if (!state.defaultSchedule[dow])     state.defaultSchedule[dow]     = {};
  if (!state.defaultSchedule[dow][empId]) state.defaultSchedule[dow][empId] = [];

  // Remove overlapping base shifts for this employee/day
  state.defaultSchedule[dow][empId] = state.defaultSchedule[dow][empId]
    .filter(b => b.end <= startMins || b.start >= endMins);

  state.defaultSchedule[dow][empId].push({ loc, start: startMins, end: endMins });
  state.defaultSchedule[dow][empId].sort((a, b) => a.start - b.start);
  persistAll('defaultSchedule');
}

function removeBaseShift(dow, empId, startMins) {
  if (!state.defaultSchedule?.[dow]?.[empId]) return;
  state.defaultSchedule[dow][empId] =
    state.defaultSchedule[dow][empId].filter(b => b.start !== startMins);
  persistAll('defaultSchedule');
}

// ── Hours calculation ─────────────────────────────────────────
function calcEmpHrsDay(iso, empId) {
  const shifts = getResolvedShifts(iso).filter(s =>
    s.empId === empId && s.loc !== 'off' && s.loc !== 'vac' && s.loc !== 'lunch'
  );
  return shifts.reduce((acc, s) => acc + (s.end - s.start) / 60, 0);
}

function calcScheduledHrsWeek(empId, weekMon) {
  const mon = new Date(weekMon + 'T00:00:00');
  let total = 0;
  for (let di = 0; di < 7; di++) {
    const d   = new Date(mon); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    if (isEmpDayOff(empId, iso) || isOnLeave(empId, iso)) continue;
    if (state.absences?.[iso]?.[empId]) continue;
    total += calcEmpHrsDay(iso, empId);
  }
  return total;
}

// ── Coverage gap detection ────────────────────────────────────
// Returns array of { loc, gapStart, gapEnd } for uncovered windows
function getCoverageGaps(iso) {
  const gaps   = [];
  const shifts = getResolvedShifts(iso);

  REQUIREDLOCS.forEach(loc => {
    const locH = LOC_HOURS[loc];
    if (!locH) return;

    // Collect all covered intervals for this location
    const covered = shifts
      .filter(s => s.loc === loc &&
        !isEmpDayOff(s.empId, iso) &&
        !isOnLeave(s.empId, iso) &&
        !state.absences?.[iso]?.[s.empId])
      .map(s => ({ start: s.start, end: s.end }))
      .sort((a, b) => a.start - b.start);

    // Find uncovered ranges within operating window
    let cursor = locH.open;
    covered.forEach(interval => {
      if (interval.start > cursor) {
        gaps.push({ loc, gapStart: cursor, gapEnd: interval.start });
      }
      if (interval.end > cursor) cursor = interval.end;
    });
    if (cursor < locH.close) {
      gaps.push({ loc, gapStart: cursor, gapEnd: locH.close });
    }
  });

  return gaps;
}

// ── Point-in-time gap check (used by Now view) ────────────────
function isLocCoveredAtTime(iso, loc, timeMins) {
  return getLocAtTime(iso, loc, timeMins).length > 0;
}

// ── Who was where (accountability lookup) ─────────────────────
function whoWasAt(iso, loc, timeMins) {
  // Checks resolved shifts (includes early gate, base rota, overrides)
  return getLocAtTime(iso, loc, timeMins);
}
