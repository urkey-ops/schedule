const ALERT_DAYS = 7;       // days ahead to show leave alerts
const HANDOVER_WARN = 15;   // minutes before slot end to show handover badge
const APP_VERSION = 'v6';

// ── Admin PIN Hash ─────────────────────────────────────────────
// SHA-256 hash of your admin PIN — paste your hash below.
// To generate: in browser console run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpin'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
const HARDCODED_PIN_HASH = '2a8610aefdd0028c6bf074dd18721c0ef8bc43241cc7a653d7aedf2036bdf6b3';
