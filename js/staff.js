let editingEmpId  = null;
let editingVolId  = null;
let blockedLocs   = {};

function renderRoster() {
  const tbody = document.getElementById('roster-body');
  if (!tbody) return;
  const iso = todayStr();

  tbody.innerHTML = state.employees.map((emp, idx) => {
    const totalHrs  = calcTotalHrsWeek(emp.id);
    const leaveRec  = state.leaveRequests.filter(l => l.empId === emp.id && l.status === 'active');
    const blockedChips = ALL_LOCS
      .filter(l => emp.blocked?.[l])
      .map(l => `<span class="loc-blocked-chip">${LOC_LABEL[l]}</span>`).join('');
    const statusBadge = {
      Active:'badge-active', 'Day Off':'badge-off',
      Vacation:'badge-annual', Sick:'badge-sick'
    }[emp.status] || 'badge-off';

    return `<tr>
      <td style="color:var(--muted)">${idx+1}</td>
      <td><strong style="color:var(--text)">${escH(emp.name)}</strong></td>
      <td><span class="badge ${LOC_CLS[emp.fallback?.toLowerCase().replace(' ','')||'field']||''}">${escH(emp.fallback||'Field Work')}</span></td>
      <td>${blockedChips || `<span class="loc-all-chip">All OK</span>`}</td>
      <td><span class="badge ${statusBadge}">${escH(emp.status)}</span></td>
      <td>
        <div class="hrs-bar-wrap">
          <div class="hrs-bar"><div class="hrs-bar-fill" style="width:${Math.min(100,totalHrs/40*100)}%;background:var(--accent)"></div></div>
          <span style="font-size:9px;color:var(--muted)">${totalHrs.toFixed(1)}h</span>
        </div>
      </td>
      <td>${leaveRec.length ? `<span class="badge badge-annual">${leaveRec.length} active</span>` : '—'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-plan" onclick="openPlanSchedule('${emp.id}')">Plan</button>
          <button class="btn btn-sm btn-ghost" onclick="openEditEmployee('${emp.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${emp.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openAddEmployee() {
  editingEmpId = null;
  blockedLocs  = {};
  document.getElementById('modal-title').textContent = 'Add Employee';
  document.getElementById('emp-name').value    = '';
  document.getElementById('emp-fallback').value = 'Field Work';
  document.getElementById('emp-status').value  = 'Active';
  document.getElementById('emp-annual').value  = '20';
  document.getElementById('emp-sick').value    = '10';
  document.getElementById('emp-hrs-summary').textContent = '';
  ALL_LOCS.forEach(l => {
    const btn = document.getElementById(`tog-${l}`);
    if (btn) btn.classList.remove('blocked');
  });
  openModal('emp-modal');
}

function openEditEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  editingEmpId = empId;
  blockedLocs  = { ...(emp.blocked || {}) };
  document.getElementById('modal-title').textContent = 'Edit Employee';
  document.getElementById('emp-name').value    = emp.name;
  document.getElementById('emp-fallback').value = emp.fallback || 'Field Work';
  document.getElementById('emp-status').value  = emp.status || 'Active';
  document.getElementById('emp-annual').value  = emp.leaveBalance?.annual ?? 20;
  document.getElementById('emp-sick').value    = emp.leaveBalance?.sick   ?? 10;
  ALL_LOCS.forEach(l => {
    const btn = document.getElementById(`tog-${l}`);
    if (btn) btn.classList.toggle('blocked', !!blockedLocs[l]);
  });
  const hrs = calcTotalHrsWeek(empId);
  document.getElementById('emp-hrs-summary').textContent = `This week: ${hrs.toFixed(1)} hrs`;
  openModal('emp-modal');
}

function toggleLoc(loc) {
  blockedLocs[loc] = !blockedLocs[loc];
  const btn = document.getElementById(`tog-${loc}`);
  if (btn) btn.classList.toggle('blocked', !!blockedLocs[loc]);
}

function saveEmployee() {
  const name    = v('emp-name');
  const fallback = document.getElementById('emp-fallback').value;
  const status  = document.getElementById('emp-status').value;
  const annual  = parseInt(document.getElementById('emp-annual').value) || 20;
  const sick    = parseInt(document.getElementById('emp-sick').value)   || 10;
  if (!name) { alert('Name is required.'); return; }

  if (editingEmpId) {
    const emp = state.employees.find(e => e.id === editingEmpId);
    Object.assign(emp, { name, fallback, status, blocked: { ...blockedLocs },
      leaveBalance: { annual, sick } });
  } else {
    state.employees.push({ id: uid(), name, fallback, status,
      blocked: { ...blockedLocs }, leaveBalance: { annual, sick } });
  }
  persistAll();
  closeModal('emp-modal');
  renderRoster();
  showToast(editingEmpId ? 'Employee updated' : 'Employee added');
}

function deleteEmployee(empId) {
  if (!confirm('Delete this employee? Their schedule data will remain.')) return;
  state.employees = state.employees.filter(e => e.id !== empId);
  persistAll();
  renderRoster();
  showToast('Employee deleted');
}

// ── Volunteers ────────────────────────────────────────────────
function renderVolunteers() {
  const el = document.getElementById('volunteer-list');
  if (!el) return;
  if (!state.volunteers.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:11px;margin-bottom:14px">No volunteers yet.</p>`;
    return;
  }
  const weekStart = new Date(state.currentWeekMon + 'T00:00:00');
  const weekDates = Array.from({length:7}, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  el.innerHTML = `<div class="card" style="margin-bottom:18px"><div style="overflow-x:auto">
    <table class="data-table"><thead><tr>
      <th>Name</th><th>Note</th><th>Available This Week</th><th></th>
    </tr></thead><tbody>
    ${state.volunteers.map(vol => {
      const toggles = weekDates.map((d, i) => {
        const iso = toDateStr(d);
        const on  = state.volAvailability?.[vol.id]?.[iso];
        return `<div class="vol-day-chip" onclick="toggleVolDay('${vol.id}','${iso}')">
          <span>${DAYS_SHORT[i]}</span>
          <div class="vol-toggle ${on?'on':''}"></div>
        </div>`;
      }).join('');
      return `<tr>
        <td><strong style="color:var(--text)">${escH(vol.name)}</strong></td>
        <td style="color:var(--muted)">${escH(vol.note||'')}</td>
        <td><div style="display:flex;gap:7px;flex-wrap:wrap">${toggles}</div></td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteVolunteer('${vol.id}')">✕</button></td>
      </tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}

function openAddVolunteer() {
  editingVolId = null;
  document.getElementById('vol-modal-title').textContent = 'Add Volunteer';
  document.getElementById('vol-name').value = '';
  document.getElementById('vol-note').value = '';
  openModal('vol-modal');
}

function saveVolunteer() {
  const name = v('vol-name');
  const note = v('vol-note');
  if (!name) { alert('Name is required.'); return; }
  if (editingVolId) {
    const vol = state.volunteers.find(v => v.id === editingVolId);
    Object.assign(vol, { name, note });
  } else {
    state.volunteers.push({ id: uid(), name, note });
  }
  if (!state.volAvailability) state.volAvailability = {};
  persistAll();
  closeModal('vol-modal');
  renderVolunteers();
  showToast('Volunteer saved');
}

function deleteVolunteer(volId) {
  if (!confirm('Delete this volunteer?')) return;
  state.volunteers = state.volunteers.filter(v => v.id !== volId);
  persistAll();
  renderVolunteers();
}

function toggleVolDay(volId, iso) {
  if (!state.volAvailability)        state.volAvailability = {};
  if (!state.volAvailability[volId]) state.volAvailability[volId] = {};
  state.volAvailability[volId][iso]  = !state.volAvailability[volId][iso];
  persistAll();
  renderVolunteers();
  renderLiveVolunteers();
}

// ── Hours Calculation ─────────────────────────────────────────
function calcTotalHrsWeek(empId) {
  const weekStart = new Date(state.currentWeekMon + 'T00:00:00');
  let total = 0;
  for (let di = 0; di < 7; di++) {
    const d   = new Date(weekStart); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    TIME_SLOTS.forEach((_, si) => {
      const { loc } = getResolvedLoc(iso, si, empId);
      if (loc && loc !== 'off' && loc !== 'vac') total += SLOT_HRS[si];
    });
  }
  return total;
}
