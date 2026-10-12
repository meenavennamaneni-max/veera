/**
 * Dev's Personal AI — Cloudflare Worker entry point.
 *
 * Discord sends slash-command interactions to this Worker over HTTPS.
 * Every request is verified with Discord's Ed25519 signature scheme before
 * anything is processed. There is no Gateway connection and no AI model.
 *
 * Flow:
 *   POST /interactions
 *     -> verify X-Signature-Ed25519 over (timestamp + raw body)
 *     -> PING (type 1)  => respond { type: 1 } (PONG)
 *     -> COMMAND (type 2) => validate, defer (type 5), handle async, follow up
 */

import {
  verifyInteractionRequest,
  createDiscordClient,
  DiscordAPIError,
} from './discord.js';
import * as askCommand from './commands/ask.js';
import * as serverCommand from './commands/server.js';
import * as announcementsCommand from './commands/announcements.js';

/** Slash-command registry — exactly three commands. */
export const COMMANDS = new Map([
  ['ask', askCommand],
  ['server', serverCommand],
  ['announcements', announcementsCommand],
]);

/** Discord interaction types. */
const INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

/** Discord interaction response types. */
const RESPONSE_TYPES = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

const JSON_HEADERS = { 'content-type': 'application/json' };

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Ephemeral message payload (only visible to the invoking user).
 * @param {string} content
 */
function ephemeral(content) {
  return { type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: 64 } };
}

/**
 * Validate command input using the command's own declared option schema.
 * @param {any} command Command module.
 * @param {any} interaction
 * @returns {{ok: boolean, error?: string}}
 */
export function validateCommandInput(command, interaction) {
  const declared = command.data?.options || [];
  const provided = new Map(
    (interaction.data?.options || []).map((option) => [option.name, option.value]),
  );
  for (const option of declared) {
    if (!option.required) continue;
    const value = provided.get(option.name);
    if (typeof value !== 'string' || value.trim().length === 0) {
      return {
        ok: false,
        error: `Missing required option \`${option.name}\` — e.g. \`${command.data.name} ${option.name}:${option.description}\`.`,
      };
    }
    if (option.min_length !== undefined && value.trim().length < option.min_length) {
      return { ok: false, error: `\`${option.name}\` is too short.` };
    }
    if (option.max_length !== undefined && value.length > option.max_length) {
      return {
        ok: false,
        error: `\`${option.name}\` is limited to ${option.max_length} characters.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Build a concise, honest error message for a failed command run.
 * @param {unknown} error
 */
export function describeError(error) {
  if (error instanceof DiscordAPIError) {
    if (error.status === 403) {
      return 'Discord denied access (HTTP 403). I need the View Channels and Read Message History permissions in the channels you want me to search.';
    }
    if (error.status === 404) {
      return 'Discord reported a missing resource (HTTP 404) — a channel or server may have been deleted.';
    }
    if (error.status === 429) {
      return 'Discord rate-limited the request and retries were exhausted. Please try again in a moment.';
    }
    return `Discord API error (HTTP ${error.status}${error.code ? `, code ${error.code}` : ''}). Please try again.`;
  }
  return 'Something went wrong while handling that command. Please try again.';
}

/**
 * Handle one verified application-command interaction: defer immediately,
 * run the command, then post the result as an interaction follow-up.
 *
 * @param {object} params
 * @param {any} params.interaction
 * @param {any} params.env Worker environment (secrets + D1 binding).
 * @param {{waitUntil?: (p: Promise<unknown>) => void}} [params.ctx]
 */
export function handleApplicationCommand({ interaction, env, ctx }) {
  const command = COMMANDS.get(interaction.data?.name);
  if (!command) {
    return ephemeral('Unknown command. Available commands: `/ask`, `/server`, `/announcements`.');
  }

  const validation = validateCommandInput(command, interaction);
  if (!validation.ok) {
    return ephemeral(validation.error);
  }

  const client = createDiscordClient({ token: env.DISCORD_BOT_TOKEN });
  const db = env.DB ?? null;

  const work = (async () => {
    try {
      const payload = await command.execute({ interaction, client, db, env });
      await client.createFollowup(interaction.application_id, interaction.token, payload);
    } catch (error) {
      console.error(`/${command.data.name} failed:`, error);
      try {
        await client.createFollowup(interaction.application_id, interaction.token, {
          content: describeError(error),
          flags: 64,
        });
      } catch (followupError) {
        console.error('Failed to deliver error follow-up:', followupError);
      }
    }
  })();

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(work);
  } else {
    // Environments without waitUntil (e.g. minimal test harnesses) still run
    // the work; the promise is intentionally not awaited here so the deferred
    // response can be returned within Discord's 3-second window.
    work.catch((error) => console.error('Unhandled command failure:', error));
  }

  // Deferred channel message — the real answer arrives via follow-up.
  return { type: RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE };
}

/**
 * Route one HTTP request.
 * @param {Request} request
 * @param {any} env
 * @param {{waitUntil?: (p: Promise<unknown>) => void}} [ctx]
 */
export async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/interactions')) {
    return textResponse("Dev's Personal AI — Discord interactions endpoint is active.");
  }

  if (request.method !== 'POST' || (url.pathname !== '/interactions' && url.pathname !== '/')) {
    return textResponse('Not found.', 404);
  }

  const publicKeyHex = env.DISCORD_PUBLIC_KEY;
  if (!publicKeyHex || !env.DISCORD_BOT_TOKEN) {
    console.error('Missing DISCORD_PUBLIC_KEY or DISCORD_BOT_TOKEN secret.');
    return textResponse('Server configuration error.', 500);
  }

  const body = await request.text();
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');

  const verified = await verifyInteractionRequest({
    publicKeyHex,
    signature,
    timestamp,
    body,
  });
  if (!verified) {
    return textResponse('invalid request signature', 401);
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return textResponse('invalid request body', 400);
  }

  if (interaction.type === INTERACTION_TYPES.PING) {
    return jsonResponse({ type: RESPONSE_TYPES.PONG });
  }

  if (interaction.type === INTERACTION_TYPES.APPLICATION_COMMAND) {
    return jsonResponse(handleApplicationCommand({ interaction, env, ctx }));
  }

  return ephemeral('Unsupported interaction type.');
}

export default {
  /**
   * @param {Request} request
   * @param {any} env
   * @param {{waitUntil: (p: Promise<unknown>) => void}} ctx
   */
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      console.error('Unhandled worker error:', error);
      return textResponse('Internal error.', 500);
    }
  },
};
