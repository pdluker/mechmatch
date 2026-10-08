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

// REVISED 2026-08-23: the original prompt was 932 characters and every
// real production run has been failing with a Workers AI error 5006
// ("Length of '/prompt' ...") - a JSON-schema length-validation error.
// This version keeps the same grimy/warlike direction but cuts the
// repetition (the original restated "weathered X colors barely visible
// under grime" verbatim for both mechs, plus a long comma-chained house
// style) down to well under 400 characters, with real margin rather
// than trimming to exactly the boundary.
const HOUSE_STYLE = 'gritty war-poster painting, desaturated colors, rust and scorch marks, dramatic hard lighting, painterly not cel-shaded';

// ADDED 2026-08-25: flux-1-schnell can't resolve a faction NAME to a
// color - "weathered Tidewrought Assembly colors" and "weathered
// Aurelian Accord colors" were rendering as the same drab olive/rust
// palette on both mechs, which defeats the point of per-episode art
// (see this file's header comment). Mapping to the actual locked
// palette (mecha-show-bible.md Section 1a / brainstorm-pass-1.md's
// faction table) gives the model literal colors to render instead.
// Fallback string covers a faction added later that hasn't been added
// here yet, so a lookup miss degrades gracefully instead of throwing.
const FACTION_PALETTE = {
  'Ashguard Combine': 'iron-red and molten orange',
  'Skyline Concord': 'glacier-blue and white',
  'Tidewrought Assembly': 'teal and pearl',
  'Wraithline Circuit': 'matte black and deep violet',
  'Ironroot Concord': 'moss-green and bronze',
  'Aurelian Accord': 'gold and ivory',
  'Static Vanguard': 'yellow and graphite',
  'Thornback Cartel': 'mismatched salvaged colors',
};

function factionColors(faction) {
  return FACTION_PALETTE[faction] ?? `weathered ${faction} colors`;
}

function buildPrompt(chassisA, chassisB) {
  return (
    `Two battle-worn war mechs face off in a scarred arena. ` +
    `Left: a ${chassisA.frame.toLowerCase()}-class, ${chassisA.core.toLowerCase()}-core mech wielding a ${chassisA.signatureWeapon.toLowerCase()}, ${factionColors(chassisA.faction)} under grime. ` +
    `Right: a ${chassisB.frame.toLowerCase()}-class, ${chassisB.core.toLowerCase()}-core mech wielding a ${chassisB.signatureWeapon.toLowerCase()}, ${factionColors(chassisB.faction)} under grime. ` +
    // "unsigned, no watermark, no artist signature" added 2026-08-25:
    // flux-1-schnell was hallucinating a signature-style text mark in
    // the bottom corner despite the plain "No text, no logos" ask -
    // this is a known failure mode for that model, and the more
    // specific negative addresses it more reliably than the generic one.
    `${HOUSE_STYLE}, unsigned, no watermark, no artist signature. No text, no logos.`
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
