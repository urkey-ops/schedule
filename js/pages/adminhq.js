// ── pages/adminhq.js ──────────────────────────────────────────

let _hqRefTimer = null;

function stopHQRefresh() {
  clearInterval(_hqRefTimer);
  _hqRefTimer = null;
}

function renderAdminHQ() {
  renderHQAlerts();
  renderTodayGlance();
  renderActionQueue();
  renderHourWatch();
  renderWeekMinimap();

  if (!_hqRefTimer) {
    _hqRefTimer = setInterval(() => {
      if (document.getElementById('page-adminhq')?.classList.contains('active')) {
        renderHQAlerts();
        renderTodayGlance();
        renderActionQueue();
      } else {
        stopHQRefresh();
      }
    }, 60000);
  }
}

// ── HQ Alerts Bar ─────────────────────────────────────────────
// FIX: renderHQAlerts now calls the global renderAlertsBar(containerId, iso)
// from alerts-bar.js with the correct two-argument signature.
// The local renderAlertsBar(iso) override and local toggleAlertGroup(hdrEl)
// that shadowed the globals have both been removed.

function renderHQAlerts() {
  const el = document.getElementById('hq-alerts-bar');
  if (!el) return;
  // FIX: use correct global signature — renderAlertsBar(containerId, iso)
  renderAlertsBar('hq-alerts-bar', todayStr());
}

// ── Today at a Glance ─────────────────────────────────────────

function renderTodayGlance() {
  const el = document.getElementById('hq-today-glance');
  if (!el) return;
  const iso        = todayStr();
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const si         = currentSlotIdx();

  const working = activeEmps.filter(e =>
    !isEmpDayOff(e.id, iso) && !isOnLeave(e.id, iso) &&
    !state.absences?.[iso]?.[e.id]
  ).length;
  const onLeave = activeEmps.filter(e => isOnLeave(e.id, iso)).length;
  const dayOff  = activeEmps.filter(e => isEmpDayOff(e.id, iso)).length;
  // FIX: absent was not subtracted from working — now counted separately
  const absent  = Object.keys(state.absences?.[iso] || {}).length;
  const gaps    = getDayGapCount(iso);
  const holiday = getHolidayForDate(iso);

  el.innerHTML = `
    ${holiday
      ? `<div class="holiday-banner" style="margin-bottom:12px;
             background:${holiday.color}22;border-color:${holiday.color}55;
             color:${holiday.color}">
           ${holiday.emoji} <strong>${escH(holiday.name)}</strong>
         </div>`
      : ''}
    <div class="hq-glance-grid"
      style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
             gap:10px;margin-bottom:14px">
      ${[
        { val: working,           label: 'Working',    color: 'var(--green)',  icon: '✅' },
        { val: onLeave,           label: 'On Leave',   color: 'var(--purple)', icon: '🔒' },
        { val: dayOff,            label: 'Day Off',    color: 'var(--muted)',  icon: '😴' },
        { val: absent,            label: 'Absent',     color: 'var(--red)',    icon: '✖'  },
        { val: gaps,              label: 'Gaps',       color: gaps ? 'var(--red)' : 'var(--green)', icon: gaps ? '⚠️' : '✔' },
        { val: activeEmps.length, label: 'Total Staff',color: 'var(--accent)', icon: '👥' },
      ].map(({ val, label, color, icon }) => `
        <div class="card" style="padding:14px;text-align:center">
          <div style="font-size:11px;color:var(--muted);font-weight:600;
                      text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
            ${icon} ${label}
          </div>
          <div class="hq-glance-val"
            style="font-size:28px;font-weight:800;color:${color};
                   font-family:'DM Mono',monospace">
            ${val}
          </div>
        </div>`
      ).join('')}
    </div>
    ${si >= 0
      ? `<div class="card" style="padding:12px 14px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
            Current Slot — ${TIMESLOTS[si]}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${REQUIREDLOCS.map(loc => {
              const covered = activeEmps.some(e => {
                if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso) ||
                    state.absences?.[iso]?.[e.id]) return false;
                return getResolvedLoc(iso, si, e.id).loc === loc;
              });
              const color = LOCCOLOR[loc] || '#888';
              return `<div style="padding:6px 12px;border-radius:10px;
                                  background:${covered ? color+'22' : 'var(--red-bg)'};
                                  border:1.5px solid ${covered ? color+'55' : 'rgba(215,43,43,.3)'};
                                  font-size:12px;font-weight:700;
                                  color:${covered ? color : 'var(--red)'}">
                ${covered ? '✔' : '✖'} ${LOCLABEL[loc] || loc}
              </div>`;
            }).join('')}
          </div>
        </div>`
      : ''}`;
}

// ── Action Queue ──────────────────────────────────────────────

function renderActionQueue() {
  const el = document.getElementById('hq-action-queue');
  if (!el) return;
  const iso   = todayStr();
  const items = [];

  const si = currentSlotIdx();
  if (si >= 0) {
    REQUIREDLOCS.forEach(loc => {
      const covered = state.employees.filter(e => e.status === 'Active').some(e => {
        if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso) ||
            state.absences?.[iso]?.[e.id]) return false;
        return getResolvedLoc(iso, si, e.id).loc === loc;
      });
      if (!covered) items.push({
        priority   : 'high',
        icon       : '⚠️',
        msg        : `${LOCLABEL[loc] || loc} is uncovered right now`,
        action     : `openFillGapWizard('${iso}',${si},'${loc}')`,
        actionLabel: 'Fill Gap',
      });
    });
  }

  Object.keys(state.absences?.[iso] || {}).forEach(empId => {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) items.push({
      priority   : 'med',
      icon       : '✖',
      msg        : `${emp.name} is marked absent`,
      action     : `toggleAbsent('${empId}','${iso}')`,
      actionLabel: 'Mark Present',
    });
  });

  (state.leaveRequests || [])
    .filter(l => l.status === 'active' && l.to === iso)
    .forEach(l => {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) items.push({
        priority: 'low',
        icon    : '🔔',
        msg     : `${emp.name}'s leave ends today`,
      });
    });

  const tom = toDateStr(new Date(new Date().setDate(new Date().getDate() + 1)));
  (state.leaveRequests || [])
    .filter(l => l.status === 'active' && l.from === tom)
    .forEach(l => {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) items.push({
        priority: 'low',
        icon    : '📅',
        msg     : `${emp.name}'s leave starts tomorrow`,
      });
    });

  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  state.employees.filter(e => e.status === 'Active').forEach(e => {
    const used = calcScheduledHrsWeek(e.id, weekMon);
    const cap  = e.hourCap || DEFAULTHRSCAP;
    if (used > cap) items.push({
      priority: 'med',
      icon    : '⏱',
      msg     : `${e.name} is ${(used - cap).toFixed(1)}h over cap this week`,
    });
  });

  if (!items.length) {
    el.innerHTML = `
      <div style="padding:16px;text-align:center;
                  color:var(--green);font-size:13px;font-weight:600">
        ✔ All clear — no actions needed
      </div>`;
    return;
  }

  const priorityOrder = { high: 0, med: 1, low: 2 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  el.innerHTML = items.map(item => `
    <div class="hq-action-item action-${item.priority}"
      style="display:flex;align-items:center;gap:10px;
             padding:10px 14px;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;flex-shrink:0">${item.icon}</span>
      <span style="font-size:13px;color:var(--text);flex:1">${escH(item.msg)}</span>
      ${item.action
        ? `<button class="btn btn-sm btn-warn" style="flex-shrink:0"
             onclick="${item.action}">${item.actionLabel}</button>`
        : ''}
    </div>`
  ).join('');
}

// ── Hour Watch ────────────────────────────────────────────────

function renderHourWatch() {
  const el = document.getElementById('hq-hour-watch');
  if (!el) return;
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  const emps    = state.employees.filter(e => e.status === 'Active');

  if (!emps.length) {
    el.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:13px">
      No active employees.</div>`;
    return;
  }

  el.innerHTML = emps.map(e => {
    const used  = calcScheduledHrsWeek(e.id, weekMon);
    const cap   = e.hourCap || DEFAULTHRSCAP;
    const pct   = Math.min((used / cap) * 100, 100);
    const over  = used > cap;
    const warn  = !over && pct >= 80;
    const color = over ? '#dc2626' : warn ? '#d97706' : '#059669';

    return `
      <div style="display:flex;align-items:center;gap:10px;
                  padding:8px 14px;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;font-weight:700;min-width:100px;color:var(--text);
                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escH(e.name)}
        </span>
        <div class="roster-hr-bar" style="flex:1">
          <div class="roster-hr-track">
            <div class="roster-hr-fill"
              style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="roster-hr-label" style="color:${color}">
            ${used.toFixed(1)}/${cap}h
          </span>
        </div>
        ${over
          ? `<span class="hrs-chip hrs-over">+${(used - cap).toFixed(1)}h</span>`
          : warn
          ? `<span class="hrs-chip hrs-warn">${(cap - used).toFixed(1)}h left</span>`
          : ''}
      </div>`;
  }).join('');
}

// ── Week Minimap ──────────────────────────────────────────────

function renderWeekMinimap() {
  const el = document.getElementById('hq-week-minimap');
  if (!el) return;
  const mon = new Date(state.currentWeekMon + 'T00:00:00');

  el.innerHTML = `
    <div class="week-minimap"
      style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:12px">
      ${DAYSSHORT.map((dow, di) => {
        const d       = new Date(mon); d.setDate(d.getDate() + di);
        const iso     = toDateStr(d);
        const isToday = iso === todayStr();
        const holiday = getHolidayForDate(iso);
        const alerts  = scanAlerts(iso);
        const gaps    = alerts.filter(a => a.type === ALERT_TYPES.GAP).length;
        const absent  = alerts.filter(a => a.type === ALERT_TYPES.ABSENT).length;
        const ovrs    = countDayOverrides(iso);

        return `
          <div class="minimap-day card"
            style="padding:8px 6px;text-align:center;cursor:pointer;
                   ${isToday ? 'border-color:var(--accent);background:var(--accent-glow)' : ''}"
            onclick="showPage('schedule',document.getElementById('tab-schedule'));
                     selectDay('${iso}','${dow}')">
            <div class="minimap-day-name"
              style="font-size:10px;font-weight:700;color:var(--muted)">
              ${dow}
            </div>
            <div class="minimap-date"
              style="font-size:16px;font-weight:800;
                     color:${isToday ? 'var(--accent)' : 'var(--text)'}">
              ${d.getDate()}
            </div>
            ${holiday
              ? `<div style="font-size:11px">${holiday.emoji}</div>`
              : ''}
            ${gaps
              ? `<div style="font-size:9px;font-weight:700;color:var(--red)">
                   ⚠️ ${gaps} gap${gaps > 1 ? 's' : ''}</div>`
              : `<div style="font-size:9px;color:var(--green);font-weight:600">✔</div>`}
            ${absent
              ? `<div style="font-size:9px;color:var(--orange)">
                   ✖ ${absent} absent</div>`
              : ''}
            ${ovrs
              ? `<div style="font-size:9px;color:var(--muted)">${ovrs} ovr</div>`
              : ''}
          </div>`;
      }).join('')}
    </div>`;
}

// ── Fill Gap Wizard ───────────────────────────────────────────

function openFillGapWizard(iso, si, loc) {
  const modal = document.getElementById('fill-gap-modal');
  const inner = document.getElementById('fill-gap-modal-inner');
  if (!modal || !inner) return;

  const slot       = TIMESLOTS[si];
  const label      = LOCLABEL[loc] || loc;
  const color      = LOCCOLOR[loc] || '#888';
  const activeEmps = state.employees.filter(e =>
    e.status === 'Active'        &&
    !isEmpDayOff(e.id, iso)      &&
    !isOnLeave(e.id, iso)        &&
    !state.absences?.[iso]?.[e.id] &&
    !(e.blocked || []).includes(loc)
  );

  inner.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">
        Fill Gap —
        <span style="color:${color}">${label}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">
        ${fmtDate(iso)} · ${slot}
      </div>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">
      Available employees:
    </div>
    ${activeEmps.length
      ? activeEmps.map(e => {
          const { loc: curLoc } = getResolvedLoc(iso, si, e.id);
          const weekMon         = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
          const used            = calcScheduledHrsWeek(e.id, weekMon);
          const cap             = e.hourCap || DEFAULTHRSCAP;
          const overCap         = used >= cap;
          return `
            <div class="fgw-emp-row${overCap ? ' fgw-overcap' : ''}">
              <div class="fgw-emp-info">
                <span class="fgw-emp-name">${escH(e.name)}</span>
                <span class="fgw-emp-cur" style="color:var(--muted)">
                  Currently: ${LOCLABEL[curLoc] || curLoc}
                </span>
                <span class="fgw-emp-hrs" style="color:${overCap ? 'var(--red)' : 'var(--muted)'}">
                  ${used.toFixed(1)}/${cap}h ${overCap ? '⚠ over cap' : ''}
                </span>
              </div>
              <button class="btn btn-sm btn-success"
                onclick="fillGapAssign('${iso}',${si},'${e.id}','${loc}')">
                Assign
              </button>
            </div>`;
        }).join('')
      : `<div class="fgw-empty">No available employees for this slot.</div>`}`;

  openModal('fill-gap-modal');
}

function fillGapAssign(iso, si, empId, loc) {
  if (!state.schedule)            state.schedule            = {};
  if (!state.schedule[iso])       state.schedule[iso]       = {};
  if (!state.schedule[iso][si])   state.schedule[iso][si]   = {};
  state.schedule[iso][si][empId] = loc;
  persistAll('schedule');
  closeModal('fill-gap-modal');
  renderAll();
  showToast(`Gap filled — ${LOCLABEL[loc] || loc}`);
}
