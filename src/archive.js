// archive.js
//
// Writes a completed match to Supabase (the permanent, queryable archive
// tier - mecha-show-bible.md Section 5b). Separate module, same
// separation principle every other file in this project keeps: index.js
// doesn't know Supabase exists, this file doesn't know battle.js or
// ledger.js exist - it takes a plain record shape and makes one HTTP
// call. A Worker's scheduled() handler wires the two together.
//
// Uses raw fetch() against Supabase's PostgREST endpoint rather than the
// supabase-js SDK - avoids an extra dependency for a single INSERT, and
// Workers' fetch() already handles this fine. If the project later needs
// richer queries FROM the Worker (not just archival writes), revisit
// this and consider the SDK instead.
//
// NOT YET LIVE-TESTED: this environment's network allowlist doesn't
// include supabase.co, so this has only been checked for request-shape
// correctness (matches PostgREST's documented insert contract), not
// against the real endpoint. Verify with `wrangler dev` against the
// actual project before this goes into the daily cron path, same as
// every other piece of this pipeline gets a real-environment check
// before the cron is turned on (bible Section 7 / build-order step 6).

/**
 * @param {object} env - Worker env bindings
 * @param {string} env.SUPABASE_URL - e.g. "https://baknyepgyjurarojdkhy.supabase.co"
 * @param {string} env.SUPABASE_SERVICE_ROLE_KEY - service role key, NOT
 *   the anon key - this write bypasses RLS by design (see the migration's
 *   policy comment: anon gets read-only, the Worker writes as service role)
 * @param {object} matchRecord - shape matching the mech_matches table
 */
export async function archiveMatch(env, matchRecord) {
  const url = `${env.SUPABASE_URL}/rest/v1/mech_matches`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      // return=minimal: we don't need the inserted row back, just
      // confirmation it succeeded - smaller response, matches the
      // account's existing "cheap, mostly a different narration pass"
      // cost-consciousness (mecha-show-bible.md Section 5b context).
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(matchRecord)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable body>');
    throw new Error(`archiveMatch: Supabase insert failed (${response.status}): ${body}`);
  }

  return { ok: true };
}

/**
 * Builds a mech_matches-shaped record from index.js's runDailyEpisode()
 * output. Kept as a separate pure function (not inlined into
 * archiveMatch) so it's testable without a network call - exactly the
 * same reasoning ledger.js's serializeLedger is a separate step from
 * whatever writes it to KV.
 *
 * @param {object} episodeResult - runDailyEpisode()'s return value (ok: true case)
 * @param {object} ledger - the ledger AFTER recordMatchResult/advanceEpisode ran
 */
export function buildMatchRecord(episodeResult, ledger) {
  if (!episodeResult.ok) {
    throw new Error('buildMatchRecord: cannot archive a skipped episode (ok: false)');
  }

  const winner = ledger.roster[episodeResult.winnerPilotId];
  const loser = ledger.roster[episodeResult.loserPilotId];

  return {
    episode: episodeResult.episode,
    arc_number: episodeResult.arc.number,
    winner_pilot_id: episodeResult.winnerPilotId,
    loser_pilot_id: episodeResult.loserPilotId,
    winner_faction: winner?.faction ?? null,
    loser_faction: loser?.faction ?? null,
    winner_chassis_id: winner?.chassisId ?? null,
    loser_chassis_id: loser?.chassisId ?? null,
    blowout: !!episodeResult.result.blowout,
    narrow_win: !!episodeResult.result.narrowWin,
    decisive_factor: episodeResult.result.decisiveFactor,
    ripple: !!episodeResult.ripple
  };
}
