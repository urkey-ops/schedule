// ── domain/staff.js ───────────────────────────────────────────

function safeInt(val, fallback = 0) {
  const n = parseInt(val);
  return isNaN(n) ? fallback : n;
}

// ── Employee CRUD ─────────────────────────────────────────────
function saveEmployee() {
  const name       = document.getElementById('emp-name')?.value.trim();
  const fallback   = document.getElementById('emp-fallback')?.value   || 'field';
  const hourCap    = safeInt(document.getElementById('emp-hour-cap')?.value, DEFAULTHRSCAP);
  const status     = document.getElementById('emp-status')?.value     || 'Active';
  const annual     = safeInt(document.getElementById('emp-annual')?.value, 20);
  const sick       = safeInt(document.getElementById('emp-sick')?.value,   10);
  const inTraining = document.getElementById('emp-intraining')?.checked || false;
  const phone      = document.getElementById('emp-phone')?.value.trim() || '';
  const email      = document.getElementById('emp-email')?.value.trim() || '';
  const notes      = document.getElementById('emp-notes-field')?.value.trim() || '';

  if (!name) { alert('Please enter a name.'); return; }

  const daysOff = ['MON','TUE','WED','THU','FRI','SAT','SUN']
    .filter(d => document.getElementById(`dow-off-${d}`)?.checked);

  const empData = {
    name, fallback, hourCap, status, daysOff,
    blocked     : [...(_blockedLocs || [])],
    annualLeave : annual,
    sickLeave   : sick,
    inTraining,
    phone,
    email,
  };

  if (_editEmpId) {
    const dup = state.employees.find(e =>
      e.id !== _editEmpId && e.name.toLowerCase() === name.toLowerCase()
    );
    if (dup) { alert(`An employee named "${name}" already exists.`); return; }
    const emp = state.employees.find(e => e.id === _editEmpId);
    if (emp) Object.assign(emp, empData);
    if (notes !== undefined) {
      if (!state.empNotes) state.empNotes = {};
      if (notes) state.empNotes[_editEmpId] = notes;
      else delete state.empNotes[_editEmpId];
      markDirty('empNotes');
    }
  } else {
    const dup = state.employees.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (dup) { alert(`An employee named "${name}" already exists.`); return; }
    const newEmp = { id: `emp-${Date.now()}`, ...empData };
    state.employees.push(newEmp);
    if (notes) {
      if (!state.empNotes) state.empNotes = {};
      state.empNotes[newEmp.id] = notes;
      markDirty('empNotes');
    }
  }

  persistAll('employees');
  logAction(_editEmpId ? 'edit_employee' : 'add_employee', name);
  closeModal('emp-modal');
  renderRoster();
  renderAll();
  showToast(_editEmpId ? 'Employee updated' : 'Employee added');
}

function deleteEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
  state.employees = state.employees.filter(e => e.id !== empId);
  persistAll('employees');
  logAction('delete_employee', emp.name);
  renderRoster();
  renderAll();
  showToast('Employee deleted');
}

// Deactivate preserves history; delete removes all trace
function deactivateEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!confirm(`Deactivate ${emp.name}? They will be hidden from scheduling but history is preserved.`)) return;
  emp.status = 'Inactive';
  persistAll('employees');
  logAction('deactivate_employee', emp.name);
  renderRoster();
  renderAll();
  showToast(`${emp.name} deactivated`);
}

function getEmpNote(empId) {
  return state.empNotes?.[empId] || '';
}

function setEmpNote(empId, note) {
  if (!state.empNotes) state.empNotes = {};
  if (note) state.empNotes[empId] = note;
  else delete state.empNotes[empId];
  persistAll('empNotes');
}

function isInTraining(empId) {
  return !!(state.employees.find(e => e.id === empId)?.inTraining);
}

// ── Blocked location toggles ──────────────────────────────────
let _blockedLocs = [];

function toggleLoc(loc) {
  const btn = document.getElementById(`tog-${loc}`);
  if (_blockedLocs.includes(loc)) {
    _blockedLocs = _blockedLocs.filter(l => l !== loc);
    btn?.classList.remove('active');
  } else {
    _blockedLocs.push(loc);
    btn?.classList.add('active');
  }
}

// ── Day-off inline toggle (roster table) ─────────────────────
function toggleEmpDow(empId, dow) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!emp.daysOff) emp.daysOff = [];
  const idx = emp.daysOff.indexOf(dow);
  if (idx !== -1) emp.daysOff.splice(idx, 1);
  else            emp.daysOff.push(dow);
  persistAll('employees');
  renderRoster();
}

// ── Volunteer CRUD ────────────────────────────────────────────
function saveVolunteer() {
  const name      = document.getElementById('vol-name')?.value.trim();
  const note      = document.getElementById('vol-note')?.value.trim()  || '';
  const prefLoc   = document.getElementById('vol-prefloc')?.value      || '';
  if (!name) { alert('Please enter a name.'); return; }
  if (!state.volunteers) state.volunteers = [];

  if (_editVolId) {
    const vol = state.volunteers.find(v => v.id === _editVolId);
    if (vol) Object.assign(vol, { name, note, prefLoc });
  } else {
    state.volunteers.push({ id: `vol-${Date.now()}`, name, note, prefLoc });
  }

  persistAll('volunteers');
  closeModal('vol-modal');
  renderVolunteers();
  showToast(_editVolId ? 'Volunteer updated' : 'Volunteer added');
}

function deleteVolunteer(volId) {
  if (!confirm('Delete this volunteer?')) return;
  state.volunteers = (state.volunteers || []).filter(v => v.id !== volId);
  persistAll('volunteers');
  renderVolunteers();
  showToast('Volunteer deleted');
}

// ── toggleVolAvail removed — use toggleVolToday in staff-page.js ──
