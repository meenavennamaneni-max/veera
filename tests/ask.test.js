/**
 * /ask command tests: built-in facts, creator intent, honest fallbacks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  execute,
  matchBotFact,
  isCreatorQuestion,
  CREATOR_RESPONSE,
} from '../src/commands/ask.js';
import { createFakeDiscordClient, commandInteraction } from './helpers.js';

function askInteraction(question) {
  return commandInteraction({ name: 'ask', options: [['question', question]] });
}

test('creator questions get the exact mandated sentence', () => {
  assert.equal(
    CREATOR_RESPONSE,
    "Dev's Personal AI was created and developed by Dev Chowdhary.",
  );
  for (const question of [
    'who created the bot?',
    'who made you?',
    'who is the creator?',
    'who developed this bot',
    'who is Dev Chowdhary',
  ]) {
    const fact = matchBotFact(question);
    assert.equal(fact?.answer, CREATOR_RESPONSE, question);
  }
});

test('isCreatorQuestion does not hijack unrelated who-questions', () => {
  assert.equal(isCreatorQuestion('who won the tournament?'), false);
  assert.equal(isCreatorQuestion('what time is the event?'), false);
});

test('built-in facts match by keyword', () => {
  assert.equal(matchBotFact('what is your name')?.id, 'name');
  assert.equal(matchBotFact('what runtime do you use')?.id, 'runtime');
  assert.equal(matchBotFact('do you use ai?')?.id, 'implementation');
  assert.equal(matchBotFact('what do you do')?.id, 'purpose');
  assert.equal(matchBotFact('are you chatgpt?')?.id, 'not-ai');
  assert.equal(matchBotFact('what is 2+2'), null);
});

test('execute answers creator questions without touching the Discord API', async () => {
  let fetched = false;
  const client = {
    getGuildChannels: async () => {
      fetched = true;
      return [];
    },
    listMessagesPaginated: async () => ({ messages: [], skipped: false }),
    createFollowup: async () => ({}),
  };
  const payload = await execute({ interaction: askInteraction('who created the bot'), client, db: null });
  assert.equal(payload.content, CREATOR_RESPONSE);
  assert.equal(fetched, false);
});

test('execute falls back to retrieved history with links and timestamps', async () => {
  const client = createFakeDiscordClient({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
    messagesByChannel: {
      c1: [
        {
          id: 'm1',
          channel_id: 'c1',
          author: { id: 'u1', username: 'dev' },
          content: 'the deploy password policy changed today',
          timestamp: '2026-02-01T10:00:00.000Z',
        },
      ],
    },
  });
  const payload = await execute({
    interaction: askInteraction('password policy'),
    client,
    db: null,
  });
  assert.ok(payload.embeds);
  const description = payload.embeds[0].description;
  assert.match(description, /keyword matching — not generated/);
  assert.match(description, /#general/);
  assert.match(description, /https:\/\/discord\.com\/channels\/guild-1\/c1\/m1/);
  assert.match(description, /<t:\d+:f>/);
});

test('execute admits when no answer is available and does not fabricate', async () => {
  const client = createFakeDiscordClient({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
    messagesByChannel: { c1: [] },
  });
  const payload = await execute({
    interaction: askInteraction('what is the airspeed velocity of an unladen swallow'),
    client,
    db: null,
  });
  assert.equal(payload.embeds, undefined);
  assert.match(payload.content, /could not find an answer/i);
  assert.match(payload.content, /I don't generate answers/);
});

test('execute validates the question option', async () => {
  const client = createFakeDiscordClient({ channels: [], messagesByChannel: {} });
  const empty = await execute({
    interaction: commandInteraction({ name: 'ask', options: [['question', '   ']] }),
    client,
    db: null,
  });
  assert.equal(empty.flags, 64);
  assert.match(empty.content, /non-empty question/);

  const long = await execute({
    interaction: askInteraction('x'.repeat(501)),
    client,
    db: null,
  });
  assert.equal(long.flags, 64);
  assert.match(long.content, /500 characters/);
});
