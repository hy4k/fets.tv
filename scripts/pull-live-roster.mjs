// Run on the server with the same private cron secret configured in the Next app.
const secret = process.env.FETS_ROSTER_CRON_SECRET;
if (!secret) throw Error('FETS_ROSTER_CRON_SECRET is not configured');
const response = await fetch(process.env.FETS_ROSTER_SYNC_URL || 'http://127.0.0.1:3022/api/fets-live/roster/cron', {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(180000),
});
const result = await response.json();
// API responses contain centre IDs and summary counts, never candidate names or secrets.
console.log(JSON.stringify({ at: new Date().toISOString(), status: response.status, ...result }));
if (!response.ok) process.exitCode = 1;
