// ── domain/shifts.js ─────────────────────────────────────────

function minsToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function HHMMtoMins(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function shiftsForDay(iso) { return state.shifts?.[iso] || []; }

function baseRotaShifts(iso) {
  const dow     = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const empRota = state.defaultSchedule?.[dow] || {};
  const shifts  = [];
  Object.entries(empRota).forEach(([empId, blocks]) => {
    (blocks || []).forEach(b => {
      shifts.push({ id: `base-${empId}-${b.start}`, empId, loc: b.loc,
                    start: b.start, end: b.end, isBase: true });
    });
  });
  return shifts;
}

function getResolvedShifts(iso) {
  const overrides   = shiftsForDay(iso);
  const base        = baseRotaShifts(iso);
  const overrideEmp = new Set(overrides.map(s => s.empId));
  const baseFiltered = base.filter(s => !overrideEmp.has(s.empId));

  const earlyEmpId = state.earlyGate?.[iso];
  const earlyShift = earlyEmpId
    ? [{ id: `early-${iso}`, empId: earlyEmpId, loc: 'gate',
         start: EARLY_GATE_START, end: EARLY_GATE_END, isEarlyGate: true }]
    : [];

  const all = [...earlyShift, ...overrides, ...baseFiltered];
  return all.filter(s => {
    if (!earlyEmpId) return true;
    if (s.isEarlyGate) return true;
    if (s.empId === earlyEmpId &&
        s.start < EARLY_GATE_END && s.end > EARLY_GATE_START) return false;
    return true;
  });
}

function getLocAtTime(iso, loc, timeMins) {
  if (loc === 'off' || loc === 'vac') return [];
  return getResolvedShifts(iso)
    .filter(s => s.loc === loc && s.start <= timeMins && s.end > timeMins)
    .map(s => state.employees.find(e => e.id === s.empId))
    .filter(Boolean);
}

function getEmpLocAtTime(iso, empId, timeMins) {
  if (isOnLeave(empId, iso))           return 'vac';
  if (isEmpDayOff(empId, iso))         return 'off';
  if (state.absences?.[iso]?.[empId])  return 'off';

  const match = getResolvedShifts(iso).find(s =>
    s.empId === empId && s.start <= timeMins && s.end > timeMins
  );
  if (match) return match.loc;
  return state.employees.find(e => e.id === empId)?.fallback || 'off';
}

function currentSlotIdx() {
  const mins = nowMins();
  if (mins < DISPLAY_START_MINS || mins >= DISPLAY_END_MINS) return -1;
  return Math.floor((mins - DISPLAY_START_MINS) / SLOT_DURATION_MINS);
}

// ── CRUD ──────────────────────────────────────────────────────

function addShift(iso, empId, loc, startMins, endMins) {
  if (!state.shifts)      state.shifts      = {};
  if (!state.shifts[iso]) state.shifts[iso] = [];

  const locH = LOC_HOURS[loc];
  if (locH) {
    if (startMins < locH.open)  startMins = locH.open;
    if (endMins   > locH.close) endMins   = locH.close;
    if (startMins >= endMins) return null;
  }

  // Check soft/hard overtime cap
  const weekMon = getWeekMonStr(iso);
  const currentHrs = calcScheduledHrsWeek(empId, weekMon);
  const newHrs     = (endMins - startMins) / 60;
  const emp        = state.employees.find(e => e.id === empId);
  const cap        = getEmpHourCap(empId);

  if (currentHrs + newHrs > OVERTIME_HARD_CAP) {
    if (!confirm(`⚠ ${emp?.name || empId} would exceed the hard cap of ${OVERTIME_HARD_CAP}h (currently ${currentHrs.toFixed(1)}h + ${newHrs.toFixed(1)}h). Add anyway?`)) return null;
  } else if (currentHrs + newHrs > OVERTIME_SOFT_CAP && currentHrs <= OVERTIME_SOFT_CAP) {
    showToast(`⏱ ${emp?.name || empId} will exceed ${OVERTIME_SOFT_CAP}h this week`);
  }

  state.shifts[iso] = state.shifts[iso].filter(s =>
    s.empId !== empId || s.end <= startMins || s.start >= endMins
  );

  const shift = { id: uid(), empId, loc, start: startMins, end: endMins, updatedAt: Date.now() };
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
  Object.assign(shift, changes, { updatedAt: Date.now() });
  persistAll('shifts');
}

function setEarlyGate(iso, empId) {
  if (!state.earlyGate) state.earlyGate = {};
  if (empId) state.earlyGate[iso] = empId;
  else delete state.earlyGate[iso];
  persistAll('earlyGate');
}

// ── Revert single employee to base rota ───────────────────────
function revertEmpToBase(iso, empId) {
  if (!confirm(`Revert ${state.employees.find(e=>e.id===empId)?.name || empId}'s shifts for ${fmtDate(iso)} to base rota?`)) return;
  pushUndo('Revert to base', state);
  if (state.shifts?.[iso]) {
    state.shifts[iso] = state.shifts[iso].filter(s => s.empId !== empId);
    if (!state.shifts[iso].length) delete state.shifts[iso];
  }
  persistAll('shifts');
  renderRota();
  showToast('Reverted to base rota');
}

// ── Base rota CRUD ────────────────────────────────────────────

function setBaseShift(dow, empId, loc, startMins, endMins) {
  if (!state.defaultSchedule)               state.defaultSchedule               = {};
  if (!state.defaultSchedule[dow])          state.defaultSchedule[dow]          = {};
  if (!state.defaultSchedule[dow][empId])   state.defaultSchedule[dow][empId]   = [];

  state.defaultSchedule[dow][empId] = state.defaultSchedule[dow][empId]
    .filter(b => b.end <= startMins || b.start >= endMins);

  state.defaultSchedule[dow][empId].push({ loc, start: startMins, end: endMins });
  state.defaultSchedule[dow][empId].sort((a, b) => a.start - b.start);
  persistAll('defaultSchedule');
  logAction('edit_base_rota', `Base rota updated: ${dow} ${empId} ${LOCLABEL[loc]} ${minsToHHMM(startMins)}–${minsToHHMM(endMins)}`);
}

function removeBaseShift(dow, empId, startMins) {
  if (!state.defaultSchedule?.[dow]?.[empId]) return;
  state.defaultSchedule[dow][empId] =
    state.defaultSchedule[dow][empId].filter(b => b.start !== startMins);
  persistAll('defaultSchedule');
}

// ── Hours ─────────────────────────────────────────────────────

function calcEmpHrsDay(iso, empId) {
  return getResolvedShifts(iso)
    .filter(s => s.empId === empId && s.loc !== 'off' && s.loc !== 'vac' && s.loc !== 'lunch')
    .reduce((acc, s) => acc + (s.end - s.start) / 60, 0);
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

function getWeekHoursSummary(weekMon) {
  const result = {};
  state.employees.filter(e => e.status === 'Active').forEach(e => {
    result[e.id] = calcScheduledHrsWeek(e.id, weekMon);
  });
  return result;
}

function getUnscheduledEmployees(weekMon) {
  return state.employees
    .filter(e => e.status === 'Active' && !e.inTraining)
    .filter(e => calcScheduledHrsWeek(e.id, weekMon) === 0);
}

// ── Coverage gap detection ────────────────────────────────────
// Uses MIN_STAFF_PER_LOC — gap = covered by fewer staff than minimum

function getCoverageGaps(iso) {
  const gaps   = [];
  const shifts = getResolvedShifts(iso);

  REQUIREDLOCS.forEach(loc => {
    const locH   = LOC_HOURS[loc];
    const minStaff = MIN_STAFF_PER_LOC[loc] || 1;
    if (!locH) return;

    // Build coverage timeline: array of { time, delta }
    const events = [];
    shifts
      .filter(s => s.loc === loc &&
        !isEmpDayOff(s.empId, iso) &&
        !isOnLeave(s.empId, iso) &&
        !state.absences?.[iso]?.[s.empId])
      .forEach(s => {
        events.push({ t: s.start, d: +1 });
        events.push({ t: s.end,   d: -1 });
      });
    events.sort((a, b) => a.t - b.t || b.d - a.d);

    let count  = 0;
    let cursor = locH.open;
    let gapStart = null;

    const checkGap = (t) => {
      if (count < minStaff && gapStart === null) gapStart = cursor;
      else if (count >= minStaff && gapStart !== null) {
        if (t > gapStart) gaps.push({ loc, gapStart, gapEnd: t, understaffed: count > 0 });
        gapStart = null;
      }
    };

    for (const ev of events) {
      if (ev.t < locH.open || ev.t > locH.close) continue;
      checkGap(ev.t);
      cursor = ev.t;
      count += ev.d;
    }
    checkGap(locH.close);
    if (gapStart !== null && locH.close > gapStart) {
      gaps.push({ loc, gapStart, gapEnd: locH.close, understaffed: count > 0 });
    }
  });

  return gaps;
}

function isLocCoveredAtTime(iso, loc, timeMins) {
  const minStaff = MIN_STAFF_PER_LOC[loc] || 1;
  return getLocAtTime(iso, loc, timeMins).length >= minStaff;
}

function whoWasAt(iso, loc, timeMins) { return getLocAtTime(iso, loc, timeMins); }
