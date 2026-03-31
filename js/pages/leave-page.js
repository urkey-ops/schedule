// ── pages/leave-page.js ───────────────────────────────────────

let _leaveView = 'leave';
let _editSwapId = null;

function setLeaveView(view) {
  _leaveView = view;
  document.getElementById('leave-view-leave')?.classList.toggle('active', view === 'leave');
  document.getElementById('leave-view-swap')?.classList.toggle('active', view === 'swap');
  renderLeavePageHeader();
  renderLeavePageBody();
}

function renderLeavePageHeader() {
  const mountId = 'leave-page-switcher';
  let mount = document.getElementById(mountId);

  if (!mount) {
    mount = document.createElement('div');
    mount.id = mountId;
    mount.style.margin = '10px 0 12px';
    const host = document.getElementById('leave-alerts-bar');
    host?.parentNode?.insertBefore(mount, host.nextSibling);
  }

  const pending = getPendingSwapCount();

  mount.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button id="leave-view-leave" class="btn btn-sm ${_leaveView === 'leave' ? 'btn-primary' : 'btn-ghost'}" onclick="setLeaveView('leave')">
        Leave Records
      </button>
      <button id="leave-view-swap" class="btn btn-sm ${_leaveView === 'swap' ? 'btn-primary' : 'btn-ghost'}" onclick="setLeaveView('swap')">
        Swap Requests ${pending ? `<span class="status-chip" style="margin-left:6px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">${pending}</span>` : ''}
      </button>
      ${_leaveView === 'swap'
        ? `<button class="btn btn-sm btn-success ml-auto" onclick="openAddSwap()">Add Swap</button>`
        : `<button class="btn btn-sm btn-success ml-auto" onclick="openAddLeave()">Add Leave</button>`}
    </div>`;
}

function renderLeavePageBody() {
  if (_leaveView === 'swap') {
    renderSwaps();
    hideWhoWasWhere();
  } else {
    renderLeave();
    showWhoWasWhere();
  }
}

function hideWhoWasWhere() {
  const lookup = document.getElementById('www-result')?.closest('.card')?.parentNode;
  if (lookup) lookup.style.display = 'none';
}

function showWhoWasWhere() {
  const lookup = document.getElementById('www-result')?.closest('.card')?.parentNode;
  if (lookup) lookup.style.display = '';
}

function renderLeave() {
  const tbody = document.getElementById('leave-body');
  if (!tbody) return;
  const records = state.leaveRequests || [];

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">No leave records yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(l => {
    const emp = state.employees.find(e => e.id === l.empId);
    const empName = emp ? escH(emp.name) : `<span style="color:var(--red)">Unknown</span>`;
    const from = new Date(l.from + 'T00:00:00');
    const to   = new Date(l.to + 'T00:00:00');
    const days = l.partialFrom && l.partialTo
      ? `${((HHMMtoMins(l.partialTo) - HHMMtoMins(l.partialFrom)) / 60).toFixed(1)}h`
      : `${Math.round((to - from) / 86400000) + 1}d`;

    let remainHtml = '—';
    if (emp && ['annual','sick'].includes(l.type)) {
      const remain = calcLeaveBalance(emp.id, l.type);
      remainHtml = `<span class="leave-remaining ${remain <= 3 ? 'low' : ''}">${remain} left</span>`;
    }

    const conflicts = emp ? checkLeaveConflicts(emp.id, l.from, l.to) : [];
    const conflictHtml = conflicts.length
      ? `<span class="leave-conflict-badge">⚠️ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}</span>`
      : `<span style="font-size:11px;color:#059669;font-weight:600">✔ clear</span>`;

    const typeBadge = `<span class="type-chip type-${l.type || 'annual'}">${(l.type || 'annual').toUpperCase()}</span>`;
    const statusBadge = `<span class="status-chip ${l.status === 'active' ? 'chip-active' : 'chip-cancelled'}">${l.status || 'active'}</span>`;

    const returnBtn = l.status === 'active' && l.to <= todayStr()
      ? `<button class="btn btn-sm btn-success" onclick="reinstateLeave('${l.id}')">Return Confirmed</button>`
      : '';

    return `
      <tr class="${l.status === 'cancelled' ? 'row-cancelled' : ''}">
        <td><div style="font-weight:700;font-size:13px">${empName}</div></td>
        <td>${typeBadge}</td>
        <td><div style="font-size:12px;font-weight:600">${fmtDate(l.from)}</div>${l.partialFrom ? `<div style="font-size:10px;color:var(--muted)">from ${l.partialFrom}</div>` : ''}</td>
        <td><div style="font-size:12px;font-weight:600">${fmtDate(l.to)}</div>${l.partialTo ? `<div style="font-size:10px;color:var(--muted)">to ${l.partialTo}</div>` : ''}</td>
        <td><span style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace">${days}</span></td>
        <td>${remainHtml}</td>
        <td style="font-size:11px;color:var(--muted);max-width:120px">${escH(l.note || '—')}</td>
        <td>${statusBadge}</td>
        <td>${conflictHtml}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${l.status === 'active'
              ? `<button class="btn btn-sm btn-warn" onclick="cancelLeave('${l.id}')">Cancel</button>`
              : `<button class="btn btn-sm btn-success" onclick="reinstateLeave('${l.id}')">Reinstate</button>`}
            ${returnBtn}
            <button class="btn btn-sm btn-ghost" onclick="openEditLeave('${l.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteLeave('${l.id}')">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderSwaps() {
  const tbody = document.getElementById('leave-body');
  if (!tbody) return;

  const swaps = state.swapRequests || [];
  if (!swaps.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">No swap requests yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = swaps.map(s => {
    const emp = state.employees.find(e => e.id === s.empId);
    const empName = emp ? escH(emp.name) : `<span style="color:var(--red)">Unknown</span>`;

    const statusBadgeMap = {
      [SWAP_STATUS.PENDING]:   `<span class="status-chip" style="background:#fff7ed;color:#b45309;border:1px solid #fdba74">pending</span>`,
      [SWAP_STATUS.APPROVED]:  `<span class="status-chip chip-active">approved</span>`,
      [SWAP_STATUS.REJECTED]:  `<span class="status-chip chip-cancelled">rejected</span>`,
      [SWAP_STATUS.CANCELLED]: `<span class="status-chip chip-cancelled">cancelled</span>`,
    };

    const coverIssues = s.status === SWAP_STATUS.APPROVED ? getCoverageGaps(s.fromDate) : [];
    const coverBadge = coverIssues.length
      ? `<span class="leave-conflict-badge">⚠️ ${coverIssues.length} gap${coverIssues.length > 1 ? 's' : ''}</span>`
      : `<span style="font-size:11px;color:#059669;font-weight:600">✔ covered</span>`;

    return `
      <tr class="${[SWAP_STATUS.REJECTED, SWAP_STATUS.CANCELLED].includes(s.status) ? 'row-cancelled' : ''}">
        <td><div style="font-weight:700;font-size:13px">${empName}</div></td>
        <td><span class="type-chip type-other">SWAP</span></td>
        <td><div style="font-size:12px;font-weight:600">${fmtDate(s.fromDate)}</div><div style="font-size:10px;color:var(--muted)">Day off date</div></td>
        <td><div style="font-size:12px;font-weight:600">${fmtDate(s.toDate)}</div><div style="font-size:10px;color:var(--muted)">Works instead</div></td>
        <td>—</td>
        <td>—</td>
        <td style="font-size:11px;color:var(--muted)">${escH(s.note || '—')}</td>
        <td>${statusBadgeMap[s.status] || s.status}</td>
        <td>${coverBadge}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${s.status === SWAP_STATUS.PENDING ? `
              <button class="btn btn-sm btn-success" onclick="approveSwap('${s.id}')">Approve</button>
              <button class="btn btn-sm btn-warn" onclick="rejectSwap('${s.id}')">Reject</button>
            ` : ''}
            ${s.status !== SWAP_STATUS.CANCELLED ? `<button class="btn btn-sm btn-ghost" onclick="openEditSwap('${s.id}')">Edit</button>` : ''}
            ${s.status !== SWAP_STATUS.CANCELLED ? `<button class="btn btn-sm btn-warn" onclick="cancelSwap('${s.id}')">Cancel</button>` : `<button class="btn btn-sm btn-success" onclick="reinstateSwap('${s.id}')">Reinstate</button>`}
            <button class="btn btn-sm btn-danger" onclick="deleteSwap('${s.id}')">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openAddSwap(preEmpId = null) {
  _editSwapId = null;
  const sel = document.getElementById('swap-emp-id');
  if (sel) {
    sel.innerHTML = state.employees
      .filter(e => e.status === 'Active')
      .map(e => `<option value="${e.id}" ${preEmpId === e.id ? 'selected' : ''}>${escH(e.name)}</option>`)
      .join('');
  }
  document.getElementById('swap-from-date').value = todayStr();
  document.getElementById('swap-to-date').value   = todayStr();
  document.getElementById('swap-note').value      = '';
  openModal('swap-modal');
}

function openEditSwap(swapId) {
  const s = (state.swapRequests || []).find(x => x.id === swapId);
  if (!s) return;
  _editSwapId = swapId;
  const sel = document.getElementById('swap-emp-id');
  if (sel) {
    sel.innerHTML = state.employees
      .filter(e => e.status === 'Active')
      .map(e => `<option value="${e.id}" ${e.id === s.empId ? 'selected' : ''}>${escH(e.name)}</option>`)
      .join('');
  }
  document.getElementById('swap-from-date').value = s.fromDate || '';
  document.getElementById('swap-to-date').value   = s.toDate || '';
  document.getElementById('swap-note').value      = s.note || '';
  openModal('swap-modal');
}

function renderLeavePage() {
  renderLeavePageHeader();
  renderLeavePageBody();
  renderAlertsBar('leave-alerts-bardiv', state.currentDateISO);
}

function onLeavePageShow() {
  renderLeavePage();
}
