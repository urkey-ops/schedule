// ── domain/leave.js ───────────────────────────────────────────

// ── Leave balance helpers ─────────────────────────────────────

function calcLeaveUsed(empId, type) {
  return (state.leaveRequests || [])
    .filter(l =>
      l.empId  === empId &&
      l.type   === type  &&
      l.status === 'active'
    )
    .reduce((acc, l) => {
      const from = new Date(l.from + 'T00:00:00');
      const to   = new Date(l.to   + 'T00:00:00');
      // If partial day, count as fraction
      if (l.partialFrom && l.partialTo) {
        const startM = HHMMtoMins(l.partialFrom);
        const endM   = HHMMtoMins(l.partialTo);
        return acc + (endM - startM) / (8 * 60); // fraction of 8h day
      }
      return acc + Math.round((to - from) / 86400000) + 1;
    }, 0);
}

function calcLeaveBalance(empId, type) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return 0;
  const cap     = type === 'annual' ? (emp.annualLeave || 20) : (emp.sickLeave || 10);
  const opening = emp.openingBalance?.[type] || 0;
  const used    = calcLeaveUsed(empId, type);
  return cap + opening - used;
}

// ── Conflict detection ────────────────────────────────────────

function checkLeaveConflicts(empId, from, to) {
  // Returns array of ISO dates where emp has shifts during leave window
  const conflicts = [];
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso     = toDateStr(d);
    const shifts  = getResolvedShifts(iso).filter(s =>
      s.empId === empId && s.loc !== 'off' && s.loc !== 'vac'
    );
    if (shifts.length) conflicts.push(iso);
  }
  return conflicts;
}

// ── CRUD ──────────────────────────────────────────────────────

function cancelLeave(leaveId) {
  const rec = (state.leaveRequests || []).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('leaveRequests');
  logAction('cancel_leave', `Leave cancelled for emp ${rec.empId}`);
  renderLeave();
  renderAll();
  showToast('Leave cancelled');
}

function reinstateLeave(leaveId) {
  const rec = (state.leaveRequests || []).find(l => l.id === leaveId);
  if (!rec) return;

  // Back-to-back guard
  const others = (state.leaveRequests || []).filter(l =>
    l.id !== leaveId && l.empId === rec.empId && l.status === 'active'
  );
  const adjacent = others.some(l => l.to === rec.from || l.from === rec.to);
  if (adjacent && !confirm('This leave is adjacent to another leave period. Continue?')) return;

  rec.status = 'active';
  persistAll('leaveRequests');
  logAction('reinstate_leave', `Leave reinstated for emp ${rec.empId}`);
  renderLeave();
  renderAll();
  showToast('Leave reinstated');
}

function deleteLeave(leaveId) {
  if (!confirm('Delete this leave record? This cannot be undone.')) return;
  state.leaveRequests = (state.leaveRequests || []).filter(l => l.id !== leaveId);
  persistAll('leaveRequests');
  logAction('delete_leave', `Leave record deleted`);
  renderLeave();
  showToast('Leave deleted');
}

// ── Quick emergency absence ───────────────────────────────────
// Creates a same-day leave record and marks absent in one action
function quickEmergencyAbsence(empId, iso) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  // Mark absent
  if (!state.absences)      state.absences      = {};
  if (!state.absences[iso]) state.absences[iso] = {};
  state.absences[iso][empId] = true;
  markDirty('absences');

  // Add emergency leave record
  if (!state.leaveRequests) state.leaveRequests = [];
  state.leaveRequests.push({
    id       : `leave-${Date.now()}`,
    empId,
    from     : iso,
    to       : iso,
    type     : 'sick',
    note     : 'Emergency absence (quick mark)',
    status   : 'active',
  });
  markDirty('leaveRequests');

  persistAll();
  logAction('emergency_absence', `${emp.name} marked as emergency absent on ${iso}`);
  renderAll();
  showToast(`${emp.name} marked absent & leave added`);
}

// ── Location note helpers ─────────────────────────────────────

function getLocNote(iso, loc) {
  return state.locNotes?.[iso]?.[loc] || '';
}

function setLocNote(iso, loc, note) {
  if (!state.locNotes)       state.locNotes       = {};
  if (!state.locNotes[iso])  state.locNotes[iso]  = {};
  if (note) {
    state.locNotes[iso][loc] = note;
  } else {
    delete state.locNotes[iso][loc];
    if (!Object.keys(state.locNotes[iso]).length) delete state.locNotes[iso];
  }
  persistAll('locNotes');
  showToast('Note saved');
}

// ── Broadcast message ─────────────────────────────────────────

function saveBroadcast(text) {
  state.broadcastMsg = text ? { text, setAt: Date.now() } : null;
  persistAll('broadcastMsg');
  renderBroadcastBanner();
  showToast(text ? 'Broadcast message set' : 'Broadcast cleared');
}

function renderBroadcastBanner() {
  const el = document.getElementById('broadcast-bar');
  if (!el) return;
  if (state.broadcastMsg?.text) {
    el.innerHTML = `
      <div class="broadcast-banner">
        📢 <span>${escH(state.broadcastMsg.text)}</span>
        ${state.mode === 'admin'
          ? `<button class="btn btn-sm btn-ghost" style="margin-left:auto"
               onclick="openBroadcastModal()">Edit</button>
             <button class="btn btn-sm btn-ghost"
               onclick="saveBroadcast(null)">✕ Clear</button>`
          : ''}
      </div>`;
    el.classList.remove('hidden');
  } else {
    el.innerHTML = state.mode === 'admin'
      ? `<div style="text-align:right;padding:4px 14px">
           <button class="btn btn-sm btn-ghost" onclick="openBroadcastModal()">
             + Broadcast Message</button>
         </div>`
      : '';
    el.classList.toggle('hidden', state.mode !== 'admin');
  }
}

function openBroadcastModal() {
  document.getElementById('broadcast-input').value = state.broadcastMsg?.text || '';
  openModal('broadcast-modal');
  setTimeout(() => document.getElementById('broadcast-input')?.focus(), 100);
}

function submitBroadcast() {
  const text = document.getElementById('broadcast-input')?.value.trim();
  closeModal('broadcast-modal');
  saveBroadcast(text || null);
}

// ── Shift confirmation ────────────────────────────────────────

function confirmMySchedule(empId, weekMon) {
  if (!state.shiftConfirmations)          state.shiftConfirmations          = {};
  if (!state.shiftConfirmations[weekMon]) state.shiftConfirmations[weekMon] = {};
  state.shiftConfirmations[weekMon][empId] = Date.now();
  persistAll('shiftConfirmations');
  showToast('Schedule confirmed ✓');
  renderMySchedule();
}

function hasConfirmedSchedule(empId, weekMon) {
  return !!(state.shiftConfirmations?.[weekMon]?.[empId]);
}

function scheduleChangedAfterConfirm(empId, weekMon) {
  const confirmTs = state.shiftConfirmations?.[weekMon]?.[empId];
  if (!confirmTs) return false;
  // Check if any shifts in the week were added after the confirmation timestamp
  const mon = new Date(weekMon + 'T00:00:00');
  for (let di = 0; di < 7; di++) {
    const d   = new Date(mon); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    const dayShifts = state.shifts?.[iso]?.filter(s => s.empId === empId) || [];
    if (dayShifts.some(s => (s.updatedAt || 0) > confirmTs)) return true;
  }
  return false;
}
