// ── ui/nav.js ─────────────────────────────────────────────────

function showPage(name, tabEl) {
  const publicPages = ['live', 'grand'];
  if (!publicPages.includes(name) && state.mode !== 'admin') return;

  if (name !== 'grand'   && typeof stopGrandRefresh === 'function') stopGrandRefresh();
  if (name !== 'adminhq' && typeof stopHQRefresh    === 'function') stopHQRefresh();

  document.querySelectorAll('.page').forEach(p    => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  const wnb = document.getElementById('week-nav-bar');

  if (name === 'schedule') {
    wnb?.classList.remove('hidden');
    renderWeekNav();
    renderSchedule();
    renderAlertsBar('schedule-alerts-bar', state.currentDateISO);
    const rf = document.getElementById('range-fill-weekly');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('weekly');
  } else if (name === 'default') {
    wnb?.classList.add('hidden');
    renderDowPills();
    renderDefaultSchedule();
    renderAlertsBar('default-alerts-bar', todayStr());
    const rf = document.getElementById('range-fill-default');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('default');
  } else {
    wnb?.classList.add('hidden');
  }

  if (name === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
  if (name === 'leave')    { renderLeave();  renderSwaps();      renderAlertsBar('leave-alerts-bar', todayStr()); }
  if (name === 'live')     renderLiveBoard();
  if (name === 'grand')    renderGrandView();
  if (name === 'holidays') renderHolidaysPage();

  if (name === 'adminhq') {
    const dl = document.getElementById('hq-date-label');
    if (dl) dl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
    const wl = document.getElementById('hq-week-label');
    if (wl) {
      const mon = new Date(state.currentWeekMon+'T00:00:00');
      const end = new Date(mon); end.setDate(end.getDate()+6);
      wl.textContent = `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
        end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
    }
    renderAdminHQ();
  }
}

function renderAll() {
  renderLiveBoard();

  if (state.mode === 'admin') {
    renderGlobalAlerts();
    const active = document.querySelector('.page.active')?.id?.replace('page-','');
    if (active === 'adminhq')  renderAdminHQ();
    if (active === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
    if (active === 'leave')    { renderLeave();  renderSwaps();      renderAlertsBar('leave-alerts-bar', todayStr()); }
    if (active === 'default')  { renderDowPills(); renderDefaultSchedule(); renderAlertsBar('default-alerts-bar', todayStr()); }
    if (active === 'schedule') { renderWeekNav(); renderSchedule();  renderAlertsBar('schedule-alerts-bar', state.currentDateISO); }
    if (active === 'holidays') renderHolidaysPage();
  }

  const grandActive = document.getElementById('page-grand')?.classList.contains('active');
  if (grandActive && typeof renderGrandView === 'function') renderGrandView();
}

// ── Week nav ──────────────────────────────────────────────────

function shiftWeek(delta) {
  const d = new Date(state.currentWeekMon+'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  const curDow = DAYSSHORT.indexOf(state.currentDow);
  const newDay = new Date(d);
  newDay.setDate(newDay.getDate() + (curDow >= 0 ? curDow : 0));
  state.currentDateISO = toDateStr(newDay);
  renderWeekNav();
  renderSchedule();
}

function goToToday() {
  const mon = getWeekMonday(new Date());
  state.currentWeekMon = toDateStr(mon);
  state.currentDateISO = todayStr();
  state.currentDow     = DAYSSHORT[(new Date().getDay()+6)%7];
  renderWeekNav();
  renderSchedule();
}

function renderWeekNav() {
  const wLabel  = document.getElementById('week-label');
  const pillsEl = document.getElementById('day-pills');
  const mon = new Date(state.currentWeekMon+'T00:00:00');
  const end = new Date(mon); end.setDate(end.getDate()+6);

  if (wLabel) wLabel.textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  if (!pillsEl) return;
  pillsEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d       = new Date(mon); d.setDate(d.getDate()+di);
    const iso     = toDateStr(d);
    const isToday = iso === todayStr();
    const isActive= iso === state.currentDateISO;
    const holiday = getHolidayForDate(iso);
    const alerts  = typeof scanAlerts === 'function' ? scanAlerts(iso) : [];
    const hasGap  = alerts.some(a => a.type === ALERT_TYPES.GAP);
    const hasOvr  = countDayOverrides(iso) > 0;

    return `<button class="day-pill ${isActive?'active':''} ${isToday?'today':''}
      ${hasGap?'has-gap':''} ${hasOvr?'has-ovr':''} ${holiday?'has-hday':''}"
      onclick="selectDay('${iso}','${dow}')">
      <span class="gap-dot"></span>
      <span class="ovr-dot"></span>
      <span class="hday-dot"
        ${holiday?`style="background:${holiday.color}"`:''}></span>
      ${dow} ${d.getDate()}
      ${holiday?`<span style="font-size:9px;display:block;line-height:1">
        ${holiday.emoji}</span>`:''}
    </button>`;
  }).join('');
}

function selectDay(iso, dow) {
  state.currentDateISO = iso;
  state.currentDow     = dow;
  renderWeekNav();
  renderSchedule();
  renderAlertsBar('schedule-alerts-bar', iso);
}

// ── DOW pills ─────────────────────────────────────────────────

function renderDowPills() {
  const container = document.getElementById('dow-pills');
  if (!container) return;
  container.innerHTML = DAYSSHORT.map((d, i) =>
    `<button class="day-pill ${state.currentDow===d?'active':''}"
      onclick="selectDow('${d}')">${DAYSFULL[i]}</button>`
  ).join('');
}

function selectDow(dow) {
  state.currentDow = dow;
  renderDowPills();
  renderDefaultSchedule();
}

// ── HQ week controls ──────────────────────────────────────────

function hqShiftWeek(delta) {
  const d = new Date(state.currentWeekMon+'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  renderWeekMinimap();
  renderHourWatch();
  const hwl = document.getElementById('hq-week-label');
  if (hwl) {
    const mon = new Date(state.currentWeekMon+'T00:00:00');
    const end = new Date(mon); end.setDate(end.getDate()+6);
    hwl.textContent = `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
  }
}

function hqGoToToday() {
  state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  renderWeekMinimap();
  renderHourWatch();
}

// ── Density ───────────────────────────────────────────────────

function setDensity(d) {
  document.querySelectorAll('.density-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`density-${d}`)?.classList.add('active');
  document.querySelectorAll('.sched-grid').forEach(t => {
    t.classList.toggle('density-compact', d === 'compact');
    t.classList.toggle('density-normal',  d === 'normal');
  });
}

// ── Advanced tools toggle ─────────────────────────────────────

function toggleAdv() {
  const body = document.getElementById('adv-body');
  const btn  = document.getElementById('adv-toggle');
  if (!body) return;
  body.classList.toggle('open');
  btn?.classList.toggle('open');
  if (body.classList.contains('open')) {
    const container = document.getElementById('copy-day-btns');
    if (!container) return;
    const mon = new Date(state.currentWeekMon+'T00:00:00');
    container.innerHTML = DAYSSHORT.map((dow, di) => {
      const d   = new Date(mon); d.setDate(d.getDate()+di);
      const iso = toDateStr(d);
      if (iso === state.currentDateISO) return '';
      return `<button class="btn btn-sm btn-ghost"
        onclick="copyDayTo('${iso}')">${dow}</button>`;
    }).filter(Boolean).join('');
  }
}

// ── Live view toggle ──────────────────────────────────────────

function setLiveView(view) {
  ['locations','my','history'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view);
    document.getElementById(`lvt-${v}`)?.classList.toggle('active', v === view);
  });
  if (view === 'my')        renderMySchedule();
  if (view === 'history')   renderHistoryToday();
  if (view === 'locations') renderLiveBoard();
}

// ── Midnight refresh ──────────────────────────────────────────

function scheduleMidnightRefresh() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 30, 0);
  setTimeout(() => {
    state.currentDateISO = todayStr();
    state.currentDow     = DAYSSHORT[(new Date().getDay()+6)%7];
    renderAll();
    scheduleMidnightRefresh();
  }, next - now);
}

// ── Alias used by holidays.js ─────────────────────────────────
// holidays.js calls updateDayPillDots() after mutating state.holidays.
// It re-renders the week nav pills so holiday dots refresh immediately.
function updateDayPillDots() {
  renderWeekNav();
}
