let liveView = 'locations';
let selectedEmpId = sessionStorage.getItem('smPro_selectedEmp') || null;

function setLiveView(v) {
  liveView = v;
  ['locations','my','history'].forEach(id => {
    document.getElementById(`view-${id}`).classList.toggle('hidden', id !== v);
    document.getElementById(`lvt-${id}`).classList.toggle('active', id === v);
  });
  if (v === 'locations') renderLiveBoard();
  if (v === 'my')        renderMySchedule();
  if (v === 'history')   { renderHistoryToday(); renderDeepLookup(); }
}

// ── Live Board ────────────────────────────────────────────────
function renderLiveBoard() {
  const iso     = todayStr();
  const nm      = nowMins();
  const si      = currentSlotIdx();
  const isAdmin = state.mode === 'admin';

  document.getElementById('live-date-label').textContent =
    new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const cards = ALL_LOCS.map(loc => {
    const locLabel = LOC_LABEL[loc] || loc;
    const color    = LOC_COLOR[loc] || '#888';

    const assignedEmp = si >= 0
      ? activeEmps.find(e => getResolvedLoc(iso, si, e.id).loc === loc)
      : null;

    const nextSi   = si + 1;
    const nextEmp  = (nextSi < TIME_SLOTS.length && assignedEmp)
      ? activeEmps.find(e => getResolvedLoc(iso, nextSi, e.id).loc === loc)
      : null;

    const minsLeft    = si >= 0 ? (SLOT_END[si] - nm / 60) * 60 : 999;
    const handoverSoon = minsLeft <= HANDOVER_WARN && minsLeft > 0;

    const nextSlots = si >= 0
      ? TIME_SLOTS.slice(si + 1, si + 4).map((slot, offset) => {
          const nsi  = si + 1 + offset;
          const nemp = activeEmps.find(e => getResolvedLoc(iso, nsi, e.id).loc === loc);
          return nemp
            ? `<div class="live-next-slot">
                <span class="live-next-time">${slot}</span>
                <span>${escH(nemp.name.split(' ')[0])}</span>
               </div>`
            : '';
        }).filter(Boolean).join('')
      : '';

    const bodyHtml = assignedEmp ? `
      <div class="live-emp-name">${escH(assignedEmp.name)}</div>
      <div class="live-sub">
        <span>${assignedEmp.status === 'Active' ? '' : assignedEmp.status}</span>
        ${handoverSoon ? `<span class="handover-badge">${Math.round(minsLeft)}m left</span>` : ''}
        ${isAdmin ? `<button class="present-toggle ${state.absences[iso]?.[assignedEmp.id] ? 'absent' : 'present'}"
          onclick="toggleAbsent('${assignedEmp.id}','${iso}',this)">
          ${state.absences[iso]?.[assignedEmp.id] ? '✖ Absent' : '✔ Present'}
        </button>` : ''}
      </div>
      ${handoverSoon && nextEmp  ? `<div style="font-size:9px;color:var(--orange);margin-top:4px">Next: ${escH(nextEmp.name)}</div>` : ''}
      ${handoverSoon && !nextEmp ? `<div style="font-size:9px;color:var(--red);margin-top:4px">No one assigned next</div>` : ''}
      ${nextSlots ? `<div class="live-next"><div class="live-next-title">Up next</div>${nextSlots}</div>` : ''}
    ` : `
      <div class="live-uncovered">— Uncovered —</div>
      <div class="live-sub">No one assigned to ${locLabel}</div>
    `;

    return `<div class="live-card">
      <div class="live-card-hdr">
        <div class="live-loc-name">
          <span class="live-loc-dot" style="background:${color}"></span>
          ${locLabel}
        </div>
        <span class="live-slot-time">${si >= 0 ? TIME_SLOTS[si] : 'Before hours'}</span>
      </div>
      <div class="live-card-body">${bodyHtml}</div>
    </div>`;
  }).join('');

  document.getElementById('live-board').innerHTML = cards ||
    `<p style="color:var(--muted);font-size:11px">No schedule data for today.</p>`;

  renderTimeline();
  renderLiveAlerts();
  renderLiveVolunteers();
}

// ── Live Volunteers ───────────────────────────────────────────
function renderLiveVolunteers() {
  const iso  = todayStr();
  const avail = state.volunteers.filter(v => state.volAvailability?.[v.id]?.[iso]);
  document.getElementById('live-volunteers').innerHTML = avail.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:5px">${avail.map(v =>
        `<span class="vol-chip">${escH(v.name)}</span>`).join('')}</div>`
    : `<p style="color:var(--muted);font-size:11px">No volunteers available today.</p>`;
}

// ── Live Alerts ───────────────────────────────────────────────
function renderLiveAlerts() {
  const el = document.getElementById('live-alert-area');
  if (!el) return;
  const alerts = buildAlerts();
  el.innerHTML = alerts.map(a => `
    <div class="alert-banner ${a.type}">
      <span>${a.msg}</span>
      ${a.jumpDate && state.mode === 'admin'
        ? `<button class="fix-btn" onclick="jumpToDate('${a.jumpDate}')">Fix</button>`
        : ''}
    </div>`).join('');
}

// ── Timeline ──────────────────────────────────────────────────
function renderTimeline() {
  const iso        = todayStr();
  const nm         = nowMins();
  const totalMins  = DAY_END - DAY_START;
  const nowPct     = Math.min(100, Math.max(0, (nm - DAY_START) / totalMins * 100));
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const tl     = document.getElementById('location-timeline');
  const labels = document.getElementById('tl-labels');
  if (!tl) return;

  const labelHrs = [6, 8, 10, 12, 14, 16, 18, 20];
  if (labels) labels.innerHTML = labelHrs.map(h => {
    const pct = (h * 60 - DAY_START) / totalMins * 100;
    return `<span class="timeline-time-label" style="margin-left:${pct.toFixed(1)}%">${h}:00</span>`;
  }).join('');

  tl.innerHTML = ALL_LOCS.map(loc => {
    const color = LOC_COLOR[loc] || '#888';
    const segs  = TIME_SLOTS.map((_, si) => {
      const empsHere = activeEmps.filter(e => getResolvedLoc(iso, si, e.id).loc === loc);
      const slotMins = SLOT_END[si] - SLOT_START[si];
      const w        = (slotMins / totalMins * 100).toFixed(2);
      const label    = empsHere.length > 1 ? `${empsHere.length}` : empsHere[0]?.name.split(' ')[0] || '';
      const bg       = empsHere.length ? color : 'transparent';
      return `<div class="timeline-seg" style="width:${w}%;background:${bg};color:#fff"
        title="${LOC_LABEL[loc]}: ${empsHere.map(e=>e.name).join(', ')||'empty'}">${label}</div>`;
    }).join('');

    return `<div class="timeline-row">
      <span class="timeline-loc-label">${LOC_LABEL[loc] || loc}</span>
      <div class="timeline-bar">
        ${segs}
        <div class="timeline-now-line" style="left:${nowPct.toFixed(1)}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ── My Schedule ───────────────────────────────────────────────
function renderMySchedule() {
  const selector = document.getElementById('emp-selector');
  const body     = document.getElementById('my-sched-body');
  if (!selector) return;

  selector.innerHTML = state.employees
    .filter(e => e.status === 'Active')
    .map(e => `<button class="emp-pill ${e.id === selectedEmpId ? 'active' : ''}"
      onclick="selectEmp('${e.id}')">${escH(e.name)}</button>`).join('');

  if (!selectedEmpId) {
    body.innerHTML = `<p style="color:var(--muted);font-size:11px">Select your name above to see your schedule.</p>`;
    return;
  }

  const emp = state.employees.find(e => e.id === selectedEmpId);
  if (!emp) { body.innerHTML = `<p style="color:var(--muted);font-size:11px">Employee not found.</p>`; return; }

  const iso = todayStr();
  const nm  = nowMins();
  const si  = currentSlotIdx();
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
    const color   = LOC_COLOR[loc] || 'transparent';
    const w       = ((SLOT_END[i] - SLOT_START[i]) / totalMins * 100).toFixed(2);
    return `<div class="my-tl-seg" style="width:${w}%;background:${color}" title="${TIME_SLOTS[i]}: ${LOC_LABEL[loc]||loc}"></div>`;
  }).join('');
  const nowPct = Math.min(100, Math.max(0, (nm - DAY_START) / totalMins * 100));

  // 7-day week columns
  const weekStart  = new Date(state.currentWeekMon + 'T00:00:00');
  const todayStr_  = todayStr();
  const dayCols = Array.from({length: 7}, (_, di) => {
    const d   = new Date(weekStart); d.setDate(d.getDate() + di);
    const dIso = toDateStr(d);
    const isToday = dIso === todayStr_;
    const slots = TIME_SLOTS.map((slot, si) => {
      const { loc } = getResolvedLoc(dIso, si, selectedEmpId);
      const color   = LOC_COLOR[loc] || '';
      return `<div class="my-6day-slot">
        <span class="my-6day-time">${SLOT_START[si] >= 720 ? (SLOT_START[si]/60-12||12)+'p' : SLOT_START[si]/60+'a'}</span>
        <span style="color:${color};font-size:8px">${LOC_LABEL[loc]||loc}</span>
      </div>`;
    }).join('');
    return `<div class="my-6day-col">
      <div class="my-6day-hdr ${isToday?'today-col':''}">${DAYS_SHORT[di]}<br>${d.getDate()}</div>
      ${slots}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="my-today-header">
      <div class="my-today-name">${escH(emp.name)}</div>
      <span class="my-cur-loc ${cls}">${LOC_LABEL[curLoc] || curLoc}</span>
      ${nextChangeSlot >= 0
        ? `<span class="my-next-up">→ ${LOC_LABEL[nextChangeLoc]||nextChangeLoc} at ${TIME_SLOTS[nextChangeSlot]}</span>`
        : ''}
    </div>
    <div class="my-timeline">
      ${segs}
      <div class="my-tl-now" style="left:${nowPct.toFixed(1)}%"></div>
    </div>
    <div class="my-6day">${dayCols}</div>
  `;
}

function selectEmp(empId) {
  selectedEmpId = empId;
  sessionStorage.setItem('smPro_selectedEmp', empId);
  renderMySchedule();
}

// ── History / Deep Lookup ─────────────────────────────────────
function renderHistoryToday() {
  const iso = todayStr();
  const nm  = nowMins();
  const el  = document.getElementById('history-today');
  if (!el) return;

  const past = TIME_SLOTS.filter((_, i) => SLOT_END[i] <= nm);
  if (!past.length) { el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:11px">No completed slots yet today.</div>`; return; }

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  el.innerHTML = past.map((slot, i) => {
    const locs = ALL_LOCS.map(loc => {
      const empsHere = activeEmps.filter(e => getResolvedLoc(iso, i, e.id).loc === loc);
      return empsHere.length
        ? `<span class="badge ${LOC_CLS[loc]||''}">${LOC_LABEL[loc]}: ${empsHere.map(e=>e.name.split(' ')[0]).join(', ')}</span>`
        : '';
    }).filter(Boolean).join('');
    return `<div class="hist-slot-row">
      <span class="hist-time">${slot}</span>
      <div class="hist-locs">${locs || '<span style="color:var(--muted)">—</span>'}</div>
    </div>`;
  }).join('');
}

function renderDeepLookup() {
  const iso    = document.getElementById('lookup-date')?.value || todayStr();
  const filter = document.getElementById('lookup-loc')?.value || '';
  const el     = document.getElementById('deep-lookup-result');
  if (!el) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  el.innerHTML = TIME_SLOTS.map((slot, si) => {
    const locs = ALL_LOCS
      .filter(loc => !filter || LOC_LABEL[loc] === filter)
      .map(loc => {
        const empsHere = activeEmps.filter(e => getResolvedLoc(iso, si, e.id).loc === loc);
        return empsHere.length
          ? `<span class="badge ${LOC_CLS[loc]||''}">${LOC_LABEL[loc]}: ${empsHere.map(e=>escH(e.name.split(' ')[0])).join(', ')}</span>`
          : '';
      }).filter(Boolean).join('');
    return locs ? `<div class="lookup-slot-row">
      <span style="font-family:DM Mono,monospace;color:var(--muted);min-width:140px">${slot}</span>
      <div style="display:flex;gap:5px;flex-wrap:wrap">${locs}</div>
    </div>` : '';
  }).filter(Boolean).join('') || `<p style="color:var(--muted);font-size:11px">No data for this date/filter.</p>`;
}
