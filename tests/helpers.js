/**
 * Test helpers: Ed25519 signing (Node crypto), fake Discord client, fake D1.
 */

import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

/** Generate an Ed25519 keypair and a signing helper, as Discord would. */
export function makeSigningKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const raw = spki.subarray(spki.length - 32);
  return {
    publicKeyHex: Buffer.from(raw).toString('hex'),
    sign(timestamp, body) {
      return cryptoSign(null, Buffer.from(timestamp + body, 'utf8'), privateKey).toString('hex');
    },
  };
}

/**
 * Build a signed Request equivalent to what Discord sends to the
 * interactions endpoint.
 */
export function signedInteractionRequest(url, bodyObj, keypair, timestamp) {
  const body = JSON.stringify(bodyObj);
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': keypair.sign(ts, body),
      'x-signature-timestamp': ts,
    },
    body,
  });
}

/** A type-2 (APPLICATION_COMMAND) interaction payload. */
export function commandInteraction({ name, options = [], guildId = 'guild-1', token = 'token-1' }) {
  return {
    id: 'interaction-1',
    application_id: 'app-1',
    type: 2,
    guild_id: guildId,
    token,
    data: {
      name,
      options: options.map(([optionName, value]) => ({ name: optionName, type: 3, value })),
    },
  };
}

/**
 * Minimal in-memory D1 double covering the statements used in src/search.js:
 * INSERT upsert, SELECT keyword lookup, and db.batch().
 */
export function createFakeD1(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.message_id, row]));

  function parseSelect(sql, args) {
    const likeCount = (sql.match(/content LIKE \?/g) || []).length;
    const inMatch = sql.match(/channel_id IN \(([^)]*)\)/);
    const channelCount = inMatch ? (inMatch[1].match(/\?/g) || []).length : 0;

    const guildId = args[0];
    const channelIds = channelCount > 0 ? args.slice(1, 1 + channelCount) : null;
    const likeParams = args.slice(1 + channelCount, 1 + channelCount + likeCount);
    const limit = args[args.length - 1];

    return [...rows.values()]
      .filter((row) => row.guild_id === guildId)
      .filter((row) => !channelIds || channelIds.includes(row.channel_id))
      .filter((row) =>
        likeParams.some((pattern) => {
          const needle = String(pattern).replace(/%/g, '');
          return String(row.content).toLowerCase().includes(needle.toLowerCase());
        }),
      )
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map((row) => ({
        message_id: row.message_id,
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        author_id: row.author_id,
        author_name: row.author_name,
        content: row.content,
        created_at: row.created_at,
      }));
  }

  function applyInsert(args) {
    const [message_id, guild_id, channel_id, channel_name, author_id, author_name, content, created_at, indexed_at] = args;
    rows.set(message_id, {
      message_id,
      guild_id,
      channel_id,
      channel_name,
      author_id,
      author_name,
      content,
      created_at,
      indexed_at,
    });
  }

  const api = {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,
            args,
            all: async () => ({ results: parseSelect(sql, args) }),
            run: async () => {
              if (sql.includes('INSERT INTO messages')) applyInsert(args);
              return { success: true };
            },
            first: async () => parseSelect(sql, args)[0] ?? null,
          };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes('INSERT INTO messages')) applyInsert(statement.args);
      }
      return statements.map(() => ({ success: true }));
    },
  };
  return api;
}

/**
 * Fake Discord client with canned channels/messages and per-channel errors.
 *
 * @param {object} spec
 * @param {any[]} spec.channels
 * @param {Record<string, any[]>} spec.messagesByChannel
 * @param {Record<string, {status: number, message?: string}>} [spec.errorsByChannel]
 */
export function createFakeDiscordClient({ channels, messagesByChannel, errorsByChannel = {} }) {
  const calls = { listMessagesPaginated: [], createFollowup: [] };
  return {
    calls,
    async getGuildChannels() {
      return channels;
    },
    async listMessagesPaginated(channelId) {
      calls.listMessagesPaginated.push(channelId);
      const error = errorsByChannel[channelId];
      if (error) {
        return { messages: [], skipped: true, error };
      }
      return { messages: messagesByChannel[channelId] || [], skipped: false };
    },
    async createFollowup(applicationId, token, payload) {
      calls.createFollowup.push({ applicationId, token, payload });
      return { id: 'followup-1' };
    },
  };
}

/** Collect waitUntil promises from a worker fetch call. */
export function createWaitUntilContext() {
  const pending = [];
  return {
    ctx: { waitUntil: (promise) => pending.push(promise) },
    drain: () => Promise.all(pending),
  };
}
