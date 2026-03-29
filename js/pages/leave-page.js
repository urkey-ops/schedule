// ── pages/leave-page.js ───────────────────────────────────────

function renderLeave() {
  const tbody = document.getElementById('leave-body');
  if (!tbody) return;
  const records = state.leaveRequests || [];

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="10"
      style="text-align:center;padding:24px;color:var(--muted)">
      No leave records yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(l => {
    const emp     = state.employees.find(e => e.id === l.empId);
    const empName = emp
      ? escH(emp.name)
      : `<span style="color:var(--red)">Unknown</span>`;

    const from  = new Date(l.from+'T00:00:00');
    const to    = new Date(l.to+'T00:00:00');
    const days  = Math.round((to-from)/86400000) + 1;

    let remainHtml = '—';
    if (emp) {
      const type = l.type === 'annual' ? 'annual' : l.type === 'sick' ? 'sick' : null;
      if (type) {
        const cap    = type === 'annual' ? (emp.annualLeave||20) : (emp.sickLeave||10);
        const used   = calcLeaveUsed(emp.id, type);
        const remain = cap - used;
        remainHtml   = `<span class="leave-remaining ${remain<=3?'low':''}">
          ${remain}d left</span>`;
      }
    }

    const conflicts    = emp ? checkLeaveConflicts(emp.id, l.from, l.to) : [];
    const conflictHtml = conflicts.length
      ? `<span class="leave-conflict-badge">
          ⚠️ ${conflicts.length} conflict${conflicts.length>1?'s':''}</span>`
      : `<span style="font-size:11px;color:#059669;font-weight:600">✔ clear</span>`;

    const typeBadge = `<span class="type-chip type-${l.type||'annual'}">
      ${(l.type||'annual').toUpperCase()}</span>`;

    const statusBadge = `<span class="status-chip ${
      l.status==='active'?'chip-active':'chip-cancelled'}">
      ${l.status||'active'}</span>`;

    return `<tr class="${l.status==='cancelled'?'row-cancelled':''}">
      <td><div style="font-weight:700;font-size:13px">${empName}</div></td>
      <td>${typeBadge}</td>
      <td><div style="font-size:12px;font-weight:600">${fmtDate(l.from)}</div></td>
      <td><div style="font-size:12px;font-weight:600">${fmtDate(l.to)}</div></td>
      <td><span style="font-size:13px;font-weight:700;
        font-family:'DM Mono',monospace">${days}d</span></td>
      <td>${remainHtml}</td>
      <td style="font-size:11px;color:var(--muted);max-width:120px">
        ${escH(l.note||'—')}</td>
      <td>${statusBadge}</td>
      <td>${conflictHtml}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${l.status==='active'
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

function renderSwaps() {
  const el = document.getElementById('swap-list');
  if (!el) return;
  const swaps = state.swapRequests || [];

  if (!swaps.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;
      color:var(--muted);font-size:13px">No swap records yet.</div>`;
    return;
  }

  el.innerHTML = `<div style="overflow-x:auto">
    <table class="data-table">
      <thead><tr>
        <th>Employee</th><th>Day Off Date</th><th>Works Instead</th>
        <th>Coverage Check</th><th>Note</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${swaps.map(s => {
          const emp     = state.employees.find(e => e.id === s.empId);
          const empName = emp
            ? escH(emp.name)
            : `<span style="color:var(--red)">Unknown</span>`;

          const coverIssues = [];
          if (s.status === 'active') {
            TIMESLOTS.forEach((slot, si) => {
              const { loc } = getResolvedLoc(s.fromDate, si, s.empId);
              if (!REQUIREDLOCS.includes(loc)) return;
              const others = state.employees.filter(e =>
                e.status==='Active' && e.id !== s.empId &&
                !isEmpDayOff(e.id, s.fromDate) &&
                !isOnLeave(e.id, s.fromDate)
              );
              const covered = others.some(e =>
                getResolvedLoc(s.fromDate, si, e.id).loc === loc
              );
              if (!covered) coverIssues.push(slot);
            });
          }

          const coverBadge = coverIssues.length
            ? `<span class="leave-conflict-badge">
                ⚠️ ${coverIssues.length} gap${coverIssues.length>1?'s':''}</span>`
            : s.status==='active'
            ? `<span style="font-size:11px;color:#059669;font-weight:600">✔ covered</span>`
            : `<span style="font-size:11px;color:var(--muted)">—</span>`;

          const statusBadge = `<span class="status-chip ${
            s.status==='active'?'chip-active':'chip-cancelled'}">
            ${s.status||'active'}</span>`;

          return `<tr class="${s.status==='cancelled'?'row-cancelled':''}">
            <td style="font-weight:700;font-size:13px">${empName}</td>
            <td>
              <div style="font-size:12px;font-weight:600">${fmtDate(s.fromDate)}</div>
              <div style="font-size:10px;color:var(--muted)">
                ${s.fromDate
                  ? DAYSSHORT[(new Date(s.fromDate+'T00:00:00').getDay()+6)%7]
                  : ''}</div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:600">${fmtDate(s.toDate)}</div>
              <div style="font-size:10px;color:var(--muted)">
                ${s.toDate
                  ? DAYSSHORT[(new Date(s.toDate+'T00:00:00').getDay()+6)%7]
                  : ''}</div>
            </td>
            <td>${coverBadge}</td>
            <td style="font-size:11px;color:var(--muted);max-width:120px">
              ${escH(s.note||'—')}</td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                ${s.status==='active'
                  ? `<button class="btn btn-sm btn-warn"
                      onclick="cancelSwap('${s.id}')">Cancel</button>`
                  : `<button class="btn btn-sm btn-success"
                      onclick="reinstateSwap('${s.id}')">Reinstate</button>`}
                <button class="btn btn-sm btn-ghost"
                  onclick="openEditSwap('${s.id}')">Edit</button>
                <button class="btn btn-sm btn-danger"
                  onclick="deleteSwap('${s.id}')">✕</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}
