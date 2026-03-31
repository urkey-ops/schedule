// ── pages/rota-page.js ────────────────────────────────────────

let _rotaMode     = 'week';
let _blockStart   = null;
let _rotaReadOnly = false;

function renderRota() {
  _rotaReadOnly = state.mode !== 'admin';
  renderRotaHeaderExtras();
  renderOverrideSummary();
  renderEarlyGateStrip();
  renderRotaAlerts();
  renderGantt();
}

function renderRotaHeaderExtras() {
  const weekLabel = document.getElementById('week-label');
  if (!weekLabel) return;

  const status = getPublishStatus(state.currentWeekMon);
  const badge  = status === WEEK_STATUS.PUBLISHED
    ? `<span class="status-chip chip-active" style="margin-left:8px">PUBLISHED</span>`
    : `<span class="status-chip" style="margin-left:8px;background:#fff7ed;color:#b45309;border:1px solid #fdba74">DRAFT</span>`;

  const nextMon = getNextWeekMon();
  const extraId = 'rota-header-extra-actions';
  let extra = document.getElementById(extraId);
  if (!extra) {
    extra = document.createElement('div');
    extra.id = extraId;
    extra.style.margin = '8px 0 10px';
    const mount = document.getElementById('rota-alerts-bar');
    mount?.parentNode?.insertBefore(extra, mount);
  }

  weekLabel.innerHTML = `${fmtDate(state.currentWeekMon)}${badge}`;

  extra.innerHTML = state.mode === 'admin' ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-sm btn-success" onclick="togglePublishWeek(state.currentWeekMon)">
        ${isWeekPublished(state.currentWeekMon) ? 'Unpublish Week' : 'Publish Week'}
      </button>
      <button class="btn btn-sm btn-ghost" onclick="copyWeekForward(state.currentWeekMon, getNextWeekMon())">
        Copy to Next Week
      </button>
      <button class="btn btn-sm btn-ghost" onclick="goToNextWeekDraft()">
        Next Week Draft
      </button>
      <button class="btn btn-sm btn-warn" onclick="applyDefaultToNextWeek()">
        Apply Base to Next Week
      </button>
      <span style="font-size:12px;color:var(--muted)">Next week starts ${fmtDate(nextMon)}</span>
    </div>
  ` : '';
}

function goToNextWeekDraft() {
  const nextMon = getNextWeekMon();
  state.currentWeekMon = nextMon;
  state.currentDateISO = nextMon;
  state.currentDow     = 'MON';
  renderWeekNav();
  renderRota();
}

function setRotaMode(mode) {
  _rotaMode = mode;
  document.getElementById('rota-mode-week')?.classList.toggle('active', mode === 'week');
  document.getElementById('rota-mode-base')?.classList.toggle('active', mode === 'base');
  renderRota();
}

function renderOverrideSummary() {
  const el = document.getElementById('rota-override-summary');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const weekMon = state.currentWeekMon;
  const mon = new Date(weekMon + 'T00:00:00');
  const changes = [];
  const unscheduled = getUnscheduledEmployees(weekMon);

  for (let di = 0; di < 7; di++) {
    const d      = new Date(mon); d.setDate(d.getDate() + di);
    const dayIso = toDateStr(d);
    const shifts = state.shifts?.[dayIso] || [];
    if (shifts.length) {
      const names = [...new Set(shifts.map(s => {
        const e = state.employees.find(x => x.id === s.empId);
        return e ? e.name.split(' ')[0] : '?';
      }))];
      changes.push(`${DAYSSHORT[di]}: ${names.join(', ')}`);
    }
  }

  const leaveNames = (state.leaveRequests || [])
    .filter(l => l.status === 'active')
    .filter(l => {
      const end = new Date(weekMon + 'T00:00:00');
      end.setDate(end.getDate() + 6);
      return l.from <= toDateStr(end) && l.to >= weekMon;
    })
    .map(l => {
      const e = state.employees.find(x => x.id === l.empId);
      return e ? `${e.name.split(' ')[0]} (${l.type})` : null;
    })
    .filter(Boolean);

  const parts = [];
  if (changes.length) parts.push(`${changes.length} override day${changes.length > 1 ? 's' : ''}: ${changes.join(' · ')}`);
  if (leaveNames.length) parts.push(`Leave: ${leaveNames.join(', ')}`);
  if (unscheduled.length) parts.push(`Unscheduled this week: ${unscheduled.map(e => e.name.split(' ')[0]).join(', ')}`);

  el.innerHTML = parts.length
    ? `<div class="override-summary">${parts.join(' &nbsp;|&nbsp; ')}</div>`
    : '';
}

function renderEarlyGateStrip() {
  const el = document.getElementById('early-gate-strip');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const iso        = state.currentDateISO;
  const earlyEmpId = state.earlyGate?.[iso];
  const earlyEmp   = earlyEmpId ? state.employees.find(e => e.id === earlyEmpId) : null;

  const activeEmps = state.employees
    .filter(e => e.status === 'Active')
    .filter(e => !isEmpDayOff(e.id, iso))
    .filter(e => !isOnLeave(e.id, iso));

  el.innerHTML = `
    <div class="early-gate-strip">
      <span class="early-gate-label">⭐ Early Gate 06:00–09:00</span>
      ${_rotaReadOnly
        ? `<span class="early-gate-name">${earlyEmp ? escH(earlyEmp.name) : '— not assigned'}</span>`
        : `<select class="early-gate-select"
            onchange="setEarlyGate('${iso}', this.value || null); renderRota()">
            <option value="">— not needed today</option>
            ${activeEmps.map(e => `
              <option value="${e.id}" ${earlyEmpId === e.id ? 'selected' : ''}>${escH(e.name)}</option>
            `).join('')}
          </select>`}
    </div>`;
}

function renderGantt() {
  const container = document.getElementById('gantt-container');
  if (!container) return;

  const iso        = _rotaMode === 'week' ? state.currentDateISO : null;
  const dow        = _rotaMode === 'base' ? state.currentDow     : null;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const totalMins  = DISPLAY_END_MINS - DISPLAY_START_MINS;

  const timeLabels = [];
  for (let m = DISPLAY_START_MINS; m <= DISPLAY_END_MINS; m += 60) {
    timeLabels.push({
      pct  : ((m - DISPLAY_START_MINS) / totalMins) * 100,
      label: minsToHHMM(m),
    });
  }

  const nowPct = (() => {
    const m = nowMins();
    if (_rotaMode === 'base' || iso !== todayStr()) return -1;
    if (m < DISPLAY_START_MINS || m >= DISPLAY_END_MINS) return -1;
    return ((m - DISPLAY_START_MINS) / totalMins) * 100;
  })();

  const rows = activeEmps.map(emp => {
    let bars = [];
    if (_rotaMode === 'week') {
      if (isOnLeave(emp.id, iso)) {
        bars = [{ loc: 'vac', start: DISPLAY_START_MINS, end: DISPLAY_END_MINS, id: null, isLeave: true }];
      } else if (isEmpDayOff(emp.id, iso)) {
        bars = [];
      } else {
        const overrides = state.shifts?.[iso]?.filter(s => s.empId === emp.id) || [];
        const hasOverride = overrides.length > 0;
        bars = hasOverride
          ? overrides.map(s => ({ ...s, source: 'override' }))
          : (state.defaultSchedule?.[DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7]]?.[emp.id] || [])
              .map(b => ({ ...b, id: `base-${emp.id}-${b.start}`, source: 'base' }));

        if (state.earlyGate?.[iso] === emp.id) {
          bars.unshift({
            id: `early-${iso}`,
            empId: emp.id,
            loc: 'gate',
            start: EARLY_GATE_START,
            end: EARLY_GATE_END,
            isEarlyGate: true,
            source: 'early',
          });
        }
      }
    } else {
      bars = (state.defaultSchedule?.[dow]?.[emp.id] || [])
        .map(b => ({ ...b, id: `base-${emp.id}-${b.start}`, source: 'base' }));
    }
    return { emp, bars };
  });

  container.innerHTML = `
    <div class="gantt-wrap">
      <div class="gantt-axis-row">
        <div class="gantt-name-col"></div>
        <div class="gantt-bars-col" style="position:relative;height:24px">
          ${timeLabels.map(t => `<span class="gantt-time-label" style="left:${t.pct}%">${t.label}</span>`).join('')}
        </div>
      </div>

      ${renderLocWindows(totalMins)}

      ${rows.map(({ emp, bars }) => {
        const dayOff = _rotaMode === 'week' && isEmpDayOff(emp.id, iso);
        const leave  = _rotaMode === 'week' && isOnLeave(emp.id, iso);
        const hrs    = _rotaMode === 'week'
          ? calcEmpHrsDay(iso, emp.id).toFixed(1)
          : calcBaseHrsDay(dow, emp.id).toFixed(1);

        const note = getEmpNote(emp.id);
        const noteBadge = note ? `<span title="${escH(note)}" style="margin-left:6px;color:#7c3aed">📝</span>` : '';
        const training = emp.inTraining ? `<span class="status-chip" style="margin-left:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">Training</span>` : '';

        return `
          <div class="gantt-row ${dayOff ? 'gantt-row-dayoff' : ''} ${leave ? 'gantt-row-leave' : ''}" data-empid="${emp.id}">
            <div class="gantt-name-col">
              <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                <span class="gantt-emp-name">${escH(emp.name.split(' ')[0])}</span>
                ${noteBadge}
                ${training}
              </div>
              <span class="gantt-emp-hrs">${hrs}h / cap ${getEmpHourCap(emp.id)}h</span>
              ${_rotaMode === 'week' && state.mode === 'admin'
                ? `<button class="btn btn-sm btn-ghost" style="margin-top:4px;padding:3px 6px;font-size:10px"
                    onclick="revertEmpToBase('${iso}','${emp.id}')">Revert to Base</button>`
                : ''}
            </div>

            <div class="gantt-bars-col"
              ${!_rotaReadOnly && !dayOff && !leave ? `onclick="ganttColClick(event, '${emp.id}')"` : ''}>

              ${dayOff ? '<span class="gantt-dayoff-label">Day Off</span>' : ''}
              ${leave  ? '<span class="gantt-leave-label">On Leave</span>' : ''}

              ${bars.map(bar => {
                const left  = ((bar.start - DISPLAY_START_MINS) / totalMins) * 100;
                const width = ((bar.end - bar.start) / totalMins) * 100;
                const color = LOCCOLOR[bar.loc] || '#ccc';
                const style = [
                  `left:${left}%`,
                  `width:${width}%`,
                  `background:${color}`,
                  bar.source === 'base' ? 'box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)' : '',
                  bar.source === 'override' ? 'border:2px solid rgba(0,0,0,.18)' : '',
                  bar.isEarlyGate ? 'outline:2px dashed #111827' : '',
                ].filter(Boolean).join(';');

                const label = `${LOCLABEL[bar.loc] || bar.loc} ${minsToHHMM(bar.start)}–${minsToHHMM(bar.end)}`;
                return `
                  <div class="gantt-bar ${bar.isEarlyGate ? 'gantt-bar-early' : ''}"
                       style="${style}"
                       title="${label}"
                       ${!_rotaReadOnly && bar.id && !bar.isLeave
                         ? `onclick="event.stopPropagation();openShiftEditor('${iso || dow}','${emp.id}','${bar.id}','${_rotaMode}')"`
                         : ''}>
                    <span class="gantt-bar-label">${LOCLABEL[bar.loc] || bar.loc}</span>
                    ${!_rotaReadOnly && bar.id && !bar.isLeave && !String(bar.id).startsWith('early-')
                      ? `<button class="gantt-bar-del" onclick="event.stopPropagation();deleteBarClick('${iso || dow}','${bar.id}','${_rotaMode}')">✕</button>`
                      : ''}
                  </div>`;
              }).join('')}

              ${nowPct >= 0 ? `<div class="gantt-now-line" style="left:${nowPct}%"></div>` : ''}
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
      const left  = ((h.open - DISPLAY_START_MINS) / totalMins) * 100;
      const width = ((h.close - h.open) / totalMins) * 100;
      const note = _rotaMode === 'week' ? getLocNote(state.currentDateISO, loc) : '';
      return `
        <div class="gantt-loc-window"
             style="left:${left}%;width:${width}%;background:${LOCCOLOR[loc]}14"
             title="${LOCLABEL[loc]} ${minsToHHMM(h.open)}–${minsToHHMM(h.close)}">
        </div>
        ${_rotaMode === 'week' && note ? `
          <button class="btn btn-sm btn-ghost"
            style="position:absolute;left:${left}%;top:-16px;padding:1px 5px;font-size:10px"
            onclick="openLocNoteModal('${state.currentDateISO}','${loc}')">📝 ${LOCLABEL[loc]}</button>` : ''}
      `;
    }).join('');

  return `
    <div class="gantt-window-row">
      <div class="gantt-name-col"></div>
      <div class="gantt-bars-col" style="position:relative;height:18px">
        ${windows}
      </div>
    </div>`;
}

function renderCoverageBand(totalMins, iso) {
  const el = document.getElementById('gantt-coverage-band');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }

  const gaps = getCoverageGaps(iso);

  el.innerHTML = `
    <div class="gantt-coverage-wrap">
      <div class="gantt-name-col">
        <span style="font-size:10px;font-weight:700;color:var(--muted)">Coverage</span>
      </div>
      <div class="gantt-bars-col" style="position:relative;height:28px">
        ${REQUIREDLOCS.map(loc => {
          const color = LOCCOLOR[loc];
          const h     = LOC_HOURS[loc];
          if (!h) return '';
          const left  = ((h.open - DISPLAY_START_MINS) / totalMins) * 100;
          const width = ((h.close - h.open) / totalMins) * 100;
          const min   = MIN_STAFF_PER_LOC[loc] || 1;
          const current = getLocAtTime(iso, loc, nowMins()).length;
          const ok = current >= min;
          const locGaps = gaps.filter(g => g.loc === loc);
          return `
            <div class="gantt-cov-loc" style="left:${left}%;width:${width}%;background:${color}33">
              ${locGaps.map(g => {
                const gl = ((g.gapStart - DISPLAY_START_MINS) / totalMins) * 100;
                const gw = ((g.gapEnd - g.gapStart) / totalMins) * 100;
                return `<div class="gantt-gap-mark" style="left:${gl}%;width:${gw}%"
                  title="${LOCLABEL[loc]} gap ${minsToHHMM(g.gapStart)}–${minsToHHMM(g.gapEnd)}"></div>`;
              }).join('')}
              <span class="gantt-cov-label" style="color:${color}">
                ${LOCLABEL[loc]} ${ok ? '✔' : '⚠'} ${current}/${min}
              </span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

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
    return;
  }

  const startMins = Math.min(_blockStart.startMins, clickMins);
  const endMins   = Math.max(_blockStart.startMins, clickMins);
  _blockStart     = null;

  if (endMins <= startMins) { showToast('Select a valid range'); return; }
  openLocPickerModal(empId, startMins, endMins);
}

function openLocPickerModal(empId, startMins, endMins) {
  const inner = document.getElementById('loc-picker-inner');
  const emp   = state.employees.find(e => e.id === empId);
  if (!inner) return;

  inner.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">${escH(emp?.name || empId)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
      ${minsToHHMM(startMins)} – ${minsToHHMM(endMins)} (${((endMins - startMins)/60).toFixed(1)}h)
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${LOC_CYCLE.filter(l => !['off','vac'].includes(l)).map(loc => {
        const h = LOC_HOURS[loc];
        const valid = !h || (startMins >= h.open && endMins <= h.close);
        return `
          <button class="btn btn-ghost"
            style="border-color:${LOCCOLOR[loc]};color:${LOCCOLOR[loc]};${!valid ? 'opacity:.35;cursor:not-allowed' : ''}"
            ${valid ? `onclick="confirmLocPick('${state.currentDateISO || state.currentDow}','${empId}',${startMins},${endMins},'${loc}','${_rotaMode}')"` : 'disabled'}>
            ${LOCLABEL[loc]}
          </button>`;
      }).join('')}
    </div>`;
  openModal('loc-picker-modal');
}

function confirmLocPick(isoOrDow, empId, startMins, endMins, loc, mode) {
  closeModal('loc-picker-modal');
  if (mode === 'base') setBaseShift(isoOrDow, empId, loc, startMins, endMins);
  else addShift(isoOrDow, empId, loc, startMins, endMins);
  renderRota();
  renderAll();
}

function deleteBarClick(isoOrDow, shiftId, mode) {
  if (mode === 'base') {
    const parts = shiftId.replace('base-', '').split('-');
    const start = parseInt(parts[parts.length - 1]);
    const empId = parts.slice(0, -1).join('-');
    removeBaseShift(isoOrDow, empId, start);
  } else {
    removeShift(isoOrDow, shiftId);
  }
  renderRota();
}

function openShiftEditor(isoOrDow, empId, shiftId, mode) {
  if (mode === 'base') {
    const parts = shiftId.replace('base-', '').split('-');
    const start = parseInt(parts[parts.length - 1]);
    const shift = (state.defaultSchedule?.[isoOrDow]?.[empId] || []).find(b => b.start === start);
    if (!shift) return;
    openLocPickerModal(empId, shift.start, shift.end);
  } else {
    const shift = (state.shifts?.[isoOrDow] || []).find(s => s.id === shiftId);
    if (!shift) return;
    openLocPickerModal(empId, shift.start, shift.end);
  }
}

function calcBaseHrsDay(dow, empId) {
  return (state.defaultSchedule?.[dow]?.[empId] || [])
    .filter(b => !['off','vac','lunch'].includes(b.loc))
    .reduce((acc, b) => acc + (b.end - b.start) / 60, 0);
}

function renderRotaAlerts() {
  const el = document.getElementById('rota-alerts-bar');
  if (!el) return;
  if (_rotaMode === 'base') { el.innerHTML = ''; return; }
  renderAlertsBar('rota-alerts-bar', state.currentDateISO, { weekMode: true });
}

function onRotaPageShow() {
  _blockStart = null;
  renderWeekNav();
  renderRota();
}
