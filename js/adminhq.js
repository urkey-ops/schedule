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
