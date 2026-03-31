// ── domain/publish.js ─────────────────────────────────────────

function isWeekPublished(weekMon) {
  return !!(state.publishedWeeks?.[weekMon]);
}

function isWeekEditable(weekMon) {
  // Draft weeks are always editable by admin; published weeks show a warning
  if (state.mode !== 'admin') return false;
  return true; // Admin can always override even published weeks
}

function getPublishStatus(weekMon) {
  return isWeekPublished(weekMon) ? WEEK_STATUS.PUBLISHED : WEEK_STATUS.DRAFT;
}

function publishWeek(weekMon) {
  if (!state.publishedWeeks) state.publishedWeeks = {};
  state.publishedWeeks[weekMon] = { publishedAt: Date.now(), by: 'admin' };
  persistAll('publishedWeeks');
  logAction('publish_week', `Week of ${weekMon} published`);
  renderWeekNav();
  showToast(`Week of ${weekMon} published ✓`);
}

function unpublishWeek(weekMon) {
  if (!state.publishedWeeks?.[weekMon]) return;
  delete state.publishedWeeks[weekMon];
  persistAll('publishedWeeks');
  logAction('unpublish_week', `Week of ${weekMon} set back to draft`);
  renderWeekNav();
  showToast('Week set back to draft');
}

function togglePublishWeek(weekMon) {
  if (isWeekPublished(weekMon)) unpublishWeek(weekMon);
  else publishWeek(weekMon);
}

// Copy all shifts from one week to another
function copyWeekForward(fromWeekMon, toWeekMon) {
  if (!confirm(`Copy rota from week of ${fromWeekMon} to week of ${toWeekMon}?\nExisting shifts in target week will be replaced.`)) return;

  pushUndo('Copy week forward', state);

  const fromMon = new Date(fromWeekMon + 'T00:00:00');
  const toMon   = new Date(toWeekMon   + 'T00:00:00');

  for (let di = 0; di < 7; di++) {
    const fromDay = new Date(fromMon); fromDay.setDate(fromDay.getDate() + di);
    const toDay   = new Date(toMon);   toDay.setDate(toDay.getDate()   + di);
    const fromIso = toDateStr(fromDay);
    const toIso   = toDateStr(toDay);

    // Copy shifts
    if (state.shifts?.[fromIso]?.length) {
      state.shifts[toIso] = state.shifts[fromIso].map(s => ({ ...s, id: uid() }));
    }
    // Copy early gate
    if (state.earlyGate?.[fromIso]) {
      if (!state.earlyGate) state.earlyGate = {};
      state.earlyGate[toIso] = state.earlyGate[fromIso];
    }
  }

  markDirty('shifts');
  markDirty('earlyGate');
  persistAll();
  logAction('copy_week', `Copied week ${fromWeekMon} → ${toWeekMon}`);
  showToast(`Week copied to ${toWeekMon}`);

  // Navigate to the new week
  state.currentWeekMon = toWeekMon;
  const toMonDate = new Date(toWeekMon + 'T00:00:00');
  state.currentDateISO = toDateStr(toMonDate);
  state.currentDow     = DAYSSHORT[0];
  renderWeekNav();
  renderRota();
}
