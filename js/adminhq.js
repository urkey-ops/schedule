// ── adminhq.js ────────────────────────────────────────────────
// Admin HQ Dashboard — today glance, action queue,
// hour watch, week minimap, quick actions

let _hqRefreshInt = null;

// ── Entry point ───────────────────────────────────────────────
function renderAdminHQ() {
  renderHQAlerts();
  renderTodayGlance();
  renderWeekMinimap();
  renderHourWatch();
  renderActionQueue();
  startHQRefresh();
}

function startHQRefresh() {
  stopHQRefresh();
  _hqRefreshInt = setInterval(() => {
    const active = document.getElementById('page-adminhq')
      ?.classList.contains('active');
    if (!active) { stopHQRefresh(); return; }
    renderHQAlerts();
    renderTodayGlance();
    renderHourWatch();
    renderActionQueue();
  }, 30000);
}

function stopHQRefresh() {
  if (_hqRefreshInt) { clearInterval(_hqRefreshInt); _hqRefreshInt = null; }
}

// ── HQ Alerts ─────────────────────────────────────────────────
function renderHQAlerts() {
  renderAlertsBar('hq-alerts-bar', todayStr());
}

// ── Today at a Glance ─────────────────────────────────────────
function renderTodayGlance() {
  const el = document.getElementById('hq-today-glance');
  if (!el) return;

  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const alerts     = scanAlerts(iso);

  let onShift = 0, dayOff = 0, onLeave = 0, absent = 0, gaps = 0;

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso))          { dayOff++;  return; }
    if (isOnLeave(e.id, iso))            { onLeave++; return; }
    if (state.absences?.[iso]?.[e.id])   { absent++;  return; }
    if (si >= 0) {
      const { loc } = getResolvedLoc(iso, si, e.id);
      if (loc !== 'off') onShift++;
    }
  });

  gaps = alerts.filter(a => a.type === ALERT_TYPES.GAP && a.si === si).length;

  const holiday = getHolidayForDate(iso);
  const cards   = [
    { icon:'✅', val: onShift, label:'On Shift',  color:'#059669', bg:'#dcfce7' },
    { icon:'⚠️', val: gaps,    label:'Gaps Now',  color: gaps ? '#dc2626' : '#059669',
      bg: gaps ? '#fee2e2' : '#dcfce7' },
    { icon:'✖',  val: absent,  label:'Absent',    color: absent ? '#dc2626' : 'var(--muted)',
      bg: absent ? '#fee2e2' : 'var(--surface2)' },
    { icon:'🔒', val: onLeave, label:'On Leave',  color:'#7c3aed', bg:'#ede9fe' },
    { icon:'💤', val: dayOff,  label:'Day Off',   color:'var(--muted)', bg:'var(--surface2)' },
    { icon:'👥', val: activeEmps.length, label:'Total Active', color:'var(--primary)', bg:'#eef2ff' },
  ];

  el.innerHTML = `
    ${holiday ? `<div class="hq-holiday-banner"
      style="background:${holiday.color}18;border-color:${holiday.color}40;color:${holiday.color}">
      ${holiday.emoji} <strong>${escH(holiday.name)}</strong> today
    </div>` : ''}
    <div class="hq-glance-grid">
      ${cards.map(c => `
        <div class="hq-glance-card" style="background:${c.bg};border-color:${c.color}30">
          <div class="hq-glance-icon">${c.icon}</div>
          <div class="hq-glance-val" style="color:${c.color}">${c.val}</div>
          <div class="hq-glance-label">${c.label}</div>
        </div>`).join('')}
    </div>`;
}

// ── Week Minimap ──────────────────────────────────────────────
function renderWeekMinimap() {
  const el = document.getElementById('hq-week-minimap');
  if (!el) return;

  const mon     = new Date(state.currentWeekMon + 'T00:00:00');
  const iso_now = todayStr();

  el.innerHTML = `<div class="week-minimap">
    ${DAYSFULL.map((day, di) => {
      const d        = new Date(mon);
      d.setDate(d.getDate() + di);
      const iso      = toDateStr(d);
      const isToday  = iso === iso_now;
      const holiday  = getHolidayForDate(iso);
      const alerts   = scanAlerts(iso);
      const gapCount = alerts.filter(a => a.type === ALERT_TYPES.GAP).length;
      const ovrCount = countDayOverrides(iso);
      const activeEmps = state.employees.filter(e => e.status === 'Active');
      const assigned = activeEmps.filter(e =>
        !isEmpDayOff(e.id, iso) && !isOnLeave(e.id, iso)
      ).length;

      return `<div class="minimap-day ${isToday ? 'minimap-today' : ''}"
        onclick="jumpToDay('${iso}')">
        <div class="minimap-dow">${DAYSSHORT[di]}</div>
        <div class="minimap-date">${d.getDate()}</div>
        <div class="minimap-badges">
          ${gapCount ? `<span class="minimap-badge badge-gap">${gapCount}⚠</span>` : ''}
          ${ovrCount ? `<span class="minimap-badge badge-ovr">${ovrCount}✎</span>` : ''}
          ${holiday  ? `<span class="minimap-badge badge-hol">${holiday.emoji}</span>` : ''}
        </div>
        <div class="minimap-assigned">${assigned} staff</div>
      </div>`;
    }).join('')}
  </div>`;
}

function jumpToDay(iso) {
  const d   = new Date(iso + 'T00:00:00');
  const dow = DAYSSHORT[(d.getDay() + 6) % 7];
  state.currentDateISO = iso;
  state.currentDow     = dow;
  state.currentWeekMon = toDateStr(getWeekMonday(d));
  showPage('schedule', document.getElementById('tab-schedule'));
  document.getElementById('tab-schedule')?.classList.add('active');
}

// ── Hour Watch ────────────────────────────────────────────────
function renderHourWatch() {
  const el = document.getElementById('hq-hour-watch');
  if (!el) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  if (!activeEmps.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">No active employees.</div>`;
    return;
  }

  const weekMon = state.currentWeekMon;
  const rows    = activeEmps.map(emp => {
    const used = calcScheduledHrsWeek(emp.id, weekMon);
    const cap  = emp.hourCap || DEFAULTHRSCAP;
    const pct  = Math.min((used / cap) * 100, 100);
    const over = used > cap;
    const warn = !over && pct >= 80;
    const color = over ? '#dc2626' : warn ? '#d97706' : '#059669';

    return { emp, used, cap, pct, over, warn, color };
  }).sort((a, b) => b.pct - a.pct);

  el.innerHTML = `<div class="hour-watch-grid">
    ${rows.map(({ emp, used, cap, pct, over, color }) => `
      <div class="hour-watch-row">
        <div class="hw-name">${escH(emp.name)}</div>
        <div class="hw-bar-wrap">
          <div class="hw-bar-track">
            <div class="hw-bar-fill" style="width:${pct}%;background:${color}"></div>
            ${pct >= 100 ? `<div class="hw-bar-over" style="width:${Math.min(((used-cap)/cap)*100,30)}%"></div>` : ''}
          </div>
          <span class="hw-hrs" style="color:${color}">
            ${used.toFixed(1)}/${cap}h ${over ? '⚠️' : ''}
          </span>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── Action Queue ──────────────────────────────────────────────
function renderActionQueue() {
  const el = document.getElementById('hq-action-queue');
  if (!el) return;

  const iso    = todayStr();
  const alerts = scanAlerts(iso).filter(a => !_dismissedAlerts.has(a.key));

  // Deduplicate
  const seen   = new Set();
  const unique = alerts.filter(a => {
    if (seen.has(a.key)) return false;
    seen.add(a.key); return true;
  });

  const high = unique.filter(a => a.severity === 'high');
  const warn = unique.filter(a => a.severity === 'warn');
  const info = unique.filter(a => a.severity === 'info');
  const all  = [...high, ...warn, ...info];

  if (!all.length) {
    el.innerHTML = `<div class="hq-all-clear">
      ✅ All clear — no actions needed right now
    </div>`;
    return;
  }

  el.innerHTML = `<div class="hq-action-list">
    ${all.map(a => `
      <div class="hq-action-item hq-action-${a.severity}">
        <span class="hq-action-icon">${severityIcon(a.severity)}</span>
        <span class="hq-action-msg">${escH(a.msg)}</span>
        <div class="hq-action-btns">
          ${a.action === 'fillGap'
            ? `<button class="btn btn-sm btn-primary"
                onclick="openFillGapWizard('${a.loc}',${a.si},'${a.iso}')">
                Fill Gap</button>`
            : ''}
          ${a.action === 'clearOverride'
            ? `<button class="btn btn-sm btn-warn"
                onclick="clearSingleOverride('${a.iso}',${a.si},'${a.empId}')">
                Clear Override</button>`
            : ''}
          ${a.action === 'viewEmployee'
            ? `<button class="btn btn-sm btn-ghost"
                onclick="showPage('staff',document.getElementById('tab-staff'))">
                View Staff</button>`
            : ''}
          ${a.action === 'viewSwap'
            ? `<button class="btn btn-sm btn-ghost"
                onclick="showPage('leave',document.getElementById('tab-leave'))">
                View Swaps</button>`
            : ''}
          <button class="btn btn-sm btn-ghost"
            onclick="dismissAlert('${escH(a.key)}');renderActionQueue();renderHQAlerts()">
            Dismiss</button>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── Fill Gap Wizard ───────────────────────────────────────────
function openFillGapWizard(loc, si, iso) {
  iso = iso || todayStr();
  const panel = document.getElementById('fill-gap-panel');
  if (!panel) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Available = not day off, not on leave, not absent, not blocked for this loc
  const available = activeEmps.filter(e => {
    if (isEmpDayOff(e.id, iso))        return false;
    if (isOnLeave(e.id, iso))          return false;
    if (state.absences?.[iso]?.[e.id]) return false;
    if (e.blocked?.includes(loc))      return false;
    return true;
  }).map(e => {
    const { loc: curLoc } = getResolvedLoc(iso, si, e.id);
    const hrs = calcScheduledHrsWeek(e.id, getWeekMonStr(iso));
    const cap = e.hourCap || DEFAULTHRSCAP;
    return { e, curLoc, hrs, cap, overCap: hrs >= cap };
  }).sort((a, b) => a.hrs - b.hrs); // least hours first

  panel.innerHTML = `
    <div class="fill-gap-wizard">
      <div class="fgw-header">
        <strong>Fill Gap</strong>
        <span style="color:${LOCCOLOR[loc]||'#888'};margin-left:8px">
          ${LOCLABEL[loc]} — ${TIMESLOTS[si]||si}
        </span>
        <button class="fgw-close" onclick="closeFillGapPanel()">×</button>
      </div>
      ${!available.length
        ? `<div class="fgw-empty">No available employees for this slot.</div>`
        : `<div class="fgw-list">
            ${available.map(({ e, curLoc, hrs, cap, overCap }) => `
              <div class="fgw-emp-row ${overCap ? 'fgw-overcap' : ''}">
                <div class="fgw-emp-info">
                  <span class="fgw-emp-name">${escH(e.name)}</span>
                  <span class="fgw-emp-cur" style="color:${LOCCOLOR[curLoc]||'var(--muted)'}">
                    currently: ${LOCLABEL[curLoc]||curLoc}
                  </span>
                  <span class="fgw-emp-hrs" style="color:${overCap?'#dc2626':'var(--muted)'}">
                    ${hrs.toFixed(1)}/${cap}h ${overCap ? '⚠️' : ''}
                  </span>
                </div>
                <button class="btn btn-sm btn-primary ${overCap ? 'btn-warn' : ''}"
                  onclick="assignGapFill('${e.id}','${iso}',${si},'${loc}')">
                  Assign
                </button>
              </div>`).join('')}
          </div>`}
    </div>`;

  panel.classList.remove('hidden');
}

function closeFillGapPanel() {
  document.getElementById('fill-gap-panel')?.classList.add('hidden');
}

function assignGapFill(empId, iso, si, loc) {
  if (!state.schedule)       state.schedule       = {};
  if (!state.schedule[iso])  state.schedule[iso]  = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  state.schedule[iso][si][empId] = loc;
  persistAll('schedule');
  closeFillGapPanel();
  renderAll();
  showToast(`Gap filled — ${LOCLABEL[loc]}`);
}

// ── Quick Actions Panel ───────────────────────────────────────
function toggleQuickActions() {
  const panel = document.getElementById('quick-actions-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderQuickActionsPanel();
}

function renderQuickActionsPanel() {
  const inner = document.getElementById('qa-inner');
  if (!inner) return;
  const iso    = todayStr();
  const emps   = state.employees.filter(e => e.status === 'Active');
  const empOpts = emps.map(e =>
    `<option value="${e.id}">${escH(e.name)}</option>`).join('');

  inner.innerHTML = `
    <div class="qa-section">
      <div class="qa-section-title">⚡ Mark Absent</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="qa-absent-emp" style="flex:1;min-width:120px;padding:7px 10px;
          border-radius:8px;border:1.5px solid var(--border2);font-size:13px">
          <option value="">Select employee…</option>
          ${empOpts}
        </select>
        <input type="date" id="qa-absent-date" value="${iso}"
          style="padding:7px 10px;border-radius:8px;border:1.5px solid var(--border2);font-size:13px">
        <button class="btn btn-sm btn-danger"
          onclick="qaMarkAbsent()">Mark</button>
      </div>
    </div>

    <div class="qa-section">
      <div class="qa-section-title">🔒 Quick Leave</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="qa-leave-emp" style="flex:1;min-width:120px;padding:7px 10px;
          border-radius:8px;border:1.5px solid var(--border2);font-size:13px">
          <option value="">Select employee…</option>
          ${empOpts}
        </select>
        <input type="date" id="qa-leave-from" value="${iso}"
          style="padding:7px 10px;border-radius:8px;border:1.5px solid var(--border2);font-size:13px">
        <input type="date" id="qa-leave-to" value="${iso}"
          style="padding:7px 10px;border-radius:8px;border:1.5px solid var(--border2);font-size:13px">
        <button class="btn btn-sm btn-leave"
          onclick="qaAddLeave()">Add Leave</button>
      </div>
    </div>

    <div class="qa-section">
      <div class="qa-section-title">📋 Apply Default to Week</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--muted);flex:1">
          Week of ${fmtDate(state.currentWeekMon)}
        </span>
        <button class="btn btn-sm btn-warn"
          onclick="qaApplyDefaultWeek()">Apply</button>
      </div>
    </div>

    <div class="qa-section">
      <div class="qa-section-title">📊 Jump to Today</div>
      <button class="btn btn-sm btn-primary" style="width:100%;justify-content:center"
        onclick="jumpToDay('${iso}');toggleQuickActions()">
        Open Today's Schedule
      </button>
    </div>`;
}

function qaMarkAbsent() {
  const empId = document.getElementById('qa-absent-emp')?.value;
  const iso   = document.getElementById('qa-absent-date')?.value;
  if (!empId || !iso) { showToast('Select employee and date'); return; }
  if (!state.absences)       state.absences       = {};
  if (!state.absences[iso])  state.absences[iso]  = {};
  state.absences[iso][empId] = true;
  persistAll('absences');
  renderAll();
  showToast('Marked absent');
}

function qaAddLeave() {
  const empId = document.getElementById('qa-leave-emp')?.value;
  const from  = document.getElementById('qa-leave-from')?.value;
  const to    = document.getElementById('qa-leave-to')?.value;
  if (!empId || !from || !to) { showToast('Fill all leave fields'); return; }
  if (!state.leaveRequests) state.leaveRequests = [];
  state.leaveRequests.push({
    id    : `leave-${Date.now()}`,
    empId, from, to,
    type  : 'annual',
    note  : 'Quick add',
    status: 'active',
  });
  persistAll('leaveRequests');
  renderAll();
  showToast('Leave added');
}

function qaApplyDefaultWeek() {
  if (!confirm('Apply default schedule to entire current week? This will overwrite existing overrides.')) return;
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d   = new Date(mon);
    d.setDate(d.getDate() + i);
    const iso = toDateStr(d);
    const dow = DAYSSHORT[i];
    if (!state.schedule[iso]) state.schedule[iso] = {};
    const def = state.defaultSchedule?.[dow] || {};
    TIMESLOTS.forEach((_, si) => {
      if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
      Object.keys(def[si] || {}).forEach(empId => {
        state.schedule[iso][si][empId] = def[si][empId];
      });
    });
  }
  persistAll('schedule');
  renderAll();
  showToast('Default applied to whole week');
  toggleQuickActions();
}
