// ── pages/schedule-page.js ────────────────────────────────────
// Rendering only — CRUD/logic lives in domain/schedule.js

function renderSchedule() {
  const iso  = state.currentDateISO;
  const head = document.getElementById('sched-head');
  const body = document.getElementById('sched-body');
  if (!head || !body) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const holiday    = getHolidayForDate(iso);

  // Holiday banner
  const hb = document.getElementById('sched-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `${holiday.emoji} <strong>${escH(holiday.name)}</strong>`;
      hb.style.background  = holiday.color + '22';
      hb.style.borderColor = holiday.color + '55';
      hb.style.color       = holiday.color;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  renderSchedAlerts();
  renderSchedHrsRow(activeEmps, iso);

  // Header
  head.innerHTML = `<tr>
    <th class="slot-label">Time Slot</th>
    ${activeEmps.map(e => {
      const isDO    = isEmpDayOff(e.id, iso);
      const onLeave = isOnLeave(e.id, iso);
      const absent  = !!state.absences?.[iso]?.[e.id];
      return `<th class="${isDO?'dayoff-col':''}"
        style="min-width:90px;font-size:11px">
        <div style="font-weight:700">${escH(e.name.split(' ')[0])}</div>
        ${isDO
          ? '<div style="font-size:9px;color:var(--muted)">Day Off</div>'
          : onLeave
          ? '<div style="font-size:9px;color:var(--purple)">🔒 Leave</div>'
          : absent
          ? '<div style="font-size:9px;color:var(--red)">✖ Absent</div>'
          : ''}
      </th>`;
    }).join('')}
    <th style="min-width:50px;font-size:11px;color:var(--muted)">Cov.</th>
  </tr>`;

  // Body
  const nowSi = currentSlotIdx();
  body.innerHTML = TIMESLOTS.map((slot, si) => {
    const isLunch = LUNCHSLOTS?.includes(si);
    const isCur   = si === nowSi;

    const cells = activeEmps.map(e => {
      const isDO    = isEmpDayOff(e.id, iso);
      const onLeave = isOnLeave(e.id, iso);
      const absent  = !!state.absences?.[iso]?.[e.id];

      if (isDO) return `<td class="dayoff-col">
        <div class="dayoff-lock">
          <span>—</span>
          ${state.mode==='admin'
            ? `<button class="dayoff-override-btn" title="Override day off"
                onclick="overrideDayOff('${iso}',${si},'${e.id}')">✏</button>`
            : ''}
        </div></td>`;

      if (onLeave) return `<td>
        <div class="leave-lock">🔒 Leave</div></td>`;

      if (absent) return `<td>
        <div class="absent-lock">✖ Absent</div></td>`;

      const { loc, source } = getResolvedLoc(iso, si, e.id);
      const isOvr = source === 'override';

      if (state.mode !== 'admin') {
        return `<td><div class="cell-wrap ${isOvr?'overridden':''}">
          <span class="loc-select ${LOCCLS[loc]||''}">
            ${LOCLABEL[loc]||loc}
          </span>
        </div></td>`;
      }

      return `<td><div class="cell-wrap ${isOvr?'overridden':''}">
        ${isOvr
          ? `<button class="reset-btn"
              onclick="resetCell('${iso}',${si},'${e.id}')">↩ reset</button>`
          : ''}
        <select class="loc-select ${LOCCLS[loc]||''}"
          onchange="setCellOverride('${iso}',${si},'${e.id}',this)"
          onmousedown="this.dataset.prev=this.value">
          ${ALLLOCS.map(l =>
            `<option value="${l}" ${loc===l?'selected':''}
              class="${LOCCLS[l]||''}">${LOCLABEL[l]||l}</option>`
          ).join('')}
        </select>
      </div></td>`;
    }).join('');

    // Coverage cell
    const covOk = REQUIREDLOCS.every(rloc =>
      activeEmps.some(e => {
        if (isEmpDayOff(e.id,iso) || isOnLeave(e.id,iso) ||
            state.absences?.[iso]?.[e.id]) return false;
        return getResolvedLoc(iso, si, e.id).loc === rloc;
      })
    );

    return `<tr class="${isCur?'cur-row':''}">
      <td class="slot-label ${isLunch?'lunch-slot':''} ${isCur?'cur-slot':''}">
        ${slot}
      </td>
      ${cells}
      <td class="cov-cell ${covOk?'cov-ok':'cov-fail'}">
        ${covOk?'✔':'✖'}
      </td>
    </tr>`;
  }).join('');
}

function renderSchedHrsRow(activeEmps, iso) {
  const row = document.getElementById('sched-hrs-row');
  if (!row) return;
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  row.innerHTML = activeEmps.map(e => {
    const used  = calcScheduledHrsWeek(e.id, weekMon);
    const cap   = e.hourCap || DEFAULTHRSCAP;
    const over  = used > cap;
    const warn  = !over && (used/cap) >= 0.8;
    const color = over ? 'hrs-over' : warn ? 'hrs-under' : 'hrs-ok';
    return `<div class="sched-hrs-emp">
      <span style="font-size:11px">${escH(e.name.split(' ')[0])}</span>
      <span class="hrs-chip ${color}">${used.toFixed(1)}h</span>
    </div>`;
  }).join('');
}

function renderDefaultSchedule() {
  const dow  = state.currentDow;
  const head = document.getElementById('default-head');
  const body = document.getElementById('default-body');
  if (!head || !body) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const dayOffEmps = activeEmps.filter(e => (e.daysOff||[]).includes(dow));
  const workEmps   = activeEmps.filter(e => !(e.daysOff||[]).includes(dow));

  head.innerHTML = `<tr>
    <th class="slot-label">Time Slot</th>
    ${workEmps.map(e =>
      `<th style="min-width:90px;font-size:11px;font-weight:700">
        ${escH(e.name.split(' ')[0])}
      </th>`
    ).join('')}
    ${dayOffEmps.map(e =>
      `<th class="dayoff-col"
        style="min-width:90px;font-size:11px;opacity:.5">
        ${escH(e.name.split(' ')[0])}
        <div style="font-size:9px;color:var(--muted)">Day Off</div>
      </th>`
    ).join('')}
    <th style="min-width:50px;font-size:11px;color:var(--muted)">Cov.</th>
  </tr>`;

  body.innerHTML = TIMESLOTS.map((slot, si) => {
    const isLunch = LUNCHSLOTS?.includes(si);

    const workCells = workEmps.map(e => {
      const cur = state.defaultSchedule?.[dow]?.[si]?.[e.id] || e.fallback || 'off';
      if (state.mode !== 'admin') {
        return `<td><span class="loc-select ${LOCCLS[cur]||''}">
          ${LOCLABEL[cur]||cur}</span></td>`;
      }
      return `<td>
        <select class="loc-select ${LOCCLS[cur]||''}"
          onchange="setDefaultCell('${dow}',${si},'${e.id}',this)">
          ${ALLLOCS.map(l =>
            `<option value="${l}" ${cur===l?'selected':''}
              class="${LOCCLS[l]||''}">${LOCLABEL[l]||l}</option>`
          ).join('')}
        </select></td>`;
    }).join('');

    const dayOffCells = dayOffEmps.map(() =>
      `<td class="dayoff-col">
        <div class="dayoff-lock">—</div></td>`
    ).join('');

    const covOk = REQUIREDLOCS.every(rloc =>
      workEmps.some(e => {
        const loc = state.defaultSchedule?.[dow]?.[si]?.[e.id] || e.fallback || 'off';
        return loc === rloc;
      })
    );

    return `<tr>
      <td class="slot-label ${isLunch?'lunch-slot':''}">
        ${slot}
      </td>
      ${workCells}
      ${dayOffCells}
      <td class="cov-cell ${covOk?'cov-ok':'cov-fail'}">${covOk?'✔':'✖'}</td>
    </tr>`;
  }).join('');
}

// ── Cell mutations ────────────────────────────────────────────

function setCellOverride(iso, si, empId, sel) {
  const loc = sel.value;
  if (!state.schedule)         state.schedule         = {};
  if (!state.schedule[iso])    state.schedule[iso]    = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  state.schedule[iso][si][empId] = loc;
  sel.className = `loc-select ${LOCCLS[loc]||''}`;
  sel.closest('.cell-wrap')?.classList.add('overridden');
  persistAll('schedule');
  renderWeekNav();
  renderSchedHrsRow(state.employees.filter(e=>e.status==='Active'), iso);
}

function resetCell(iso, si, empId) {
  if (!state.schedule?.[iso]?.[si]) return;
  delete state.schedule[iso][si][empId];
  if (!Object.keys(state.schedule[iso][si]).length) delete state.schedule[iso][si];
  if (!Object.keys(state.schedule[iso]).length)     delete state.schedule[iso];
  persistAll('schedule');
  renderSchedule();
}

function setDefaultCell(dow, si, empId, sel) {
  const loc = sel.value;
  if (!state.defaultSchedule)        state.defaultSchedule        = {};
  if (!state.defaultSchedule[dow])   state.defaultSchedule[dow]   = {};
  if (!state.defaultSchedule[dow][si]) state.defaultSchedule[dow][si] = {};
  state.defaultSchedule[dow][si][empId] = loc;
  sel.className = `loc-select ${LOCCLS[loc]||''}`;
}

function saveDefault() {
  persistAll('defaultSchedule');
  showToast('Default schedule saved');
}

function applyDefaultToDay() {
  const iso = state.currentDateISO;
  const dow = state.currentDow;
  pushUndo('Apply default', state);
  if (!state.schedule)      state.schedule      = {};
  if (!state.schedule[iso]) state.schedule[iso] = {};

  TIMESLOTS.forEach((_, si) => {
    if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
    state.employees
      .filter(e => e.status === 'Active' && !isEmpDayOff(e.id, iso))
      .forEach(e => {
        const def = state.defaultSchedule?.[dow]?.[si]?.[e.id];
        if (def) state.schedule[iso][si][e.id] = def;
      });
  });

  persistAll('schedule');
  renderSchedule();
  showToast('Default applied to ' + fmtDate(iso));
}

function clearOverridesForDay() {
  const iso = state.currentDateISO;
  if (!confirm(`Clear all overrides for ${fmtDate(iso)}?`)) return;
  pushUndo('Clear overrides', state);
  delete state.schedule?.[iso];
  persistAll('schedule');
  renderSchedule();
  renderWeekNav();
  showToast('Overrides cleared');
}

function copyDayTo(targetIso) {
  const srcIso = state.currentDateISO;
  pushUndo('Copy day', state);
  if (!state.schedule)            state.schedule            = {};
  if (!state.schedule[targetIso]) state.schedule[targetIso] = {};
  const src = state.schedule[srcIso] || {};
  state.schedule[targetIso] = JSON.parse(JSON.stringify(src));
  persistAll('schedule');
  showToast(`Copied to ${fmtDate(targetIso)}`);
}

function overrideDayOff(iso, si, empId) {
  if (!state.schedule)          state.schedule          = {};
  if (!state.schedule[iso])     state.schedule[iso]     = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  const emp = state.employees.find(e => e.id === empId);
  state.schedule[iso][si][empId] = emp?.fallback || 'field';
  persistAll('schedule');
  renderSchedule();
  showToast('Day off overridden for this slot');
}

function renderRangeFill(mode) {
  if (state.mode !== 'admin') return '';
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  return `<div class="range-fill-bar">
    <span class="range-fill-label">⚡ Fill range:</span>
    <select id="range-fill-emp-${mode}" style="flex:1;min-width:120px">
      ${activeEmps.map(e =>
        `<option value="${e.id}">${escH(e.name)}</option>`
      ).join('')}
    </select>
    <select id="range-fill-loc-${mode}">
      ${ALLLOCS.map(l =>
        `<option value="${l}">${LOCLABEL[l]||l}</option>`
      ).join('')}
    </select>
    <button class="btn btn-sm btn-warn"
      onclick="applyRangeFill('${mode}')">Apply to Week</button>
  </div>`;
}

function applyRangeFill(mode) {
  const empId = document.getElementById(`range-fill-emp-${mode}`)?.value;
  const loc   = document.getElementById(`range-fill-loc-${mode}`)?.value;
  if (!empId || !loc) return;
  pushUndo('Range fill', state);

  if (mode === 'default') {
    const dow = state.currentDow;
    if (!state.defaultSchedule)      state.defaultSchedule      = {};
    if (!state.defaultSchedule[dow]) state.defaultSchedule[dow] = {};
    TIMESLOTS.forEach((_, si) => {
      if (!state.defaultSchedule[dow][si]) state.defaultSchedule[dow][si] = {};
      state.defaultSchedule[dow][si][empId] = loc;
    });
    renderDefaultSchedule();
  } else {
    const iso = state.currentDateISO;
    if (!state.schedule)      state.schedule      = {};
    if (!state.schedule[iso]) state.schedule[iso] = {};
    TIMESLOTS.forEach((_, si) => {
      if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
      state.schedule[iso][si][empId] = loc;
    });
    renderSchedule();
  }
  showToast('Range fill applied');
}

// ── Plan modal render ─────────────────────────────────────────

function renderPlanModal() {
  const emp = state.employees.find(e => e.id === _editEmpId);
  if (!emp) return;

  const mon = new Date(_planWeekMon+'T00:00:00');
  const end = new Date(mon); end.setDate(end.getDate()+6);
  document.getElementById('plan-week-label').textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  const container = document.getElementById('plan-days-container');
  if (!container) return;

  container.innerHTML = DAYSSHORT.map((dow, di) => {
    const d        = new Date(mon); d.setDate(d.getDate()+di);
    const iso      = toDateStr(d);
    const isToday_ = iso === todayStr();
    const isDO     = isEmpDayOff(emp.id, iso);
    const onLeave_ = isOnLeave(emp.id, iso);
    const holiday  = getHolidayForDate(iso);

    return `<div style="border:1.5px solid var(--border);border-radius:10px;
                        margin-bottom:10px;overflow:hidden">
      <div style="padding:8px 12px;background:var(--surface2);
                  border-bottom:1px solid var(--border);
                  display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="font-size:13px">${DAYSFULL[di]} ${d.getDate()}</strong>
        ${isToday_ ? '<span class="today-badge">TODAY</span>' : ''}
        ${holiday
          ? `<span style="font-size:11px;color:${holiday.color};font-weight:600">
              ${holiday.emoji} ${escH(holiday.name)}</span>`
          : ''}
        ${isDO     ? '<span class="status-chip chip-dayoff" style="font-size:10px">Day Off</span>' : ''}
        ${onLeave_ ? '<span class="status-chip chip-leave"  style="font-size:10px">On Leave</span>' : ''}
      </div>
      ${isDO || onLeave_ ? '' :
        `<div style="padding:8px 12px;display:flex;flex-direction:column;gap:4px">
          ${TIMESLOTS.map((slot, si) => {
            const { loc, source } = getResolvedLoc(iso, si, emp.id);
            const isOvr = source === 'override';
            return `<div style="display:flex;align-items:center;gap:8px;
                                padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:10px;color:var(--muted);
                           min-width:110px;flex-shrink:0">${slot}</span>
              <select data-iso="${iso}" data-si="${si}"
                class="plan-cell-select ${isOvr?'is-override':''}"
                style="flex:1;padding:5px 8px;border-radius:6px;font-size:12px;
                       border:1.5px solid ${isOvr?'var(--orange)':'var(--border2)'};
                       background:var(--surface)"
                onchange="planCellChange(this,'${emp.id}')">
                ${ALLLOCS.map(l =>
                  `<option value="${l}" ${loc===l?'selected':''}>${LOCLABEL[l]||l}</option>`
                ).join('')}
              </select>
              ${isOvr
                ? `<button class="btn btn-sm btn-ghost"
                    style="font-size:10px;padding:3px 7px"
                    onclick="clearPlanCell('${iso}',${si},'${emp.id}')">↩</button>`
                : ''}
            </div>`;
          }).join('')}
        </div>`}
    </div>`;
  }).join('');
}

function planCellChange(sel, empId) {
  const iso = sel.dataset.iso;
  const si  = parseInt(sel.dataset.si);
  const loc = sel.value;
  if (!state.schedule)          state.schedule          = {};
  if (!state.schedule[iso])     state.schedule[iso]     = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  state.schedule[iso][si][empId] = loc;
  sel.style.borderColor = 'var(--orange)';
  sel.classList.add('is-override');
}

function clearPlanCell(iso, si, empId) {
  if (!state.schedule?.[iso]?.[si]) return;
  delete state.schedule[iso][si][empId];
  if (!Object.keys(state.schedule[iso][si]).length) delete state.schedule[iso][si];
  if (!Object.keys(state.schedule[iso]).length)     delete state.schedule[iso];
  renderPlanModal();
}
