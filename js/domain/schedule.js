// ── domain/schedule.js ────────────────────────────────────────

function isEmpDayOff(empId, iso) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return false;
  // Check swap — if employee has active swap fromDate=iso, they are working
  const swapped = (state.swapRequests||[]).some(s =>
    s.empId === empId && s.fromDate === iso && s.status === 'active'
  );
  if (swapped) return false;
  const dow = DAYSSHORT[(new Date(iso+'T00:00:00').getDay()+6)%7];
  return (emp.daysOff||[]).includes(dow);
}

function isOnLeave(empId, iso) {
  return (state.leaveRequests||[]).some(l =>
    l.empId === empId && l.status === 'active' &&
    iso >= l.from && iso <= l.to
  );
}

function getResolvedLoc(iso, si, empId) {
  // 1. Override
  const ovr = state.schedule?.[iso]?.[si]?.[empId];
  if (ovr) return { loc: ovr, source: 'override' };

  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return { loc: 'off', source: 'default' };

  // 2. Day off
  if (isEmpDayOff(empId, iso)) return { loc: 'off', source: 'dayoff' };

  // 3. Leave
  if (isOnLeave(empId, iso)) return { loc: 'vac', source: 'leave' };

  // 4. Default schedule
  const dow = DAYSSHORT[(new Date(iso+'T00:00:00').getDay()+6)%7];
  const def = state.defaultSchedule?.[dow]?.[si]?.[empId];
  if (def) return { loc: def, source: 'default' };

  // 5. Fallback
  return { loc: emp.fallback || 'off', source: 'fallback' };
}

function calcScheduledHrsWeek(empId, weekMon) {
  const mon = new Date(weekMon + 'T00:00:00');
  let total = 0;
  for (let di = 0; di < 7; di++) {
    const d   = new Date(mon); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    if (isEmpDayOff(empId, iso) || isOnLeave(empId, iso)) continue;
    // FIX: also skip absent days — absent staff were being counted before
    if (state.absences?.[iso]?.[empId]) continue;
    TIMESLOTS.forEach((slot, si) => {
      const { loc } = getResolvedLoc(iso, si, empId);
      // FIX: SLOT_HRS is now a per-slot array (constants.js fix); index by si
      if (loc !== 'off' && loc !== 'vac') total += SLOT_HRS[si] || 0;
    });
  }
  return total;
}

function getSlotAssignments(iso, si) {
  return state.employees
    .filter(e => e.status === 'Active')
    .map(e => ({ emp: e, ...getResolvedLoc(iso, si, e.id) }));
}

function countDayOverrides(iso) {
  const ovrs = state.schedule?.[iso] || {};
  return Object.values(ovrs).reduce((acc, slot) =>
    acc + Object.keys(slot).length, 0);
}

// ── Wizard: convert block sequence → slot map ─────────────────
function blocksToSlotMap(iso) {
  const blocks = state.draftBlocks[iso] || [];
  const slotMap = {};

  blocks.forEach(block => {
    if (block.type === 'lunch') return;
    for (let si = block.siStart; si <= block.siEnd; si++) {
      if (!slotMap[si]) slotMap[si] = {};
      slotMap[si][block.empId] = block.loc;
    }
  });

  return slotMap;
}

function applyDraftToSchedule(isoList) {
  isoList.forEach(iso => {
    const slotMap = blocksToSlotMap(iso);
    if (Object.keys(slotMap).length) {
      state.schedule[iso] = slotMap;
    }
  });
}
