/**
 * Search-engine tests: tokenizing, scoring, retrieval, D1 index, formatting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  scoreMessage,
  buildJumpLink,
  excerpt,
  messageCreatedAt,
  formatTimestamp,
  isAnnouncementChannel,
  isSearchableTextChannel,
  searchGuildMessages,
  formatSearchResults,
  limitationsNote,
  normalizeMessage,
  indexMessages,
  queryIndexedMessages,
} from '../src/search.js';
import { createFakeDiscordClient, createFakeD1 } from './helpers.js';

const GUILD = 'guild-1';

function msg(id, channelId, content, { username = 'alice', ts = '2026-01-01T12:00:00.000Z' } = {}) {
  return {
    id,
    channel_id: channelId,
    author: { id: `user-${username}`, username },
    content,
    timestamp: ts,
  };
}

test('tokenize lowercases, strips stopwords, dedupes and caps', () => {
  assert.deepEqual(tokenize('The Release Date of the Release!'), ['release', 'date']);
  assert.deepEqual(tokenize('what is 2fa'), ['2fa']);
  assert.deepEqual(tokenize('a b c d'), []);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.equal(tokenize('one two three four five six seven eight nine ten eleven twelve thirteen fourteen').length, 12);
});

test('scoreMessage requires keyword overlap and rewards phrase/all hits', () => {
  assert.equal(scoreMessage(['release'], 'nothing here'), 0);
  assert.equal(scoreMessage(['release'], 'the big release today'), 2);
  assert.equal(scoreMessage(['release', 'date'], 'the release date is friday'), 2 + 2 + 4 + 3);
  assert.ok(scoreMessage(['alpha', 'beta'], 'alpha beta') > scoreMessage(['alpha', 'beta'], 'alpha only'));
});

test('buildJumpLink and formatTimestamp produce canonical Discord markup', () => {
  assert.equal(
    buildJumpLink('g1', 'c1', 'm1'),
    'https://discord.com/channels/g1/c1/m1',
  );
  assert.equal(formatTimestamp(123), '<t:123:f>');
});

test('excerpt flattens whitespace and truncates', () => {
  assert.equal(excerpt('hello\n  world'), 'hello world');
  assert.equal(excerpt('x'.repeat(300)).length, 160);
  assert.equal(excerpt('x'.repeat(300)).endsWith('…'), true);
  assert.equal(excerpt(''), '*(no text content)*');
});

test('messageCreatedAt prefers ISO timestamp, falls back to snowflake', () => {
  assert.equal(messageCreatedAt({ timestamp: '2026-01-01T00:00:00.000Z' }), 1767225600);
  // Snowflake encoding: ms = (id >> 22) + 1420070400000.
  const snowflake = ((1767225600n * 1000n - 1420070400000n) << 22n).toString();
  assert.equal(messageCreatedAt({ id: snowflake }), 1767225600);
});

test('channel classification', () => {
  assert.equal(isAnnouncementChannel({ type: 5, name: 'whatever' }), true);
  assert.equal(isAnnouncementChannel({ type: 0, name: 'news-and-updates' }), true);
  assert.equal(isAnnouncementChannel({ type: 0, name: 'general' }), false);
  assert.equal(isSearchableTextChannel({ type: 0 }), true);
  assert.equal(isSearchableTextChannel({ type: 5 }), true);
  assert.equal(isSearchableTextChannel({ type: 2 }), false); // voice
  assert.equal(isSearchableTextChannel({ type: 4 }), false); // category
});

test('searchGuildMessages retrieves live messages and returns links + timestamps', async () => {
  const client = createFakeDiscordClient({
    channels: [
      { id: 'c1', name: 'general', type: 0 },
      { id: 'c2', name: 'announcements', type: 5 },
      { id: 'c3', name: 'voice', type: 2 },
      { id: 'c4', name: 'secret', type: 0 },
    ],
    messagesByChannel: {
      c1: [
        msg('m1', 'c1', 'the release date is friday for the release'),
        msg('m2', 'c1', 'lunch plans?'),
      ],
      c2: [msg('m3', 'c2', 'Maintenance window tonight')],
    },
    errorsByChannel: {
      c4: { status: 403 },
    },
  });

  const outcome = await searchGuildMessages({
    client,
    db: null,
    guildId: GUILD,
    query: 'release date',
  });

  assert.equal(outcome.results.length, 1);
  const [top] = outcome.results;
  assert.equal(top.record.id, 'm1');
  assert.equal(top.record.channelName, 'general');
  assert.equal(top.source, 'live');
  const line = formatSearchResults({ title: 'Server search: release date', outcome });
  const description = line.embeds[0].description;
  assert.match(description, /#general/);
  assert.match(description, /https:\/\/discord\.com\/channels\/guild-1\/c1\/m1/);
  assert.match(description, /<t:\d+:f>/);
  assert.equal(outcome.stats.channelsSearched, 3); // voice channel is not searchable
  assert.equal(outcome.stats.channelsSkipped, 1); // secret 403
  assert.equal(outcome.stats.messagesScanned, 3);
});

test('searchGuildMessages scope=announcements only scans announcement channels', async () => {
  const client = createFakeDiscordClient({
    channels: [
      { id: 'c1', name: 'general', type: 0 },
      { id: 'c2', name: 'announcements', type: 5 },
    ],
    messagesByChannel: {
      c1: [msg('m1', 'c1', 'server restart announced here in general')],
      c2: [msg('m2', 'c2', 'We announced a server restart for Sunday')],
    },
  });

  const outcome = await searchGuildMessages({
    client,
    db: null,
    guildId: GUILD,
    query: 'server restart',
    scope: 'announcements',
  });

  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].record.id, 'm2');
  assert.equal(outcome.stats.channelsSearched, 1);
});

test('D1 index extends search beyond the live window', async () => {
  const db = createFakeD1([
    {
      message_id: 'old-1',
      guild_id: GUILD,
      channel_id: 'c1',
      channel_name: 'general',
      author_id: 'u1',
      author_name: 'bob',
      content: 'ancient lore about the phoenix project',
      created_at: 1_600_000_000,
      indexed_at: 1_700_000_000,
    },
    {
      message_id: 'noise-1',
      guild_id: GUILD,
      channel_id: 'c1',
      channel_name: 'general',
      author_id: 'u1',
      author_name: 'bob',
      content: 'unrelated chatter',
      created_at: 1_600_000_001,
      indexed_at: 1_700_000_000,
    },
  ]);
  const client = createFakeDiscordClient({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
    messagesByChannel: { c1: [msg('m1', 'c1', 'phoenix project launch is today')] },
  });

  const outcome = await searchGuildMessages({
    client,
    db,
    guildId: GUILD,
    query: 'phoenix',
  });

  const ids = outcome.results.map((entry) => entry.record.id).sort();
  assert.deepEqual(ids, ['m1', 'old-1']);
  assert.equal(outcome.stats.indexMatches, 1);
  assert.equal(outcome.stats.indexedRows, 1); // live message cached
});

test('indexMessages upserts and queryIndexedMessages filters by channel', async () => {
  const db = createFakeD1();
  const record = normalizeMessage(msg('m9', 'c1', 'hello phoenix'), GUILD, 'general');
  await indexMessages(db, [record]);
  await indexMessages(db, [{ ...record, content: 'hello phoenix updated' }]); // upsert
  assert.equal(db.rows.size, 1);
  assert.equal([...db.rows.values()][0].content, 'hello phoenix updated');

  const hit = await queryIndexedMessages(db, {
    guildId: GUILD,
    tokens: ['phoenix'],
    channelIds: ['c1'],
  });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, 'm9');

  const miss = await queryIndexedMessages(db, {
    guildId: GUILD,
    tokens: ['phoenix'],
    channelIds: ['other'],
  });
  assert.equal(miss.length, 0);
});

test('no results produce an honest message; limitations note explains the window', async () => {
  const client = createFakeDiscordClient({
    channels: [{ id: 'c1', name: 'general', type: 0 }],
    messagesByChannel: { c1: [msg('m1', 'c1', 'completely unrelated')] },
  });
  const outcome = await searchGuildMessages({
    client,
    db: null,
    guildId: GUILD,
    query: 'zebra migrations',
  });
  assert.equal(outcome.results.length, 0);
  const payload = formatSearchResults({ title: 'Server search: zebra migrations', outcome });
  assert.equal(payload.embeds, undefined);
  assert.match(payload.content, /No accessible messages matched/);
  assert.match(limitationsNote(outcome), /no AI model/);
  assert.match(limitationsNote(outcome), /1 accessible messages/);
});
