// ── Holiday helpers ───────────────────────────────────────────

function initHolidays() {
  // Merge defaults — admin overrides take priority
  const base = { ...US_FEDERAL_HOLIDAYS, ...HINDU_FESTIVALS_DEFAULT };
  if (!state.holidays || Object.keys(state.holidays).length === 0) {
    state.holidays = JSON.parse(JSON.stringify(base));
  } else {
    // Add any new default holidays not yet in state
    Object.entries(base).forEach(([iso, h]) => {
      if (!state.holidays[iso]) state.holidays[iso] = h;
    });
  }
}

function getHolidayForDate(iso) {
  return state.holidays?.[iso] || null;
}

function renderHolidaysPage() {
  const tbody = document.getElementById('holidays-body');
  if (!tbody) return;

  const all = Object.entries(state.holidays || {})
    .sort(([a],[b]) => a.localeCompare(b));

  tbody.innerHTML = all.map(([iso, h]) => {
    const d = new Date(iso + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    return `<tr>
      <td>
        <input type="date" class="holiday-date-input" value="${iso}"
          onchange="updateHolidayDate('${iso}', this.value)"
          style="width:150px;font-size:13px;padding:6px 8px">
      </td>
      <td>${dateLabel}</td>
      <td>
        <input type="text" value="${escH(h.name)}"
          onchange="updateHolidayName('${iso}', this.value)"
          style="width:180px;font-size:13px;padding:6px 8px">
      </td>
      <td>
        <input type="text" value="${escH(h.emoji)}"
          onchange="updateHolidayEmoji('${iso}', this.value)"
          style="width:60px;font-size:16px;padding:6px 8px;text-align:center">
      </td>
      <td>
        <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${h.color};margin-right:6px;vertical-align:middle"></span>
        <select onchange="updateHolidayColor('${iso}', this.value)" style="font-size:12px;padding:4px 6px;width:auto">
          <option value="#4F8EF7"  ${h.color==='#4F8EF7' ?'selected':''}>Blue (Federal)</option>
          <option value="#EA580C"  ${h.color==='#EA580C' ?'selected':''}>Saffron (Hindu)</option>
          <option value="#D97706"  ${h.color==='#D97706' ?'selected':''}>Amber (Diwali)</option>
          <option value="#059669"  ${h.color==='#059669' ?'selected':''}>Green</option>
          <option value="#7C3AED"  ${h.color==='#7C3AED' ?'selected':''}>Purple</option>
        </select>
      </td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteHoliday('${iso}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function updateHolidayDate(oldIso, newIso) {
  if (!newIso || newIso === oldIso) return;
  const h = state.holidays[oldIso];
  delete state.holidays[oldIso];
  state.holidays[newIso] = h;
  persistAll();
  renderHolidaysPage();
  updateDayPillDots();
  showToast('Holiday date updated');
}

function updateHolidayName(iso, name) {
  if (!state.holidays[iso]) return;
  state.holidays[iso].name = name;
  persistAll();
  showToast('Holiday name updated');
}

function updateHolidayEmoji(iso, emoji) {
  if (!state.holidays[iso]) return;
  state.holidays[iso].emoji = emoji;
  persistAll();
}

function updateHolidayColor(iso, color) {
  if (!state.holidays[iso]) return;
  state.holidays[iso].color = color;
  persistAll();
  renderHolidaysPage();
}

function deleteHoliday(iso) {
  if (!confirm(`Delete ${state.holidays[iso]?.name}?`)) return;
  delete state.holidays[iso];
  persistAll();
  renderHolidaysPage();
  updateDayPillDots();
  showToast('Holiday removed');
}

function addHoliday() {
  const iso   = document.getElementById('new-holiday-date').value;
  const name  = document.getElementById('new-holiday-name').value.trim();
  const emoji = document.getElementById('new-holiday-emoji').value.trim() || '📅';
  const color = document.getElementById('new-holiday-color').value;
  if (!iso || !name) { alert('Date and name are required.'); return; }
  state.holidays[iso] = { name, emoji, color };
  persistAll();
  renderHolidaysPage();
  updateDayPillDots();
  document.getElementById('new-holiday-date').value  = '';
  document.getElementById('new-holiday-name').value  = '';
  document.getElementById('new-holiday-emoji').value = '';
  showToast('Holiday added');
}
