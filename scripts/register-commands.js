#!/usr/bin/env node
/**
 * Register Dev's Personal AI slash commands through the Discord REST API.
 *
 * Usage:
 *   node scripts/register-commands.js               # guild commands if DISCORD_GUILD_ID set, else global
 *   node scripts/register-commands.js --global       # force global registration
 *   node scripts/register-commands.js --guild 123    # force guild registration
 *
 * Required credentials (process.env or .dev.vars):
 *   DISCORD_BOT_TOKEN      Bot token from the Discord developer portal.
 *   DISCORD_APPLICATION_ID Application ID (optional — fetched when omitted).
 *   DISCORD_GUILD_ID       Guild ID for instant guild-scoped registration.
 */

import { loadScriptEnv } from './lib.js';
import { data as askCommand } from '../src/commands/ask.js';
import { data as serverCommand } from '../src/commands/server.js';
import { data as announcementsCommand } from '../src/commands/announcements.js';

const API_BASE = 'https://discord.com/api/v10';
const COMMAND_DEFINITIONS = [askCommand, serverCommand, announcementsCommand];

/**
 * REST call with a single retry on 429.
 * @param {string} path
 * @param {object} options
 */
async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        "User-Agent": "Dev's Personal AI (register-commands script)",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (response.status === 429 && attempt < 2) {
      const waitSeconds = Number(data?.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitSeconds * 1000) + 50));
      continue;
    }

    if (!response.ok) {
      const hint =
        response.status === 401
          ? 'Check DISCORD_BOT_TOKEN.'
          : response.status === 403
            ? 'The application or guild ID is wrong, or the bot is not in that guild.'
            : '';
      throw new Error(
        `Discord API ${response.status} on ${method} ${path}: ${data?.message || text} ${hint}`.trim(),
      );
    }
    return data;
  }
  throw new Error(`Rate limited on ${method} ${path} after 3 attempts.`);
}

async function main() {
  const env = loadScriptEnv();
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is required (set it in .dev.vars or the environment).');
  }

  let applicationId = env.DISCORD_APPLICATION_ID;
  if (!applicationId) {
    const app = await api('/oauth2/applications/@me', { token });
    applicationId = app.id;
    console.log(`Fetched application ID from the API: ${applicationId}`);
  }

  const guildId = env.guild || env.DISCORD_GUILD_ID;
  const forceGlobal = env.global === 'true';
  const target = !forceGlobal && guildId ? `guild ${guildId}` : `application ${applicationId} (global)`;
  const path =
    !forceGlobal && guildId
      ? `/applications/${applicationId}/guilds/${guildId}/commands`
      : `/applications/${applicationId}/commands`;

  console.log(`Registering ${COMMAND_DEFINITIONS.length} commands on ${target} ...`);
  const registered = await api(path, { method: 'PUT', token, body: COMMAND_DEFINITIONS });

  console.log('Registered commands:');
  for (const command of registered) {
    console.log(`  /${command.name} (id ${command.id}) — ${command.description}`);
  }
  if (!forceGlobal && guildId) {
    console.log('\nGuild commands update instantly. Remove them in the portal if you later switch to global commands.');
  } else {
    console.log('\nGlobal commands can take up to an hour to appear in every server.');
  }
  console.log('Done.');
}

main().catch((error) => {
  console.error(`register-commands failed: ${error.message}`);
  process.exitCode = 1;
});
