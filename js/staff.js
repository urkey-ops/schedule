// ── Roster ────────────────────────────────────────────────────
function renderRoster() {
  const tbody = document.getElementById('roster-body');
  if (!tbody) return;
  const emps = state.employees;
  if (!emps.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">No employees yet. Click + Add Employee.</td></tr>`;
    return;
  }
  tbody.innerHTML = emps.map((e,i) => {
    const hrs     = calcTotalHrsWeek(e.id);
    const cap     = getEmpHourCap(e.id);
    const hrsCls  = hrs > cap ? 'hrs-over' : hrs >= cap-5 ? 'hrs-ok' : 'hrs-under';
    const blocked = e.blocked ? Object.keys(e.blocked).filter(k=>e.blocked[k]) : [];
    const daysOff = getEmpDaysOff(e.id);

    return `<tr>
      <td style="color:var(--muted);font-size:12px">${i+1}</td>
      <td style="font-weight:600">${escH(e.name)}</td>
      <td><span class="badge badge-active">${escH(e.fallback||'Field Work')}</span></td>
      <td>
        ${blocked.length
          ? blocked.map(l=>`<span class="loc-blocked-chip">${LOC_LABEL[l]||l}</span>`).join('')
          : `<span class="loc-all-chip">All</span>`}
      </td>
      <td><span class="badge ${e.status==='Active'?'badge-active':'badge-off'}">${e.status}</span></td>
      <td>
        <div class="hrs-bar-wrap">
          <span class="hrs-chip ${hrsCls}">${hrs}/${cap}h</span>
          <div class="hrs-bar">
            <div class="hrs-bar-fill" style="width:${Math.min(100,(hrs/cap)*100)}%;background:${hrs>cap?'var(--red)':hrs>=cap-5?'var(--green)':'var(--amber)'}"></div>
          </div>
        </div>
      </td>
      <td>
        ${daysOff.length
          ? daysOff.map(d=>`<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:var(--surface3);color:var(--muted);margin:1px">${d}</span>`).join('')
          : '<span style="color:var(--subtle);font-size:11px">None</span>'}
      </td>
      <td>
        ${calcLeaveBalance(e.id)}
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost"  onclick="openEditEmployee('${e.id}')">Edit</button>
          <button class="btn btn-sm btn-plan"   onclick="openPlanSchedule('${e.id}')">Plan</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${e.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function calcTotalHrsWeek(empId) {
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  let total = 0;
  for (let d = 0; d < 7; d++) {
    const day = new Date(mon);
    day.setDate(day.getDate() + d);
    const iso = toDateStr(day);
    if (isEmpDayOff(empId, iso)) continue;
    TIME_SLOTS.forEach((_,si) => {
      const { loc } = getResolvedLoc(iso, si, empId);
      if (loc !== 'off' && loc !== 'vac') total += SLOT_HRS[si];
    });
  }
  return Math.round(total * 10) / 10;
}

function calcLeaveBalance(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return '';
  const used = (state.leaveRequests||[]).filter(l =>
    l.empId === empId && l.status === 'active' && l.type === 'annual'
  ).reduce((acc, l) => {
    const from = new Date(l.from), to = new Date(l.to);
    return acc + Math.round((to-from)/(1000*60*60*24)) + 1;
  }, 0);
  const cap = emp.annualLeave || 20;
  return `<span style="font-size:11px;color:var(--muted)">${cap-used}/${cap} AL</span>`;
}

// ── Employee Modal ────────────────────────────────────────────
let _editEmpId   = null;
let _blockedLocs = {};

function openAddEmployee() {
  _editEmpId   = null;
  _blockedLocs = {};
  document.getElementById('modal-title').textContent  = 'Add Employee';
  document.getElementById('emp-name').value           = '';
  document.getElementById('emp-fallback').value       = 'Field Work';
  document.getElementById('emp-status').value         = 'Active';
  document.getElementById('emp-annual').value         = '20';
  document.getElementById('emp-sick').value           = '10';
  document.getElementById('emp-hour-cap').value       = '40';
  document.getElementById('emp-hrs-summary').textContent = '';
  // Clear day off checkboxes
  DAYS_SHORT.forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = false;
  });
  updateLocToggles();
  openModal('emp-modal');
}

function openEditEmployee(empId) {
  const emp    = state.employees.find(e => e.id === empId);
  if (!emp) return;
  _editEmpId   = empId;
  _blockedLocs = emp.blocked ? { ...emp.blocked } : {};
  document.getElementById('modal-title').textContent  = 'Edit Employee';
  document.getElementById('emp-name').value           = emp.name;
  document.getElementById('emp-fallback').value       = emp.fallback || 'Field Work';
  document.getElementById('emp-status').value         = emp.status  || 'Active';
  document.getElementById('emp-annual').value         = emp.annualLeave || '20';
  document.getElementById('emp-sick').value           = emp.sickLeave   || '10';
  document.getElementById('emp-hour-cap').value       = getEmpHourCap(empId);
  // Day off checkboxes
  const daysOff = getEmpDaysOff(empId);
  DAYS_SHORT.forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = daysOff.includes(d);
  });
  const hrs = calcTotalHrsWeek(empId);
  const cap = getEmpHourCap(empId);
  document.getElementById('emp-hrs-summary').textContent = `Current week: ${hrs}h scheduled / ${cap}h cap`;
  updateLocToggles();
  openModal('emp-modal');
}

function toggleLoc(loc) {
  _blockedLocs[loc] = !_blockedLocs[loc];
  updateLocToggles();
}

function updateLocToggles() {
  ALL_LOCS.forEach(loc => {
    const btn = document.getElementById(`tog-${loc}`);
    if (btn) btn.classList.toggle('blocked', !!_blockedLocs[loc]);
  });
}

function saveEmployee() {
  const name = v('emp-name');
  if (!name) { alert('Name is required.'); return; }

  // Collect day off selections
  const daysOff = DAYS_SHORT.filter(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    return cb && cb.checked;
  });

  const hourCap = parseInt(document.getElementById('emp-hour-cap').value) || DEFAULT_HRS_CAP;

  pushUndo('Save employee', state);

  if (_editEmpId) {
    const idx = state.employees.findIndex(e => e.id === _editEmpId);
    if (idx > -1) {
      state.employees[idx] = {
        ...state.employees[idx],
        name,
        fallback:    v('emp-fallback'),
        status:      v('emp-status'),
        annualLeave: parseInt(v('emp-annual')) || 20,
        sickLeave:   parseInt(v('emp-sick'))   || 10,
        blocked:     { ..._blockedLocs },
      };
    }
    if (!state.empDaysOff) state.empDaysOff = {};
    state.empDaysOff[_editEmpId] = daysOff;
    if (!state.empHourCap) state.empHourCap = {};
    state.empHourCap[_editEmpId] = hourCap;
  } else {
    const newId = uid();
    state.employees.push({
      id:          newId,
      name,
      fallback:    v('emp-fallback'),
      status:      v('emp-status'),
      annualLeave: parseInt(v('emp-annual')) || 20,
      sickLeave:   parseInt(v('emp-sick'))   || 10,
      blocked:     { ..._blockedLocs },
    });
    if (!state.empDaysOff) state.empDaysOff = {};
    state.empDaysOff[newId] = daysOff;
    if (!state.empHourCap) state.empHourCap = {};
    state.empHourCap[newId] = hourCap;
  }

  persistAll();
  closeModal('emp-modal');
  renderRoster();
  showToast('Employee saved');
}

function deleteEmployee(empId) {
  if (!confirm('Delete this employee?')) return;
  pushUndo('Delete employee', state);
  state.employees = state.employees.filter(e => e.id !== empId);
  persistAll();
  renderRoster();
  showToast('Employee deleted');
}

// ── Volunteers ────────────────────────────────────────────────
function renderVolunteers() {
  const container = document.getElementById('volunteer-list');
  if (!container) return;
  const vols = state.volunteers || [];
  if (!vols.length) {
    container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--muted);font-size:13px">No volunteers yet.</div></div>`;
    return;
  }
  container.innerHTML = vols.map(vol => {
    const avail = state.volAvailability?.[vol.id] || [];
    return `<div class="card" style="margin-bottom:10px">
      <div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-weight:600;font-size:14px">${escH(vol.name)}</div>
          ${vol.note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escH(vol.note)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          ${DAYS_SHORT.map(d => `
            <div class="vol-day-chip" onclick="toggleVolDay('${vol.id}','${d}')">
              <span>${d}</span>
              <div class="vol-toggle ${avail.includes(d)?'on':''}"></div>
            </div>`).join('')}
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteVolunteer('${vol.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

let _editVolId = null;

function openAddVolunteer() {
  _editVolId = null;
  document.getElementById('vol-modal-title').textContent = 'Add Volunteer';
  document.getElementById('vol-name').value = '';
  document.getElementById('vol-note').value = '';
  openModal('vol-modal');
}

function saveVolunteer() {
  const name = v('vol-name');
  if (!name) { alert('Name is required.'); return; }
  pushUndo('Save volunteer', state);
  if (!state.volunteers) state.volunteers = [];
  const newId = uid();
  state.volunteers.push({ id:newId, name, note:v('vol-note') });
  persistAll();
  closeModal('vol-modal');
  renderVolunteers();
  showToast('Volunteer saved');
}

function deleteVolunteer(volId) {
  if (!confirm('Delete volunteer?')) return;
  pushUndo('Delete volunteer', state);
  state.volunteers = state.volunteers.filter(v => v.id !== volId);
  persistAll();
  renderVolunteers();
}

function toggleVolDay(volId, day) {
  if (!state.volAvailability)         state.volAvailability         = {};
  if (!state.volAvailability[volId])  state.volAvailability[volId]  = [];
  const arr = state.volAvailability[volId];
  const idx = arr.indexOf(day);
  if (idx > -1) arr.splice(idx,1); else arr.push(day);
  persistAll();
  renderVolunteers();
}
