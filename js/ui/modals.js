// ── ui/modals.js ──────────────────────────────────────────────

function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Admin login ───────────────────────────────────────────────

function openAdminLogin() {
  if (state.mode === 'admin') { exitAdmin(); return; }
  document.getElementById('admin-pin-input').value       = '';
  document.getElementById('admin-pin-error').textContent = '';
  openModal('admin-login-modal');
  setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 100);
}

function checkAdminPin(e) {
  if (e.key === 'Enter') submitAdminPin();
}

async function submitAdminPin() {
  const pin      = document.getElementById('admin-pin-input').value.trim();
  const errEl    = document.getElementById('admin-pin-error');
  const remember = document.getElementById('admin-remember')?.checked;
  if (!pin) { errEl.textContent = 'Please enter your PIN.'; return; }
  if (!hasPinSet()) { errEl.textContent = 'No PIN configured.'; return; }
  const ok = await verifyPin(pin);
  if (ok) {
    if (remember) saveAdminSession();
    else sessionStorage.setItem('smPro_adminSession', '1');
    closeModal('admin-login-modal');
    enterAdmin();
  } else {
    errEl.textContent = 'Incorrect PIN. Try again.';
    document.getElementById('admin-pin-input').value = '';
  }
}

function switchToFirebaseModal() {
  closeModal('admin-login-modal');
  showFirebaseConfig();
}

// ── Firebase modal ────────────────────────────────────────────

function showFirebaseConfig() {
  const saved = localStorage.getItem('smPro_fbConfig');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      ['apiKey','authDomain','databaseURL','projectId','appId'].forEach(k => {
        const el = document.getElementById(`fb-${k}`);
        if (el) el.value = cfg[k] || '';
      });
    } catch(e) {}
  }
  openModal('firebase-modal');
}

async function saveFirebaseConfig() {
  const cfg = {
    apiKey     : v('fb-apiKey'),
    authDomain : v('fb-authDomain'),
    databaseURL: v('fb-databaseURL'),
    projectId  : v('fb-projectId'),
    appId      : v('fb-appId'),
  };
  if (!cfg.apiKey || !cfg.databaseURL) {
    alert('API Key and Database URL are required.'); return;
  }
  localStorage.setItem('smPro_fbConfig', JSON.stringify(cfg));
  closeModal('firebase-modal');
  location.reload();
}

// ── Employee modal ────────────────────────────────────────────

let _editEmpId = null;

function openAddEmployee() {
  _editEmpId   = null;
  _blockedLocs = [];
  document.getElementById('modal-title').textContent    = 'Add Employee';
  document.getElementById('emp-name').value             = '';
  document.getElementById('emp-fallback').value         = 'field';
  document.getElementById('emp-hour-cap').value         = '';
  document.getElementById('emp-status').value           = 'Active';
  document.getElementById('emp-annual').value           = '';
  document.getElementById('emp-sick').value             = '';
  document.getElementById('emp-hrs-summary').innerHTML  = '';
  ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = false;
  });
  ['gate','podium','mandir','field','giftshop'].forEach(loc =>
    document.getElementById(`tog-${loc}`)?.classList.remove('active')
  );
  openModal('emp-modal');
  setTimeout(() => document.getElementById('emp-name')?.focus(), 100);
}

function openEditEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  _editEmpId   = empId;
  _blockedLocs = [...(emp.blocked || [])];

  document.getElementById('modal-title').textContent  = 'Edit Employee';
  document.getElementById('emp-name').value           = emp.name     || '';
  document.getElementById('emp-fallback').value       = emp.fallback || 'field';
  document.getElementById('emp-hour-cap').value       = emp.hourCap  || '';
  document.getElementById('emp-status').value         = emp.status   || 'Active';
  document.getElementById('emp-annual').value         = emp.annualLeave || '';
  document.getElementById('emp-sick').value           = emp.sickLeave   || '';

  ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = (emp.daysOff || []).includes(d);
  });
  ['gate','podium','mandir','field','giftshop'].forEach(loc => {
    document.getElementById(`tog-${loc}`)
      ?.classList.toggle('active', _blockedLocs.includes(loc));
  });

  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  const used    = calcScheduledHrsWeek(empId, weekMon);
  const cap     = emp.hourCap || DEFAULTHRSCAP;
  const pct     = Math.min((used / cap) * 100, 100);
  const color   = used > cap ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669';
  document.getElementById('emp-hrs-summary').innerHTML =
    `<div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:12px;color:var(--muted);font-weight:600">This week:</span>
      <div class="roster-hr-bar" style="flex:1">
        <div class="roster-hr-track">
          <div class="roster-hr-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="roster-hr-label" style="color:${color}">
          ${used.toFixed(1)}/${cap}h
        </span>
      </div>
    </div>`;

  openModal('emp-modal');
  setTimeout(() => document.getElementById('emp-name')?.focus(), 100);
}

// ── Leave modal ───────────────────────────────────────────────

let _editLeaveId = null;

function openAddLeave(preEmpId = null) {
  _editLeaveId = null;
  document.getElementById('leave-modal-title').textContent = 'Add Leave Record';
  document.getElementById('leave-from').value              = todayStr();
  document.getElementById('leave-to').value                = todayStr();
  document.getElementById('leave-note').value              = '';
  document.getElementById('leave-type').value              = 'annual';
  document.getElementById('leave-status').value            = 'active';

  const sel = document.getElementById('leave-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}" ${preEmpId === e.id ? 'selected' : ''}>
      ${escH(e.name)}</option>`)
    .join('');

  updateLeaveBalance();
  openModal('leave-modal');
}

function openEditLeave(leaveId) {
  const rec = (state.leaveRequests || []).find(l => l.id === leaveId);
  if (!rec) return;
  _editLeaveId = leaveId;
  document.getElementById('leave-modal-title').textContent = 'Edit Leave Record';

  const sel = document.getElementById('leave-emp-id');
  sel.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<option value="${e.id}" ${e.id === rec.empId ? 'selected' : ''}>
      ${escH(e.name)}</option>`)
    .join('');

  document.getElementById('leave-from').value   = rec.from   || '';
  document.getElementById('leave-to').value     = rec.to     || '';
  document.getElementById('leave-type').value   = rec.type   || 'annual';
  document.getElementById('leave-note').value   = rec.note   || '';
  document.getElementById('leave-status').value = rec.status || 'active';
  updateLeaveBalance();
  openModal('leave-modal');
}

function updateLeaveBalance() {
  const el    = document.getElementById('leave-balance-info');
  if (!el) return;
  const empId = document.getElementById('leave-emp-id')?.value;
  const type  = document.getElementById('leave-type')?.value;
  const emp   = state.employees.find(e => e.id === empId);
  if (!emp || !['annual','sick'].includes(type)) { el.innerHTML = ''; return; }
  const cap    = type === 'annual' ? (emp.annualLeave || 20) : (emp.sickLeave || 10);
  const used   = calcLeaveUsed(empId, type);
  const remain = cap - used;
  const color  = remain <= 3 ? 'var(--red)' : 'var(--green)';
  el.innerHTML = `<span style="font-size:12px;font-weight:600;color:${color}">
    ${remain}d remaining of ${cap}d ${type} leave</span>`;
}

function saveLeave() {
  const empId  = document.getElementById('leave-emp-id')?.value;
  const from   = v('leave-from');
  const to     = v('leave-to');
  const type   = v('leave-type');
  const note   = v('leave-note');
  const status = v('leave-status');

  if (!empId || !from || !to) { alert('Please fill all required fields.'); return; }
  if (from > to) { alert('"From" date must be before "To" date.'); return; }

  const conflicts = checkLeaveConflicts(empId, from, to);
  if (conflicts.length) {
    const emp = state.employees.find(e => e.id === empId);
    if (!confirm(`${emp?.name || 'This employee'} has ${conflicts.length} scheduled shift(s) during this period.\n\nContinue anyway?`)) return;
  }

  if (!state.leaveRequests) state.leaveRequests = [];

  if (_editLeaveId) {
    const rec = state.leaveRequests.find(l => l.id === _editLeaveId);
    if (rec) Object.assign(rec, { empId, from, to, type, note, status });
  } else {
    state.leaveRequests.push({
      id: `leave-${Date.now()}`, empId, from, to, type, note, status,
    });
  }

  persistAll('leaveRequests');
  closeModal('leave-modal');
  renderLeave();
  renderAll();
  showToast(_editLeaveId ? 'Leave updated' : 'Leave added');
}

// ── Volunteer modal ───────────────────────────────────────────

let _editVolId = null;

function openAddVolunteer() {
  _editVolId = null;
  document.getElementById('vol-modal-title').textContent = 'Add Volunteer';
  document.getElementById('vol-name').value = '';
  document.getElementById('vol-note').value = '';
  openModal('vol-modal');
  setTimeout(() => document.getElementById('vol-name')?.focus(), 100);
}

function openEditVolunteer(volId) {
  const vol = (state.volunteers || []).find(v => v.id === volId);
  if (!vol) return;
  _editVolId = volId;
  document.getElementById('vol-modal-title').textContent = 'Edit Volunteer';
  document.getElementById('vol-name').value = vol.name || '';
  document.getElementById('vol-note').value = vol.note || '';
  openModal('vol-modal');
  setTimeout(() => document.getElementById('vol-name')?.focus(), 100);
}

// ── Reset modal ───────────────────────────────────────────────

function resetAllData() {
  document.getElementById('reset-pin').value         = '';
  document.getElementById('reset-error').textContent = '';
  openModal('reset-modal');
}

async function confirmReset() {
  const pin = document.getElementById('reset-pin').value.trim();
  const ok  = await verifyPin(pin);
  if (!ok) { document.getElementById('reset-error').textContent = 'Incorrect PIN.'; return; }
  Object.assign(state, {
    employees:[], volunteers:[], defaultSchedule:{}, shifts:{},
    earlyGate:{}, volAvailability:{}, absences:{},
    leaveRequests:[], swapRequests:[], holidays:{}, empDaysOff:{}, empHourCap:{},
  });
  // ✅ FIXED — mark all keys dirty so Firebase receives the reset
  FBKEYS.forEach(k => markDirty(k));
  persistAll();
  closeModal('reset-modal');
  renderAll();
  showToast('All data deleted');
}

// ── Export / Import ───────────────────────────────────────────

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `schedule-backup-${todayStr()}.json`;
  a.click();
}

function importData() {
  document.getElementById('import-file')?.click();
}

function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!confirm('This will replace ALL current data. Are you sure?')) return;
      pushUndo('Import data', state);
      Object.keys(data).forEach(k => { state[k] = data[k]; });
      // ✅ FIXED — mark all keys dirty so Firebase receives the import
      FBKEYS.forEach(k => markDirty(k));
      persistAll();
      renderAll();
      showToast('Data imported successfully');
    } catch(err) { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
}

// ── Who was where lookup ──────────────────────────────────────

function renderWhoWasWhere() {
  const iso    = document.getElementById('www-date')?.value;
  const loc    = document.getElementById('www-loc')?.value;
  const timeStr= document.getElementById('www-time')?.value;
  const el     = document.getElementById('www-result');
  if (!iso || !loc || !timeStr || !el) return;

  const timeMins = HHMMtoMins(timeStr);
  const emps     = whoWasAt(iso, loc, timeMins);

  el.innerHTML = emps.length
    ? `<div style="margin-top:10px">
        <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">
          At ${LOCLABEL[loc]||loc} on ${fmtDate(iso)} at ${timeStr}:
        </div>
        ${emps.map(e =>
          `<div style="font-size:14px;font-weight:600;padding:6px 0;
                       border-bottom:1px solid var(--border)">${escH(e.name)}</div>`
        ).join('')}
      </div>`
    : `<div style="margin-top:10px;font-size:13px;color:var(--muted)">
        Nobody recorded at ${LOCLABEL[loc]||loc} at that time.</div>`;
}
