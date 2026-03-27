let liveView = 'locations';
let selectedEmpId = sessionStorage.getItem('smPro_selectedEmp') || null;

function setLiveView(v) {
  liveView = v;
  ['locations','my','history'].forEach(id => {
    document.getElementById(`view-${id}`).classList.toggle('hidden', id !== v);
    document.getElementById(`lvt-${id}`).classList.toggle('active', id === v);
  });
  if (v === 'locations') renderLiveBoard();
  if (v === 'my') renderMySchedule();
  if (v === 'history') { renderHistoryToday(); renderDeepLookup(); }
}

// ── Live Board ────────────────────────────────────────────────
function renderLiveBoard() {
  const iso = todayStr();
  const nm = nowMins();
  const si = currentSlotIdx();
  const isAdmin = state.mode === 'admin';

  document.getElementById('live-date-label').textContent =
    new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Holiday banner
  const holiday = getHolidayForDate(iso);
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `<span>${holiday.emoji || '🎉'}</span><span>${escH(holiday.name)}</span>`;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  const activeEmps = state.employees.filter(e => e.status === 'Active');

  if (!activeEmps.length || si < 0 && !state.defaultSchedule) {
    document.getElementById('live-board').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);font-size:14px;">No schedule data for today.</div>`;
    renderTimeline();
    renderLiveAlerts();
    renderLiveVolunteers();
    return;
  }

  const cards = ALL_LOCS.map(loc => {
    const locLabel = LOC_LABEL[loc] || loc;
    const color = LOC_COLOR[loc] || '#888';

    const assignedEmp = si >= 0
      ? activeEmps.find(e => getResolvedLoc(iso, si, e.id).loc === loc)
      : null;

    const minsLeft = si >= 0 ? (SLOT_END[si] - nm / 60) * 60 : 999;
    const handoverSoon = minsLeft <= HANDOVER_WARN && minsLeft > 0;
    const isAbsent = assignedEmp ? !!state.absences?.[iso]?.[assignedEmp.id] : false;
    const isUncovered = !assignedEmp;

    // Up next — 3 slots ahead
    const nextSlots = si >= 0
      ? TIME_SLOTS.slice(si + 1, si + 4).map((slot, offset) => {
          const nsi = si + 1 + offset;
          const nemp = activeEmps.find(e => getResolvedLoc(iso, nsi, e.id).loc === loc);
          return nemp
            ? `<div class="live-next-slot">
                <span>${escH(nemp.name.split(' ')[0])}</span>
                <span class="live-next-time">${slot}</span>
               </div>`
            : `<div class="live-next-slot">
                <span style="color:var(--red)">Uncovered</span>
                <span class="live-next-time">${slot}</span>
               </div>`;
        }).join('')
      : '';

    // Card state class
    const cardClass = [
      'live-card',
      isUncovered ? 'uncovered' : '',
      (!isUncovered && handoverSoon) ? 'handover-soon' : ''
    ].filter(Boolean).join(' ');

    // Body content
    const bodyHtml = assignedEmp
      ? `<div class="live-emp-name">${escH(assignedEmp.name)}</div>
         <div class="live-sub">
           ${isAbsent ? '<span class="absent-badge">⚠ Absent</span>' : ''}
           ${handoverSoon ? `<span class="handover-badge">🔄 ${Math.round(minsLeft)}m left</span>` : ''}
           ${!isAbsent && !handoverSoon ? `<span>${escH(assignedEmp.role || '')}</span>` : ''}
         </div>
         ${isAdmin
           ? `<button class="present-toggle ${isAbsent ? 'absent' : 'present'}"
                data-iso="${iso}" data-empid="${assignedEmp.id}"
                onclick="toggleAbsent(this.dataset.iso, this.dataset.empid)">
                ${isAbsent ? '✕ Mark Present' : '✓ Present'}
              </button>`
           : ''}`
      : `<div class="live-uncovered">⚠ Not Covered</div>
         <div class="live-sub">No one assigned this slot</div>`;

    return `
      <div class="${cardClass}">
        <div class="live-card-stripe" style="background:${color}"></div>
        <div class="live-card-hdr">
          <span class="live-loc-tag" style="background:${color}22;color:${color}">
            ${escH(locLabel)}
          </span>
          <span class="live-slot-time">${si >= 0 ? TIME_SLOTS[si] : '–'}</span>
        </div>
        <div class="live-card-body">
          ${bodyHtml}
          ${nextSlots ? `<div class="live-next">
            <div class="live-next-title">Up next</div>
            ${nextSlots}
          </div>` : ''}
        </div>
      </div>`;
  });

  document.getElementById('live-board').innerHTML = cards.join('');
  renderTimeline();
  renderLiveAlerts();
  renderLiveVolunteers();
}

// ── Toggle Absent ─────────────────────────────────────────────
function toggleAbsent(iso, empId) {
  if (!state.absences) state.absences = {};
  if (!state.absences[iso]) state.absences[iso] = {};
  if (state.absences[iso][empId]) {
    delete state.absences[iso][empId];
    if (!Object.keys(state.absences[iso]).length) delete state.absences[iso];
  } else {
    state.absences[iso][empId] = true;
  }
  persistAll('absences');
  renderLiveBoard();
}

// ── Live Volunteers ───────────────────────────────────────────
function renderLiveVolunteers() {
  const iso = todayStr();
  const avail = state.volunteers.filter(v => state.volAvailability?.[v.id]?.[iso]);
  document.getElementById('live-volunteers').innerHTML = avail.length
    ? `<div class="live-next-title" style="padding:0 0 8px">Volunteers Available</div>` +
      avail.map(v => `<span class="hrs-chip hrs-ok" style="margin-right:6px">${escH(v.name)}</span>`).join('')
    : `<span style="font-size:12px;color:var(--muted)">No volunteers available today.</span>`;
}

// ── Live Alerts ───────────────────────────────────────────────
function renderLiveAlerts() {
  const el = document.getElementById('live-alert-area');
  if (!el) return;
  const alerts = buildAlerts();
  el.innerHTML = alerts.map(a =>
    `<div class="alert-chip alert-${a.type || 'info'}">${escH(a.msg)}</div>`
  ).join('');
}

// ── Timeline ──────────────────────────────────────────────────
function renderTimeline() {
  const iso = todayStr();
  const nm = nowMins();
  const totalMins = DAY_END - DAY_START;
  const nowPct = Math.min(100, Math.max(0, (nm - DAY_START) / totalMins * 100));
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const tl = document.getElementById('location-timeline');
  const labels = document.getElementById('tl-labels');
  if (!tl) return;

  const labelHrs = [6, 8, 10, 12, 14, 16, 18, 20];
  if (labels) labels.innerHTML = labelHrs.map(h => {
    const pct = (h * 60 - DAY_START) / totalMins * 100;
    return `<span class="timeline-time-label" style="left:${pct.toFixed(2)}%;position:absolute">${h}:00</span>`;
  }).join('');

  tl.innerHTML = ALL_LOCS.map(loc => {
    const color = LOC_COLOR[loc] || '#888';
    const segs = TIME_SLOTS.map((_, si) => {
      const empsHere = activeEmps.filter(e => getResolvedLoc(iso, si, e.id).loc === loc);
      const slotMins = SLOT_END[si] - SLOT_START[si];
      const w = (slotMins / totalMins * 100).toFixed(2);
      const label = empsHere.length > 1
        ? `${empsHere.length}`
        : empsHere[0]?.name.split(' ')[0] || '';
      const bg = empsHere.length ? color : 'transparent';
      return `<div class="timeline-seg" style="width:${w}%;background:${bg};${!empsHere.length ? 'opacity:.15' : ''}"
                title="${empsHere.map(e => e.name).join(', ') || 'Uncovered'}">${label}</div>`;
    }).join('');

    return `<div class="timeline-row">
      <div class="timeline-loc-label">${escH(LOC_LABEL[loc] || loc)}</div>
      <div class="timeline-bar">
        ${segs}
        <div class="timeline-now-line" style="left:${nowPct.toFixed(2)}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ── My Schedule ───────────────────────────────────────────────
function renderMySchedule() {
  const body = document.getElementById('my-sched-body');
  const pillsEl = document.getElementById('emp-selector');
  if (!body || !pillsEl) return;

  // Build employee pills
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  pillsEl.innerHTML = activeEmps.map(e =>
    `<button class="emp-pill ${e.id === selectedEmpId ? 'active' : ''}"
       onclick="selectEmp('${e.id}')">${escH(e.name)}</button>`
  ).join('');

  if (!selectedEmpId) {
    body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">Select your name above to see your schedule.</div>`;
    return;
  }

  const emp = state.employees.find(e => e.id === selectedEmpId);
  if (!emp) {
    body.innerHTML = `<div style="padding:20px;color:var(--muted)">Employee not found.</div>`;
    return;
  }

  const iso = todayStr();
  const nm = nowMins();
  const si = currentSlotIdx();
  const { loc: curLoc } = si >= 0 ? getResolvedLoc(iso, si, selectedEmpId) : { loc: 'off' };
  const cls = LOC_CLS[curLoc] || '';

  // Next change
  let nextChangeSlot = -1, nextChangeLoc = '';
  if (si >= 0) {
    for (let ni = si + 1; ni < TIME_SLOTS.length; ni++) {
      const nl = getResolvedLoc(iso, ni, selectedEmpId).loc;
      if (nl !== curLoc) { nextChangeSlot = ni; nextChangeLoc = nl; break; }
    }
  }

  // Personal timeline bar
  const totalMins = DAY_END - DAY_START;
  const segs = TIME_SLOTS.map((_, i) => {
    const { loc } = getResolvedLoc(iso, i, selectedEmpId);
    const color = LOC_COLOR[loc] || 'transparent';
    const w = ((SLOT_END[i] - SLOT_START[i]) / totalMins * 100).toFixed(2);
    return `<div class="my-tl-seg" style="width:${w}%;background:${color}"></div>`;
  }).join('');
  const nowPct = Math.min(100, Math.max(0, (nm - DAY_START) / totalMins * 100));

  // 7-day week columns
  const weekStart = new Date(state.currentWeekMon + 'T00:00:00');
  const todayIso = todayStr();
  const dayCols = Array.from({ length: 7 }, (_, di) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + di);
    const dIso = toDateStr(d);
    const isToday = dIso === todayIso;
    const slots = TIME_SLOTS.map((slot, si) => {
      const { loc } = getResolvedLoc(dIso, si, selectedEmpId);
      const color = LOC_COLOR[loc] || '';
      return `<div class="my-6day-slot">
        <span class="my-6day-time">${slot.split('–')[0].trim()}</span>
        <span style="font-size:10px;font-weight:700;color:${color || 'var(--muted)'}">${escH(LOC_LABEL[loc] || loc)}</span>
      </div>`;
    }).join('');
    return `<div class="my-6day-col">
      <div class="my-6day-hdr ${isToday ? 'today-col' : ''}">${DAYS_SHORT[di]}<br>${d.getDate()}</div>
      ${slots}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="my-today-header">
      <div class="my-today-name">${escH(emp.name)}</div>
      <div class="my-cur-loc ${cls}">${escH(LOC_LABEL[curLoc] || curLoc)}</div>
      ${nextChangeSlot >= 0
        ? `<div class="my-next-up">Next: <strong>${escH(LOC_LABEL[nextChangeLoc] || nextChangeLoc)}</strong> at ${TIME_SLOTS[nextChangeSlot].split('–')[0].trim()}</div>`
        : ''}
    </div>
    <div class="my-timeline">
      ${segs}
      <div class="my-tl-now" style="left:${nowPct.toFixed(2)}%"></div>
    </div>
    <div class="my-6day">${dayCols}</div>`;
}

function selectEmp(id) {
  selectedEmpId = id;
  sessionStorage.setItem('smPro_selectedEmp', id);
  renderMySchedule();
}

// ── History Today ─────────────────────────────────────────────
function renderHistoryToday() {
  const iso = todayStr();
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const el = document.getElementById('history-today-body');
  if (!el) return;

  el.innerHTML = TIME_SLOTS.map((slot, si) => {
    const locs = ALL_LOCS.map(loc => {
      const emp = activeEmps.find(e => getResolvedLoc(iso, si, e.id).loc === loc);
      if (!emp) return '';
      const color = LOC_COLOR[loc] || '#888';
      return `<span class="hrs-chip" style="background:${color}22;color:${color}">${escH(LOC_LABEL[loc]||loc)}: ${escH(emp.name.split(' ')[0])}</span>`;
    }).filter(Boolean).join('');
    return `<div class="hist-slot-row">
      <span class="hist-time">${slot}</span>
      <div class="hist-locs">${locs || '<span style="color:var(--subtle);font-size:11px">Uncovered</span>'}</div>
    </div>`;
  }).join('');
}

// ── Deep Lookup ───────────────────────────────────────────────
function renderDeepLookup() {
  const ctrl = document.getElementById('lookup-controls');
  const out = document.getElementById('lookup-output');
  if (!ctrl || !out) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  ctrl.innerHTML = `
    <select id="lookup-emp" onchange="runDeepLookup()" style="min-height:44px;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid var(--border)">
      <option value="">– Select Employee –</option>
      ${activeEmps.map(e => `<option value="${e.id}">${escH(e.name)}</option>`).join('')}
    </select>
    <input type="date" id="lookup-date" onchange="runDeepLookup()"
      value="${todayStr()}"
      style="min-height:44px;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid var(--border)">`;
}

function runDeepLookup() {
  const empId = document.getElementById('lookup-emp')?.value;
  const iso = document.getElementById('lookup-date')?.value;
  const out = document.getElementById('lookup-output');
  if (!out) return;
  if (!empId || !iso) { out.innerHTML = ''; return; }

  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  out.innerHTML = TIME_SLOTS.map((slot, si) => {
    const { loc, source } = getResolvedLoc(iso, si, empId);
    const color = LOC_COLOR[loc] || 'var(--muted)';
    return `<div class="lookup-slot-row">
      <span class="hist-time">${slot}</span>
      <span style="font-weight:700;color:${color}">${escH(LOC_LABEL[loc]||loc)}</span>
      <span style="font-size:11px;color:var(--subtle)">${source}</span>
    </div>`;
  }).join('');
}
