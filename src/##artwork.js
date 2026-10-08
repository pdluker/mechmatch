// artwork.js
//
// Generates unique per-episode artwork via Workers AI (@cf/black-forest-
// labs/flux-1-schnell), prompted from the actual two chassis in that
// day's battle - not a generic template, not reused faction posters.
// Uses env.AI (the Workers AI binding), same account, no new vendor or
// API key, per the explicit choice made 2026-08-18.
//
// Style is pinned to the show's LOCKED visual identity (mecha-show-
// bible.md Section 1a: "retro-poster... flat bold color blocks, warm
// halftone texture, WPA-poster composition") - every prompt below
// includes that phrase verbatim so episode art stays visually
// consistent with the existing faction poster set, not a different
// look per episode.

// REVISED 2026-08-18 per explicit feedback: the original clean WPA
// travel-poster rendering (bright colors, crisp linework) was reading
// as cartoonish, not the "grimy and warlike" look wanted. This keeps
// the poster COMPOSITION (bold, dramatic, propaganda-poster framing -
// still recognizably Mech Match, still distinct from a generic AI
// render) but replaces the clean/bright RENDERING with something
// closer to a weathered wartime propaganda poster: matte-painted,
// desaturated, battle-damaged. This is a real deviation from the
// bible's Section 1a locked "retro-poster" house style (flat bold
// color blocks, warm halftone, WPA composition) toward something
// grittier - worth flagging as a deliberate style change to fold back
// into the bible once approved, not something to silently diverge on.
const HOUSE_STYLE =
  'gritty realistic digital painting, weathered wartime propaganda poster aesthetic, ' +
  'desaturated muted color palette with rust and scorch-mark accents, heavy battle damage, ' +
  'dirt and grime streaking the armor plating, dramatic hard directional lighting, ' +
  'painterly brushwork rather than clean cel-shaded linework, aged paper texture, ' +
  'oil-painted concept-art realism';

// ASSUMPTION: no doc specifies per-episode art composition beyond the
// house style itself - this framing (two chassis facing off, arena
// backdrop) is a first-pass choice, easy to tune once real output can
// be reviewed, same posture as everything else marked ASSUMPTION in
// this project.
function buildPrompt(chassisA, chassisB) {
  return (
    `Two battle-worn war mechs facing off in a scarred dueling arena, mid-combat. ` +
    `Left: a ${chassisA.frame.toLowerCase()}-class mech, dented and scorched armor, ` +
    `a ${chassisA.core.toLowerCase()}-type power core visibly worn from use, ` +
    `wielding a ${chassisA.signatureWeapon.toLowerCase()}, weathered ${chassisA.faction} colors barely visible under grime. ` +
    `Right: a ${chassisB.frame.toLowerCase()}-class mech, battle-damaged plating, ` +
    `a ${chassisB.core.toLowerCase()}-type power core, ` +
    `wielding a ${chassisB.signatureWeapon.toLowerCase()}, weathered ${chassisB.faction} colors barely visible under grime. ` +
    `Dust and debris in the air, cracked ground, overcast harsh light, low-angle dramatic composition. ` +
    `${HOUSE_STYLE}. No text, no logos, no watermarks.`
  );
}

/**
 * @param {object} env - Worker env (needs env.AI, the Workers AI binding)
 * @param {object} chassisA - { frame, core, signatureWeapon, faction }
 * @param {object} chassisB - same shape
 * @returns {Promise<Uint8Array>} JPEG bytes
 */
export async function generateEpisodeArt(env, chassisA, chassisB) {
  const prompt = buildPrompt(chassisA, chassisB);

  const response = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    // ASSUMPTION: 6 of the model's max 8 steps - a middle ground between
    // flux-1-schnell's fast 4-step default and its 8-step ceiling,
    // traded for slightly better quality since this runs once/day, not
    // per-request. Tune down to 4 if daily cron latency becomes an
    // issue (image gen adds real wall-clock time on top of the TTS
    // calls already in this pipeline).
    steps: 6
  });

  if (!response?.image) {
    throw new Error('generateEpisodeArt: Workers AI returned no image data');
  }

  const binaryString = atob(response.image);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
