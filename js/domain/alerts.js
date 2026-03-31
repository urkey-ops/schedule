// ── domain/alerts.js ─────────────────────────────────────────

function getDayGapCount(iso) { return getCoverageGaps(iso).length; }

function scanAlerts(iso) {
  const alerts = [];

  // Coverage gaps / understaffed
  getCoverageGaps(iso).forEach(g => {
    const type = g.understaffed ? ALERT_TYPES.UNDERSTAFFED : ALERT_TYPES.GAP;
    alerts.push({
      type,
      iso,
      loc      : g.loc,
      gapStart : g.gapStart,
      gapEnd   : g.gapEnd,
      msg      : `${LOCLABEL[g.loc] || g.loc} ${g.understaffed ? 'understaffed' : 'uncovered'} `
                 + `${minsToHHMM(g.gapStart)}–${minsToHHMM(g.gapEnd)}`,
    });
  });

  // Absent
  Object.keys(state.absences?.[iso] || {}).forEach(empId => {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) alerts.push({ type: ALERT_TYPES.ABSENT, iso, empId, msg: `${emp.name} is absent today` });
  });

  // Leave
  (state.leaveRequests || [])
    .filter(l => l.status === 'active' && iso >= l.from && iso <= l.to)
    .forEach(l => {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) alerts.push({ type: ALERT_TYPES.LEAVE, iso, empId: l.empId,
                              msg: `${emp.name} on ${l.type} leave` });
    });

  // Over hour cap
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  state.employees.filter(e => e.status === 'Active').forEach(e => {
    const used = calcScheduledHrsWeek(e.id, weekMon);
    const cap  = getEmpHourCap(e.id);
    if (used > cap) alerts.push({
      type  : ALERT_TYPES.OVERHR, iso, empId: e.id,
      msg   : `${e.name} is ${(used - cap).toFixed(1)}h over cap this week`,
    });
  });

  // Sort by priority
  alerts.sort((a, b) => (ALERT_PRIORITY[a.type] || 99) - (ALERT_PRIORITY[b.type] || 99));
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

  // Unscheduled employees this week
  const unscheduled = getUnscheduledEmployees(weekMon);
  unscheduled.forEach(e => {
    alerts.push({
      type  : ALERT_TYPES.UNSCHEDULED,
      iso   : weekMon,
      empId : e.id,
      msg   : `${e.name} has no shifts scheduled this week`,
    });
  });

  // Pending swaps
  const pendingSwaps = getPendingSwapCount();
  if (pendingSwaps) {
    alerts.push({
      type : ALERT_TYPES.SWAP_PENDING,
      iso  : weekMon,
      msg  : `${pendingSwaps} swap request${pendingSwaps > 1 ? 's' : ''} pending approval`,
    });
  }

  // Week not published by Thursday
  const today   = todayStr();
  const weekEnd = toDateStr(new Date(new Date(weekMon + 'T00:00:00').getTime() + 6 * 86400000));
  const nextMon = getNextWeekMon();
  const thursDue = toDateStr(new Date(new Date(weekMon + 'T00:00:00').getTime() + 3 * 86400000));
  if (!isWeekPublished(nextMon) && today >= thursDue && today <= weekEnd) {
    alerts.push({
      type : ALERT_TYPES.UNPUBLISHED,
      iso  : weekMon,
      msg  : `Next week (${nextMon}) is not published yet`,
    });
  }

  alerts.sort((a, b) => (ALERT_PRIORITY[a.type] || 99) - (ALERT_PRIORITY[b.type] || 99));
  return alerts;
}

function scanWeekReadinessAlerts(weekMon) {
  return scanWeekAlerts(weekMon).filter(a =>
    [ALERT_TYPES.GAP, ALERT_TYPES.UNDERSTAFFED, ALERT_TYPES.UNSCHEDULED,
     ALERT_TYPES.SWAP_PENDING, ALERT_TYPES.UNPUBLISHED].includes(a.type)
  );
}
