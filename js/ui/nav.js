// ── ui/nav.js ─────────────────────────────────────────────────

function showPage(name, tabEl) {
  const publicPages = ['live', 'grand'];
  if (!publicPages.includes(name) && state.mode !== 'admin') return;

  if (name !== 'grand' && typeof stopGrandRefresh === 'function') stopGrandRefresh();

  document.querySelectorAll('.page').forEach(p    => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  const wnb = document.getElementById('week-nav-bar');

  if (name === 'rota') {
    wnb?.classList.remove('hidden');
    renderWeekNav();
    onRotaPageShow();
  } else {
    wnb?.classList.add('hidden');
  }

  if (name === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
  if (name === 'leave')    { renderLeave();  renderAlertsBar('leave-alerts-bar', todayStr()); }
  if (name === 'live')     renderLiveBoard();
  if (name === 'grand')    renderGrandView();
  if (name === 'holidays') renderHolidaysPage();
}

function renderAll() {
  renderLiveBoard();
  if (state.mode === 'admin') {
    renderGlobalAlerts();
    const active = document.querySelector('.page.active')?.id?.replace('page-','');
    if (active === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
    if (active === 'leave')    { renderLeave();  renderAlertsBar('leave-alerts-bar', todayStr()); }
    if (active === 'rota')     onRotaPageShow();
    if (active === 'holidays') renderHolidaysPage();
  }
  const grandActive = document.getElementById('page-grand')?.classList.contains('active');
  if (grandActive && typeof renderGrandView === 'function') renderGrandView();
}

function shiftWeek(delta) {
  const d = new Date(state.currentWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  const curDow = DAYSSHORT.indexOf(state.currentDow);
  const newDay = new Date(d);
  newDay.setDate(newDay.getDate() + (curDow >= 0 ? curDow : 0));
  state.currentDateISO = toDateStr(newDay);
  renderWeekNav();
  renderRota();
}

function goToToday() {
  state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  state.currentDateISO = todayStr();
  state.currentDow     = DAYSSHORT[(new Date().getDay() + 6) % 7];
  renderWeekNav();
  renderRota();
}

function renderWeekNav() {
  const wLabel  = document.getElementById('week-label');
  const pillsEl = document.getElementById('day-pills');
  const mon     = new Date(state.currentWeekMon + 'T00:00:00');
  const end     = new Date(mon); end.setDate(end.getDate() + 6);

  if (wLabel) wLabel.textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  if (!pillsEl) return;
  pillsEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d       = new Date(mon); d.setDate(d.getDate() + di);
    const iso     = toDateStr(d);
    const isToday = iso === todayStr();
    const isActive= iso === state.currentDateISO;
    const holiday = getHolidayForDate(iso);
    const gaps    = typeof getCoverageGaps === 'function' ? getCoverageGaps(iso) : [];
    const hasGap  = gaps.length > 0;
    const hasOvr  = countDayOverrides(iso) > 0;

    return `<button class="day-pill ${isActive?'active':''} ${isToday?'today':''}
      ${hasGap?'has-gap':''} ${hasOvr?'has-ovr':''} ${holiday?'has-hday':''}"
      onclick="selectDay('${iso}','${dow}')">
      <span class="gap-dot"></span><span class="ovr-dot"></span>
      <span class="hday-dot" ${holiday?`style="background:${holiday.color}"` : ''}></span>
      ${dow} ${d.getDate()}
      ${holiday?`<span style="font-size:9px;display:block;line-height:1">${holiday.emoji}</span>`:''}
    </button>`;
  }).join('');
}

function selectDay(iso, dow) {
  state.currentDateISO = iso;
  state.currentDow     = dow;
  renderWeekNav();
  renderRota();
  renderAlertsBar('rota-alerts-bar', iso);
}

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
  renderRota();
}

function setDensity() {}

function setLiveView(view) {
  ['locations','my'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view);
    document.getElementById(`lvt-${v}`)?.classList.toggle('active', v === view);
  });
  if (view === 'my')        renderMySchedule();
  if (view === 'locations') renderLiveBoard();
}

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

function updateDayPillDots() { renderWeekNav(); }
