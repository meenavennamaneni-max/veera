/**
 * Worker routing tests: signature enforcement, PING/PONG, deferral, command
 * dispatch, follow-up delivery, validation and error handling — all through
 * the real Worker entry point with a stubbed Discord HTTP layer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { validateCommandInput, describeError, COMMANDS } from '../src/index.js';
import { DiscordAPIError } from '../src/discord.js';
import { CREATOR_RESPONSE } from '../src/commands/ask.js';
import {
  makeSigningKeypair,
  signedInteractionRequest,
  commandInteraction,
  createWaitUntilContext,
  createFakeD1,
} from './helpers.js';

/**
 * Install a stubbed global fetch that serves the Discord endpoints the Worker
 * uses, and records follow-up webhook calls.
 */
function stubDiscordHttp({ channels = [], messagesByChannel = {}, failOn = () => false }) {
  const followups = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    // Strip the API version prefix so path matching is simple.
    const path = parsed.pathname.replace(/^\/api\/v\d+/, '');
    if (failOn(parsed, init)) {
      throw new TypeError('network down');
    }
    if (path.startsWith('/webhooks/')) {
      followups.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: 'followup-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (/^\/guilds\/[^/]+\/channels$/.test(path)) {
      return json(channels);
    }
    const messagesMatch = path.match(/^\/channels\/([^/]+)\/messages$/);
    if (messagesMatch) {
      return json(messagesByChannel[messagesMatch[1]] || []);
    }
    return json({});
  };
  return {
    followups,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function deliver(keypair, env, bodyObj, { timestamp, url = 'https://worker.example/interactions' } = {}) {
  const request = signedInteractionRequest(url, bodyObj, keypair, timestamp);
  const { ctx, drain } = createWaitUntilContext();
  const response = await worker.fetch(request, env, ctx);
  await drain();
  return response;
}

test('exactly three commands are registered', () => {
  assert.deepEqual([...COMMANDS.keys()].sort(), ['announcements', 'ask', 'server']);
});

test('GET / is a health check; unknown routes are 404', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const ok = await worker.fetch(new Request('https://worker.example/'), env, {});
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /interactions endpoint is active/);

  const missing = await worker.fetch(new Request('https://worker.example/nope'), env, {});
  assert.equal(missing.status, 404);
});

test('PING interactions receive PONG', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const response = await deliver(keypair, env, { type: 1 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test('tampered signatures are rejected with 401', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const request = signedInteractionRequest(
    'https://worker.example/interactions',
    { type: 1 },
    keypair,
  );
  // Corrupt the signature header after signing.
  request.headers.set('x-signature-ed25519', 'ab'.repeat(64));
  const response = await worker.fetch(request, env, {});
  assert.equal(response.status, 401);
  assert.equal(await response.text(), 'invalid request signature');
});

test('stale timestamps are rejected with 401 (replay protection)', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const stale = String(Math.floor(Date.now() / 1000) - 3600);
  const response = await deliver(keypair, env, { type: 1 }, { timestamp: stale });
  assert.equal(response.status, 401);
});

test('unknown commands get an ephemeral reply, never a crash', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const response = await deliver(
    keypair,
    env,
    commandInteraction({ name: 'not-a-command', options: [] }),
  );
  const body = await response.json();
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /Unknown command/);
});

test('missing required options are rejected before deferral', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const response = await deliver(
    keypair,
    env,
    commandInteraction({ name: 'ask', options: [] }),
  );
  const body = await response.json();
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /Missing required option/);
});

test('valid /ask (fact) defers and delivers the exact creator answer via follow-up', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const stub = stubDiscordHttp({});
  try {
    const response = await deliver(
      keypair,
      env,
      commandInteraction({ name: 'ask', options: [['question', 'who created the bot']] }),
    );
    assert.deepEqual(await response.json(), { type: 5 }); // deferred
    assert.equal(stub.followups.length, 1);
    assert.equal(stub.followups[0].body.content, CREATOR_RESPONSE);
    assert.equal(stub.followups[0].body.allowed_mentions.parse.length, 0);
  } finally {
    stub.restore();
  }
});

test('valid /server defers and follows up with channel names, timestamps and links', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok', DB: createFakeD1() };
  const stub = stubDiscordHttp({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
    messagesByChannel: {
      c1: [
        {
          id: 'm1',
          channel_id: 'c1',
          author: { id: 'u1', username: 'dev' },
          content: 'the launch date is confirmed for march',
          timestamp: '2026-03-01T00:00:00.000Z',
        },
      ],
    },
  });
  try {
    const response = await deliver(
      keypair,
      env,
      commandInteraction({ name: 'server', options: [['question', 'launch date']] }),
    );
    assert.deepEqual(await response.json(), { type: 5 });
    assert.equal(stub.followups.length, 1);
    const embed = stub.followups[0].body.embeds[0];
    assert.match(embed.title, /Server search/);
    assert.match(embed.description, /#general/);
    assert.match(embed.description, /<t:\d+:f>/);
    assert.match(embed.description, /https:\/\/discord\.com\/channels\/guild-1\/c1\/m1/);
  } finally {
    stub.restore();
  }
});

test('/announcements reports when the server has no announcement channels', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const stub = stubDiscordHttp({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
  });
  try {
    await deliver(
      keypair,
      env,
      commandInteraction({ name: 'announcements', options: [['topic', 'maintenance']] }),
    );
    assert.equal(stub.followups.length, 1);
    const body = stub.followups[0].body;
    assert.equal(body.flags, 64);
    assert.match(body.content, /no announcement channels/i);
  } finally {
    stub.restore();
  }
});

test('Discord API failures produce a concise ephemeral error follow-up', async () => {
  const keypair = makeSigningKeypair();
  const env = { DISCORD_PUBLIC_KEY: keypair.publicKeyHex, DISCORD_BOT_TOKEN: 'tok' };
  const stub = stubDiscordHttp({
    channels: [],
    failOn: (parsed) => parsed.pathname.includes('/channels'),
  });
  try {
    await deliver(
      keypair,
      env,
      commandInteraction({ name: 'server', options: [['question', 'anything here']] }),
    );
    assert.equal(stub.followups.length, 1);
    const body = stub.followups[0].body;
    assert.equal(body.flags, 64);
    assert.match(body.content, /Something went wrong|Discord/);
  } finally {
    stub.restore();
  }
});

test('missing secrets yield a 500 without touching the body', async () => {
  const keypair = makeSigningKeypair();
  const response = await deliver(keypair, {}, { type: 1 });
  assert.equal(response.status, 500);
});

test('validateCommandInput enforces required/min/max string options', () => {
  const command = {
    data: {
      name: 'ask',
      options: [{ type: 3, name: 'question', description: 'q', required: true, min_length: 1, max_length: 5 }],
    },
  };
  assert.equal(validateCommandInput(command, commandInteraction({ name: 'ask', options: [['question', 'ok']] })).ok, true);
  assert.equal(validateCommandInput(command, commandInteraction({ name: 'ask', options: [] })).ok, false);
  assert.equal(validateCommandInput(command, commandInteraction({ name: 'ask', options: [['question', '   ']] })).ok, false);
  assert.equal(validateCommandInput(command, commandInteraction({ name: 'ask', options: [['question', '123456']] })).ok, false);
});

test('describeError maps API failures to actionable messages', () => {
  assert.match(describeError(new DiscordAPIError({ status: 403 })), /View Channels/);
  assert.match(describeError(new DiscordAPIError({ status: 429 })), /rate-limited/i);
  assert.match(describeError(new DiscordAPIError({ status: 404 })), /deleted/);
  assert.match(describeError(new Error('boom')), /Something went wrong/);
});
