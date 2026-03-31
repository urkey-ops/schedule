// ── core/constants.js ─────────────────────────────────────────

const LOC_CYCLE    = ['gate','podium','mandir','field','giftshop','lunch','off'];
const ALLLOCS      = ['gate','podium','mandir','field','giftshop','lunch','off','vac'];
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

const LOC_HOURS = {
  gate     : { open:  6 * 60, close: 20 * 60 + 30 },
  podium   : { open:  9 * 60, close: 20 * 60 + 30 },
  mandir   : { open:  9 * 60, close: 20 * 60 + 30 },
  field    : { open:  9 * 60, close: 17 * 60       },
  giftshop : { open: 10 * 60, close: 18 * 60       },
  lunch    : { open: 12 * 60, close: 14 * 60       },
  off      : null,
  vac      : null,
};

// ── Minimum staff per required location ───────────────────────
const MIN_STAFF_PER_LOC = {
  gate    : 2,
  podium  : 1,
  mandir  : 1,
};

// ── Overtime thresholds ───────────────────────────────────────
const OVERTIME_SOFT_CAP = 40;
const OVERTIME_HARD_CAP = 48;

// ── Early gate ────────────────────────────────────────────────
const EARLY_GATE_START = 6 * 60;
const EARLY_GATE_END   = 9 * 60;

// ── Days ──────────────────────────────────────────────────────
const DAYSSHORT = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DAYSFULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ── Display grid ──────────────────────────────────────────────
const DISPLAY_START_MINS = 6 * 60;
const DISPLAY_END_MINS   = 21 * 60;
const SLOT_DURATION_MINS = 30;

const TIMESLOTS = (() => {
  const slots = [];
  for (let m = DISPLAY_START_MINS; m < DISPLAY_END_MINS; m += SLOT_DURATION_MINS) {
    const h1  = String(Math.floor(m / 60)).padStart(2,'0');
    const m1  = String(m % 60).padStart(2,'0');
    const m2  = m + SLOT_DURATION_MINS;
    const h2  = String(Math.floor(m2 / 60)).padStart(2,'0');
    const m2s = String(m2 % 60).padStart(2,'0');
    slots.push(`${h1}:${m1}–${h2}:${m2s}`);
  }
  return slots;
})();

const SLOT_START_MINS = DISPLAY_START_MINS;
const DEFAULTHRSCAP   = 40;

// ── Alert types ───────────────────────────────────────────────
const ALERT_TYPES = {
  GAP          : 'gap',
  UNDERSTAFFED : 'understaffed',
  OVERHR       : 'overhr',
  ABSENT       : 'absent',
  LEAVE        : 'leave',
  CONFLICT     : 'conflict',
  SWAP_PENDING : 'swap_pending',
  UNSCHEDULED  : 'unscheduled',
  UNPUBLISHED  : 'unpublished',
};

const ALERT_TYPE_LABELS = {
  gap          : 'Coverage Gaps',
  understaffed : 'Understaffed',
  overhr       : 'Over Hour Cap',
  absent       : 'Absent Staff',
  leave        : 'On Leave',
  conflict     : 'Schedule Conflicts',
  swap_pending : 'Pending Swaps',
  unscheduled  : 'Unscheduled Staff',
  unpublished  : 'Week Not Published',
};

const ALERT_TYPE_ICONS = {
  gap          : '⚠️',
  understaffed : '👥',
  overhr       : '⏱',
  absent       : '✖',
  leave        : '🔒',
  conflict     : '⚡',
  swap_pending : '🔄',
  unscheduled  : '📋',
  unpublished  : '📌',
};

// Lower number = higher priority in alert list
const ALERT_PRIORITY = {
  gap          : 1,
  understaffed : 2,
  absent       : 3,
  swap_pending : 4,
  overhr       : 5,
  unscheduled  : 6,
  unpublished  : 7,
  leave        : 8,
  conflict     : 9,
};

// ── Swap status ───────────────────────────────────────────────
const SWAP_STATUS = {
  PENDING   : 'pending',
  APPROVED  : 'approved',
  REJECTED  : 'rejected',
  CANCELLED : 'cancelled',
};

// ── Week publish status ───────────────────────────────────────
const WEEK_STATUS = {
  DRAFT     : 'draft',
  PUBLISHED : 'published',
};

// ── US Federal Holidays 2025–2026 ─────────────────────────────
const US_FEDERAL_HOLIDAYS = {
  '2025-01-01': { name: "New Year's Day",         emoji: '🎆', color: '#4F8EF7' },
  '2025-01-20': { name: 'Martin Luther King Jr.', emoji: '✊', color: '#4F8EF7' },
  '2025-02-17': { name: "Presidents' Day",        emoji: '🇺🇸', color: '#4F8EF7' },
  '2025-05-26': { name: 'Memorial Day',           emoji: '🎖️', color: '#4F8EF7' },
  '2025-06-19': { name: 'Juneteenth',             emoji: '✊', color: '#4F8EF7' },
  '2025-07-04': { name: 'Independence Day',       emoji: '🎇', color: '#4F8EF7' },
  '2025-09-01': { name: 'Labor Day',              emoji: '🔧', color: '#4F8EF7' },
  '2025-10-13': { name: 'Columbus Day',           emoji: '⚓', color: '#4F8EF7' },
  '2025-11-11': { name: 'Veterans Day',           emoji: '🎖️', color: '#4F8EF7' },
  '2025-11-27': { name: 'Thanksgiving',           emoji: '🦃', color: '#4F8EF7' },
  '2025-12-25': { name: 'Christmas Day',          emoji: '🎄', color: '#4F8EF7' },
  '2026-01-01': { name: "New Year's Day",         emoji: '🎆', color: '#4F8EF7' },
  '2026-01-19': { name: 'Martin Luther King Jr.', emoji: '✊', color: '#4F8EF7' },
  '2026-02-16': { name: "Presidents' Day",        emoji: '🇺🇸', color: '#4F8EF7' },
  '2026-05-25': { name: 'Memorial Day',           emoji: '🎖️', color: '#4F8EF7' },
  '2026-06-19': { name: 'Juneteenth',             emoji: '✊', color: '#4F8EF7' },
  '2026-07-04': { name: 'Independence Day',       emoji: '🎇', color: '#4F8EF7' },
  '2026-09-07': { name: 'Labor Day',              emoji: '🔧', color: '#4F8EF7' },
  '2026-10-12': { name: 'Columbus Day',           emoji: '⚓', color: '#4F8EF7' },
  '2026-11-11': { name: 'Veterans Day',           emoji: '🎖️', color: '#4F8EF7' },
  '2026-11-26': { name: 'Thanksgiving',           emoji: '🦃', color: '#4F8EF7' },
  '2026-12-25': { name: 'Christmas Day',          emoji: '🎄', color: '#4F8EF7' },
};

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
