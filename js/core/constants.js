// ── core/constants.js ─────────────────────────────────────────

// ── Locations ─────────────────────────────────────────────────
const LOC_CYCLE = ['gate','podium','mandir','field','giftshop','lunch','off'];

const ALLLOCS = ['gate','podium','mandir','field','giftshop','lunch','off','vac'];

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
const DAYSFULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ── Time slots ────────────────────────────────────────────────
const SLOT_DURATION_MINS = 30;
const SLOT_START_MINS    = 9 * 60;   // 09:00

const TIMESLOTS = [
  '09:00–09:30','09:30–10:00','10:00–10:30','10:30–11:00',
  '11:00–11:30','11:30–12:00','12:00–12:30','12:30–13:00',
  '13:00–13:30','13:30–14:00','14:00–14:30','14:30–15:00',
  '15:00–15:30','15:30–16:00','16:00–16:30','16:30–17:00',
];

const SLOT_HRS   = TIMESLOTS.length * (SLOT_DURATION_MINS / 60);
const LUNCHSLOTS = [6, 7];   // 12:00–13:00 indices

// ✅ FIX: SLOTEND was missing — computed end minute of last slot
const SLOTEND = SLOT_START_MINS + (TIMESLOTS.length * SLOT_DURATION_MINS);

// ── Defaults ──────────────────────────────────────────────────
const DEFAULTHRSCAP = 40;

// ── Alert types ───────────────────────────────────────────────
const ALERT_TYPES = {
  GAP       : 'gap',
  OVERHR    : 'overhr',
  ABSENT    : 'absent',
  LEAVE     : 'leave',
  SWAP      : 'swap',
  CONFLICT  : 'conflict',
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
