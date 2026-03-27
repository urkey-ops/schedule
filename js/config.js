const ALERT_DAYS = 7;       // days ahead to show leave alerts
const HANDOVER_WARN = 15;   // minutes before slot end to show handover badge
const APP_VERSION = 'v6';

// ── Admin PIN Hash ─────────────────────────────────────────────
// SHA-256 hash of your admin PIN — paste your hash below.
// To generate: in browser console run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpin'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
const HARDCODED_PIN_HASH = '8bb0cf6eb9b17d0f7d22b456f121257dc1254e1f01665370476383ea776df414';
