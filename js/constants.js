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
const LUNCH_SLOTS = [6,7,8]; // indices of lunch/break slots
const DAY_START  = 6;
const DAY_END    = 20.5;

const LOC_OPTIONS = [
  { val: 'gate',     label: 'Gate',      cls: 'loc-gate' },
  { val: 'podium',   label: 'Podium',    cls: 'loc-podium' },
  { val: 'mandir',   label: 'Mandir',    cls: 'loc-mandir' },
  { val: 'field',    label: 'Field Work',cls: 'loc-field' },
  { val: 'giftshop', label: 'Gift Shop', cls: 'loc-giftshop' },
  { val: 'lunch',    label: 'Lunch',     cls: 'loc-lunch' },
  { val: 'off',      label: 'OFF',       cls: 'loc-off' },
  { val: 'vac',      label: 'VACATION',  cls: 'loc-vac' },
];

const LOC_CLS = Object.fromEntries(LOC_OPTIONS.map(l => [l.val, l.cls]));
const LOC_LABEL = Object.fromEntries(LOC_OPTIONS.map(l => [l.val, l.label]));
const LOC_COLOR = {
  gate:'#4F8EF7', podium:'#34D399', mandir:'#FB923C',
  field:'#8B91A8', giftshop:'#22D3EE', lunch:'#FBBF24',
  off:'#252940', vac:'#A78BFA'
};
const ALL_LOCS = ['gate','podium','mandir','field','giftshop'];
