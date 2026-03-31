// ── pages/rota-page.js ────────────────────────────────────────

let _rotaMode      = 'week';
let _blockStart    = null;
let _rotaReadOnly  = false;

// ── Entry point ───────────────────────────────────────────────

function renderRota() {
  _rotaReadOnly = state.mode !== 'admin';
  renderOverrideSummary();
  renderEarlyGateStrip();
  renderGantt();
  renderRotaAlerts();
}

function setRotaMode(mode) {
  _rotaMode = mode;
  document.getElementById('rota-mode-week')?.classList.toggle('active', mode === 'week');
  document.getElementById('rota-mode-base')?.classList.toggle('active', mode === 'base');
  renderRota();
}

// ── Override summary strip ────────────────────────────────────

function renderOverrideSummary() {
  const el = document.getElementById('rota-override-summary');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const weekMon = state.currentWeekMon;
  const mon     = new Date(weekMon + 'T00:00:00');
  const changes = [];

  for (let di = 0; di < 7; di++) {
    const d       = new Date(mon); d.setDate(d.getDate() + di);
    const dayIso  = toDateStr(d);
    const shifts  = state.shifts?.[dayIso];
    if (shifts?.length) {
      const empNames = [...new Set(shifts.map(s => {
        const e = state.employees.find(x => x.id === s.empId);
        return e ? e.name.split(' ')[0] : '?';
      }))].join(', ');
      changes.push(`${DAYSSHORT[di]}: ${empNames}`);
    }
  }

  const leaveNames = (state.leaveRequests || [])
    .filter(l => l.status === 'active')
    .filter(l => {
      const end = new Date(mon); end.setDate(end.getDate() + 6);
      return l.from <= toDateStr(end) && l.to >= weekMon;
    })
    .map(l => {
      const e = state.employees.find(x => x.id === l.empId);
      return e ? `${e.name.split(' ')[0]} (${l.type})` : null;
    })
    .filter(Boolean);

  const parts = [];
  if (changes.length)    parts.push(`${changes.length} override day${changes.length > 1 ? 's' : ''}: ${changes.join(' · ')}`);
  if (leaveNames.length) parts.push(`Leave: ${leaveNames.join(', ')}`);

  el.innerHTML = parts.length
    ? `<div class="override-summary">${parts.join(' &nbsp;|&nbsp; ')}</div>`
    : '';
}

// ── Early gate strip ──────────────────────────────────────────

function renderEarlyGateStrip() {
  const el = document.getElementById('early-gate-strip');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const iso        = state.currentDateISO;
  const earlyEmpId = state.earlyGate?.[iso];
  const earlyEmp   = earlyEmpId
    ? state.employees.find(e => e.id === earlyEmpId)
    : null;

  const activeEmps = state.employees
    .filter(e => e.status === 'Active' && !isEmpDayOff(e.id, iso) && !isOnLeave(e.id, iso));

  el.innerHTML = `
    <div class="early-gate-strip">
      <span class="early-gate-label">⭐ Early Gate 06:00–09:00</span>
      ${_rotaReadOnly
        ? `<span class="early-gate-name">${earlyEmp ? escH(earlyEmp.name) : '— not assigned'}</span>`
        : `<select class="early-gate-select"
              onchange="setEarlyGate('${iso}', this.value || null); renderRota()">
            <option value="">— not needed today</option>
            ${activeEmps.map(e =>
              `<option value="${e.id}" ${earlyEmpId === e.id ? 'selected' : ''}>
                ${escH(e.name)}</option>`
            ).join('')}
          </select>`}
    </div>`;
}

// ── Gantt renderer ────────────────────────────────────────────

function renderGantt() {
  const container = document.getElementById('gantt-container');
  if (!container) return;

  const iso        = _rotaMode === 'week' ? state.currentDateISO : null;
  const dow        = _rotaMode === 'base' ? state.currentDow     : null;
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const totalMins  = DISPLAY_END_MINS - DISPLAY_START_MINS;

  const timeLabels = [];
  for (let m = DISPLAY_START_MINS; m <= DISPLAY_END_MINS; m += 60) {
    const pct = ((m - DISPLAY_START_MINS) / totalMins) * 100;
    timeLabels.push({ pct, label: minsToHHMM(m) });
  }

  const nowPct = (() => {
    const m = nowMins();
    if (_rotaMode === 'base' || iso !== todayStr()) return -1;
    if (m < DISPLAY_START_MINS || m >= DISPLAY_END_MINS) return -1;
    return ((m - DISPLAY_START_MINS) / totalMins) * 100;
  })();

  const rows = activeEmps.map(e => {
    let bars = [];

    if (_rotaMode === 'week') {
      if (isOnLeave(e.id, iso)) {
        bars = [{ loc: 'vac', start: DISPLAY_START_MINS, end: DISPLAY_END_MINS,
                  id: null, isLeave: true }];
      } else if (isEmpDayOff(e.id, iso)) {
        bars = [];
      } else {
        bars = getResolvedShifts(iso)
          .filter(s => s.empId === e.id)
          .map(s => ({ ...s }));
      }
    } else {
      bars = (state.defaultSchedule?.[dow]?.[e.id] || [])
        .map(b => ({ ...b, id: `base-${e.id}-${b.start}` }));
    }

    return { emp: e, bars };
  });

  container.innerHTML = `
    <div class="gantt-wrap">
      <div class="gantt-axis-row">
        <div class="gantt-name-col"></div>
        <div class="gantt-bars-col" style="position:relative;height:24px">
          ${timeLabels.map(tl =>
            `<span class="gantt-time-label"
               style="left:${tl.pct}%">${tl.label}</span>`
          ).join('')}
        </div>
      </div>

      ${renderLocWindows(totalMins)}

      ${rows.map(({ emp, bars }) => {
        const isDayOff = _rotaMode === 'week' && isEmpDayOff(emp.id, iso);
        const onLeave  = _rotaMode === 'week' && isOnLeave(emp.id, iso);
        const hrs      = _rotaMode === 'week'
          ? calcEmpHrsDay(iso, emp.id).toFixed(1)
          : calcBaseHrsDay(dow, emp.id).toFixed(1);

        return `
          <div class="gantt-row ${isDayOff ? 'gantt-row-dayoff' : ''}
                                ${onLeave  ? 'gantt-row-leave'  : ''}"
               data-empid="${emp.id}">
            <div class="gantt-name-col">
              <span class="gantt-emp-name">${escH(emp.name.split(' ')[0])}</span>
              <span class="gantt-emp-hrs">${hrs}h</span>
            </div>
            <div class="gantt-bars-col"
                 ${!_rotaReadOnly && !isDayOff && !onLeave
                   ? `onclick="ganttColClick(event, '${emp.id}')"`
                   : ''}>

              ${isDayOff ? '<span class="gantt-dayoff-label">Day Off</span>' : ''}
              ${onLeave  ? '<span class="gantt-leave-label">On Leave</span>'  : ''}

              ${bars.map(bar => {
                const left  = ((bar.start - DISPLAY_START_MINS) / totalMins) * 100;
                const width = ((bar.end   - bar.start)          / totalMins) * 100;
                const color = LOCCOLOR[bar.loc] || '#ccc';
                const label = LOCLABEL[bar.loc] || bar.loc;
                return `
                  <div class="gantt-bar ${bar.isEarlyGate ? 'gantt-bar-early' : ''}"
                       style="left:${left}%;width:${width}%;background:${color}"
                       title="${label} ${minsToHHMM(bar.start)}–${minsToHHMM(bar.end)}"
                       ${!_rotaReadOnly && bar.id && !bar.isLeave
                         ? `onclick="event.stopPropagation();openShiftEditor('${iso || dow}','${emp.id}','${bar.id}','${_rotaMode}')"`
                         : ''}>
                    <span class="gantt-bar-label">${label}</span>
                    ${!_rotaReadOnly && bar.id && !bar.isLeave
                      ? `<button class="gantt-bar-del"
                           onclick="event.stopPropagation();deleteBarClick('${iso || dow}','${bar.id}','${_rotaMode}')">✕</button>`
                      : ''}
                  </div>`;
              }).join('')}

              ${nowPct >= 0
                ? `<div class="gantt-now-line" style="left:${nowPct}%"></div>`
                : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  renderCoverageBand(totalMins, iso, dow);
}

function renderLocWindows(totalMins) {
  const windows = Object.entries(LOC_HOURS)
    .filter(([, h]) => h)
    .map(([loc, h]) => {
      const left  = ((h.open  - DISPLAY_START_MINS) / totalMins) * 100;
      const width = ((h.close - h.open)              / totalMins) * 100;
      return `<div class="gantt-loc-window"
                   style="left:${left}%;width:${width}%;background:${LOCCOLOR[loc]}14"
                   title="${LOCLABEL[loc]} ${minsToHHMM(h.open)}–${minsToHHMM(h.close)}">
              </div>`;
    }).join('');

  return `<div class="gantt-window-row">
    <div class="gantt-name-col"></div>
    <div class="gantt-bars-col" style="position:relative;height:12px">${windows}</div>
  </div>`;
}

function renderCoverageBand(totalMins, iso, dow) {
  const el = document.getElementById('gantt-coverage-band');
  if (!el) return;

  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const gaps = getCoverageGaps(iso);

  el.innerHTML = `
    <div class="gantt-coverage-wrap">
      <div class="gantt-name-col">
        <span style="font-size:10px;font-weight:700;color:var(--muted)">Coverage</span>
      </div>
      <div class="gantt-bars-col" style="position:relative;height:20px">
        ${REQUIREDLOCS.map(loc => {
          const color = LOCCOLOR[loc];
          const locH  = LOC_HOURS[loc];
          if (!locH) return '';
          const locGaps = gaps.filter(g => g.loc === loc);
          const left  = ((locH.open  - DISPLAY_START_MINS) / totalMins) * 100;
          const width = ((locH.close - locH.open)           / totalMins) * 100;
          const gapMarks = locGaps.map(g => {
            const gl = ((g.gapStart - DISPLAY_START_MINS) / totalMins) * 100;
            const gw = ((g.gapEnd   - g.gapStart)         / totalMins) * 100;
            return `<div class="gantt-gap-mark" style="left:${gl}%;width:${gw}%"
                         title="${LOCLABEL[loc]} gap ${minsToHHMM(g.gapStart)}–${minsToHHMM(g.gapEnd)}"></div>`;
          }).join('');
          return `<div class="gantt-cov-loc" style="left:${left}%;width:${width}%;background:${color}33">
            ${gapMarks}
            <span class="gantt-cov-label" style="color:${color}">${LOCLABEL[loc]}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Block-assign interaction ──────────────────────────────────

function ganttColClick(event, empId) {
  if (_rotaReadOnly) return;
  const col       = event.currentTarget;
  const rect      = col.getBoundingClientRect();
  const pct       = (event.clientX - rect.left) / rect.width;
  const totalMins = DISPLAY_END_MINS - DISPLAY_START_MINS;
  const clickMins = DISPLAY_START_MINS + Math.round((pct * totalMins) / 30) * 30;

  if (!_blockStart || _blockStart.empId !== empId) {
    _blockStart = { empId, startMins: clickMins };
    showToast(`Start: ${minsToHHMM(clickMins)} — click end time`);
    col.classList.add('gantt-selecting');
    return;
  }

  const startMins = Math.min(_blockStart.startMins, clickMins);
  const endMins   = Math.max(_blockStart.startMins, clickMins);
  _blockStart     = null;
  document.querySelectorAll('.gantt-selecting').forEach(c => c.classList.remove('gantt-selecting'));

  if (endMins <= startMins) { showToast('Select a valid time range'); return; }
  openLocPickerModal(empId, startMins, endMins);
}

function openLocPickerModal(empId, startMins, endMins) {
  const emp    = state.employees.find(e => e.id === empId);
  const iso    = _rotaMode === 'week' ? state.currentDateISO : null;
  const dow    = _rotaMode === 'base' ? state.currentDow     : null;
  const inner  = document.getElementById('loc-picker-inner');
  if (!inner) return;

  inner.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">
      ${escH(emp?.name || empId)}
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px">
      ${minsToHHMM(startMins)} – ${minsToHHMM(endMins)}
      &nbsp;(${((endMins - startMins) / 60).toFixed(1)}h)
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${LOC_CYCLE.filter(l => l !== 'off').map(loc => {
        const locH  = LOC_HOURS[loc];
        const valid = !locH || (startMins >= locH.open && endMins <= locH.close);
        return `<button class="btn btn-ghost"
          style="border-color:${LOCCOLOR[loc]};color:${LOCCOLOR[loc]};
                 ${!valid ? 'opacity:.4;cursor:not-allowed' : ''}"
          ${valid
            ? `onclick="confirmLocPick('${iso || dow}','${empId}',${startMins},${endMins},'${loc}','${_rotaMode}')"`
            : 'disabled'}
          title="${valid ? '' : `Outside ${LOCLABEL[loc]} operating hours`}">
          ${LOCLABEL[loc]}
        </button>`;
      }).join('')}
    </div>`;

  openModal('loc-picker-modal');
}

function confirmLocPick(isoOrDow, empId, startMins, endMins, loc, mode) {
  closeModal('loc-picker-modal');
  if (mode === 'base') {
    setBaseShift(isoOrDow, empId, loc, startMins, endMins);
  } else {
    addShift(isoOrDow, empId, loc, startMins, endMins);
  }
  renderRota();
  showToast(`${LOCLABEL[loc]} ${minsToHHMM(startMins)}–${minsToHHMM(endMins)}`);
}

// ✅ FIXED — correct empId and start parsing for base shiftIds like "base-emp-1234567890-540"
function deleteBarClick(isoOrDow, shiftId, mode) {
  if (mode === 'base') {
    const parts = shiftId.replace('base-', '').split('-');
    const start = parseInt(parts[parts.length - 1]);       // ✅ last segment = start mins
    const empId = parts.slice(0, -1).join('-');            // ✅ everything before = empId
    removeBaseShift(isoOrDow, empId, start);
  } else {
    removeShift(isoOrDow, shiftId);
  }
  renderRota();
}

// ✅ FIXED — correct start parsing; empId already passed as parameter
function openShiftEditor(isoOrDow, empId, shiftId, mode) {
  let shift;
  if (mode === 'base') {
    const parts = shiftId.replace('base-', '').split('-');
    const start = parseInt(parts[parts.length - 1]);       // ✅ last segment = start mins
    const dow   = isoOrDow;
    shift = (state.defaultSchedule?.[dow]?.[empId] || [])
      .find(b => b.start === start);
    if (!shift) return;
    openLocPickerModal(empId, shift.start, shift.end);
  } else {
    shift = (state.shifts?.[isoOrDow] || []).find(s => s.id === shiftId);
    if (!shift) return;
    openLocPickerModal(empId, shift.start, shift.end);
  }
}

// ── Base rota hours helper ────────────────────────────────────

function calcBaseHrsDay(dow, empId) {
  return (state.defaultSchedule?.[dow]?.[empId] || [])
    .filter(b => b.loc !== 'off' && b.loc !== 'vac' && b.loc !== 'lunch')
    .reduce((acc, b) => acc + (b.end - b.start) / 60, 0);
}

// ── Alerts strip ──────────────────────────────────────────────

function renderRotaAlerts() {
  const el = document.getElementById('rota-alerts-bar');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }
  renderAlertsBar('rota-alerts-bar', state.currentDateISO);
}

function renderRotaWeekNav() {
  renderWeekNav();
}

function onRotaPageShow() {
  _blockStart = null;
  renderRota();
  renderRotaWeekNav();
}
