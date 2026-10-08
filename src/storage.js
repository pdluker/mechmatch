// storage.js
//
// R2 read/write layer, mirroring pokepod's actual live pattern verified
// from the `podcast` Worker's source (env.PODCAST_BUCKET.put/.get for
// everything - audio, images, RSS, episode metadata, run status,
// recentFlavor). Corrected 2026-08-17 away from the earlier KV plan -
// see mecha-show-bible.md Section 5b for the full correction writeup.
//
// Bucket binding name used throughout: MECH_BUCKET (Worker env var name,
// bound to the mech-match-podcast R2 bucket - see wrangler.toml).
//
// Kept ledger-agnostic and battle-agnostic on purpose, same separation
// every other module in this project keeps: this file only knows how to
// get/put JSON and binary blobs in R2. It doesn't know what a "ledger"
// or "episode" is.

const LEDGER_KEY = 'ledger.json';
const FLAVOR_STATE_KEY = 'flavor-state.json';
const STATUS_KEY = 'status.json';
const EPISODES_KEY = 'episodes.json';
const RUN_LOCK_KEY = 'run-lock.json';

// ---------------------------------------------------------------------
// Generic JSON read/write - same shape as pokepod's readJsonFromR2
// ---------------------------------------------------------------------

/**
 * Reads and parses a JSON object from R2. Returns `fallback` if the key
 * doesn't exist yet (first-ever run) rather than throwing - same
 * behavior pokepod's readJsonFromR2 uses for RECENT_FLAVOR_KEY on a
 * fresh bucket.
 */
export async function readJsonFromR2(bucket, key, fallback = null) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  const text = await obj.text();
  return JSON.parse(text);
}

export async function writeJsonToR2(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

// ---------------------------------------------------------------------
// Ledger persistence
// ---------------------------------------------------------------------

export async function loadLedger(bucket, createLedger, deserializeLedger, { arcLengthDays } = {}) {
  const obj = await bucket.get(LEDGER_KEY);
  if (!obj) return createLedger({ arcLengthDays });
  const text = await obj.text();
  return deserializeLedger(text);
}

export async function saveLedger(bucket, ledger, serializeLedger) {
  await bucket.put(LEDGER_KEY, serializeLedger(ledger), {
    httpMetadata: { contentType: 'application/json' }
  });
}

// ---------------------------------------------------------------------
// Flavor state persistence (script.js's exclusion-window state)
// ---------------------------------------------------------------------

export async function loadFlavorState(bucket, createFlavorState) {
  const state = await readJsonFromR2(bucket, FLAVOR_STATE_KEY, null);
  return state ?? createFlavorState();
}

export async function saveFlavorState(bucket, flavorState) {
  await writeJsonToR2(bucket, FLAVOR_STATE_KEY, flavorState);
}

// ---------------------------------------------------------------------
// Run status
// ---------------------------------------------------------------------

export async function writeRunStatus(bucket, status) {
  await writeJsonToR2(bucket, STATUS_KEY, status);
}

/**
 * Read-only accessor for the last run's status - lets /admin/status
 * expose exactly what writeRunStatus last wrote (including artError),
 * without needing wrangler tail or the Cloudflare dashboard's log
 * viewer to see it.
 */
export async function readRunStatus(bucket) {
  return readJsonFromR2(bucket, STATUS_KEY, null);
}

// ---------------------------------------------------------------------
// Run lock - NEW 2026-08-18. Root-causes the duplicate "episode 0" seen
// in production: two near-simultaneous requests both called loadLedger()
// before either had called saveLedger(), so both saw episodeCount 0 and
// both wrote themselves as episode 0 (the second silently overwrote the
// first's audio at the same R2 key). This isn't a true distributed lock
// (R2 has no compare-and-swap primitive exposed here), but a short
// timestamp-based cooldown closes the actual failure mode observed in
// the field: multiple requests arriving seconds apart against an
// endpoint that had no gating. Combined with the admin-secret gate in
// worker.js, this is a second, independent layer of protection - the
// gate stops randoms from triggering runs at all; the lock stops two
// legitimate-but-overlapping triggers (e.g. cron firing while a manual
// admin run is still in flight) from corrupting the ledger.
const RUN_LOCK_COOLDOWN_MS = 60_000;

/**
 * Attempts to acquire the run lock using R2's atomic conditional put
 * (If-None-Match: * - "create only if this key doesn't already exist").
 * This is enforced server-side by R2, not a client-side read-then-write
 * check - a plain "read, check timestamp, write" approach was tried
 * first and FAILED under test: two calls arriving in the same tick both
 * read "no lock" before either had written one, so both proceeded (the
 * exact bug that produced duplicate episode 0 in production). The
 * conditional put closes that specific window.
 *
 * Returns true if acquired (caller must call releaseRunLock when done,
 * success or not), false if a run is already in progress.
 */
export async function acquireRunLock(bucket, cooldownMs = RUN_LOCK_COOLDOWN_MS) {
  const now = new Date();
  const created = await bucket.put(
    RUN_LOCK_KEY,
    JSON.stringify({ startedAt: now.toISOString() }),
    {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: new Headers({ 'If-None-Match': '*' })
    }
  );

  if (created !== null) return true; // we created it - lock is ours

  // A lock already exists. Check whether it's stale (a previous run
  // crashed/timed out without releasing it) and take it over if so.
  // NOTE: this fallback path is NOT atomic the way the create path
  // above is - two callers could theoretically both see the same stale
  // lock and both take over. That's a narrower, lower-stakes race than
  // the one this function exists to fix (it requires a run to have
  // already been dead for a full cooldown window), but it's a real
  // residual gap worth knowing about, not a fully solved problem.
  const existing = await readJsonFromR2(bucket, RUN_LOCK_KEY, null);
  if (existing && Date.now() - Date.parse(existing.startedAt) >= cooldownMs) {
    await writeJsonToR2(bucket, RUN_LOCK_KEY, { startedAt: now.toISOString() });
    return true;
  }
  return false;
}

export async function releaseRunLock(bucket) {
  await bucket.delete(RUN_LOCK_KEY);
}

// ---------------------------------------------------------------------
// Episode metadata list
// ---------------------------------------------------------------------

const EPISODES_LIST_CAP = 500;

export async function appendEpisodeMeta(bucket, episodeMeta) {
  const episodes = await readJsonFromR2(bucket, EPISODES_KEY, []);
  episodes.push(episodeMeta);
  while (episodes.length > EPISODES_LIST_CAP) episodes.shift();
  await writeJsonToR2(bucket, EPISODES_KEY, episodes);
  return episodes;
}

/**
 * Read-only accessor for the episode index - used by the front end
 * (site.js) and RSS feed (feed.js) to render what's actually published.
 */
export async function readEpisodesList(bucket) {
  return readJsonFromR2(bucket, EPISODES_KEY, []);
}

// ---------------------------------------------------------------------
// Binary uploads / reads (audio, poster art)
// ---------------------------------------------------------------------

export async function putBinary(bucket, key, bytes, contentType) {
  await bucket.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000' }
  });
}

/**
 * Raw R2 get, for the Worker to stream a binary object straight through
 * in fetch(). Returns null if the key doesn't exist.
 */
export async function getObject(bucket, key) {
  return bucket.get(key);
}
