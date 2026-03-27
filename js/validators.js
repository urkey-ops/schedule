// ── validators.js ─────────────────────────────────────────────

function validateDuplicateEmployee(name, excludeId = null) {
  const dupe = state.employees.some(e =>
    e.name.trim().toLowerCase() === name.trim().toLowerCase() &&
    e.id !== excludeId
  );
  if (dupe) { alert(`An employee named "${name}" already exists.`); return false; }
  return true;
}

function validateLeaveOverlap(empId, from, to, excludeId = null) {
  const conflict = (state.leaveRequests || []).some(l => {
    if (l.status !== 'active') return false;
    if (l.empId !== empId)     return false;
    if (l.id    === excludeId) return false;
    return from <= l.to && to >= l.from;
  });
  if (conflict) {
    alert('This employee already has active leave that overlaps these dates.');
    return false;
  }
  return true;
}

function validateSwapDayOff(empId, fromDate) {
  // Fixed: was DAYS_SHORT (undefined) — must be DAYSSHORT
  const dow     = DAYSSHORT[(new Date(fromDate + 'T00:00:00').getDay() + 6) % 7];
  const daysOff = getEmpDaysOff(empId);
  if (!daysOff.includes(dow)) {
    alert(`${fromDate} is not a registered day-off for this employee (their day-off: ${daysOff.join(', ') || 'none'}).`);
    return false;
  }
  // Check for duplicate swap on same day-off date
  const dupSwap = (state.swapRequests || []).some(s =>
    s.empId === empId && s.fromDate === fromDate && s.status === 'active'
  );
  if (dupSwap) {
    alert('This employee already has an active swap for that day-off date.');
    return false;
  }
  return true;
}
