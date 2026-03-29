// ── domain/alerts.js ─────────────────────────────────────────

function getDayGapCount(iso) {
  return scanAlerts(iso).filter(a => a.type === ALERT_TYPES.GAP).length;
}

function scanAlerts(iso) {
  const alerts     = [];
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  TIMESLOTS.forEach((slot, si) => {
    REQUIREDLOCS.forEach(loc => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso))         return false;
        if (isOnLeave(e.id, iso))           return false;
        if (state.absences?.[iso]?.[e.id]) return false;
        const { loc: l } = getResolvedLoc(iso, si, e.id);
        return l === loc;
      });
      if (!covered) {
        alerts.push({
          type : ALERT_TYPES.GAP,
          iso,
          si,
          slot,
          loc,
          msg  : `${slot} — ${LOCLABEL[loc] || loc} uncovered`,
        });
      }
    });
  });

  // Absent employees
  const absentIds = Object.keys(state.absences?.[iso] || {});
  absentIds.forEach(empId => {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) alerts.push({
      type : ALERT_TYPES.ABSENT,
      iso,
      empId,
      msg  : `${emp.name} is absent today`,
    });
  });

  // Leave
  (state.leaveRequests || [])
    .filter(l => l.status === 'active' && iso >= l.from && iso <= l.to)
    .forEach(l => {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) alerts.push({
        type  : ALERT_TYPES.LEAVE,
        iso,
        empId : l.empId,
        msg   : `${emp.name} on ${l.type} leave`,
      });
    });

  // FIX: emit OVERHR alerts so adminhq.js GROUPS['overhr'] actually renders.
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  activeEmps.forEach(emp => {
    const used = calcScheduledHrsWeek(emp.id, weekMon);
    const cap  = emp.hourCap || DEFAULTHRSCAP;
    if (used > cap) {
      alerts.push({
        type  : ALERT_TYPES.OVERHR,
        iso,
        empId : emp.id,
        msg   : `${emp.name} is ${(used - cap).toFixed(1)}h over cap this week`,
      });
    }
  });

  return alerts;
}

function scanWeekAlerts(weekMon) {
  const alerts = [];
  const mon    = new Date(weekMon + 'T00:00:00');
  for (let di = 0; di < 7; di++) {
    const d   = new Date(mon); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    alerts.push(...scanAlerts(iso).map(a => ({ ...a, iso })));
  }
  return alerts;
}

// FIX: stub for updateDayPillDots — called by holidays.js (addHoliday, deleteHoliday,
// updateHolidayDate) but was never defined anywhere. Delegates to renderWeekNav
// which is the function that actually rebuilds the day pills with holiday dots.
function updateDayPillDots() {
  if (typeof renderWeekNav === 'function') renderWeekNav();
}
