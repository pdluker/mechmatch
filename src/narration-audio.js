// narration-audio.js
//
// Turns script.js's narration output into an audio buffer via
// ElevenLabs, mirroring pokepod's actual live pattern verified from the
// `podcast` Worker's source (synthesizeBlock -> synthesizeBlockOnce,
// retry-once against a fallback voice, Uint8Array concatenation).
//
// NOT YET LIVE-TESTED: no ElevenLabs API key is available in this
// environment to test against the real endpoint (same caveat as
// archive.js's Supabase call - request shape verified against pokepod's
// working implementation, not against a live response). Needs an
// ELEVENLABS_API_KEY Worker secret before this can run for real - that
// key can only come from you (your ElevenLabs account/billing), not
// something provisionable on your behalf.
//
// MVP mapping: script.js currently produces prose narration (intro,
// turnLines[], outro), not per-speaker dialogue like pokepod's two-host
// format. So this file uses ONE voice for the whole episode to start -
// multi-voice (e.g. a distinct tone for crit/blowout lines) is a real
// but separate enhancement, not attempted here since it would mean
// deciding which lines get which voice without any spec for that yet.

// ASSUMPTION: block granularity. Splitting on sentence-ish boundaries
// keeps individual ElevenLabs calls small (matches pokepod's per-beat
// splitting), and means one failed block doesn't force re-synthesizing
// the whole episode - only synthesizeEpisode's retry logic needs to
// touch that one block.
function narrationToBlocks(narration) {
  return [narration.intro, ...narration.turnLines, narration.outro].filter(Boolean);
}

/**
 * One ElevenLabs TTS call for a single block of text. Mirrors pokepod's
 * synthesizeBlockOnce exactly: POST to the voice-specific endpoint,
 * Accept: audio/mpeg, raw bytes back.
 */
async function synthesizeBlockOnce(text, voiceId, env) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      // ASSUMPTION: model + voice_settings. Pokepod's exact tuned
      // values aren't visible in the bundled/minified source this file
      // was verified against - these are ElevenLabs' own documented
      // defaults, not pulled from pokepod, and should be treated as a
      // first pass to tune once real audio output can be reviewed.
      //
      // speed ADDED 2026-08-19 per explicit feedback that pacing could
      // be a little quicker. Verified via ElevenLabs' own docs (not
      // assumed) that `speed` is a real voice_settings field, range
      // 0.7-1.2, default 1.0. 1.08 is a modest bump, well short of the
      // "extreme values may affect quality" range the docs warn about -
      // meant as a first-pass nudge to tune further once you've heard
      // it, not a final answer.
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.08 }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable body>');
    const err = new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  return new Uint8Array(await res.arrayBuffer());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// FIX (2026-08-18): the original retry-once-against-fallback pattern
// assumed failures were voice-specific (bad voice id, content policy,
// transient glitch). In production the actual failure mode is
// concurrent_limit_exceeded (429) - an ACCOUNT-level cap, not a
// per-voice one. Falling back to a second voice on the same account/key
// just fires a second doomed request instead of fixing anything, which
// is exactly what the "both primary and fallback voice failed" error in
// the field was showing. 429s now get retried against the SAME voice
// with backoff; the fallback voice is reserved for genuinely
// voice-specific failures (4xx other than 429, or a 5xx).
const MAX_RATE_LIMIT_RETRIES = 4;
const BASE_BACKOFF_MS = 1500;

async function synthesizeBlock(text, voiceId, fallbackVoiceId, env) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await synthesizeBlockOnce(text, voiceId, env);
    } catch (err) {
      lastErr = err;
      if (err.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) break;
      // Exponential backoff with jitter, so a batch of blocks that all
      // hit 429 at once don't all retry in lockstep and re-collide.
      const delay = BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 500;
      await sleep(delay);
    }
  }

  if (!fallbackVoiceId) throw lastErr;
  try {
    return await synthesizeBlockOnce(text, fallbackVoiceId, env);
  } catch (secondErr) {
    throw new Error(
      `synthesizeBlock: both primary and fallback voice failed, giving up: ${secondErr.message}`
    );
  }
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Synthesizes a full episode's narration into one audio buffer.
 *
 * @param {object} narration - script.js's narrateBattle() output
 * @param {object} env - Worker env (needs ELEVENLABS_API_KEY)
 * @param {object} [opts]
 * @param {string} [opts.voiceId] - primary ElevenLabs voice id.
 *   ASSUMPTION: no voice has been chosen yet - this needs a real
 *   decision (browsing ElevenLabs' voice library) which is a creative
 *   choice, not something to default silently.
 * @param {string} [opts.fallbackVoiceId] - optional fallback voice
 */
// FIX (2026-08-18): the original Promise.all fired every block at once.
// A multi-turn episode easily has 10-15 blocks, well past ElevenLabs'
// 5-concurrent-request cap on the current plan - that's the direct
// cause of the concurrent_limit_exceeded 429s seen in production.
// CONCURRENCY_LIMIT is deliberately below the plan's cap (not equal to
// it) so the retry logic in synthesizeBlock has headroom to re-issue a
// request without immediately colliding with the next queued block.
const CONCURRENCY_LIMIT = 3;

async function synthesizeBlocksThrottled(blocks, voiceId, fallbackVoiceId, env) {
  const results = new Array(blocks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < blocks.length) {
      const i = nextIndex++;
      results[i] = await synthesizeBlock(blocks[i], voiceId, fallbackVoiceId, env);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, blocks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function synthesizeEpisode(narration, env, { voiceId, fallbackVoiceId } = {}) {
  if (!voiceId) {
    throw new Error(
      'synthesizeEpisode: no voiceId provided - pick a narrator voice from ' +
      'the ElevenLabs voice library before wiring this into the daily cron'
    );
  }

  const blocks = narrationToBlocks(narration);
  const buffers = await synthesizeBlocksThrottled(blocks, voiceId, fallbackVoiceId, env);
  return concatUint8Arrays(buffers);
}
