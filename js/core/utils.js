// ── core/utils.js ─────────────────────────────────────────────

function v(id)   { return document.getElementById(id)?.value?.trim() || ''; }
function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function uid() {
  return Math.random().toString(36).slice(2,9) + Date.now().toString(36);
}

function todayStr() {
  return toDateStr(new Date());
}

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day:'numeric', month:'short', year:'numeric'
  });
}

function getWeekMonday(d) {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // Mon=0
  day.setDate(day.getDate() - dow);
  return day;
}

function getWeekMonStr(iso) {
  return toDateStr(getWeekMonday(new Date(iso + 'T00:00:00')));
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function currentSlotIdx() {
  const mins = nowMins();
  for (let i = TIMESLOTS.length - 1; i >= 0; i--) {
    const [h, m] = SLOT_START_MINS[i] !== undefined
      ? [Math.floor(SLOT_START_MINS[i]/60), SLOT_START_MINS[i]%60]
      : parseSlotTime(TIMESLOTS[i]);
    if (mins >= h * 60 + m) return i;
  }
  return -1;
}

function parseSlotTime(slotStr) {
  // Expects "HH:MM – HH:MM" format, returns [h, m] of start
  const match = slotStr.match(/^(\d{1,2}):(\d{2})/);
  return match ? [parseInt(match[1]), parseInt(match[2])] : [0, 0];
}
