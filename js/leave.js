let editingLeaveId = null;
let editingSwapId  = null;

// ── Leave ─────────────────────────────────────────────────────
function isOnLeave(empId, iso) {
  return state.leaveRequests?.some(l =>
    l.status === 'active' && l.empId === empId && l.from <= iso && l.to >= iso
  ) || false;
}

function toggleAbsent(empId, iso, btn) {
  if (!state.absences)       state.absences = {};
  if (!state.absences[iso])  state.absences[iso] = {};
  state.absences[iso][empId] = !state.absences[iso][empId];
  if (btn) {
    const absent = state.absences[iso][empId];
    btn.className  = `present-toggle ${absent ? 'absent' : 'present'}`;
    btn.textContent = absent ? '✖ Absent' : '✔ Present';
  }
  persistAll();
}

function buildAlerts() {
  const alerts = [];
  const today  = todayStr();
  const soon   = new Date(); soon.setDate(soon.getDate() + ALERT_DAYS);
  const soonStr = toDateStr(soon);

  state.leaveRequests?.forEach(lr => {
    if (lr.status !== 'active') return;
    const emp = state.employees.find(e => e.id === lr.empId);
    if (!emp) return;
    if (lr.from <= today && lr.to >= today) {
      alerts.push({ type:'leave', msg:`${emp.name} is on leave today (${lr.type})`, jumpDate: lr.from });
    } else if (lr.from > today && lr.from <= soonStr) {
      alerts.push({ type:'leave', msg:`${emp.name} leave starts ${lr.from} (${lr.type})`, jumpDate: lr.from });
    }
  });

  state.swapRequests?.forEach(sw => {
    const emp = state.employees.find(e => e.id === sw.empId);
    if (!emp) return;
    if (sw.toDate >= today && sw.toDate <= soonStr) {
      alerts.push({ type:'swap', msg:`${emp.name} swap: works ${sw.toDate} (off ${sw.fromDate})`, jumpDate: sw.toDate });
    }
  });

  return alerts;
}

function renderSchedAlerts() {
  const el = document.getElementById('sched-alert-area');
  if (!el) return;
  const alerts = buildAlerts();
  el.innerHTML = alerts.map(a => `
    <div class="alert-banner ${a.type}">
      <span>${escH(a.msg)}</span>
      ${a.jumpDate ? `<button class="fix-btn" onclick="jumpToDate('${a.jumpDate}')">Go</button>` : ''}
    </div>`).join('');
}

function renderLeave() {
  const tbody = document.getElementById('leave-body');
  if (!tbody) return;

  tbody.innerHTML = (state.leaveRequests || []).map(lr => {
    const emp  = state.employees.find(e => e.id === lr.empId);
    const days = lr.from && lr.to
      ? Math.round((new Date(lr.to) - new Date(lr.from)) / 86400000) + 1
      : '?';
    const typeBadge = { annual:'badge-annual', sick:'badge-sick',
      comp:'badge-comp', other:'badge-other' }[lr.type] || 'badge-other';
    return `<tr>
      <td>${escH(emp?.name || 'Unknown')}</td>
      <td><span class="badge ${typeBadge}">${lr.type}</span></td>
      <td style="font-family:DM Mono,monospace">${lr.from}</td>
      <td style="font-family:DM Mono,monospace">${lr.to}</td>
      <td style="color:var(--muted)">${days}d</td>
      <td style="color:var(--muted)">${escH(lr.note||'')}</td>
      <td><span class="leave-status-${lr.status}">${lr.status}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="openEditLeave('${lr.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLeave('${lr.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openAddLeave() {
  editingLeaveId = null;
  document.getElementById('leave-modal-title').textContent = 'Add Leave Record';
  document.getElementById('leave-emp-id').innerHTML =
    state.employees.map(e => `<option value="${e.id}">${escH(e.name)}</option>`).join('');
  ['leave-from','leave-to','leave-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('leave-type').value   = 'annual';
  document.getElementById('leave-status').value = 'active';
  openModal('leave-modal');
}

function openEditLeave(leaveId) {
  const lr = state.leaveRequests.find(l => l.id === leaveId);
  if (!lr) return;
  editingLeaveId = leaveId;
  document.getElementById('leave-modal-title').textContent = 'Edit Leave';
  document.getElementById('leave-emp-id').innerHTML =
    state.employees.map(e =>
      `<option value="${e.id}" ${e.id===lr.empId?'selected':''}>${escH(e.name)}</option>`
    ).join('');
  document.getElementById('leave-from').value   = lr.from;
  document.getElementById('leave-to').value     = lr.to;
  document.getElementById('leave-type').value   = lr.type;
  document.getElementById('leave-note').value   = lr.note || '';
  document.getElementById('leave-status').value = lr.status;
  openModal('leave-modal');
}

function saveLeave() {
  const empId  = document.getElementById('leave-emp-id').value;
  const from   = v('leave-from');
  const to     = v('leave-to');
  const type   = document.getElementById('leave-type').value;
  const note   = v('leave-note');
  const status = document.getElementById('leave-status').value;
  if (!empId || !from || !to) { alert('Fill in all required fields.'); return; }
  if (from > to) { alert('From must be before To.'); return; }

  if (!state.leaveRequests) state.leaveRequests = [];
  if (editingLeaveId) {
    const lr = state.leaveRequests.find(l => l.id === editingLeaveId);
    Object.assign(lr, { empId, from, to, type, note, status });
  } else {
    state.leaveRequests.push({ id: uid(), empId, from, to, type, note, status });
  }
  persistAll();
  closeModal('leave-modal');
  renderLeave();
  showToast('Leave saved');
}

function deleteLeave(leaveId) {
  if (!confirm('Delete leave record?')) return;
  state.leaveRequests = state.leaveRequests.filter(l => l.id !== leaveId);
  persistAll();
  renderLeave();
}

// ── Swaps ─────────────────────────────────────────────────────
function renderSwaps() {
  const el = document.getElementById('swap-list');
  if (!el) return;

  if (!state.swapRequests?.length) {
    el.innerHTML = `<div style="padding:14px 16px;color:var(--muted);font-size:11px">No swap requests.</div>`;
    return;
  }

  el.innerHTML = state.swapRequests.map(sw => {
    const emp = state.employees.find(e => e.id === sw.empId);
    return `<div class="swap-item">
      <div style="flex:1">
        <strong style="color:var(--text)">${escH(emp?.name || 'Unknown')}</strong>
        <span style="color:var(--muted);font-size:10px;margin-left:8px">off </span>
        <span style="font-family:DM Mono,monospace">${sw.fromDate}</span>
        <span style="color:var(--muted)"> → works </span>
        <span style="font-family:DM Mono,monospace">${sw.toDate}</span>
        ${sw.note ? `<span style="color:var(--subtle);font-size:10px;margin-left:6px">${escH(sw.note)}</span>` : ''}
      </div>
      <div style="display:flex;gap:3px">
        <button class="btn btn-sm btn-ghost" onclick="openEditSwap('${sw.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSwap('${sw.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function openAddSwap() {
  editingSwapId = null;
  document.getElementById('swap-modal-title').textContent = 'Add Day-Off Swap';
  document.getElementById('swap-emp-id').innerHTML =
    state.employees.map(e => `<option value="${e.id}">${escH(e.name)}</option>`).join('');
  ['swap-from','swap-to','swap-note'].forEach(id => document.getElementById(id).value = '');
  openModal('swap-modal');
}

function openEditSwap(swapId) {
  const sw = state.swapRequests.find(s => s.id === swapId);
  if (!sw) return;
  editingSwapId = swapId;
  document.getElementById('swap-modal-title').textContent = 'Edit Swap';
  document.getElementById('swap-emp-id').innerHTML =
    state.employees.map(e =>
      `<option value="${e.id}" ${e.id===sw.empId?'selected':''}>${escH(e.name)}</option>`
    ).join('');
  document.getElementById('swap-from').value = sw.fromDate;
  document.getElementById('swap-to').value   = sw.toDate;
  document.getElementById('swap-note').value = sw.note || '';
  openModal('swap-modal');
}

function saveSwap() {
  const empId    = document.getElementById('swap-emp-id').value;
  const fromDate = v('swap-from');
  const toDate   = v('swap-to');
  const note     = v('swap-note');
  if (!empId || !fromDate || !toDate) { alert('Fill in all date fields.'); return; }

  if (!state.swapRequests) state.swapRequests = [];
  if (editingSwapId) {
    const sw = state.swapRequests.find(s => s.id === editingSwapId);
    Object.assign(sw, { empId, fromDate, toDate, note });
  } else {
    state.swapRequests.push({ id: uid(), empId, fromDate, toDate, note });
  }
  persistAll();
  closeModal('swap-modal');
  renderSwaps();
  showToast('Swap saved');
}

function deleteSwap(swapId) {
  if (!confirm('Delete swap?')) return;
  state.swapRequests = state.swapRequests.filter(s => s.id !== swapId);
  persistAll();
  renderSwaps();
}
