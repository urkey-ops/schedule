// ── domain/staff.js ───────────────────────────────────────────

let _blockedLocs = [];

function toggleLoc(loc) {
  const btn = document.getElementById(`tog-${loc}`);
  if (!btn) return;
  const idx = _blockedLocs.indexOf(loc);
  if (idx >= 0) { _blockedLocs.splice(idx,1); btn.classList.remove('active'); }
  else          { _blockedLocs.push(loc);     btn.classList.add('active'); }
}

function toggleEmpDow(empId, dow) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!emp.daysOff) emp.daysOff = [];
  const idx = emp.daysOff.indexOf(dow);
  if (idx >= 0) emp.daysOff.splice(idx,1);
  else          emp.daysOff.push(dow);
  persistAll('employees');
  renderRoster();
  showToast(`${emp.name} — ${dow} day off ${idx>=0?'removed':'added'}`);
}

function saveEmployee() {
  const name = v('emp-name');
  if (!name) { alert('Please enter a name.'); return; }
  if (!validateDuplicateEmployee(name, _editEmpId)) return;

  const daysOff = ['MON','TUE','WED','THU','FRI','SAT','SUN']
    .filter(d => document.getElementById(`dow-off-${d}`)?.checked);
  const hourCap = parseInt(v('emp-hour-cap')) || DEFAULTHRSCAP;

  if (_editEmpId) {
    const emp = state.employees.find(e => e.id === _editEmpId);
    if (!emp) return;
    emp.name        = name;
    emp.fallback    = v('emp-fallback');
    emp.blocked     = [..._blockedLocs];
    emp.status      = v('emp-status');
    emp.hourCap     = hourCap;
    emp.daysOff     = daysOff;
    emp.annualLeave = parseInt(v('emp-annual')) || 20;
    emp.sickLeave   = parseInt(v('emp-sick'))   || 10;
  } else {
    state.employees.push({
      id          : uid(),
      name,
      fallback    : v('emp-fallback'),
      blocked     : [..._blockedLocs],
      status      : v('emp-status'),
      hourCap,
      daysOff,
      annualLeave : parseInt(v('emp-annual')) || 20,
      sickLeave   : parseInt(v('emp-sick'))   || 10,
    });
  }

  persistAll('employees');
  closeModal('emp-modal');
  renderRoster(); renderAll();
  showToast(_editEmpId ? 'Employee updated' : 'Employee added');
}

function deleteEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
  pushUndo('Delete employee', state);
  state.employees = state.employees.filter(e => e.id !== empId);
  persistAll('employees');
  renderRoster(); renderAll();
  showToast(`${emp.name} deleted`);
}

function saveVolunteer() {
  const name = v('vol-name');
  if (!name) { alert('Please enter a name.'); return; }
  if (!state.volunteers) state.volunteers = [];
  if (_editVolId) {
    const vol = state.volunteers.find(v => v.id === _editVolId);
    if (vol) { vol.name = name; vol.note = v('vol-note'); }
  } else {
    state.volunteers.push({ id: uid(), name, note: v('vol-note') });
  }
  persistAll('volunteers');
  closeModal('vol-modal');
  renderVolunteers();
  showToast(_editVolId ? 'Volunteer updated' : 'Volunteer added');
}

function deleteVolunteer(volId) {
  const vol = (state.volunteers||[]).find(v => v.id === volId);
  if (!vol) return;
  if (!confirm(`Delete ${vol.name}?`)) return;
  state.volunteers = state.volunteers.filter(v => v.id !== volId);
  persistAll('volunteers');
  renderVolunteers();
  showToast(`${vol.name} deleted`);
}

function toggleVolAvail(volId, dow) {
  if (!state.volAvailability)        state.volAvailability = {};
  if (!state.volAvailability[volId]) state.volAvailability[volId] = {};
  const cur = state.volAvailability[volId][dow];
  state.volAvailability[volId][dow] = (cur === false) ? true : false;
  persistAll('volAvailability');
  renderVolunteers();
}
