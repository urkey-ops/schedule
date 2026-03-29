// ── core/constants.js ─────────────────────────────────────────

// ── Locations ─────────────────────────────────────────────────
const LOC_CYCLE = ['gate','podium','mandir','field','giftshop','lunch','off'];
const ALLLOCS   = ['gate','podium','mandir','field','giftshop','lunch','off','vac'];
const REQUIREDLOCS = ['gate','podium','mandir'];

const LOCLABEL = {
  gate     : 'Gate',
  podium   : 'Podium',
  mandir   : 'Mandir',
  field    : 'Field Work',
  giftshop : 'Gift Shop',
  lunch    : 'Lunch',
  off      : 'OFF',
  vac      : 'Vacation',
};

const LOCCOLOR = {
  gate     : '#4F8EF7',
  podium   : '#EA580C',
  mandir   : '#7C3AED',
  field    : '#059669',
  giftshop : '#D97706',
  lunch    : '#94A3B8',
  off      : '#CBD5E1',
  vac      : '#A855F7',
};

const LOCCLS = {
  gate     : 'loc-gate',
  podium   : 'loc-podium',
  mandir   : 'loc-mandir',
  field    : 'loc-field',
  giftshop : 'loc-giftshop',
  lunch    : 'loc-lunch',
  off      : 'loc-off',
  vac      : 'loc-vac',
};

// ── Days ──────────────────────────────────────────────────────
const DAYSSHORT = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DAYSFULL  = ['Monday','Tuesday','Wednesday','Thursday',
                   'Friday','Saturday','Sunday'];

// ── Time slots ────────────────────────────────────────────────
const SLOT_DURATION_MINS = 30;
const SLOT_START_MINS    = 9 * 60; // 09:00

const TIMESLOTS = [
  '09:00–09:30','09:30–10:00','10:00–10:30','10:30–11:00',
  '11:00–11:30','11:30–12:00','12:00–12:30','12:30–13:00',
  '13:00–13:30','13:30–14:00','14:00–14:30','14:30–15:00',
  '15:00–15:30','15:30–16:00','16:00–16:30','16:30–17:00',
];

// FIX: SLOT_HRS was a single number — schedule.js uses SLOT_HRS[si] (per-slot lookup).
// Changed to a per-slot array so calcScheduledHrsWeek works correctly.
const SLOT_HRS   = TIMESLOTS.map(() => SLOT_DURATION_MINS / 60);
const LUNCHSLOTS = [6, 7];
const SLOTEND    = SLOT_START_MINS + (TIMESLOTS.length * SLOT_DURATION_MINS);

// ── Defaults ──────────────────────────────────────────────────
const DEFAULTHRSCAP = 40;

// ── Alert types ───────────────────────────────────────────────
const ALERT_TYPES = {
  GAP      : 'gap',
  OVERHR   : 'overhr',   // FIX: was missing — adminhq.js references ALERT_TYPES.OVERHR
  ABSENT   : 'absent',
  LEAVE    : 'leave',
  SWAP     : 'swap',
  CONFLICT : 'conflict',
};

const ALERT_TYPE_LABELS = {
  gap      : 'Coverage Gaps',
  overhr   : 'Hour Cap Exceeded',
  absent   : 'Absent Staff',
  leave    : 'On Leave',
  swap     : 'Day-Off Swaps',
  conflict : 'Schedule Conflicts',
};

const ALERT_TYPE_ICONS = {
  gap      : '⚠️',
  overhr   : '⏱',
  absent   : '✖',
  leave    : '🔒',
  swap     : '🔄',
  conflict : '⚡',
};

// ── US Federal Holidays 2025–2026 ─────────────────────────────
const US_FEDERAL_HOLIDAYS = {
  '2025-01-01': { name: "New Year's Day",          emoji: '🎆', color: '#4F8EF7' },
  '2025-01-20': { name: 'Martin Luther King Jr.',  emoji: '✊', color: '#4F8EF7' },
  '2025-02-17': { name: "Presidents' Day",         emoji: '🇺🇸', color: '#4F8EF7' },
  '2025-05-26': { name: 'Memorial Day',            emoji: '🎖️', color: '#4F8EF7' },
  '2025-06-19': { name: 'Juneteenth',              emoji: '✊', color: '#4F8EF7' },
  '2025-07-04': { name: 'Independence Day',        emoji: '🎇', color: '#4F8EF7' },
  '2025-09-01': { name: 'Labor Day',               emoji: '🔧', color: '#4F8EF7' },
  '2025-10-13': { name: 'Columbus Day',            emoji: '⚓', color: '#4F8EF7' },
  '2025-11-11': { name: 'Veterans Day',            emoji: '🎖️', color: '#4F8EF7' },
  '2025-11-27': { name: 'Thanksgiving',            emoji: '🦃', color: '#4F8EF7' },
  '2025-12-25': { name: 'Christmas Day',           emoji: '🎄', color: '#4F8EF7' },
  '2026-01-01': { name: "New Year's Day",          emoji: '🎆', color: '#4F8EF7' },
  '2026-01-19': { name: 'Martin Luther King Jr.',  emoji: '✊', color: '#4F8EF7' },
  '2026-02-16': { name: "Presidents' Day",         emoji: '🇺🇸', color: '#4F8EF7' },
  '2026-05-25': { name: 'Memorial Day',            emoji: '🎖️', color: '#4F8EF7' },
  '2026-06-19': { name: 'Juneteenth',              emoji: '✊', color: '#4F8EF7' },
  '2026-07-04': { name: 'Independence Day',        emoji: '🎇', color: '#4F8EF7' },
  '2026-09-07': { name: 'Labor Day',               emoji: '🔧', color: '#4F8EF7' },
  '2026-10-12': { name: 'Columbus Day',            emoji: '⚓', color: '#4F8EF7' },
  '2026-11-11': { name: 'Veterans Day',            emoji: '🎖️', color: '#4F8EF7' },
  '2026-11-26': { name: 'Thanksgiving',            emoji: '🦃', color: '#4F8EF7' },
  '2026-12-25': { name: 'Christmas Day',           emoji: '🎄', color: '#4F8EF7' },
};

// ── Hindu / Indian Festivals 2025–2026 ────────────────────────
// FIX: removed duplicate key '2025-08-09' (Nag Panchami was silently dropped).
// Nag Panchami moved to its own key '2025-08-08' (it falls a day earlier anyway).
const HINDU_FESTIVALS_DEFAULT = {
  '2025-01-14': { name: 'Makar Sankranti',  emoji: '🪁', color: '#EA580C' },
  '2025-01-29': { name: 'Vasant Panchami',  emoji: '🌸', color: '#EA580C' },
  '2025-02-26': { name: 'Maha Shivratri',   emoji: '🔱', color: '#7C3AED' },
  '2025-03-14': { name: 'Holi',             emoji: '🎨', color: '#EA580C' },
  '2025-03-30': { name: 'Ram Navami',       emoji: '🏹', color: '#EA580C' },
  '2025-04-06': { name: 'Hanuman Jayanti',  emoji: '🙏', color: '#EA580C' },
  '2025-08-08': { name: 'Nag Panchami',     emoji: '🐍', color: '#059669' },
  '2025-08-09': { name: 'Raksha Bandhan',   emoji: '🪢', color: '#EA580C' },
  '2025-08-16': { name: 'Janmashtami',      emoji: '🦚', color: '#7C3AED' },
  '2025-09-02': { name: 'Ganesh Chaturthi', emoji: '🐘', color: '#EA580C' },
  '2025-10-02': { name: 'Gandhi Jayanti',   emoji: '🕊️', color: '#059669' },
  '2025-10-03': { name: 'Navratri Begins',  emoji: '🌺', color: '#EA580C' },
  '2025-10-12': { name: 'Dussehra',         emoji: '🏹', color: '#EA580C' },
  '2025-10-20': { name: 'Diwali',           emoji: '🪔', color: '#D97706' },
  '2025-10-22': { name: 'Govardhan Puja',   emoji: '🙏', color: '#EA580C' },
  '2025-10-23': { name: 'Bhai Dooj',        emoji: '👫', color: '#EA580C' },
  '2025-11-05': { name: 'Chhath Puja',      emoji: '☀️', color: '#EA580C' },
  '2026-01-14': { name: 'Makar Sankranti',  emoji: '🪁', color: '#EA580C' },
  '2026-02-15': { name: 'Vasant Panchami',  emoji: '🌸', color: '#EA580C' },
  '2026-02-17': { name: 'Maha Shivratri',   emoji: '🔱', color: '#7C3AED' },
  '2026-03-04': { name: 'Holi',             emoji: '🎨', color: '#EA580C' },
  '2026-03-28': { name: 'Ram Navami',       emoji: '🏹', color: '#EA580C' },
  '2026-08-23': { name: 'Raksha Bandhan',   emoji: '🪢', color: '#EA580C' },
  '2026-08-28': { name: 'Janmashtami',      emoji: '🦚', color: '#7C3AED' },
  '2026-09-19': { name: 'Ganesh Chaturthi', emoji: '🐘', color: '#EA580C' },
  '2026-10-09': { name: 'Navratri Begins',  emoji: '🌺', color: '#EA580C' },
  '2026-10-19': { name: 'Dussehra',         emoji: '🏹', color: '#EA580C' },
  '2026-11-08': { name: 'Diwali',           emoji: '🪔', color: '#D97706' },
};
