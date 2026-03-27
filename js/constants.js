const DAYS_SHORT = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DAYS_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const TIME_SLOTS = [
  '6:00–7:00 AM','7:00–8:00 AM','8:00–9:00 AM',
  '9:00–10:00 AM','10:00–11:00 AM','11:00 AM–12:00 PM',
  '12:00–12:30 PM','12:30–1:00 PM','1:00–1:30 PM',
  '1:30–2:30 PM','2:30–3:30 PM','3:30–4:30 PM',
  '4:30–5:30 PM','5:30–6:30 PM','6:30–7:30 PM','7:30–8:30 PM'
];

const SLOT_START = [6,7,8,9,10,11,12,12.5,13,13.5,14.5,15.5,16.5,17.5,18.5,19.5];
const SLOT_END   = [7,8,9,10,11,12,12.5,13,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5];
const SLOT_HRS   = SLOT_START.map((s,i) => SLOT_END[i] - s);

const LUNCH_SLOTS   = [6,7,8];
const DAY_START     = 6;
const DAY_END       = 20.5;
const DEFAULT_HRS_CAP = 40;
const MAX_HRS_CAP     = 60;

const LOC_OPTIONS = [
  { val:'gate',     label:'Gate',      cls:'loc-gate'     },
  { val:'podium',   label:'Podium',    cls:'loc-podium'   },
  { val:'mandir',   label:'Mandir',    cls:'loc-mandir'   },
  { val:'field',    label:'Field Work',cls:'loc-field'    },
  { val:'giftshop', label:'Gift Shop', cls:'loc-giftshop' },
  { val:'lunch',    label:'Lunch',     cls:'loc-lunch'    },
  { val:'off',      label:'OFF',       cls:'loc-off'      },
  { val:'vac',      label:'VACATION',  cls:'loc-vac'      },
];

const LOC_CLS   = Object.fromEntries(LOC_OPTIONS.map(l=>[l.val,l.cls]));
const LOC_LABEL = Object.fromEntries(LOC_OPTIONS.map(l=>[l.val,l.label]));
const LOC_COLOR = {
  gate:'#4F8EF7', podium:'#059669', mandir:'#EA580C',
  field:'#6B7280', giftshop:'#0891B2', lunch:'#D97706',
  off:'#F1F3F5', vac:'#7C3AED'
};

const ALL_LOCS      = ['gate','podium','mandir','field','giftshop'];
const REQUIRED_LOCS = ['gate','podium','mandir'];

// ── US Federal Holidays 2026 ──────────────────────────────────
const US_FEDERAL_HOLIDAYS = {
  '2026-01-01': { name:"New Year's Day",        emoji:'🎆', color:'#4F8EF7' },
  '2026-01-19': { name:'MLK Day',               emoji:'✊', color:'#4F8EF7' },
  '2026-02-16': { name:"Presidents' Day",       emoji:'🇺🇸', color:'#4F8EF7' },
  '2026-05-25': { name:'Memorial Day',          emoji:'🎖️', color:'#4F8EF7' },
  '2026-06-19': { name:'Juneteenth',            emoji:'✊', color:'#4F8EF7' },
  '2026-07-04': { name:'Independence Day',      emoji:'🎇', color:'#4F8EF7' },
  '2026-09-07': { name:'Labor Day',             emoji:'👷', color:'#4F8EF7' },
  '2026-10-12': { name:'Columbus Day',          emoji:'⚓', color:'#4F8EF7' },
  '2026-11-11': { name:'Veterans Day',          emoji:'🎖️', color:'#4F8EF7' },
  '2026-11-26': { name:'Thanksgiving',          emoji:'🦃', color:'#4F8EF7' },
  '2026-12-25': { name:'Christmas Day',         emoji:'🎄', color:'#4F8EF7' },
  '2027-01-01': { name:"New Year's Day",        emoji:'🎆', color:'#4F8EF7' },
  '2027-01-18': { name:'MLK Day',               emoji:'✊', color:'#4F8EF7' },
  '2027-02-15': { name:"Presidents' Day",       emoji:'🇺🇸', color:'#4F8EF7' },
  '2027-05-31': { name:'Memorial Day',          emoji:'🎖️', color:'#4F8EF7' },
  '2027-06-19': { name:'Juneteenth',            emoji:'✊', color:'#4F8EF7' },
  '2027-07-04': { name:'Independence Day',      emoji:'🎇', color:'#4F8EF7' },
  '2027-09-06': { name:'Labor Day',             emoji:'👷', color:'#4F8EF7' },
  '2027-11-11': { name:'Veterans Day',          emoji:'🎖️', color:'#4F8EF7' },
  '2027-11-25': { name:'Thanksgiving',          emoji:'🦃', color:'#4F8EF7' },
  '2027-12-25': { name:'Christmas Day',         emoji:'🎄', color:'#4F8EF7' },
};

// ── Hindu & Other Festival Dates 2026–2027 ────────────────────
const HINDU_FESTIVALS_DEFAULT = {
  '2026-03-25': { name:'Holi',              emoji:'🎨', color:'#EA580C' },
  '2026-04-14': { name:'Baisakhi',          emoji:'🌾', color:'#EA580C' },
  '2026-04-06': { name:'Ram Navami',        emoji:'🙏', color:'#EA580C' },
  '2026-08-16': { name:'Janmashtami',       emoji:'🦚', color:'#EA580C' },
  '2026-08-26': { name:'Ganesh Chaturthi', emoji:'🐘', color:'#EA580C' },
  '2026-10-02': { name:'Navratri Begins',   emoji:'🪔', color:'#EA580C' },
  '2026-10-11': { name:'Dussehra',          emoji:'🏹', color:'#EA580C' },
  '2026-10-20': { name:'Diwali',            emoji:'🪔', color:'#D97706' },
  '2026-11-05': { name:'Chhath Puja',       emoji:'🌅', color:'#EA580C' },
  '2026-12-25': { name:'Christmas',         emoji:'🎄', color:'#059669' },
  '2027-03-14': { name:'Holi',              emoji:'🎨', color:'#EA580C' },
  '2027-08-05': { name:'Janmashtami',       emoji:'🦚', color:'#EA580C' },
  '2027-09-15': { name:'Ganesh Chaturthi', emoji:'🐘', color:'#EA580C' },
  '2027-10-09': { name:'Diwali',            emoji:'🪔', color:'#D97706' },
};

// ── Aliases — do not remove ───────────────────────────────────
const SLOTSTART      = SLOT_START;
const SLOTEND        = SLOT_END;
const SLOTHRS        = SLOT_HRS;
const TIMESLOTS      = TIME_SLOTS;
const DAYSSHORT      = DAYS_SHORT;
const DAYSFULL       = DAYS_FULL;
const LOCOPTIONS     = LOC_OPTIONS;
const LOCCLS         = LOC_CLS;
const LOCLABEL       = LOC_LABEL;
const LOCCOLOR       = LOC_COLOR;
const ALLLOCS        = ALL_LOCS;
const REQUIREDLOCS   = REQUIRED_LOCS;
const LUNCHSLOTS     = LUNCH_SLOTS;
const DAYSTART       = DAY_START;
const DAYEND         = DAY_END;
const DEFAULTHRSCAP  = DEFAULT_HRS_CAP;
const MAXHRSCAP      = MAX_HRS_CAP;
const USFEDERALHOLIDAYS     = US_FEDERAL_HOLIDAYS;
const HINDUFESTIVALSDEFAULT = HINDU_FESTIVALS_DEFAULT;
