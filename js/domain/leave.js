// ── domain/leave.js ───────────────────────────────────────────

// ── Validators ────────────────────────────────────────────────

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

// ── Leave usage calc ──────────────────────────────────────────

function calcLeaveUsed(empId, type) {
  return (state.leaveRequests || [])
    .filter(l => l.empId === empId && l.type === type && l.status === 'active')
    .reduce((acc, l) => {
      const from = new Date(l.from + 'T00:00:00');
      const to   = new Date(l.to   + 'T00:00:00');
      return acc + Math.round((to - from) / 86400000) + 1;
    }, 0);
}

// ── Leave conflict check (shift-based) ───────────────────────
// Returns shifts that conflict with the leave period so admin
// can decide whether to proceed.

function checkLeaveConflicts(empId, from, to) {
  const conflicts = [];
  const start     = new Date(from + 'T00:00:00');
  const end       = new Date(to   + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso     = toDateStr(d);
    const shifts  = (state.shifts?.[iso] || []).filter(s =>
      s.empId === empId && s.loc !== 'off' && s.loc !== 'vac'
    );
    shifts.forEach(s => {
      conflicts.push({
        iso,
        loc  : s.loc,
        start: s.start,
        end  : s.end,
        label: `${fmtDate(iso)} ${minsToHHMM(s.start)}–${minsToHHMM(s.end)} ${LOCLABEL[s.loc] || s.loc}`,
      });
    });
  }
  return conflicts;
}

// ── Leave CRUD ────────────────────────────────────────────────

function cancelLeave(leaveId) {
  const rec = (state.leaveRequests || []).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('leaveRequests');
  renderLeave();
  renderAll();
  showToast('Leave cancelled');
}

function reinstateLeave(leaveId) {
  const rec = (state.leaveRequests || []).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'active';
  persistAll('leaveRequests');
  renderLeave();
  renderAll();
  showToast('Leave reinstated');
}

function deleteLeave(leaveId) {
  if (!confirm('Delete this leave record?')) return;
  pushUndo('Delete leave', state);
  state.leaveRequests = (state.leaveRequests || []).filter(l => l.id !== leaveId);
  persistAll('leaveRequests');
  renderLeave();
  renderAll();
  showToast('Leave deleted');
}
