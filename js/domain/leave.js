// ── pages/leave-page.js ───────────────────────────────────────

function renderLeave() {
  const tbody = document.getElementById('leave-body');
  if (!tbody) return;
  const records = state.leaveRequests || [];

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="8"
      style="text-align:center;padding:24px;color:var(--muted)">
      No leave records yet.</td></tr>`;
    return;
  }

  // Sort: active first, then by from date descending
  const sorted = [...records].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.from.localeCompare(a.from);
  });

  tbody.innerHTML = sorted.map(l => {
    const emp     = state.employees.find(e => e.id === l.empId);
    const empName = emp
      ? escH(emp.name)
      : `<span style="color:var(--red)">Unknown</span>`;

    const from  = new Date(l.from + 'T00:00:00');
    const to    = new Date(l.to   + 'T00:00:00');
    const days  = Math.round((to - from) / 86400000) + 1;

    // Remaining leave balance
    let remainHtml = '—';
    if (emp) {
      const type = ['annual','sick'].includes(l.type) ? l.type : null;
      if (type) {
        const cap    = type === 'annual' ? (emp.annualLeave || 20) : (emp.sickLeave || 10);
        const used   = calcLeaveUsed(emp.id, type);
        const remain = cap - used;
        remainHtml   = `<span class="leave-remaining ${remain <= 3 ? 'low' : ''}">
          ${remain}d left</span>`;
      }
    }

    // Conflict check
    const conflicts    = emp ? checkLeaveConflicts(emp.id, l.from, l.to) : [];
    const conflictHtml = conflicts.length
      ? `<span class="leave-conflict-badge">
          ⚠️ ${conflicts.length} shift${conflicts.length > 1 ? 's' : ''} affected</span>`
      : `<span style="font-size:11px;color:#059669;font-weight:600">✔ clear</span>`;

    const typeBadge = `<span class="badge badge-${l.type === 'annual' ? 'annual' : l.type === 'sick' ? 'sick' : l.type === 'comp' ? 'comp' : 'other'}">
      ${(l.type || 'annual').toUpperCase()}</span>`;

    const statusBadge = l.status === 'active'
      ? `<span class="leave-status-active">Active</span>`
      : `<span class="leave-status-cancelled">Cancelled</span>`;

    return `<tr class="${l.status === 'cancelled' ? 'row-cancelled' : ''}">
      <td><div style="font-weight:700;font-size:13px">${empName}</div></td>
      <td>${typeBadge}</td>
      <td><div style="font-size:12px;font-weight:600">${fmtDate(l.from)}</div></td>
      <td><div style="font-size:12px;font-weight:600">${fmtDate(l.to)}</div></td>
      <td><span style="font-size:13px;font-weight:700;
        font-family:'DM Mono',monospace">${days}d</span></td>
      <td>${remainHtml}</td>
      <td>${statusBadge}</td>
      <td>${conflictHtml}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${l.status === 'active'
            ? `<button class="btn btn-sm btn-warn"
                onclick="cancelLeave('${l.id}')">Cancel</button>`
            : `<button class="btn btn-sm btn-success"
                onclick="reinstateLeave('${l.id}')">Reinstate</button>`}
          <button class="btn btn-sm btn-ghost"
            onclick="openEditLeave('${l.id}')">Edit</button>
          <button class="btn btn-sm btn-danger"
            onclick="deleteLeave('${l.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
