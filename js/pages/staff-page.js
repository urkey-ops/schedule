// ── pages/staff-page.js ───────────────────────────────────────

let _rosterSort = 'name';
let _rosterFilter = 'all';

function filterRoster(val) {
  _rosterFilter = val || 'all';
  renderRoster();
}

function sortRoster(field) {
  _rosterSort = field;
  renderRoster();
}

function renderRoster() {
  const tbody = document.getElementById('roster-body');
  if (!tbody) return;

  let employees = [...(state.employees || [])];

  if (_rosterFilter === 'active') {
    employees = employees.filter(e => e.status === 'Active');
  } else if (_rosterFilter === 'leave') {
    employees = employees.filter(e => isOnLeave(e.id, todayStr()));
  } else if (_rosterFilter === 'dayoff') {
    employees = employees.filter(e => isEmpDayOff(e.id, todayStr()));
  }

  if (_rosterSort === 'hours') {
    employees.sort((a, b) => calcScheduledHrsWeek(b.id, state.currentWeekMon) - calcScheduledHrsWeek(a.id, state.currentWeekMon));
  } else {
    employees.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (!employees.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No employees found.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(e => {
    const hrs   = calcScheduledHrsWeek(e.id, state.currentWeekMon);
    const leave = isOnLeave(e.id, todayStr());
    const dayOff = isEmpDayOff(e.id, todayStr());
    const currentLoc = getEmpLocAtTime(todayStr(), e.id, nowMins());
    const note = getEmpNote(e.id);
    const swapCount = (state.swapRequests || []).filter(s => s.empId === e.id).length;
    const leaveCount = (state.leaveRequests || []).filter(l => l.empId === e.id).length;

    return `
      <tr>
        <td>${e.inTraining ? `<span class="status-chip" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">T</span>` : ''}</td>
        <td>
          <div style="font-weight:700">${escH(e.name)}</div>
          ${note ? `<div style="font-size:11px;color:var(--muted)">${escH(note)}</div>` : ''}
        </td>
        <td>
          <span class="status-chip ${e.status === 'Active' ? 'chip-active' : 'chip-cancelled'}">${e.status}</span>
        </td>
        <td>
          <div style="font-weight:700">${hrs.toFixed(1)}h</div>
          <div style="font-size:10px;color:${hrs > getEmpHourCap(e.id) ? 'var(--red)' : 'var(--muted)'}">Cap ${getEmpHourCap(e.id)}h</div>
        </td>
        <td>${(e.daysOff || []).join(', ') || '—'}</td>
        <td>${leave ? 'On Leave' : dayOff ? 'Day Off' : '—'}</td>
        <td>
          <div style="font-size:12px;font-weight:700">${LOCLABEL[currentLoc] || currentLoc}</div>
          <div style="font-size:10px;color:var(--muted)">${e.phone || '—'} ${e.email ? `· ${escH(e.email)}` : ''}</div>
          <div style="font-size:10px;color:var(--muted)">Swaps ${swapCount} · Leave ${leaveCount}</div>
        </td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-sm btn-ghost" onclick="openEditEmployee('${e.id}')">Edit</button>
            ${e.status === 'Active'
              ? `<button class="btn btn-sm btn-warn" onclick="deactivateEmployee('${e.id}')">Deactivate</button>`
              : `<button class="btn btn-sm btn-success" onclick="reactivateEmployee('${e.id}')">Activate</button>`}
            <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${e.id}')">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function reactivateEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  emp.status = 'Active';
  persistAll('employees');
  renderRoster();
  renderAll();
  showToast(`${emp.name} activated`);
}

function renderVolunteers() {
  const el = document.getElementById('volunteer-list');
  if (!el) return;
  const vols = state.volunteers || [];

  if (!vols.length) {
    el.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;color:var(--muted)">No volunteers yet.</div></div>`;
    return;
  }

  el.innerHTML = vols.map(v => {
    const avail = !!state.volAvailability?.[todayStr()]?.[v.id];
    return `
      <div class="card" style="margin-bottom:10px">
        <div class="card-body" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div>
            <div style="font-weight:700">${escH(v.name)}</div>
            <div style="font-size:12px;color:var(--muted)">
              ${escH(v.note || '—')}
              ${v.prefLoc ? ` · Prefers ${LOCLABEL[v.prefLoc] || v.prefLoc}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm ${avail ? 'btn-success' : 'btn-ghost'}" onclick="toggleVolToday('${v.id}')">
              ${avail ? 'Available Today' : 'Mark Available'}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="openEditVolunteer('${v.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteVolunteer('${v.id}')">✕</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleVolToday(volId) {
  const iso = todayStr();
  if (!state.volAvailability) state.volAvailability = {};
  if (!state.volAvailability[iso]) state.volAvailability[iso] = {};
  state.volAvailability[iso][volId] = !state.volAvailability[iso][volId];
  persistAll('volAvailability');
  renderVolunteers();
  renderLiveVolunteers();
}

function renderStaffPage() {
  renderAlertsBar('staff-alerts-bardiv', state.currentDateISO, { weekMode: true });
  renderRoster();
  renderVolunteers();
}

function onStaffPageShow() {
  renderStaffPage();
}
