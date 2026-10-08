// script.js
//
// Narration layer. Bible Section 4: "Narration reads the log the same
// way script.js already does for type effectiveness - Core matchup and
// Sync level both get their own phrase banks, same architecture, new
// vocabulary." Pass 3's governing principle applies directly here too:
// this module NARRATES a result battle.js already produced - it never
// decides the outcome, only picks words for what the log already shows.
//
// REVISED 2026-08-18 (drama/length pass) and again same day (tone pass,
// per explicit feedback: "reads as very cold... I want an enthusiastic,
// engaged and compassionate play by play commentator"). Structure is
// UNCHANGED from the tested drama/length version - context threading,
// pilot profiles, commentary asides, midpoint recap, sign-off all still
// work exactly as verified. Every phrase BANK was rewritten for voice:
// warm and genuinely excited about both pilots, generous to whoever's
// losing rather than clinical about it, real enthusiasm without turning
// into a caricature. Nothing here changes what battle.js decided -
// still just picking warmer words for the same log.

const DEFAULT_WINDOW = 3;

export function createFlavorState() {
  return {};
}

export function pickFlavor(bankKey, bank, flavorState, windowSize = DEFAULT_WINDOW) {
  if (!bank || bank.length === 0) return '';
  if (!flavorState[bankKey]) flavorState[bankKey] = [];
  const recent = flavorState[bankKey];

  // FIX 2026-08-19: found via a real transcript review, not
  // theoretical - a bank with exactly `windowSize` entries would fill
  // `recent` completely, causing pool.length===0 and a full reset to
  // the entire bank (including whatever was JUST picked), allowing an
  // immediate back-to-back repeat. Capping the effective window at
  // bank.length-1 guarantees at least the most-recent pick stays
  // excluded no matter how small the bank is.
  const effectiveWindow = Math.min(windowSize, bank.length - 1);

  let pool = bank.filter((line) => !recent.includes(line));
  if (pool.length === 0) pool = bank;

  const choice = pool[Math.floor(Math.random() * pool.length)];

  recent.push(choice);
  while (recent.length > effectiveWindow) recent.shift();

  return choice;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

// ---------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------

const INTRO_LINES = [
  "Here we go! {attacker} and {defender} step into the ring, {attackerDescriptor} against {defenderDescriptor}!",
  "Folks, this is what we live for - {attacker} of {attackerFaction} versus {defender} of {defenderFaction}!",
  "Two incredible pilots, two incredible machines, and only one way to find out who's better - {attacker} versus {defender} starts right now!",
  "Would you look at that lineup - {attackerDescriptor} against {defenderDescriptor}, {attacker} versus {defender}!"
];

// NEW 2026-08-22, found via transcript review: the raw chassis name
// (chassis.js's buildChassisName, e.g. "Skirmisher-CRY") is meant for
// internal IDs/display, not speech - it read as broken abbreviations
// when spoken aloud. This builds a natural-language equivalent from the
// same underlying frame+core data instead.
function chassisDescriptor(fighter) {
  return `a ${fighter.frame}-class machine running a ${fighter.core} core`;
}

const SHOW_OPEN_LINES = [
  "Welcome back to Mech Match - and I gotta tell you, the Circuit has another great one for us today!",
  "Another day, another duel, and this crowd is READY. This is the Circuit Report!",
  "The arena's packed, the energy is electric, and the Circuit is calling for order!"
];

const ARENA_SETTING_LINES = [
  "And what a place to do it - {arenaName}, {arenaFlavor}.",
  "Today's battleground is {arenaName}: {arenaFlavor}.",
  "We're at {arenaName} today - {arenaFlavor} - and it could not be a better stage for this."
];

const STAKES_FRAMING_LINES = [
  "Whatever happens here today, it matters - the Circuit always keeps score, and I love that about this sport.",
  "The Sync Wars don't take a day off, and honestly? Neither do I. Let's get into it.",
  "Every single result here moves the needle on that War Map, and today's no different.",
  "This is exactly the kind of matchup that makes this show worth watching."
];

const RIVALRY_STAKES_LINES = [
  "And get this - this is their {n} meeting! These two know each other well by now, and I love that.",
  "Their {n} time sharing this arena, and folks, history like that does not just disappear.",
  "Call it what it is - a real rivalry. Their {n} meeting, and I don't think either of them has forgotten a single one."
];

const ARCHETYPE_PROFILE = {
  Veteran: "someone who's earned every ounce of that composure the hard way",
  Prodigy: "a pilot with more raw talent than experience, and that's a thrilling combination to watch",
  ReluctantSuccessor: "carrying a seat they didn't ask for and refusing to let it define them",
  Vengeful: "someone who remembers every single loss, and uses it",
  TrueBeliever: "fighting for something bigger than themselves, and you can feel that out there",
  Independent: "answering to absolutely nobody but themselves - I respect that",
  Mechanic: "someone who trusts a well-built machine more than any flashy tactic"
};
const ARCHETYPE_WATCH_FOR = {
  Veteran: "Watch for the patience here - this pilot doesn't rush anything.",
  Prodigy: "Watch for the flashes of brilliance - and stick around, because the occasional wobble is part of the story too.",
  ReluctantSuccessor: "Watch how they grow right in front of us as this fight goes on - that's the beautiful part.",
  // Vengeful intentionally has NO entry here - see the rivalry-aware
  // selection in narrateBattle below, and the fix note there.
  TrueBeliever: "Watch the sheer will here - they will not budge.",
  Independent: "Watch for anything - genuinely anything - because there's no playbook to predict this one.",
  Mechanic: "Watch this chassis take a beating and just keep coming - it won't hit the hardest, but it will not go down easy."
};

// [ADDED 2026-08-26, fixes a real bug]: the old single Vengeful line
// ("Watch what happens if this gets personal - and with this history,
// it might") fired for EVERY Vengeful pilot regardless of whether the
// ledger actually shows any rivalry history - a fabricated tease, which
// violates this show's own governing principle (report what the ledger
// produced, never predict what "should" happen - see brainstorm-pass-3).
// Split into two banks, selected in narrateBattle by context.rivalryMeetings:
// real history only gets referenced when it's real.
const VENGEFUL_WATCH_FOR_RIVALRY = [
  "Watch for the history here - this is real, and everybody in that cockpit knows it.",
  "This one's personal, and the record between them proves it.",
  "Watch what a real rivalry does to a fight - this is exactly that."
];
const VENGEFUL_WATCH_FOR_DEFAULT = [
  "Watch how they carry every loss into the next fight - that's the whole archetype right there.",
  "Watch the edge in this one - some pilots let a loss go. This one doesn't.",
  "Watch for the intensity - nothing personal yet between these two, but give it time."
];
const PILOT_PROFILE_LINES = [
  "Now, {attacker} - {profile}. {watchFor}",
  "Something worth knowing about {attacker}: they're {profile}. {watchFor}",
  "{attacker} steps in today as {profile}. {watchFor}"
];

// NEW 2026-08-19: explicit bridge between the fighter-introduction
// block and the first turn line - direct feedback that the jump from
// "watch for the patience here" straight into "That is a statement
// strike!" read as abrupt with nothing connecting them. Also leans on
// faction identity in the bridge itself, since this is the last natural
// beat before turn-by-turn combat where faction names can be
// foregrounded without interrupting the play-by-play.
const TRANSITION_LINES = [
  "Enough setup - {attackerFaction} against {defenderFaction}, let's see it in the arena!",
  "That's the story so far. Now let's find out what {attackerFaction} and {defenderFaction} actually brought today!",
  "Introductions are done - time to let these machines do the talking!"
];

// ---------------------------------------------------------------------
// Round structure (bell / first blood / the turn)
// ---------------------------------------------------------------------
// [ADDED 2026-08-26, explicit ask]: gives the fight a real boxing-match
// shape - a downbeat where combat actually starts, a marked first
// landed hit, and a marked moment the fight's shape becomes visible -
// instead of sliding straight from introductions into an undifferentiated
// stream of turn lines. Fires structurally (each once per fight, at a
// fixed point in the log), not based on ledger predictions - still just
// narrating what the log already produced, per this file's own governing
// principle at the top.

const BELL_OPEN_LINES = [
  "DING! Bell's up - whatever these two brought today, they're bringing it right now.",
  "And there's the bell. No warm-up in the Circuit - the first move IS the real move.",
  "Here we go - bell's rung, gloves are off, let's see who blinks first."
];

// Fires once, for the very first LANDED hit of the fight (never a miss
// or desync) - gives the opening exchange its own beat instead of
// treating turn one like any other turn.
const FIRST_BLOOD_LINES = [
  "{attacker} draws first blood - {move}, clean through the guard!",
  "And {attacker} wastes no time - {move} lands, and this crowd is UP before the echo even fades!",
  "First real exchange of the fight and {attacker} takes it - {move} connects!"
];

// Fires once, the first time either chassis crosses the half-HP tension
// threshold - marks the moment the fight's shape actually becomes
// visible. Distinct from HP_TENSION_HALF below, which is a per-turn
// clause that can keep firing on every subsequent turn once crossed.
const THE_TURN_LINES = [
  "And here's the turn - you can feel this fight tip before the damage numbers even catch up.",
  "That's the moment. The shape of this fight just changed, right there.",
  "This is where it stops being even. Something just shifted in that arena."
];

// ---------------------------------------------------------------------
// Attack / miss / desync
// ---------------------------------------------------------------------

const ATTACK_LINES_NORMAL = [
  "Oh, {attacker} lands {move} right on the mark! Nice hit!",
  "{attacker}'s {move} connects clean! {defender} is going to feel that one!",
  "Look at that closing speed - {attacker} fires off {move} and it's a good one!",
  "{defender} just couldn't get clear in time - {attacker}'s {move} lands!",
  // [ADDED 2026-08-26, explicit ask for more visceral impact language]
  "{attacker}'s {move} connects with a CRACK you can hear from the cheap seats!",
  "Metal on metal - {attacker}'s {move} lands and {defender} staggers back!"
];

const ATTACK_LINES_CRIT = [
  "OH WOW! {attacker} finds a seam in the armor and {move} lands ABSOLUTELY PERFECTLY! What a moment!",
  "Are you kidding me?! {attacker}'s {move} tears right through {defender}'s plating - that is a HUGE hit!",
  "{attacker} times it to absolute perfection - {move} lands with everything behind it! Incredible!",
  "That is a statement strike! {attacker}'s {move} connects at full force and this crowd is on its feet!",
  // [ADDED 2026-08-26]
  "That's not a dent - that's structural! {attacker}'s {move} just wrecked something important!",
  "{defender}'s chassis GROANS from that hit - {attacker}'s {move} did real damage there!"
];

const MISS_LINES = [
  "{defender} slips clear at the last second as {attacker}'s {move} goes wide - great instincts there!",
  "{attacker} overcommits just a touch and {move} finds nothing but air - it happens to the best of them.",
  "{attacker}'s {move} was well telegraphed, and {defender} reads it perfectly, sidestepping the whole thing!",
  "Not today! {defender} ducks right under {attacker}'s {move} - beautiful defensive move!"
];

const DESYNC_LINES = [
  "Oh, and there it is - {attacker}'s chassis hesitates for just a moment. Pilot and machine aren't quite speaking the same language right now, and that's a tough thing to watch, but it happens to everyone.",
  "{attacker} loses the beat there - the mech just isn't answering the way it should. Stay with them, folks, this happens even to the best.",
  "A real stumble from {attacker} there. The sync isn't there this turn, and my heart goes out to them - that's a hard moment in front of a crowd like this.",
  // [ADDED 2026-08-26]
  "And there it is - the sync drops for half a second. Just long enough.",
  "Pilot and chassis, arguing mid-fight. Not the time."
];

const CORE_COMMENTARY = {
  favorable: [
    "and that Core matchup is doing some real work for {attacker} right now!",
    "that's the Core advantage showing, and it's a beautiful thing to see!",
    "the type matchup could not be better for {attacker} in this moment!"
  ],
  unfavorable: [
    "but the Core matchup is working against {attacker} here - tough spot to be in.",
    "though {attacker} is fighting an uphill matchup there, and give them credit for staying in it.",
    "the Core disadvantage is costing {attacker}, but they are not backing down."
  ],
  neutral: []
};

const SYNC_COMMENTARY_HIGH = [
  "and {attacker} and this chassis are moving as one right now - that's what full sync looks like!",
  "that is about as close to perfect resonance as you will ever see!",
  "the connection between {attacker} and this machine is just obvious right now, and it's beautiful."
];
const SYNC_COMMENTARY_LOW = [
  "and {attacker} is still fighting for control of this chassis - stay patient, it'll come.",
  "the sync just isn't there yet for {attacker}, but I've seen pilots find it mid-fight before.",
  "{attacker} hasn't quite found this machine's rhythm yet, and that takes real grit to push through."
];
const SYNC_HIGH_THRESHOLD = 1.12;
const SYNC_LOW_THRESHOLD = 0.93;

const HP_TENSION_HALF = [
  "and {defender} is past the midpoint now - this fight has real shape to it, folks.",
  "that's put a real dent in {defender}'s chassis, but they are still standing and still fighting.",
  "{defender}'s trading from behind now, and I love how they're handling the pressure."
];
const HP_TENSION_CRITICAL = [
  "and {defender} is in real trouble now - my heart's racing for them, honestly. One more clean hit could end this.",
  "the warning lights are on for {defender}, and I just want to say - however this ends, they've fought their heart out.",
  "{defender} is on the ropes, and this crowd knows it too - you can feel it in here."
];
const HP_TENSION_HALF_THRESHOLD = 0.5;
const HP_TENSION_CRITICAL_THRESHOLD = 0.2;

// ---------------------------------------------------------------------
// Color-commentary asides and midpoint recap
// ---------------------------------------------------------------------

const COMMENTARY_ASIDES = [
  "This crowd is locked in, and honestly, so am I.",
  "Neither pilot is giving an inch, and I respect that so much.",
  "You can feel the pace of this fight shifting right now.",
  "This is exactly the kind of exchange I love this sport for.",
  "Both chassis are still reading each other, looking for that opening - great chess match.",
  "Every single exchange here is adding to the story between these two."
];
const COMMENTARY_ASIDE_CHANCE = 0.4;

const MIDPOINT_RECAP_LINES = [
  "Let's take stock for a second - {leader} of {leaderFaction} is ahead right now, holding at {pct} percent structural integrity. What a fight so far!",
  "Here's where we stand at the midpoint: the numbers favor {leaderFaction}'s {leader}, sitting at {pct} percent - but this thing is far from over.",
  "Quick check-in for everyone just tuning in: {leaderFaction} is ahead through {leader}, {pct} percent and holding strong."
];

// NEW 2026-08-22, found via transcript review: the bank above called
// 19% HP "holding strong" seconds after the same fighter was described
// as "on the ropes" - a direct tonal contradiction. This bank fires
// instead whenever the LEADER is also critically low, so being "ahead"
// doesn't get described as comfortable when it isn't.
const MIDPOINT_RECAP_LINES_TENSE = [
  "Let's take stock - {leader} of {leaderFaction} is ahead, but that's cold comfort at {pct} percent. Both of these chassis are hurting.",
  "Here's the midpoint reality: {leaderFaction}'s {leader} is technically ahead at {pct} percent, but nobody's safe in this fight right now.",
  "Quick check-in: {leader} leads on paper at {pct} percent - but at that number, this is anyone's fight."
];
const MIDPOINT_LEADER_LOW_THRESHOLD = 0.35;

// ---------------------------------------------------------------------
// Outro
// ---------------------------------------------------------------------

const BLOWOUT_LINES = [
  "Wow. That was not close, folks - {winner} was in complete control from start to finish. Just a phenomenal showing.",
  "{loser} never really found their footing today, and hey, that happens - but what a statement from {winner}.",
  "That's about as dominant as it gets. {winner} in total command tonight - take a bow.",
  // [ADDED 2026-08-26, explicit ask: short sentences at the finish]
  "And that's the fight. {winner}, start to finish, no question."
];
const NARROW_WIN_LINES = [
  "Oh my goodness, {winner} survives by the barest margin! That could have gone either way, and my heart is still pounding!",
  "Both of these chassis were running on absolute fumes by the end - {winner} just gets there first! What a fight!",
  "That is a brutal, even, incredible fight. {winner} wins it, but only just - give it up for both of these pilots!",
  // [ADDED 2026-08-26]
  "Closest thing to a coin flip the Circuit's seen all week - and it still had a winner: {winner}."
];
const STANDARD_WIN_LINES = [
  "{winner} takes it! {loser} fought hard and should hold their head high - that was a real battle.",
  "A clean, well-earned win for {winner} - beautifully done.",
  "{winner} closes it out with room to spare - fantastic performance.",
  // [ADDED 2026-08-26]
  "And that's the fight. {winner} gets it done."
];
// NEW 2026-08-22, found via transcript review: a winner who barely
// cleared narrow-win territory (survivor HP just above 15%) was getting
// the exact same "clean, beautifully done" language as one who won
// comfortably at 65% - two very different fights sounding identical.
const HARD_FOUGHT_WIN_LINES = [
  "That was closer than the final numbers might suggest - {winner} gets it done, but {loser} made them work for every inch.",
  "{winner} survives a real test here - not a blowout, not a photo finish, but a genuine fight the whole way.",
  "A hard-fought win for {winner}. {loser} pushed them right to the edge before it was over."
];
const TIMEOUT_LINES = [
  "Neither pilot could put the other away, and honestly, that's a testament to both of them - {winner} takes it on remaining structure as the clock runs out.",
  "It goes the distance! {winner} edges it on points when time runs out - what a display of endurance from both sides."
];

const DECISIVE_FACTOR_LINES = {
  'core-effectiveness': [
    "In the end, that Core matchup told the whole story.",
    "That type advantage was the difference-maker in this one."
  ],
  sync: [
    "In the end, it came down to sync - {winner} was simply more locked in, and it showed.",
    "That resonance gap decided this one, plain and simple."
  ],
  'critical-hits': [
    "One perfectly-timed strike changed the entire shape of this fight.",
    "A single incredible hit swung the whole match - what a moment."
  ]
};

const RIVALRY_CLOSE_LINES = [
  "That's their {n} meeting on the books now, and folks, this is far from over between these two.",
  "The record between them keeps shifting - their {n} meeting, and still nobody's pulling away for good."
];
const RIPPLE_CLOSE_LINES = [
  "Nobody saw that coming! This crowd is buzzing, and the whole Circuit is going to be talking about this one.",
  "That's an upset, plain and simple, and I am HERE for it.",
  "That's the kind of result that changes how people think about this matchup entirely."
];

// NEW 2026-08-19: each faction's "local saying" from the Circuit doc -
// fires occasionally (not every episode, so it doesn't get repetitive)
// right after the standings-close line, giving the winning faction's
// philosophy a voice. Only covers the 8 factions actually live in
// chassis.js; a faction with no entry here just skips this line
// entirely rather than erroring.
const FACTION_SAYING = {
  'Ashguard Combine': 'As the Foundry Belt says - the furnace doesn\'t care who you were.',
  'Skyline Concord': 'As they say up in the High Reaches - if you cannot hold the height, you never owned it.',
  'Tidewrought Assembly': 'As the Salt Archipelago teaches - the ground is only borrowed.',
  'Wraithline Circuit': 'As Wraithline pilots put it - if they saw you, you were late.',
  'Ironroot Concord': 'As they say in the Deep Canopy - stand long enough and the world grows around you.',
  'Aurelian Accord': 'As Aurel teaches - skill is what remains when spectacle is removed.',
  'Static Vanguard': 'As the Volt Flats put it - if you\'re comfortable, you\'re already slowing down.',
  'Thornback Cartel': 'As the Thornbacks say - if it still works, it belongs in the fight.'
};
const FACTION_SAYING_CHANCE = 0.65;

const STANDINGS_CLOSE_LINES = [
  "Another well-earned mark in the record for {winnerFaction} - congratulations to that whole team.",
  "{winnerFaction} banks the win, and you know the War Map is taking notice.",
  "Score one more for {winnerFaction} - the standings just moved again, and this season keeps getting better."
];

const SIGN_OFF_LINES = [
  "That's a result for the record books - and to both of these pilots, thank you for the incredible show. See you next time on Mech Match!",
  "The Circuit keeps moving, and I would not want to be anywhere else. On to the next one!",
  "Standings updated, records kept, and another great story added to this show - that's how we do it here.",
  "Another chassis walks away with a story worth telling. That's the Sync Wars, and I love every minute of it."
];

function narrateEntryDetailed(entry, flavorState) {
  const vars = { attacker: entry.attacker, defender: entry.defender, move: entry.move };

  if (entry.event === 'desync') {
    return { line: fill(pickFlavor('desync', DESYNC_LINES, flavorState), vars), hadBonusClause: true };
  }
  if (entry.event === 'miss') {
    return { line: fill(pickFlavor('miss', MISS_LINES, flavorState), vars), hadBonusClause: false };
  }

  const bank = entry.crit ? ATTACK_LINES_CRIT : ATTACK_LINES_NORMAL;
  const bankKey = entry.crit ? 'attack-crit' : 'attack-normal';
  let line = fill(pickFlavor(bankKey, bank, flavorState), vars);
  let hadBonusClause = false;

  const coreBank = CORE_COMMENTARY[entry.effectivenessLabel] || [];
  if (coreBank.length) {
    const clause = fill(pickFlavor(`core-${entry.effectivenessLabel}`, coreBank, flavorState), vars);
    line += ' ' + clause.charAt(0).toUpperCase() + clause.slice(1);
    hadBonusClause = true;
  }

  if (entry.syncMult >= SYNC_HIGH_THRESHOLD) {
    const clause = fill(pickFlavor('sync-high', SYNC_COMMENTARY_HIGH, flavorState), vars);
    line += ' ' + clause.charAt(0).toUpperCase() + clause.slice(1);
    hadBonusClause = true;
  } else if (entry.syncMult <= SYNC_LOW_THRESHOLD) {
    const clause = fill(pickFlavor('sync-low', SYNC_COMMENTARY_LOW, flavorState), vars);
    line += ' ' + clause.charAt(0).toUpperCase() + clause.slice(1);
    hadBonusClause = true;
  }

  if (entry.defenderMaxHp > 0) {
    const hpFrac = entry.defenderHpAfter / entry.defenderMaxHp;
    if (hpFrac <= HP_TENSION_CRITICAL_THRESHOLD && hpFrac > 0) {
      const clause = fill(pickFlavor('hp-critical', HP_TENSION_CRITICAL, flavorState), vars);
      line += ' ' + clause.charAt(0).toUpperCase() + clause.slice(1);
      hadBonusClause = true;
    } else if (hpFrac <= HP_TENSION_HALF_THRESHOLD) {
      const clause = fill(pickFlavor('hp-half', HP_TENSION_HALF, flavorState), vars);
      line += ' ' + clause.charAt(0).toUpperCase() + clause.slice(1);
      hadBonusClause = true;
    }
  }

  return { line, hadBonusClause };
}

/**
 * @param {object} result - battle.js's simulateBattle() output
 * @param {object} fighterA
 * @param {object} fighterB
 * @param {object} [flavorState]
 * @param {object} [context] - { rivalryMeetings?: number, ripple?: boolean }.
 *   Omitting it just means the stakes/rivalry/ripple lines don't fire -
 *   safe default, not an error.
 */
export function narrateBattle(result, fighterA, fighterB, flavorState = createFlavorState(), context = {}) {
  const introVars = {
    attacker: fighterA.name,
    defender: fighterB.name,
    attackerDescriptor: chassisDescriptor(fighterA),
    defenderDescriptor: chassisDescriptor(fighterB),
    attackerFaction: fighterA.faction,
    defenderFaction: fighterB.faction
  };

  let intro = fill(pickFlavor('intro', INTRO_LINES, flavorState), introVars);
  intro += ' ' + pickFlavor('show-open', SHOW_OPEN_LINES, flavorState);
  if (context.arena) {
    intro += ' ' + fill(
      pickFlavor('arena-setting', ARENA_SETTING_LINES, flavorState),
      { arenaName: context.arena.name, arenaFlavor: context.arena.flavor }
    );
  }
  intro += ' ' + fill(pickFlavor('stakes-framing', STAKES_FRAMING_LINES, flavorState), introVars);

  if (context.rivalryMeetings >= 2) {
    intro += ' ' + fill(
      pickFlavor('rivalry-stakes', RIVALRY_STAKES_LINES, flavorState),
      { n: ordinal(context.rivalryMeetings) }
    );
  }

  for (const [fighter, bankKey] of [[fighterA, 'pilot-profile-a'], [fighterB, 'pilot-profile-b']]) {
    const profile = ARCHETYPE_PROFILE[fighter.archetypeKey];
    let watchFor = ARCHETYPE_WATCH_FOR[fighter.archetypeKey];
    // See the fix note by VENGEFUL_WATCH_FOR_RIVALRY above - only
    // reference real history when context.rivalryMeetings says there is
    // some; otherwise describe the archetype without inventing a
    // specific history that isn't there.
    if (fighter.archetypeKey === 'Vengeful') {
      watchFor = context.rivalryMeetings >= 2
        ? pickFlavor('vengeful-watch-rivalry', VENGEFUL_WATCH_FOR_RIVALRY, flavorState)
        : pickFlavor('vengeful-watch-default', VENGEFUL_WATCH_FOR_DEFAULT, flavorState);
    }
    if (profile) {
      intro += ' ' + fill(
        pickFlavor(bankKey, PILOT_PROFILE_LINES, flavorState),
        { attacker: fighter.name, profile, watchFor: watchFor || '' }
      );
    }
  }

  intro += ' ' + fill(pickFlavor('transition', TRANSITION_LINES, flavorState), introVars);
  intro += ' ' + pickFlavor('bell-open', BELL_OPEN_LINES, flavorState);

  const turnLines = [];
  const midpoint = Math.floor(result.log.length / 2);
  let firstBloodAnnounced = false;
  let turnAnnounced = false;
  for (let i = 0; i < result.log.length; i++) {
    const entry = result.log[i];
    const defenderFighter = entry.defender === fighterA.name ? fighterA : fighterB;

    // "First blood" - the first LANDED hit of the fight (never a miss
    // or desync) gets its own beat before the normal turn line.
    if (!firstBloodAnnounced && entry.event !== 'miss' && entry.event !== 'desync') {
      turnLines.push(fill(
        pickFlavor('first-blood', FIRST_BLOOD_LINES, flavorState),
        { attacker: entry.attacker, defender: entry.defender, move: entry.move }
      ));
      firstBloodAnnounced = true;
    }

    const { line, hadBonusClause } = narrateEntryDetailed({ ...entry, defenderMaxHp: defenderFighter.maxHp }, flavorState);
    turnLines.push(line);

    // "The turn" - fires once, the first time either chassis crosses the
    // half-HP tension threshold. Separate from the per-turn
    // HP_TENSION_HALF clause inside narrateEntryDetailed, which can keep
    // firing every subsequent turn once crossed - this one marks the
    // single moment the fight's shape actually becomes visible.
    if (!turnAnnounced && defenderFighter.maxHp > 0) {
      const hpFrac = entry.defenderHpAfter / defenderFighter.maxHp;
      if (hpFrac <= HP_TENSION_HALF_THRESHOLD && hpFrac > 0) {
        turnLines.push(pickFlavor('the-turn', THE_TURN_LINES, flavorState));
        turnAnnounced = true;
      }
    }

    if (!hadBonusClause && Math.random() < COMMENTARY_ASIDE_CHANCE) {
      turnLines.push(pickFlavor('commentary-aside', COMMENTARY_ASIDES, flavorState));
    }

    if (i === midpoint && result.log.length >= 2) {
      const leaderIsA = fighterA.hp >= fighterB.hp;
      const leader = leaderIsA ? fighterA : fighterB;
      const leaderFracRaw = leader.hp / leader.maxHp;
      const leaderFrac = Math.round(leaderFracRaw * 100);
      const bank = leaderFracRaw <= MIDPOINT_LEADER_LOW_THRESHOLD ? MIDPOINT_RECAP_LINES_TENSE : MIDPOINT_RECAP_LINES;
      turnLines.push(fill(
        pickFlavor('midpoint-recap', bank, flavorState),
        { leader: leader.name, leaderFaction: leader.faction, pct: leaderFrac }
      ));
    }
  }

  const outroVars = { winner: result.winner, loser: result.loser };
  let outroBank, outroKey;
  if (result.timedOut) { outroBank = TIMEOUT_LINES; outroKey = 'outro-timeout'; }
  else if (result.blowout) { outroBank = BLOWOUT_LINES; outroKey = 'outro-blowout'; }
  else if (result.narrowWin) { outroBank = NARROW_WIN_LINES; outroKey = 'outro-narrow'; }
  else if (result.hardFought) { outroBank = HARD_FOUGHT_WIN_LINES; outroKey = 'outro-hard-fought'; }
  else { outroBank = STANDARD_WIN_LINES; outroKey = 'outro-standard'; }

  let outro = fill(pickFlavor(outroKey, outroBank, flavorState), outroVars);

  const factorBank = DECISIVE_FACTOR_LINES[result.decisiveFactor];
  if (factorBank) {
    outro += ' ' + fill(pickFlavor(`factor-${result.decisiveFactor}`, factorBank, flavorState), outroVars);
  }

  outro += ' ' + fill(
    pickFlavor('standings-close', STANDINGS_CLOSE_LINES, flavorState),
    { winnerFaction: fighterA.name === result.winner ? fighterA.faction : fighterB.faction }
  );

  const winnerFactionName = fighterA.name === result.winner ? fighterA.faction : fighterB.faction;
  const saying = FACTION_SAYING[winnerFactionName];
  if (saying && Math.random() < FACTION_SAYING_CHANCE) {
    outro += ' ' + saying;
  }

  if (context.ripple) {
    outro += ' ' + pickFlavor('ripple-close', RIPPLE_CLOSE_LINES, flavorState);
  } else if (context.rivalryMeetings >= 2) {
    outro += ' ' + fill(
      pickFlavor('rivalry-close', RIVALRY_CLOSE_LINES, flavorState),
      { n: ordinal(context.rivalryMeetings) }
    );
  }

  outro += ' ' + pickFlavor('sign-off', SIGN_OFF_LINES, flavorState);

  return { intro, turnLines, outro, fullText: [intro, ...turnLines, outro].join(' ') };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
