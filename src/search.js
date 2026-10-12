/**
 * Retrieval and keyword-matching engine for Dev's Personal AI.
 *
 * Everything here is plain JavaScript: tokenize the question, score retrieved
 * Discord messages by keyword overlap, and return the best matches with
 * channel names, timestamps and jump links. No AI model is involved.
 *
 * Message sources:
 *  1. Live retrieval from the Discord REST API (paginated, rate-limit aware).
 *  2. Optional Cloudflare D1 cache of previously retrieved messages, used to
 *     extend the search beyond the live retrieval window.
 */

/** Channel types that hold scannable message history. */
export const SEARCHABLE_CHANNEL_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

/** Hard caps so one search can never fan out unbounded. */
export const SEARCH_LIMITS = {
  maxChannels: 40,
  maxMessagesPerChannel: 100,
  maxTotalMessages: 500,
  maxResults: 5,
  maxIndexRows: 100,
  excerptLength: 160,
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'not', 'of', 'on', 'or',
  'our', 'out', 'she', 'so', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'to', 'too', 'up', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

/**
 * Split free text into lowercase keyword tokens.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  const tokens = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
    if (tokens.length >= 12) break;
  }
  return tokens;
}

/**
 * Score one message against query tokens.
 * Returns 0 when the message is not a plausible match.
 *
 * @param {string[]} tokens
 * @param {string} content
 * @returns {number}
 */
export function scoreMessage(tokens, content) {
  if (tokens.length === 0 || typeof content !== 'string' || content.length === 0) return 0;
  const haystack = content.toLowerCase();
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 2;
      hits += 1;
    }
  }
  if (hits === 0) return 0;
  // Whole-query phrase bonus.
  if (tokens.length > 1 && haystack.includes(tokens.join(' '))) score += 4;
  // All keywords present is a strong signal (only meaningful for multi-word queries).
  if (tokens.length > 1 && hits === tokens.length) score += 3;
  // Small bonus when the channel name also matches (topic channels).
  return score;
}

/**
 * Bonus score when the channel name carries query keywords.
 * @param {string[]} tokens
 * @param {string} channelName
 */
export function scoreChannelName(tokens, channelName) {
  if (tokens.length === 0 || typeof channelName !== 'string') return 0;
  const haystack = channelName.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

/**
 * Canonical Discord jump link for a message.
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} messageId
 */
export function buildJumpLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/**
 * Unix seconds from a Discord ISO timestamp (or snowflake id as fallback).
 * @param {{id?: string, timestamp?: string}} message
 * @returns {number}
 */
export function messageCreatedAt(message) {
  if (message.timestamp) {
    const parsed = Date.parse(message.timestamp);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  if (message.id && /^\d+$/.test(message.id)) {
    return Math.floor((Number(BigInt(message.id) >> 22n) + 1420070400000) / 1000);
  }
  return 0;
}

/**
 * Short single-line excerpt of a message body.
 * @param {string} content
 * @param {number} [maxLen]
 */
export function excerpt(content, maxLen = SEARCH_LIMITS.excerptLength) {
  const flat = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '*(no text content)*';
  return flat.length <= maxLen ? flat : `${flat.slice(0, maxLen - 1)}…`;
}

/**
 * Discord-rendered localized timestamp.
 * @param {number} unixSeconds
 */
export function formatTimestamp(unixSeconds) {
  return `<t:${unixSeconds}:f>`;
}

/**
 * Announcement channels: Discord Announcement type, or topic-style names.
 * @param {{type?: number, name?: string}} channel
 */
export function isAnnouncementChannel(channel) {
  if (!channel) return false;
  if (channel.type === 5) return true;
  return /announce|announcement|news|updates?/i.test(channel.name || '');
}

/**
 * Channels whose history can be searched (text + announcement).
 * @param {{type?: number, name?: string}} channel
 */
export function isSearchableTextChannel(channel) {
  return Boolean(channel) && SEARCHABLE_CHANNEL_TYPES.has(channel.type);
}

/**
 * Normalize a raw Discord message into the shape used everywhere else.
 *
 * @param {any} message Discord message object.
 * @param {string} guildId
 * @param {string} channelName
 */
export function normalizeMessage(message, guildId, channelName) {
  return {
    id: message.id,
    guildId,
    channelId: message.channel_id,
    channelName: channelName || message.channel_id,
    authorName: message.author?.global_name || message.author?.username || 'unknown',
    authorId: message.author?.id || '',
    content: message.content || '',
    createdAt: messageCreatedAt(message),
  };
}

/**
 * Format a normalized message as a compact result line with a jump link.
 * @param {ReturnType<typeof normalizeMessage>} message
 * @param {number} rank 1-based rank.
 */
export function formatResultLine(message, rank) {
  const link = buildJumpLink(message.guildId, message.channelId, message.id);
  return (
    `**${rank}.** [#${message.channelName}](${link}) · ${formatTimestamp(message.createdAt)} · ${message.authorName}\n` +
    `> ${excerpt(message.content)}`
  );
}

/* ------------------------------------------------------------------ */
/* Cloudflare D1 index (optional cache of retrieved messages)          */
/* ------------------------------------------------------------------ */

const UPSERT_SQL = `
INSERT INTO messages (
  message_id, guild_id, channel_id, channel_name,
  author_id, author_name, content, created_at, indexed_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(message_id) DO UPDATE SET
  channel_name = excluded.channel_name,
  author_name = excluded.author_name,
  content = excluded.content,
  indexed_at = excluded.indexed_at
`;

/**
 * Persist retrieved messages into D1 (batched upserts). Failures are
 * swallowed by callers — the index is a cache, never a requirement.
 *
 * @param {any} db D1 binding (may be null).
 * @param {ReturnType<typeof normalizeMessage>[]} records
 * @returns {Promise<number>} number of rows written.
 */
export async function indexMessages(db, records) {
  if (!db || !Array.isArray(records) || records.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  const statements = records.map((record) =>
    db.prepare(UPSERT_SQL).bind(
      record.id,
      record.guildId,
      record.channelId,
      record.channelName,
      record.authorId,
      record.authorName,
      record.content,
      record.createdAt,
      now,
    ),
  );
  let written = 0;
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
    written += Math.min(50, statements.length - i);
  }
  return written;
}

/**
 * Keyword lookup against the D1 index. Returns normalized records; the
 * caller applies the same scoring as live results.
 *
 * @param {any} db D1 binding (may be null).
 * @param {object} options
 * @param {string} options.guildId
 * @param {string[]} options.tokens
 * @param {string[]} [options.channelIds] Restrict to these channels.
 * @param {number} [options.limit]
 */
export async function queryIndexedMessages(db, { guildId, tokens, channelIds, limit = SEARCH_LIMITS.maxIndexRows }) {
  if (!db || tokens.length === 0) return [];
  const clauses = ['guild_id = ?'];
  const binds = [guildId];

  if (Array.isArray(channelIds)) {
    if (channelIds.length === 0) return [];
    clauses.push(`channel_id IN (${channelIds.map(() => '?').join(', ')})`);
    binds.push(...channelIds);
  }

  clauses.push(`(${tokens.map(() => 'content LIKE ?').join(' OR ')})`);
  binds.push(...tokens.map((token) => `%${token}%`));
  binds.push(limit);

  const sql = `SELECT message_id, guild_id, channel_id, channel_name, author_id, author_name, content, created_at
               FROM messages WHERE ${clauses.join(' AND ')}
               ORDER BY created_at DESC LIMIT ?`;

  const { results } = await db.prepare(sql).bind(...binds).all();
  return (results || []).map((row) => ({
    id: row.message_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/* Guild search                                                        */
/* ------------------------------------------------------------------ */

/**
 * Search accessible guild messages for a question/topic.
 *
 * Explicitly retrieves messages from the Discord REST API with pagination
 * and rate-limit handling, scores them with keyword matching, optionally
 * extends the search through the D1 index, and reports retrieval limits.
 *
 * @param {object} options
 * @param {ReturnType<typeof createDiscordClient>} options.client
 * @param {any} options.db D1 binding or null.
 * @param {string} options.guildId
 * @param {string} options.query Question or topic.
 * @param {'server'|'announcements'} [options.scope]
 * @param {Partial<typeof SEARCH_LIMITS>} [options.limits]
 * @param {any[]} [options.channels] Pre-fetched guild channels (optional).
 * @returns {Promise<{results: any[], stats: object, query: string, tokens: string[]}>}
 */
export async function searchGuildMessages({
  client,
  db = null,
  guildId,
  query,
  scope = 'server',
  limits = {},
  channels,
}) {
  const config = { ...SEARCH_LIMITS, ...limits };
  const tokens = tokenize(query);

  const allChannels = Array.isArray(channels) ? channels : await client.getGuildChannels(guildId);
  const searchable = allChannels.filter(isSearchableTextChannel);
  const scoped =
    scope === 'announcements'
      ? searchable.filter(isAnnouncementChannel)
      : searchable;

  // Prioritise channels whose names match the query, then announcements first.
  scoped.sort((a, b) => {
    const scoreDiff =
      scoreChannelName(tokens, b.name || '') - scoreChannelName(tokens, a.name || '');
    if (scoreDiff !== 0) return scoreDiff;
    return (a.name || '').localeCompare(b.name || '');
  });

  const channelLimit = Math.min(scoped.length, config.maxChannels);
  const channelsToScan = scoped.slice(0, channelLimit);

  const matches = new Map(); // message id -> { record, score, source }
  const scannedRecords = [];
  let messagesScanned = 0;
  let channelsSearched = 0;
  let channelsSkipped = 0;

  for (const channel of channelsToScan) {
    if (messagesScanned >= config.maxTotalMessages) break;
    const budget = Math.min(
      config.maxMessagesPerChannel,
      config.maxTotalMessages - messagesScanned,
    );
    const { messages, skipped } = await client.listMessagesPaginated(channel.id, {
      maxMessages: budget,
    });
    if (skipped) channelsSkipped += 1;
    channelsSearched += 1;
    messagesScanned += messages.length;

    for (const raw of messages) {
      const record = normalizeMessage(raw, guildId, channel.name);
      scannedRecords.push(record);
      const score =
        scoreMessage(tokens, record.content) + scoreChannelName(tokens, record.channelName);
      if (score >= 2 && !matches.has(record.id)) {
        matches.set(record.id, { record, score, source: 'live' });
      }
    }
  }

  // Cache everything retrieved so future searches can reach further back.
  let indexedRows = 0;
  if (db) {
    try {
      indexedRows = await indexMessages(db, scannedRecords);
    } catch (error) {
      console.error('D1 index write failed:', error);
    }
  }

  // Extend the search through the D1 index (messages outside the live window).
  let indexMatches = 0;
  if (db && tokens.length > 0) {
    try {
      const channelIds =
        scope === 'announcements' ? channelsToScan.map((channel) => channel.id) : undefined;
      const indexed = await queryIndexedMessages(db, {
        guildId,
        tokens,
        channelIds,
        limit: config.maxIndexRows,
      });
      for (const record of indexed) {
        if (matches.has(record.id)) continue;
        const score =
          scoreMessage(tokens, record.content) + scoreChannelName(tokens, record.channelName);
        if (score >= 2) {
          matches.set(record.id, { record, score, source: 'index' });
          indexMatches += 1;
        }
      }
    } catch (error) {
      console.error('D1 index read failed:', error);
    }
  }

  const results = [...matches.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.record.createdAt - a.record.createdAt;
    })
    .slice(0, config.maxResults);

  return {
    query,
    tokens,
    results,
    stats: {
      channelsAvailable: scoped.length,
      channelsSearched,
      channelsSkipped,
      messagesScanned,
      liveMatches: matches.size - indexMatches,
      indexMatches,
      indexedRows,
      maxResults: config.maxResults,
    },
  };
}

/**
 * Human-readable retrieval-limits note for response footers.
 * @param {ReturnType<typeof searchGuildMessages> extends Promise<infer T> ? T : never} outcome
 */
export function limitationsNote(outcome) {
  const { stats } = outcome;
  const window = `Retrieved the most recent ${stats.messagesScanned} accessible messages across ${stats.channelsSearched} channels`;
  const extra =
    stats.indexMatches > 0 ? ', extended by the cached index' : '';
  return (
    `JavaScript keyword matching — no AI model. ${window}${extra}. ` +
    `Older, deleted, or permission-restricted messages are not included.`
  );
}

/**
 * Build the follow-up payload for a search result set.
 *
 * @param {object} options
 * @param {string} options.title Embed title.
 * @param {ReturnType<typeof searchGuildMessages>} options.outcome
 * @returns {{embeds?: object[], content?: string}}
 */
export function formatSearchResults({ title, outcome }) {
  const { results } = outcome;
  if (results.length === 0) {
    return {
      content:
        `${title}\n\nNo accessible messages matched ` +
        `**${excerpt(outcome.query, 80)}**. ` +
        `I only return messages I can actually retrieve — try different keywords, ` +
        `or use \`/announcements\` for announcement channels.`,
    };
  }

  const lines = results.map((entry, index) => formatResultLine(entry.record, index + 1));
  return {
    embeds: [
      {
        title,
        description: lines.join('\n\n'),
        color: 0x5865f2,
        footer: { text: limitationsNote(outcome) },
      },
    ],
  };
}
