// Traffic for the incident demo. Each bet uses its own externalId, so the
// ledger actually writes. k6 or autocannon would resend one body and only
// measure idempotent replays.

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const total = Number(process.env.REQUESTS ?? 100);
const concurrency = Number(process.env.CONCURRENCY ?? 20);
const betAmount = Number(process.env.BET_AMOUNT ?? 100);

if (!Number.isInteger(total) || total < 1) throw new Error('REQUESTS must be a positive integer');
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('CONCURRENCY must be a positive integer');
if (!Number.isInteger(betAmount) || betAmount < 1) throw new Error('BET_AMOUNT must be a positive integer');

const depositAmount = total * betAmount;
if (!Number.isSafeInteger(depositAmount)) throw new Error('REQUESTS * BET_AMOUNT exceeds a safe integer');

await waitForHealth();
const version = await getJson('/version');
// A run id keeps externalIds unique when the same wallet is loaded more than once.
const runId = `load-${Date.now()}`;
const walletId = process.env.WALLET_ID || (await post('/players', { name: runId })).wallet.id;
await post(`/wallets/${walletId}/deposit`, {
  externalId: `${runId}-deposit`,
  amount: depositAmount,
});

const durations = [];
let failures = 0;
const samples = [];
let cursor = 0;

async function worker() {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= total) return;
    const externalId = `${runId}-${index}`;
    const started = performance.now();
    try {
      const response = await fetch(`${base}/wallets/${walletId}/bet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': externalId },
        body: JSON.stringify({ externalId, amount: betAmount }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      durations.push(performance.now() - started);
      if (!response.ok) {
        failures += 1;
        if (samples.length < 3) samples.push(`${response.status} ${text.slice(0, 200)}`);
      }
    } catch (error) {
      durations.push(performance.now() - started);
      failures += 1;
      if (samples.length < 3) samples.push(error instanceof Error ? error.message : String(error));
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
durations.sort((a, b) => a - b);

const elapsed = (performance.now() - started) / 1000;
console.log(
  JSON.stringify({
    commit: version.commit,
    walletId,
    requests: total,
    concurrency,
    failures,
    elapsedSec: Number(elapsed.toFixed(2)),
    p50Ms: Math.round(percentile(durations, 50)),
    p95Ms: Math.round(percentile(durations, 95)),
    maxMs: Math.round(durations[durations.length - 1] ?? 0),
    samples,
  }),
);

if (failures > 0) process.exitCode = 1;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      // service is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`no healthy service at ${base}`);
}

async function getJson(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status} ${text}`);
  return JSON.parse(text);
}
