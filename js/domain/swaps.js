// ── domain/swaps.js ───────────────────────────────────────────

function saveSwap() {
  const empId    = document.getElementById('swap-emp-id')?.value;
  const fromDate = v('swap-from-date');
  const toDate   = v('swap-to-date');
  const note     = v('swap-note');

  if (!empId || !fromDate || !toDate) {
    alert('Employee, day-off date and works-instead date are required.'); return;
  }
  if (fromDate === toDate) {
    alert('Day off and works-instead dates must be different.'); return;
  }

  if (!state.swapRequests) state.swapRequests = [];

  if (_editSwapId) {
    const rec = state.swapRequests.find(s => s.id === _editSwapId);
    if (rec) Object.assign(rec, { empId, fromDate, toDate, note });
    logAction('edit_swap', `Swap edited for emp ${empId}`);
  } else {
    state.swapRequests.push({
      id      : `swap-${Date.now()}`,
      empId,
      fromDate,
      toDate,
      note,
      status  : SWAP_STATUS.PENDING,
      createdAt: Date.now(),
    });
    logAction('add_swap', `Swap request added for emp ${empId}: ${fromDate} ↔ ${toDate}`);
  }

  persistAll('swapRequests');
  closeModal('swap-modal');
  renderLeave();
  showToast(_editSwapId ? 'Swap updated' : 'Swap request added');
}

function approveSwap(swapId) {
  const swap = (state.swapRequests || []).find(s => s.id === swapId);
  if (!swap) return;

  // Auto-adjust rota: employee works on toDate, has day off on fromDate
  const emp = state.employees.find(e => e.id === swap.empId);
  if (emp) {
    // On fromDate: clear this employee's shifts (they have day off)
    if (state.shifts?.[swap.fromDate]) {
      state.shifts[swap.fromDate] = state.shifts[swap.fromDate]
        .filter(s => s.empId !== swap.empId);
    }
    // On toDate: copy their base rota shifts to the override layer
    const toDay  = new Date(swap.toDate + 'T00:00:00');
    const toDow  = DAYSSHORT[(toDay.getDay() + 6) % 7];
    const base   = (state.defaultSchedule?.[toDow]?.[swap.empId] || []);
    if (base.length) {
      if (!state.shifts)             state.shifts             = {};
      if (!state.shifts[swap.toDate]) state.shifts[swap.toDate] = [];
      // Remove any existing shifts for this emp on toDate first
      state.shifts[swap.toDate] = state.shifts[swap.toDate].filter(s => s.empId !== swap.empId);
      base.forEach(b => {
        state.shifts[swap.toDate].push({ id: uid(), empId: swap.empId, loc: b.loc, start: b.start, end: b.end });
      });
      markDirty('shifts');
    }
  }

  swap.status     = SWAP_STATUS.APPROVED;
  swap.approvedAt = Date.now();
  persistAll('swapRequests');
  logAction('approve_swap', `Swap approved: ${swap.empId} off ${swap.fromDate}, works ${swap.toDate}`);
  renderLeave();
  renderAll();
  showToast('Swap approved — rota updated');
}

function rejectSwap(swapId) {
  const swap = (state.swapRequests || []).find(s => s.id === swapId);
  if (!swap) return;
  swap.status = SWAP_STATUS.REJECTED;
  persistAll('swapRequests');
  logAction('reject_swap', `Swap rejected for emp ${swap.empId}`);
  renderLeave();
  showToast('Swap rejected');
}

function cancelSwap(swapId) {
  const swap = (state.swapRequests || []).find(s => s.id === swapId);
  if (!swap) return;
  swap.status = SWAP_STATUS.CANCELLED;
  persistAll('swapRequests');
  renderLeave();
  showToast('Swap cancelled');
}

function reinstateSwap(swapId) {
  const swap = (state.swapRequests || []).find(s => s.id === swapId);
  if (!swap) return;
  swap.status = SWAP_STATUS.PENDING;
  persistAll('swapRequests');
  renderLeave();
  showToast('Swap reinstated to pending');
}

function deleteSwap(swapId) {
  if (!confirm('Delete this swap request?')) return;
  state.swapRequests = (state.swapRequests || []).filter(s => s.id !== swapId);
  persistAll('swapRequests');
  renderLeave();
  showToast('Swap deleted');
}

function getPendingSwapCount() {
  return (state.swapRequests || []).filter(s => s.status === SWAP_STATUS.PENDING).length;
}
