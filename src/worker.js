// worker.js
//
// The Cloudflare Worker entrypoint. Cron trigger calls scheduled(),
// which runs runDailyEpisode() (index.js) against the R2-persisted
// ledger, synthesizes audio, writes everything back to R2, and archives
// the match to Supabase.
//
// RECONCILED 2026-08-18. Three prior variants of this file existed
// (the live-deployed one this is based on, a front-end-serving one from
// another session that was built but never deployed, and a third from
// earlier today) - this merges them into one. Live-verified facts this
// version is built against (checked via Cloudflare/Supabase tools
// directly, not assumed from any prior chat):
//   - Worker name is "mech-match" (not "mechamash" - that's the local
//     folder name only), deployed at mech-match.pdluker.workers.dev.
//   - No custom domain route is live yet - only the workers.dev URL.
//     mechmash.stluker.com's zone_name was never actually verified
//     against a real DNS tool; confirm it before adding [[routes]].
//   - 14 real episodes (0-12, with episode 0 duplicated) already exist
//     in Supabase/R2 from the unguarded fetch() being hit repeatedly -
//     see the run lock in storage.js, which exists specifically to
//     close that failure mode.
//
// Routes now served:
//   GET /                              -> site.js's episode list/player
//   GET /feed.xml                      -> feed.js's podcast RSS
//   GET /episodes/*.mp3                -> R2 audio, streamed directly
//   GET /admin/run-episode?secret=...  -> manual trigger, gated by
//                                          ADMIN_TRIGGER_SECRET (unset
//                                          means always 401 - the safe
//                                          default)
//   anything else                      -> 404
//
// SETUP CHECKLIST before next deploy:
//   1. `wrangler secret put ADMIN_TRIGGER_SECRET` (new - pick any string)
//   2. Confirm ELEVENLABS_API_KEY currently live is the ROTATED key, not
//      the one that was posted in plaintext earlier in this project -
//      re-run `wrangler secret put ELEVENLABS_API_KEY` if in doubt
//   3. Resolve the duplicate episode-0 row in Supabase (see the cleanup
//      SQL provided alongside this file) before this feed goes public
//   4. Only THEN add the [[routes]] block for a custom domain, once the
//      zone_name is confirmed in the actual Cloudflare dashboard

import { createLedger, deserializeLedger, serializeLedger } from './ledger.js';
import { runDailyEpisode, seedPilot } from './index.js';
import { createFlavorState } from './script.js';
import {
  loadLedger, saveLedger, loadFlavorState, saveFlavorState,
  writeRunStatus, appendEpisodeMeta, putBinary,
  readEpisodesList, getObject, acquireRunLock, releaseRunLock, readRunStatus
} from './storage.js';
import { synthesizeEpisode } from './narration-audio.js';
import { archiveMatch, buildMatchRecord } from './archive.js';
import { seedStarterRoster, addMissingRosterPilots } from './seed-roster.js';
import { renderIndexHtml } from './site.js';
import { buildRssFeed } from './feed.js';
import { generateEpisodeArt } from './artwork.js';

function getShowConfig(env) {
  const siteUrl = (env.SITE_URL || '').replace(/\/$/, '');
  return {
    title: env.SHOW_TITLE || 'Mech Match',
    description: env.SHOW_DESCRIPTION || 'The Sync Wars - a daily mecha battle podcast.',
    author: env.SHOW_AUTHOR || 'Mech Match',
    siteUrl,
    coverImageUrl: env.COVER_IMAGE_URL || `${siteUrl}/cover.jpg`,
    language: 'en-us',
    explicit: false
  };
}

// First-draft starter roster (seed-roster.js) - not final canon, just
// enough to unblock testing. Logs loudly on seed so it's never a silent
// surprise which pilots ended up live.
async function seedInitialRosterIfEmpty(ledger) {
  if (Object.keys(ledger.roster).length > 0) return ledger;
  seedStarterRoster(ledger);
  console.log(
    `seedInitialRosterIfEmpty: ledger was empty - seeded the starter roster ` +
    `(${Object.keys(ledger.roster).length} pilots: ${Object.keys(ledger.roster).join(', ')}). ` +
    `This is first-draft content (seed-roster.js), not final canon - edit freely.`
  );
  return ledger;
}

async function runOneEpisode(env) {
  const bucket = env.MECH_BUCKET;

  const locked = await acquireRunLock(bucket);
  if (!locked) {
    return {
      ok: false,
      reason: 'locked-recent-run',
      note: 'Another run started within the last 60s (cron overlap or duplicate trigger) - skipped to avoid corrupting the ledger.'
    };
  }

  try {
    return await runOneEpisodeInner(env, bucket);
  } finally {
    await releaseRunLock(bucket);
  }
}

async function runOneEpisodeInner(env, bucket) {
  const ledger = await loadLedger(bucket, createLedger, deserializeLedger, { arcLengthDays: 75 });
  await seedInitialRosterIfEmpty(ledger);

  const flavorState = await loadFlavorState(bucket, createFlavorState);

  const episodeResult = runDailyEpisode(ledger, flavorState);

  if (!episodeResult.ok) {
    // Graceful skip (e.g. everyone grounded) - not an error, just no
    // episode today. Still persist the ledger (advanceEpisode may not
    // have run, so this is mostly a no-op, but keeps behavior explicit).
    await saveLedger(bucket, ledger, serializeLedger);
    await writeRunStatus(bucket, {
      ok: false,
      ranAt: new Date().toISOString(),
      reason: episodeResult.reason
    });
    return episodeResult;
  }

  // Audio synthesis - voiceId is required, not defaulted (see
  // narration-audio.js's own error if it's missing). Pulled from env so
  // it's configurable without a code change once a voice is chosen.
  const audioBytes = await synthesizeEpisode(episodeResult.narration, env, {
    voiceId: env.NARRATOR_VOICE_ID,
    fallbackVoiceId: env.NARRATOR_FALLBACK_VOICE_ID
  });

  const episodeNumber = episodeResult.episode;
  const audioKey = `episodes/${String(episodeNumber).padStart(5, '0')}.mp3`;
  await putBinary(bucket, audioKey, audioBytes, 'audio/mpeg');

  // Episode art - best-effort, same posture as the Supabase archive
  // below: a Workers AI hiccup shouldn't take the whole daily episode
  // down. Needs episodeResult.chassisSummary (index.js's runDailyEpisode
  // must be patched to include it - see the accompanying index.js
  // patch notes). Falls back to no art rather than throwing if that
  // patch hasn't landed yet, so this doesn't hard-break existing
  // deployments.
  let artKey = null;
  let artError = null;
  if (episodeResult.chassisSummary) {
    try {
      const artBytes = await generateEpisodeArt(
        env,
        episodeResult.chassisSummary.a,
        episodeResult.chassisSummary.b
      );
      artKey = `episodes/${String(episodeNumber).padStart(5, '0')}.jpg`;
      await putBinary(bucket, artKey, artBytes, 'image/jpeg');
    } catch (artErr) {
      // FIX 2026-08-22: console.error alone is only visible via
      // wrangler tail (live) or Cloudflare's Workers Observability/Logs
      // dashboard - neither of which was being checked, so a real
      // failure went unseen for at least one full episode. Capturing
      // the actual message somewhere already readable (the episode
      // record itself, plus status.json via the new /admin/status
      // route below) means this is never invisible again, regardless
      // of dashboard/logging settings.
      artError = artErr.message;
      console.error('Episode art generation failed (non-fatal):', artError);
    }
  }

  await appendEpisodeMeta(bucket, {
    episode: episodeNumber,
    winnerPilotId: episodeResult.winnerPilotId,
    loserPilotId: episodeResult.loserPilotId,
    blowout: episodeResult.result.blowout,
    narrowWin: episodeResult.result.narrowWin,
    decisiveFactor: episodeResult.result.decisiveFactor,
    audioKey,
    artKey,
    artError,
    // NEW 2026-08-18: the full narration text wasn't persisted anywhere
    // before this - episodeResult.narration.fullText already existed
    // (script.js's narrateBattle output), just never got written to the
    // episode record. Needed for the front end's transcript toggle.
    narrationText: episodeResult.narration.fullText,
    publishedAt: new Date().toISOString()
  });

  // Persist ledger + flavorState AFTER the episode ran successfully -
  // if synthesis or archiving fails above, the ledger hasn't moved yet,
  // so a retry doesn't double-advance the season clock.
  await saveLedger(bucket, ledger, serializeLedger);
  await saveFlavorState(bucket, flavorState);

  // Archive to Supabase - best-effort. A Supabase outage shouldn't take
  // the whole daily episode down; the KV/R2 side of the pipeline is the
  // one thing that must succeed for the show to keep running.
  try {
    const record = buildMatchRecord(episodeResult, ledger);
    await archiveMatch(env, record);
  } catch (archiveErr) {
    console.error('Supabase archive failed (non-fatal):', archiveErr.message);
  }

  await writeRunStatus(bucket, {
    ok: true,
    ranAt: new Date().toISOString(),
    episode: episodeNumber,
    winnerPilotId: episodeResult.winnerPilotId,
    loserPilotId: episodeResult.loserPilotId,
    artKey,
    artError
  });

  return episodeResult;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runOneEpisode(env).catch(async (err) => {
        console.error('Daily episode generation failed:', err);
        try {
          await writeRunStatus(env.MECH_BUCKET, {
            ok: false,
            ranAt: new Date().toISOString(),
            error: err.message
          });
        } catch (statusErr) {
          console.error('Also failed to write run status:', statusErr);
        }
      })
    );
  },

  // Public front end. Manual episode triggers now require
  // ADMIN_TRIGGER_SECRET - the live Worker this file replaces ran a full
  // episode on ANY request, which is what caused episodes 5-7 and 10-12
  // to fire seconds apart in production (confirmed via Supabase
  // timestamps) - almost certainly bot/crawler traffic hitting the bare
  // URL, each hit spending real ElevenLabs quota.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const bucket = env.MECH_BUCKET;

    try {
      if (url.pathname === '/admin/run-episode') {
        return await handleAdminRun(request, env);
      }

      if (url.pathname === '/admin/add-pilots') {
        return await handleAdminAddPilots(request, env);
      }

      if (url.pathname === '/admin/status') {
        return await handleAdminStatus(request, env);
      }

      if (url.pathname.startsWith('/episodes/') && /\.(mp3|jpg)$/.test(url.pathname)) {
        return await serveEpisodeAsset(bucket, url.pathname.slice(1));
      }

      if (url.pathname === '/feed.xml') {
        const episodes = await readEpisodesList(bucket);
        const xml = buildRssFeed(episodes, getShowConfig(env));
        return new Response(xml, {
          headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }
        });
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const episodes = await readEpisodesList(bucket);
        const html = renderIndexHtml(episodes, getShowConfig(env));
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

async function handleAdminRun(request, env) {
  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret');

  if (!env.ADMIN_TRIGGER_SECRET || provided !== env.ADMIN_TRIGGER_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }, null, 2), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const result = await runOneEpisode(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// One-time (but safe to re-run - idempotent) top-up to add the 32
// named pilots from "THE CIRCUIT" doc to the LIVE ledger, which already
// has real episode history and therefore never runs worker.js's
// seedInitialRosterIfEmpty (that only fires on an empty roster). Same
// auth gate as /admin/run-episode - this writes to the same production
// ledger, so it gets the same protection.
async function handleAdminAddPilots(request, env) {
  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret');

  if (!env.ADMIN_TRIGGER_SECRET || provided !== env.ADMIN_TRIGGER_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }, null, 2), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const bucket = env.MECH_BUCKET;
    const ledger = await loadLedger(bucket, createLedger, deserializeLedger, { arcLengthDays: 75 });
    const added = addMissingRosterPilots(ledger);
    await saveLedger(bucket, ledger, serializeLedger);
    return new Response(JSON.stringify({ ok: true, added, addedCount: added.length }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// NEW 2026-08-22: lets the last run's status.json (including any
// artError, per today's fix) be read directly with curl - no wrangler
// tail, no Cloudflare dashboard log viewer, no dependency on logging
// having been enabled ahead of time.
async function handleAdminStatus(request, env) {
  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret');

  if (!env.ADMIN_TRIGGER_SECRET || provided !== env.ADMIN_TRIGGER_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }, null, 2), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const status = await readRunStatus(env.MECH_BUCKET);
    return new Response(JSON.stringify(status ?? { ok: false, note: 'no run recorded yet' }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function serveEpisodeAsset(bucket, key) {
  const obj = await getObject(bucket, key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
}
