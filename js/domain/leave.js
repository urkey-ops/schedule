// ── domain/leave.js ───────────────────────────────────────────

// ── Validators (merged from validators.js) ────────────────────

function validateDuplicateEmployee(name, excludeId = null) {
  const dupe = state.employees.some(e =>
    e.name.trim().toLowerCase() === name.trim().toLowerCase() &&
    e.id !== excludeId
  );
  if (dupe) { alert(`An employee named "${name}" already exists.`); return false; }
  return true;
}

function validateLeaveOverlap(empId, from, to, excludeId = null) {
  const conflict = (state.leaveRequests||[]).some(l => {
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
  const dow     = DAYSSHORT[(new Date(fromDate+'T00:00:00').getDay()+6)%7];
  const emp     = state.employees.find(e => e.id === empId);
  const daysOff = emp?.daysOff || [];
  if (!daysOff.includes(dow)) {
    alert(`${fromDate} is not a registered day-off for this employee (their days off: ${daysOff.join(', ')||'none'}).`);
    return false;
  }
  const dupSwap = (state.swapRequests||[]).some(s =>
    s.empId === empId && s.fromDate === fromDate && s.status === 'active'
  );
  if (dupSwap) {
    alert('This employee already has an active swap for that day-off date.');
    return false;
  }
  return true;
}

// ── Leave usage calc ──────────────────────────────────────────

function calcLeaveUsed(empId, type) {
  return (state.leaveRequests||[])
    .filter(l => l.empId===empId && l.type===type && l.status==='active')
    .reduce((acc, l) => {
      const from = new Date(l.from+'T00:00:00');
      const to   = new Date(l.to+'T00:00:00');
      return acc + Math.round((to-from)/86400000) + 1;
    }, 0);
}

// ── Leave conflict check ──────────────────────────────────────

function checkLeaveConflicts(empId, from, to) {
  const conflicts = [];
  const start     = new Date(from+'T00:00:00');
  const end       = new Date(to+'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const iso = toDateStr(d);
    TIMESLOTS.forEach((slot, si) => {
      const ovr = state.schedule?.[iso]?.[si]?.[empId];
      if (ovr && ovr !== 'off' && ovr !== 'vac') {
        conflicts.push({ iso, si, slot, loc: ovr });
      }
    });
  }
  return conflicts;
}

// ── Leave CRUD ────────────────────────────────────────────────

function cancelLeave(leaveId) {
  const rec = (state.leaveRequests||[]).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('leaveRequests');
  renderLeave(); renderAll();
  showToast('Leave cancelled');
}

function reinstateLeave(leaveId) {
  const rec = (state.leaveRequests||[]).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'active';
  persistAll('leaveRequests');
  renderLeave(); renderAll();
  showToast('Leave reinstated');
}

function deleteLeave(leaveId) {
  if (!confirm('Delete this leave record?')) return;
  pushUndo('Delete leave', state);
  state.leaveRequests = (state.leaveRequests||[]).filter(l => l.id !== leaveId);
  persistAll('leaveRequests');
  renderLeave(); renderAll();
  showToast('Leave deleted');
}

// ── Swap CRUD ─────────────────────────────────────────────────

function cancelSwap(swapId) {
  const rec = (state.swapRequests||[]).find(s => s.id === swapId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('swapRequests');
  renderSwaps(); renderAll();
  showToast('Swap cancelled');
}

function reinstateSwap(swapId) {
  const rec = (state.swapRequests||[]).find(s => s.id === swapId);
  if (!rec) return;
  rec.status = 'active';
  persistAll('swapRequests');
  renderSwaps(); renderAll();
  showToast('Swap reinstated');
}

function deleteSwap(swapId) {
  if (!confirm('Delete this swap record?')) return;
  pushUndo('Delete swap', state);
  state.swapRequests = (state.swapRequests||[]).filter(s => s.id !== swapId);
  persistAll('swapRequests');
  renderSwaps(); renderAll();
  showToast('Swap deleted');
}
