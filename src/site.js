// site.js
//
// Renders the public front end: the homepage (hero + ticker + recent
// editions) and, new as of 2026-08-21, a real per-episode permalink page.
//
// FACTION EMPHASIS [2026-08-21, explicit ask]: previously, faction color
// only showed up as a small dot, and it silently never worked at all -
// see worker.js's companion fix. meta.winnerFaction/meta.loserFaction
// are now real fields, so pilot names are paired with visible,
// color-coded faction badges everywhere a pilot name appears, not just
// a dot.

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FACTION_ACCENT = {
  'Ashguard Combine': '#C1441E',
  'Skyline Concord': '#3E6FA8',
  'Tidewrought Assembly': '#1F6B6B',
  'Wraithline Circuit': '#7A4FA0',
  'Ironroot Concord': '#3C5F3A',
  'Aurelian Accord': '#B8901E',
  'Static Vanguard': '#2B6CB0',
  'Thornback Cartel': '#8B5A2B'
};
const DEFAULT_ACCENT = '#C1441E';

function outcomeLabel(meta) {
  if (meta.blowout) return 'Blowout';
  if (meta.narrowWin) return 'Narrow Win';
  return 'Decisive Win';
}

function pilotDisplayName(id) {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function accentFor(faction) {
  return FACTION_ACCENT[faction] || DEFAULT_ACCENT;
}

/**
 * Faction badge - a small colored, bordered tag showing the faction name
 * itself (not just a color swatch). This is the actual fix for "emphasize
 * the factions": a name+faction pairing was cheap to add, but it only
 * reads as emphasis if the faction is legible text, not a 9px dot.
 */
function factionBadge(faction) {
  const color = accentFor(faction);
  const label = faction || 'Unaffiliated';
  return `<span class="faction-badge" style="--fc:${color}">${escapeHtml(label)}</span>`;
}

function tickerItem(meta) {
  const winner = pilotDisplayName(meta.winnerPilotId);
  const loser = pilotDisplayName(meta.loserPilotId);
  return `<span class="ticker-item"><span class="ticker-tag">EP ${String(meta.episode).padStart(3, '0')}</span>${escapeHtml(winner)} <span class="ticker-faction" style="--fc:${accentFor(meta.winnerFaction)}">${escapeHtml(meta.winnerFaction || '')}</span> defeats ${escapeHtml(loser)} &middot; ${outcomeLabel(meta).toUpperCase()}</span>`;
}

function transcriptHtml(meta) {
  if (!meta.narrationText) return '';
  return `
    <details class="transcript">
      <summary>Show transcript</summary>
      <p>${escapeHtml(meta.narrationText)}</p>
    </details>`;
}

function posterFrame(meta, { size = 'full', neutral = false } = {}) {
  const accent = accentFor(meta.winnerFaction);
  if (meta.artKey) {
    // `neutral`: alt text lists pilots alphabetically instead of
    // winner-first, so the DOM/screen-reader text doesn't leak the
    // result via ordering alone even though it never said "defeats".
    // Only used for the live hero poster - archival posters (recent
    // rows, permalinks) keep winner-first since the result is the point.
    const [nameA, nameB] = neutral
      ? neutralPilotOrder(meta)
      : [pilotDisplayName(meta.winnerPilotId), pilotDisplayName(meta.loserPilotId)];
    return `<img class="poster poster-${size}" src="/${escapeHtml(meta.artKey)}" alt="Battle art: ${escapeHtml(nameA)} vs ${escapeHtml(nameB)}" loading="${size === 'full' ? 'eager' : 'lazy'}" />`;
  }
  return `<div class="poster poster-${size} poster-fallback" style="--accent:${accent}" aria-hidden="true"><span>EP ${String(meta.episode).padStart(3, '0')}</span></div>`;
}

/**
 * Matchup line used in the recent-editions rows - these are archival,
 * already-resolved results, so naming the winner ("defeats") is the
 * point. NOT for the live/current episode - see neutralMatchupLine.
 */
function matchupLine(meta) {
  const winner = pilotDisplayName(meta.winnerPilotId);
  const loser = pilotDisplayName(meta.loserPilotId);
  return (
    `<span class="ep-pilot">${escapeHtml(winner)}</span>${factionBadge(meta.winnerFaction)}` +
    `<span class="vs-word">defeats</span>` +
    `<span class="ep-pilot">${escapeHtml(loser)}</span>${factionBadge(meta.loserFaction)}`
  );
}

/**
 * [ADDED 2026-08-26, explicit ask]: neutral matchup line for the LIVE/
 * current episode only - no "defeats," no winner-first ordering. Pilots
 * are sorted alphabetically by display name rather than by win/loss, so
 * the pairing itself carries zero information about the result. Used
 * for the homepage hero exclusively; recentRow/matchupLine (above)
 * still reveal the result, since those rows are archival by definition.
 */
function neutralPilotOrder(meta) {
  const a = pilotDisplayName(meta.winnerPilotId);
  const b = pilotDisplayName(meta.loserPilotId);
  return [a, b].sort((x, y) => x.localeCompare(y));
}

function neutralMatchupLine(meta) {
  const [nameA, nameB] = neutralPilotOrder(meta);
  const factionA = nameA === pilotDisplayName(meta.winnerPilotId) ? meta.winnerFaction : meta.loserFaction;
  const factionB = nameA === pilotDisplayName(meta.winnerPilotId) ? meta.loserFaction : meta.winnerFaction;
  return (
    `<span class="ep-pilot">${escapeHtml(nameA)}</span>${factionBadge(factionA)}` +
    `<span class="vs-word">vs</span>` +
    `<span class="ep-pilot">${escapeHtml(nameB)}</span>${factionBadge(factionB)}`
  );
}

// ITEM 4/5: poster + matchline are separately clickable links to the
// episode's permalink, rather than wrapping the whole row/hero in an
// <a> (which would nest an <a> around the <audio controls> and
// <details> elements below it - invalid HTML and flaky in some
// browsers). Two smaller links is the correct trade-off here.
function recentRow(meta) {
  const date = new Date(meta.publishedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
  return `
    <article class="ep-row">
      <a class="poster-link" href="/episode/${meta.episode}">${posterFrame(meta, { size: 'thumb' })}</a>
      <div class="ep-main">
        <a class="ep-matchline-link" href="/episode/${meta.episode}">
          <div class="ep-matchline">${matchupLine(meta)}</div>
        </a>
        <div class="ep-sub">
          <span class="tag">${outcomeLabel(meta)}</span>
          ${meta.arenaName ? `<span class="ep-arena">${escapeHtml(meta.arenaName)}</span>` : ''}
          <span class="ep-date">${date}</span>
        </div>
        <audio controls preload="none" src="/${escapeHtml(meta.audioKey)}"></audio>
        ${transcriptHtml(meta)}
      </div>
    </article>`;
}

const SHARED_HEAD = (show) => `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="${escapeHtml(show.description)}" />
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(show.title)}" href="/feed.xml" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: light;
    --paper: #EDE3CE;
    --paper-dim: #E2D5B8;
    --ink: #1A1410;
    --ink-soft: #3A322A;
    --signal: #C1441E;
    --gold: #D9A441;
    --line: #C9B98F;
    --display: 'Anton', sans-serif;
    --body: 'Source Serif 4', Georgia, serif;
    --mono: 'JetBrains Mono', monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--body);
    line-height: 1.55;
    position: relative;
  }
  body::before {
    content: '';
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: radial-gradient(var(--ink) 0.6px, transparent 0.6px);
    background-size: 6px 6px;
    opacity: 0.05;
  }
  a { color: inherit; text-decoration: none; }
  img { display: block; max-width: 100%; }

  .nav {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 24px;
    background: var(--ink);
    border-bottom: 3px solid var(--gold);
  }
  /* ITEM 3: tagline under the wordmark */
  .wordmark {
    display: flex; flex-direction: column; line-height: 1.15;
    font-family: var(--display); font-size: 1.3rem; letter-spacing: 0.02em;
    color: var(--paper);
  }
  .wordmark span.brand-accent { color: var(--gold); }
  .wordmark .tagline {
    font-family: var(--mono); font-size: 0.56rem; letter-spacing: 0.14em;
    color: var(--gold); text-transform: uppercase; margin-top: 3px; font-weight: 500;
  }
  .nav-links { display: flex; gap: 22px; }
  .nav-links a {
    color: var(--paper-dim);
    font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.08em;
    text-transform: uppercase; border-bottom: 2px solid transparent; padding-bottom: 3px;
  }
  .nav-links a:hover { color: var(--gold); border-color: var(--gold); }

  .hero {
    position: relative; z-index: 1;
    max-width: 720px; margin: 0 auto; padding: 44px 24px 40px;
    text-align: center;
  }
  .eyebrow {
    font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.1em;
    color: var(--signal); text-transform: uppercase; margin: 0 0 20px;
  }
  .poster-full {
    width: 100%; aspect-ratio: 1 / 1; object-fit: cover;
    border: 3px solid var(--ink);
    box-shadow: 9px 9px 0 var(--ink);
    margin: 0 auto 20px;
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .hero-poster-link:hover .poster-full {
    transform: translate(-2px, -2px);
    box-shadow: 11px 11px 0 var(--ink);
  }
  .poster-fallback {
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(160deg, var(--accent) 0%, var(--ink) 130%);
  }
  .poster-fallback span {
    font-family: var(--display); color: var(--paper); font-size: 1.4rem; letter-spacing: 0.05em;
  }
  .hero h1 {
    font-family: var(--display); font-weight: 400; text-transform: uppercase;
    font-size: clamp(1.9rem, 5vw, 3.2rem); line-height: 1.02; letter-spacing: 0.01em;
    margin: 0 0 12px;
  }
  /* ITEM 1: prominent faction pairing under the hero headline */
  .hero-matchup { margin: 0 0 18px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .hero-sub { color: var(--ink-soft); font-size: 1.05rem; max-width: 46ch; margin: 0 auto 22px; }
  .hero-actions audio { width: 100%; }
  .hero-empty h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); }

  .ticker {
    position: relative; z-index: 1;
    background: var(--ink); border-top: 3px solid var(--gold); border-bottom: 3px solid var(--gold);
    overflow: hidden; white-space: nowrap; padding: 10px 0;
  }
  .ticker-track { display: inline-block; animation: scroll-left 40s linear infinite; }
  .ticker-item { display: inline-block; font-family: var(--mono); font-size: 0.8rem; color: var(--paper-dim); margin: 0 26px; }
  .ticker-tag {
    display: inline-block; background: var(--signal); color: var(--paper);
    font-size: 0.68rem; letter-spacing: 0.04em; padding: 2px 7px; margin-right: 8px;
  }
  .ticker-faction { color: var(--fc); font-size: 0.72rem; margin: 0 4px; }
  @keyframes scroll-left { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .ticker-track { animation: none; } }

  .recent {
    position: relative; z-index: 1;
    max-width: 780px; margin: 0 auto; padding: 44px 24px 64px;
  }
  .recent h2 {
    font-family: var(--display); font-weight: 400; text-transform: uppercase;
    font-size: 1.3rem; letter-spacing: 0.02em; margin: 0 0 6px;
  }
  .recent .section-sub { color: var(--ink-soft); font-size: 0.9rem; margin: 0 0 24px; }

  /* ITEM 4: hover states - subtle lift + shadow punch + poster zoom */
  .ep-row {
    display: grid; grid-template-columns: 88px 1fr; gap: 16px;
    background: var(--paper); border: 3px solid var(--ink);
    box-shadow: 5px 5px 0 var(--ink);
    padding: 14px; margin-bottom: 20px;
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .ep-row:hover { box-shadow: 7px 7px 0 var(--ink); transform: translate(-2px, -2px); }
  .poster-thumb { width: 100%; aspect-ratio: 1/1; object-fit: cover; border: 2px solid var(--ink); transition: transform 0.2s ease; }
  .poster-thumb.poster-fallback span { font-size: 0.85rem; }
  .poster-link:hover .poster-thumb { transform: scale(1.05); }
  .ep-main { display: flex; flex-direction: column; gap: 4px; }
  .ep-matchline-link:hover .ep-matchline { color: var(--signal); }
  .ep-matchline { font-family: var(--body); font-weight: 600; font-size: 1.02rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; transition: color 0.15s ease; }
  .ep-pilot { white-space: nowrap; }
  .vs-word { color: var(--ink-soft); font-weight: 400; font-style: italic; }
  /* ITEM 1: faction badges, everywhere a pilot name appears */
  .faction-badge {
    display: inline-block; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.05em;
    text-transform: uppercase; color: var(--fc); border: 1px solid var(--fc);
    padding: 2px 6px; margin-right: 2px; border-radius: 2px; white-space: nowrap;
  }
  .ep-sub { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .tag {
    font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.05em;
    color: var(--signal); border: 1px solid var(--signal); padding: 2px 6px; text-transform: uppercase;
  }
  .ep-arena, .ep-date { font-family: var(--mono); font-size: 0.72rem; color: var(--ink-soft); }
  .ep-row audio { width: 100%; height: 32px; }
  .empty { color: var(--ink-soft); }

  .transcript { margin-top: 8px; }
  .transcript summary {
    cursor: pointer; list-style: none;
    font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.05em;
    color: var(--signal); text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .transcript summary::-webkit-details-marker { display: none; }
  .transcript summary::before { content: '\\25B8'; transition: transform 0.15s ease; }
  .transcript[open] summary::before { transform: rotate(90deg); }
  .transcript p {
    margin: 8px 0 0; padding: 12px 14px;
    background: var(--paper-dim); border-left: 3px solid var(--signal);
    font-size: 0.9rem; color: var(--ink-soft);
    max-height: 260px; overflow-y: auto; white-space: pre-wrap;
  }

  .back-link {
    display: inline-block; margin: 0 0 20px;
    font-family: var(--mono); font-size: 0.75rem; letter-spacing: 0.05em;
    color: var(--ink-soft); text-transform: uppercase;
  }
  .back-link:hover { color: var(--signal); }

  footer {
    position: relative; z-index: 1;
    background: var(--ink); color: var(--paper-dim);
    padding: 28px 24px; text-align: center;
    font-family: var(--mono); font-size: 0.7rem;
  }
  footer a { color: var(--gold); }

  @media (max-width: 640px) {
    .nav-links { gap: 14px; }
    .ep-row { grid-template-columns: 64px 1fr; }
  }
</style>`;

const NAV = `
  <nav class="nav">
    <a class="wordmark" href="/">
      <span>MECH<span class="brand-accent">MATCH</span></span>
      <span class="tagline">Pilots. Machines. Stories.</span>
    </a>
    <div class="nav-links">
      <a href="/">Today</a>
      <a href="/#recent">Recent</a>
      <a href="/feed.xml">Subscribe</a>
    </div>
  </nav>`;

export function renderIndexHtml(episodes, show) {
  const ordered = [...episodes].reverse();
  const latest = ordered[0];
  const recent = ordered.slice(1, 10);
  // FIX 2026-08-26: this used to start at index 0, which pulled today's
  // LIVE episode into the ticker - and tickerItem() names the winner
  // ("[Winner] defeats [Loser]"), so the result was spoiled in the
  // ticker even while the hero above it was showing a neutral title.
  // Ticker is archival-results browsing, same as Recent Editions below
  // it, so it starts after latest exactly like `recent` does.
  const tickerSource = ordered.slice(1, 9);

  const heroSection = latest ? `
    <section class="hero">
      <p class="eyebrow">&#9679; LIVE &mdash; TODAY'S DUEL &mdash; EPISODE ${String(latest.episode).padStart(3, '0')}</p>
      <a class="hero-poster-link" href="/episode/${latest.episode}">${posterFrame(latest, { size: 'full', neutral: true })}</a>
      <h1>${(() => { const [a, b] = neutralPilotOrder(latest); return `${escapeHtml(a)} <span class="vs-word">vs</span> ${escapeHtml(b)}`; })()}</h1>
      <p class="hero-matchup">${neutralMatchupLine(latest)}</p>
      <p class="hero-sub">Two pilots. One arena. The War Map is watching.</p>
      <div class="hero-actions">
        <audio controls preload="none" src="/${escapeHtml(latest.audioKey)}"></audio>
      </div>
      ${transcriptHtml(latest)}
    </section>` : `
    <section class="hero hero-empty">
      <p class="eyebrow">MECH MATCH</p>
      <h1>The first duel hasn't aired yet.</h1>
      <p class="hero-sub">Check back after the next Circuit cron run.</p>
    </section>`;

  const tickerHtml = tickerSource.length
    ? `<div class="ticker" role="region" aria-label="Recent results ticker"><div class="ticker-track">${tickerSource.map(tickerItem).join('')}<span aria-hidden="true">${tickerSource.map(tickerItem).join('')}</span></div></div>`
    : '';

  const recentHtml = recent.length ? recent.map(recentRow).join('\n') : '<p class="empty">No earlier episodes yet.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<title>${escapeHtml(show.title)}</title>
${SHARED_HEAD(show)}
</head>
<body>
  ${NAV}

  ${heroSection}

  ${tickerHtml}

  <section class="recent" id="recent">
    <h2>Recent Editions</h2>
    <p class="section-sub">Every duel, in order.</p>
    ${recentHtml}
  </section>

  <footer>
    ${escapeHtml(show.title)} &mdash; ${escapeHtml(show.description)}<br/>
    <a href="/feed.xml">RSS</a>
  </footer>
</body>
</html>`;
}

/**
 * ITEM 5: real per-episode permalink page. Not the full anime "title
 * card" treatment from the redesign feedback (no in-world episode
 * titles are generated yet - that's separate content work, not a
 * front-end change), but a genuine standalone page per episode:
 * full poster, matchup with faction emphasis, arena, outcome, full
 * transcript, and a link back - the actual missing piece that made
 * "click a card, land on its own page" impossible before.
 */
export function renderEpisodeHtml(meta, show) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<title>Episode ${meta.episode} &mdash; ${escapeHtml(show.title)}</title>
${SHARED_HEAD(show)}
</head>
<body>
  ${NAV}

  <section class="hero">
    <p class="eyebrow">&#9679; THE CIRCUIT &mdash; MATCH ${String(meta.episode).padStart(3, '0')}</p>
    ${posterFrame(meta, { size: 'full' })}
    <h1>${escapeHtml(pilotDisplayName(meta.winnerPilotId))} defeats ${escapeHtml(pilotDisplayName(meta.loserPilotId))}</h1>
    <p class="hero-matchup">${matchupLine(meta)}</p>
    <p class="hero-sub">
      ${outcomeLabel(meta)}${meta.decisiveFactor && meta.decisiveFactor !== 'attrition' ? ` &middot; decided by ${escapeHtml(meta.decisiveFactor.replace('-', ' '))}` : ''}
      ${meta.arenaName ? ` &middot; ${escapeHtml(meta.arenaName)}` : ''}
    </p>
    <div class="hero-actions">
      <audio controls preload="none" src="/${escapeHtml(meta.audioKey)}"></audio>
    </div>
    ${transcriptHtml(meta)}
  </section>

  <section class="recent">
    <a class="back-link" href="/">&larr; Back to the Circuit</a>
  </section>

  <footer>
    ${escapeHtml(show.title)} &mdash; ${escapeHtml(show.description)}<br/>
    <a href="/feed.xml">RSS</a>
  </footer>
</body>
</html>`;
}
