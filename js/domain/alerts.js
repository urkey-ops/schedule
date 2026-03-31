// ── domain/alerts.js ─────────────────────────────────────────

function getDayGapCount(iso) {
  return getCoverageGaps(iso).length;
}

function scanAlerts(iso) {
  const alerts = [];

  // Coverage gaps (continuous, not per-slot)
  getCoverageGaps(iso).forEach(g => {
    alerts.push({
      type     : ALERT_TYPES.GAP,
      iso,
      loc      : g.loc,
      gapStart : g.gapStart,
      gapEnd   : g.gapEnd,
      msg      : `${LOCLABEL[g.loc] || g.loc} uncovered ` +
                 `${minsToHHMM(g.gapStart)}–${minsToHHMM(g.gapEnd)}`,
    });
  });

  // Absent employees
  Object.keys(state.absences?.[iso] || {}).forEach(empId => {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) alerts.push({
      type  : ALERT_TYPES.ABSENT,
      iso,
      empId,
      msg   : `${emp.name} is absent today`,
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

  // Over hour cap
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  state.employees.filter(e => e.status === 'Active').forEach(e => {
    const used = calcScheduledHrsWeek(e.id, weekMon);
    const cap  = getEmpHourCap(e.id);
    if (used > cap) alerts.push({
      type  : ALERT_TYPES.OVERHR,
      iso,
      empId : e.id,
      msg   : `${e.name} is ${(used - cap).toFixed(1)}h over cap this week`,
    });
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
