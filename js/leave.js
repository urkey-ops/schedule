// ── leave.js ──────────────────────────────────────────────────

let _editLeaveId = null;
let _editSwapId  = null;

// ── Leave render ──────────────────────────────────────────────
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
    const emp      = state.employees.find(e => e.id === l.empId);
    const empName  = emp ? escH(emp.name) : `<span style="color:var(--red)">Unknown</span>`;

    // Days count
    const from     = new Date(l.from + 'T00:00:00');
    const to       = new Date(l.to   + 'T00:00:00');
    const days     = Math.round((to - from) / 86400000) + 1;

    // Remaining leave balance
    let remainHtml = '—';
    if (emp) {
      const type     = l.type === 'annual' ? 'annual' : l.type === 'sick' ? 'sick' : null;
      if (type) {
        const cap    = type === 'annual' ? (emp.annualLeave||20) : (emp.sickLeave||10);
        const used   = calcLeaveUsed(emp.id, type);
        const remain = cap - used;
        const low    = remain <= 3;
        remainHtml   = `<span class="leave-remaining ${low?'low':''}">
          ${remain}d left
        </span>`;
      }
    }

    // Conflicts
    const conflicts = emp ? checkLeaveConflicts(emp.id, l.from, l.to) : [];
    const conflictHtml = conflicts.length
      ? `<span class="leave-conflict-badge">
          ⚠️ ${conflicts.length} conflict${conflicts.length>1?'s':''}
        </span>`
      : `<span style="font-size:11px;color:#059669;font-weight:600">✔ clear</span>`;

    // Type badge
    const typeBadge = `<span class="type-chip type-${l.type||'annual'}">
      ${(l.type||'annual').toUpperCase()}
    </span>`;

    // Status badge
    const statusBadge = `<span class="status-chip ${
      l.status==='active' ? 'chip-active' : 'chip-cancelled'}">
      ${l.status||'active'}
    </span>`;

    // Date range mini strip
    const dateStrip = `<div style="font-size:10px;color:var(--muted);margin-top:2px">
      ${fmtDate(l.from)} → ${fmtDate(l.to)}
    </div>`;

    return `<tr class="${l.status==='cancelled'?'row-cancelled':''}">
      <td>
        <div style="font-weight:700;font-size:13px">${empName}</div>
      </td>
      <td>${typeBadge}</td>
      <td>
        <div style="font-size:12px;font-weight:600">${fmtDate(l.from)}</div>
      </td>
      <td>
        <div style="font-size:12px;font-weight:600">${fmtDate(l.to)}</div>
      </td>
      <td>
        <span style="font-size:13px;font-weight:700;
          font-family:'DM Mono',monospace">${days}d</span>
      </td>
      <td>${remainHtml}</td>
      <td style="font-size:11px;color:var(--muted);max-width:120px">
        ${escH(l.note||'—')}
      </td>
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

// ── Leave conflict check ──────────────────────────────────────
function checkLeaveConflicts(empId, from, to) {
  const conflicts = [];
  const start     = new Date(from + 'T00:00:00');
  const end       = new Date(to   + 'T00:00:00');

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
function openAddLeave() {
  _editLeaveId = null;
  document.getElementById('leave-modal-title').textContent = 'Add Leave Record';
  document.getElementById('leave-from').value   = todayStr();
  document.getElementById('leave-to').value     = todayStr();
  document.getElementById('leave-note').value   = '';
  document.getElementById('leave-type').value   = 'annual';
  document.getElementById('leave-status').value = 'active';

  // Populate employee select
  const sel = document.getElementById('leave-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}">${escH(e.name)}</option>`)
    .join('');

  openModal('leave-modal');
}

function openEditLeave(leaveId) {
  const rec = (state.leaveRequests||[]).find(l => l.id === leaveId);
  if (!rec) return;
  _editLeaveId = leaveId;
  document.getElementById('leave-modal-title').textContent = 'Edit Leave Record';

  const sel = document.getElementById('leave-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}"
      ${e.id===rec.empId?'selected':''}>${escH(e.name)}</option>`)
    .join('');

  document.getElementById('leave-from').value   = rec.from   || '';
  document.getElementById('leave-to').value     = rec.to     || '';
  document.getElementById('leave-type').value   = rec.type   || 'annual';
  document.getElementById('leave-note').value   = rec.note   || '';
  document.getElementById('leave-status').value = rec.status || 'active';

  openModal('leave-modal');
}

function saveLeave() {
  const empId  = document.getElementById('leave-emp-id')?.value;
  const from   = v('leave-from');
  const to     = v('leave-to');
  const type   = v('leave-type');
  const note   = v('leave-note');
  const status = v('leave-status');

  if (!empId || !from || !to) {
    alert('Please fill all required fields.'); return;
  }
  if (from > to) {
    alert('"From" date must be before "To" date.'); return;
  }

  // Warn if conflicts exist
  const conflicts = checkLeaveConflicts(empId, from, to);
  if (conflicts.length) {
    const emp  = state.employees.find(e => e.id === empId);
    const msg  = `${emp?.name||'This employee'} has ${conflicts.length} scheduled shift(s) during this period.\n\nContinue anyway?`;
    if (!confirm(msg)) return;
  }

  if (!state.leaveRequests) state.leaveRequests = [];

  if (_editLeaveId) {
    const rec = state.leaveRequests.find(l => l.id === _editLeaveId);
    if (rec) {
      rec.empId  = empId;
      rec.from   = from;
      rec.to     = to;
      rec.type   = type;
      rec.note   = note;
      rec.status = status;
    }
  } else {
    state.leaveRequests.push({
      id: `leave-${Date.now()}`,
      empId, from, to, type, note, status,
    });
  }

  persistAll('leaveRequests');
  closeModal('leave-modal');
  renderLeave();
  renderAll();
  showToast(_editLeaveId ? 'Leave updated' : 'Leave added');
}

function cancelLeave(leaveId) {
  const rec = (state.leaveRequests||[]).find(l => l.id === leaveId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('leaveRequests');
  renderLeave();
  renderAll();
  showToast('Leave cancelled');
}

function reinstateLeave(leaveId) {
  const rec = (state.leaveRequests||[]).find(l => l.id === leaveId);
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
  state.leaveRequests = (state.leaveRequests||[]).filter(l => l.id !== leaveId);
  persistAll('leaveRequests');
  renderLeave();
  renderAll();
  showToast('Leave deleted');
}

// ── Swaps render ──────────────────────────────────────────────
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
        <th>Employee</th>
        <th>Day Off Date</th>
        <th>Works Instead</th>
        <th>Coverage Check</th>
        <th>Note</th>
        <th>Status</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>
        ${swaps.map(s => {
          const emp      = state.employees.find(e => e.id === s.empId);
          const empName  = emp ? escH(emp.name)
            : `<span style="color:var(--red)">Unknown</span>`;

          // Coverage check on the day-off date
          // If employee was supposed to cover required locs — is it covered by others?
          const coverIssues = [];
          if (s.status === 'active') {
            TIMESLOTS.forEach((slot, si) => {
              const { loc } = getResolvedLoc(s.fromDate, si, s.empId);
              if (!REQUIREDLOCS.includes(loc)) return;
              const others = state.employees.filter(e =>
                e.status === 'Active' && e.id !== s.empId &&
                !isEmpDayOff(e.id, s.fromDate) &&
                !isOnLeave(e.id, s.fromDate)
              );
              const covered = others.some(e => {
                const { loc: l } = getResolvedLoc(s.fromDate, si, e.id);
                return l === loc;
              });
              if (!covered) coverIssues.push(slot);
            });
          }

          const coverBadge = coverIssues.length
            ? `<span class="leave-conflict-badge">
                ⚠️ ${coverIssues.length} gap${coverIssues.length>1?'s':''}
              </span>`
            : s.status === 'active'
            ? `<span style="font-size:11px;color:#059669;font-weight:600">✔ covered</span>`
            : `<span style="font-size:11px;color:var(--muted)">—</span>`;

          const statusBadge = `<span class="status-chip ${
            s.status==='active'?'chip-active':'chip-cancelled'}">
            ${s.status||'active'}
          </span>`;

          return `<tr class="${s.status==='cancelled'?'row-cancelled':''}">
            <td style="font-weight:700;font-size:13px">${empName}</td>
            <td>
              <div style="font-size:12px;font-weight:600">
                ${fmtDate(s.fromDate)}
              </div>
              <div style="font-size:10px;color:var(--muted)">
                ${s.fromDate ? DAYSSHORT[(new Date(s.fromDate+'T00:00:00').getDay()+6)%7] : ''}
              </div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:600">
                ${fmtDate(s.toDate)}
              </div>
              <div style="font-size:10px;color:var(--muted)">
                ${s.toDate ? DAYSSHORT[(new Date(s.toDate+'T00:00:00').getDay()+6)%7] : ''}
              </div>
            </td>
            <td>${coverBadge}</td>
            <td style="font-size:11px;color:var(--muted);max-width:120px">
              ${escH(s.note||'—')}
            </td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                ${s.status === 'active'
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

// ── Swap CRUD ─────────────────────────────────────────────────
function openAddSwap() {
  _editSwapId = null;
  document.getElementById('swap-modal-title').textContent = 'Add Day-Off Swap';

  const sel = document.getElementById('swap-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}">${escH(e.name)}</option>`)
    .join('');

  document.getElementById('swap-from').value = todayStr();
  document.getElementById('swap-to').value   = todayStr();
  document.getElementById('swap-note').value = '';

  openModal('swap-modal');
}

function openEditSwap(swapId) {
  const rec = (state.swapRequests||[]).find(s => s.id === swapId);
  if (!rec) return;
  _editSwapId = swapId;
  document.getElementById('swap-modal-title').textContent = 'Edit Swap';

  const sel = document.getElementById('swap-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}"
      ${e.id===rec.empId?'selected':''}>${escH(e.name)}</option>`)
    .join('');

  document.getElementById('swap-from').value = rec.fromDate || '';
  document.getElementById('swap-to').value   = rec.toDate   || '';
  document.getElementById('swap-note').value = rec.note     || '';

  openModal('swap-modal');
}

function saveSwap() {
  const empId    = document.getElementById('swap-emp-id')?.value;
  const fromDate = v('swap-from');
  const toDate   = v('swap-to');
  const note     = v('swap-note');

  if (!empId || !fromDate || !toDate) {
    alert('Please fill all required fields.'); return;
  }

  if (!state.swapRequests) state.swapRequests = [];

  if (_editSwapId) {
    const rec = state.swapRequests.find(s => s.id === _editSwapId);
    if (rec) {
      rec.empId    = empId;
      rec.fromDate = fromDate;
      rec.toDate   = toDate;
      rec.note     = note;
      rec.status   = rec.status || 'active';
    }
  } else {
    state.swapRequests.push({
      id: `swap-${Date.now()}`,
      empId, fromDate, toDate, note,
      status: 'active',
    });
  }

  persistAll('swapRequests');
  closeModal('swap-modal');
  renderSwaps();
  renderAll();
  showToast(_editSwapId ? 'Swap updated' : 'Swap added');
}

function cancelSwap(swapId) {
  const rec = (state.swapRequests||[]).find(s => s.id === swapId);
  if (!rec) return;
  rec.status = 'cancelled';
  persistAll('swapRequests');
  renderSwaps();
  renderAll();
  showToast('Swap cancelled');
}

function reinstateSwap(swapId) {
  const rec = (state.swapRequests||[]).find(s => s.id === swapId);
  if (!rec) return;
  rec.status = 'active';
  persistAll('swapRequests');
  renderSwaps();
  renderAll();
  showToast('Swap reinstated');
}

function deleteSwap(swapId) {
  if (!confirm('Delete this swap record?')) return;
  pushUndo('Delete swap', state);
  state.swapRequests = (state.swapRequests||[]).filter(s => s.id !== swapId);
  persistAll('swapRequests');
  renderSwaps();
  renderAll();
  showToast('Swap deleted');
}

// ── Leave alerts for live/schedule pages ──────────────────────
function renderLiveAlerts() {
  const el  = document.getElementById('live-alert-area');
  if (!el) return;
  const iso = todayStr();
  let html  = '';

  (state.leaveRequests||[])
    .filter(l => l.status==='active' && iso>=l.from && iso<=l.to)
    .forEach(l => {
      const emp = state.employees.find(e => e.id===l.empId);
      if (!emp) return;
      html += `<div class="alert-banner leave">
        🔒 ${escH(emp.name)} is on
        <strong>${l.type||'annual'}</strong> leave today
      </div>`;
    });

  (state.swapRequests||[])
    .filter(s => s.status==='active' && s.fromDate===iso)
    .forEach(s => {
      const emp = state.employees.find(e => e.id===s.empId);
      if (!emp) return;
      html += `<div class="alert-banner swap">
        🔄 ${escH(emp.name)} swapped day off — working today
      </div>`;
    });

  el.innerHTML = html;
}

// ── Type / status chip CSS helpers ───────────────────────────
// (referenced in renderLeave — add to components.css if missing)
// .type-chip.type-annual  { background:#dbeafe; color:#1e40af }
// .type-chip.type-sick    { background:#fee2e2; color:#991b1b }
// .type-chip.type-comp    { background:#fef3c7; color:#92400e }
// .type-chip.type-other   { background:#f3f4f6; color:#374151 }
// .row-cancelled          { opacity:0.5; }
