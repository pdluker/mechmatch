// rss.js
//
// Builds a podcast RSS 2.0 + iTunes-namespace feed from the episode
// metadata storage.js already maintains (readEpisodesList). Pure
// function - data in, XML string out. Doesn't touch R2 itself, same
// separation every other module in this project keeps from storage.

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ASSUMPTION: appendEpisodeMeta (worker.js) only stores pilot ids, not
// display names or a written title/summary - script.js's actual
// narration text isn't persisted anywhere per-episode right now. Using
// a placeholder title/description here until real episode titles are
// threaded through into episode metadata; that's a content decision
// (bible-level), not one to invent silently in the feed layer.
function titleForEpisode(meta) {
  return `Episode ${meta.episode}`;
}

function descriptionForEpisode(meta) {
  const outcome = meta.blowout
    ? 'A total mismatch.'
    : meta.narrowWin
    ? 'A photo finish.'
    : 'A hard-fought win.';
  return `${outcome} ${escapeXml(meta.winnerPilotId)} defeats ${escapeXml(meta.loserPilotId)}.`;
}

/**
 * @param {object[]} episodes - storage.js's readEpisodesList() result (oldest first)
 * @param {object} show - { title, description, author, siteUrl, coverImageUrl, language, explicit }
 */
export function buildRssFeed(episodes, show) {
  const items = [...episodes]
    .reverse() // newest first, standard podcast feed order
    .map((meta) => {
      const audioUrl = `${show.siteUrl}/${meta.audioKey}`;
      const pubDate = new Date(meta.publishedAt).toUTCString();
      return `
    <item>
      <title>${escapeXml(titleForEpisode(meta))}</title>
      <description>${descriptionForEpisode(meta)}</description>
      <enclosure url="${escapeXml(audioUrl)}" type="audio/mpeg" />
      <guid isPermaLink="false">${escapeXml(show.siteUrl)}/episode/${meta.episode}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    </item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <link>${escapeXml(show.siteUrl)}</link>
    <language>${escapeXml(show.language || 'en-us')}</language>
    <description>${escapeXml(show.description)}</description>
    <itunes:author>${escapeXml(show.author)}</itunes:author>
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:image href="${escapeXml(show.coverImageUrl)}" />
    <image>
      <url>${escapeXml(show.coverImageUrl)}</url>
      <title>${escapeXml(show.title)}</title>
      <link>${escapeXml(show.siteUrl)}</link>
    </image>${items}
  </channel>
</rss>`;
}
