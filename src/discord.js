/**
 * Discord HTTP layer for Dev's Personal AI.
 *
 * - Ed25519 interaction signature verification (WebCrypto, no dependencies)
 * - Discord REST v10 client built on fetch() with pagination + rate-limit handling
 *
 * No Gateway connection is used anywhere. Discord talks to the Worker through
 * HTTP Interactions, and the Worker talks back through the REST API only.
 */

export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Maximum seconds a request timestamp may drift before it is rejected. */
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;

/** Retry budget for 429 / 5xx responses. */
const MAX_RETRIES = 3;

/** Upper bound on a single rate-limit sleep (ms). */
const MAX_SLEEP_MS = 10_000;

export class DiscordAPIError extends Error {
  /**
   * @param {{status: number, code?: number, message?: string, retryAfter?: number}} info
   */
  constructor({ status, code, message, retryAfter }) {
    super(message || `Discord API error (HTTP ${status})`);
    this.name = 'DiscordAPIError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/* ------------------------------------------------------------------ */
/* Hex helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Convert a hex string to bytes.
 * @param {string} hex
 * @returns {Uint8Array|null} null when the input is not valid hex.
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Interaction signature verification                                  */
/* ------------------------------------------------------------------ */

/**
 * Check that an interaction timestamp is fresh enough to accept.
 * Guards against replay of captured requests.
 *
 * @param {string} timestamp Unix seconds as sent by Discord.
 * @param {number} [nowSeconds] Current unix seconds (injectable for tests).
 * @param {number} [maxSkewSeconds] Allowed drift in seconds.
 * @returns {boolean}
 */
export function isTimestampFresh(
  timestamp,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxSkewSeconds = MAX_TIMESTAMP_SKEW_SECONDS,
) {
  if (typeof timestamp !== 'string' || !/^-?\d+$/.test(timestamp)) {
    return false;
  }
  const ts = Number(timestamp);
  return Math.abs(nowSeconds - ts) <= maxSkewSeconds;
}

/**
 * Verify a Discord Ed25519 interaction signature over `timestamp + body`.
 *
 * Uses the standard "Ed25519" WebCrypto algorithm (supported on Cloudflare
 * Workers and Node.js 18+), with an SPKI import fallback for older runtimes.
 *
 * @param {object} params
 * @param {string} params.publicKeyHex 64-char hex application public key.
 * @param {string} params.signatureHex 128-char hex X-Signature-Ed25519 value.
 * @param {string} params.timestamp X-Signature-Timestamp value.
 * @param {string} params.body Raw request body text.
 * @returns {Promise<boolean>}
 */
export async function verifyInteractionSignature({
  publicKeyHex,
  signatureHex,
  timestamp,
  body,
}) {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const signature = hexToBytes(signatureHex);
    if (!publicKey || publicKey.length !== 32) return false;
    if (!signature || signature.length !== 64) return false;
    if (typeof timestamp !== 'string' || typeof body !== 'string') return false;

    const key = await importEd25519PublicKey(publicKey);
    const data = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify('Ed25519', key, signature, data);
  } catch {
    return false;
  }
}

/**
 * Import a raw 32-byte Ed25519 public key for verification.
 * @param {Uint8Array} raw
 * @returns {Promise<CryptoKey>}
 */
async function importEd25519PublicKey(raw) {
  try {
    return await crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify']);
  } catch {
    // SPKI fallback: DER prefix for an Ed25519 public key + raw key bytes.
    const spkiPrefix = Uint8Array.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);
    const spki = new Uint8Array(spkiPrefix.length + raw.length);
    spki.set(spkiPrefix, 0);
    spki.set(raw, spkiPrefix.length);
    return await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify'],
    );
  }
}

/**
 * Full request-level verification used by the Worker entry point:
 * headers present, timestamp fresh, signature valid.
 *
 * @param {object} params
 * @param {string} params.publicKeyHex
 * @param {string|null|undefined} params.signature
 * @param {string|null|undefined} params.timestamp
 * @param {string} params.body
 * @param {number} [params.nowSeconds]
 * @returns {Promise<boolean>}
 */
export async function verifyInteractionRequest({
  publicKeyHex,
  signature,
  timestamp,
  body,
  nowSeconds,
}) {
  if (!signature || !timestamp) return false;
  if (!isTimestampFresh(timestamp, nowSeconds)) return false;
  return verifyInteractionSignature({
    publicKeyHex,
    signatureHex: signature,
    timestamp,
    body,
  });
}

/* ------------------------------------------------------------------ */
/* REST client                                                         */
/* ------------------------------------------------------------------ */

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create a Discord REST v10 client.
 *
 * @param {object} options
 * @param {string} options.token Bot token (Authorization: Bot ...).
 * @param {string} [options.baseUrl] Override for tests.
 * @param {typeof fetch} [options.fetchImpl] Override for tests.
 * @param {(ms: number) => Promise<void>} [options.sleepImpl] Override for tests.
 */
export function createDiscordClient({
  token,
  baseUrl = DISCORD_API_BASE,
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
}) {
  if (!token) {
    throw new Error('createDiscordClient requires a bot token');
  }
  const doFetch = fetchImpl;
  const sleep = sleepImpl;

  /**
   * Core request helper with rate-limit (429) and transient 5xx handling.
   *
   * @param {string} path API path beginning with "/".
   * @param {object} [options]
   * @param {string} [options.method]
   * @param {Record<string, string|number|undefined>} [options.query]
   * @param {unknown} [options.body]
   * @param {number} [options.maxRetries]
   * @returns {Promise<any>}
   */
  async function request(path, { method = 'GET', query, body, maxRetries = MAX_RETRIES } = {}) {
    const url = new URL(path.startsWith('http') ? path : baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Authorization: `Bot ${token}`,
      'User-Agent': "Dev's Personal AI (Cloudflare Worker; discord-http-interactions)",
    };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let lastRateLimit = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await doFetch(url.toString(), {
        method,
        headers,
        body: payload,
      });

      if (response.status === 204) return null;

      let data = null;
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (response.status === 429) {
        const retryAfterSeconds = Number(
          data?.retry_after ?? response.headers.get('retry-after') ?? 1,
        );
        lastRateLimit = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1;
        if (attempt < maxRetries) {
          const waitMs = Math.min(Math.ceil(lastRateLimit * 1000) + 25, MAX_SLEEP_MS);
          await sleep(waitMs);
          continue;
        }
        throw new DiscordAPIError({
          status: 429,
          code: data?.code,
          message: data?.message || 'Rate limited by the Discord API',
          retryAfter: lastRateLimit,
        });
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(Math.min(250 * 2 ** attempt, 4000));
        continue;
      }

      if (!response.ok) {
        throw new DiscordAPIError({
          status: response.status,
          code: data?.code,
          message: data?.message || `Discord API error (HTTP ${response.status})`,
          retryAfter: lastRateLimit,
        });
      }

      return data;
    }

    throw new DiscordAPIError({
      status: 429,
      message: 'Rate limited by the Discord API',
      retryAfter: lastRateLimit,
    });
  }

  return {
    request,

    /** GET /oauth2/applications/@me — application that owns this bot token. */
    getCurrentApplication() {
      return request('/oauth2/applications/@me');
    },

    /** GET /guilds/{guild.id}/channels */
    getGuildChannels(guildId) {
      return request(`/guilds/${encodeURIComponent(guildId)}/channels`);
    },

    /** GET /channels/{channel.id} */
    getChannel(channelId) {
      return request(`/channels/${encodeURIComponent(channelId)}`);
    },

    /**
     * GET /channels/{channel.id}/messages — one page (max 100, newest first).
     * @param {string} channelId
     * @param {{limit?: number, before?: string, after?: string}} [options]
     */
    listChannelMessages(channelId, { limit = 100, before, after } = {}) {
      return request(`/channels/${encodeURIComponent(channelId)}/messages`, {
        query: { limit, before, after },
      });
    },

    /**
     * Retrieve accessible messages from one channel with pagination and
     * rate-limit handling. Walks `before` cursors newest → oldest until
     * `maxMessages` is reached or the channel is exhausted.
     *
     * Skips silently on 403/404 (missing access or deleted channel) and
     * returns whatever was collected plus a `skipped` marker.
     *
     * @param {string} channelId
     * @param {{maxMessages?: number}} [options]
     * @returns {Promise<{messages: any[], skipped: boolean}>}
     */
    async listMessagesPaginated(channelId, { maxMessages = 100 } = {}) {
      const messages = [];
      let before;
      try {
        while (messages.length < maxMessages) {
          const page = await this.listChannelMessages(channelId, {
            limit: Math.min(100, maxMessages - messages.length),
            before,
          });
          if (!Array.isArray(page) || page.length === 0) break;
          messages.push(...page.slice(0, maxMessages - messages.length));
          if (page.length < 100) break;
          before = page[page.length - 1].id;
        }
      } catch (error) {
        if (error instanceof DiscordAPIError && (error.status === 403 || error.status === 404)) {
          return { messages, skipped: true };
        }
        throw error;
      }
      return { messages, skipped: false };
    },

    /**
     * POST /webhooks/{application.id}/{interaction.token} — send a follow-up
     * to a deferred interaction.
     *
     * @param {string} applicationId
     * @param {string} interactionToken
     * @param {{content?: string, embeds?: any[], flags?: number, allowed_mentions?: object}} payload
     */
    createFollowup(applicationId, interactionToken, payload) {
      return request(
        `/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(interactionToken)}`,
        {
          method: 'POST',
          body: { allowed_mentions: { parse: [] }, ...payload },
        },
      );
    },
  };
}
