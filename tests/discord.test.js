/**
 * Discord REST client tests: rate limits, retries, pagination, follow-ups.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordClient, DiscordAPIError } from '../src/discord.js';

function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('request returns parsed data on success', async () => {
  const seen = [];
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return jsonResponse({ id: '42' });
    },
    sleepImpl: async () => {},
  });
  const result = await client.request('/users/@me');
  assert.deepEqual(result, { id: '42' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.headers.Authorization, 'Bot tok');
});

test('429 is retried after the advertised delay and then succeeds', async () => {
  const sleeps = [];
  let calls = 0;
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ message: 'You are being rate limited.', retry_after: 0.05 }, { status: 429 });
      }
      return jsonResponse({ ok: true });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
  });
  const result = await client.request('/x');
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] >= 50 && sleeps[0] <= 200);
});

test('persistent 429 eventually throws DiscordAPIError', async () => {
  let calls = 0;
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ message: 'rate limited', retry_after: 0.01 }, { status: 429 });
    },
    sleepImpl: async () => {},
  });
  await assert.rejects(
    () => client.request('/x'),
    (error) => {
      assert.ok(error instanceof DiscordAPIError);
      assert.equal(error.status, 429);
      return true;
    },
  );
  assert.equal(calls, 4); // initial + 3 retries
});

test('5xx responses are retried with backoff', async () => {
  let calls = 0;
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('oops', { status: 500 });
      return jsonResponse({ ok: true });
    },
    sleepImpl: async () => {},
  });
  assert.deepEqual(await client.request('/x'), { ok: true });
  assert.equal(calls, 2);
});

test('4xx errors throw immediately without retry', async () => {
  let calls = 0;
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ message: 'Missing Access', code: 50001 }, { status: 403 });
    },
    sleepImpl: async () => {},
  });
  await assert.rejects(
    () => client.request('/x'),
    (error) => error instanceof DiscordAPIError && error.status === 403 && error.code === 50001,
  );
  assert.equal(calls, 1);
});

test('listMessagesPaginated walks before cursors until exhausted', async () => {
  const requests = [];
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const before = parsed.searchParams.get('before');
      requests.push(before);
      if (!before) {
        // First page: 100 messages (ids 200..101).
        return jsonResponse(Array.from({ length: 100 }, (_, i) => ({ id: String(200 - i) })));
      }
      if (before === '101') {
        return jsonResponse(Array.from({ length: 30 }, (_, i) => ({ id: String(100 - i) })));
      }
      return jsonResponse([]);
    },
    sleepImpl: async () => {},
  });

  const { messages, skipped } = await client.listMessagesPaginated('chan-1', { maxMessages: 200 });
  assert.equal(skipped, false);
  assert.equal(messages.length, 130);
  assert.deepEqual(requests, [null, '101']);
});

test('listMessagesPaginated respects maxMessages', async () => {
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () =>
      jsonResponse(Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1) }))),
    sleepImpl: async () => {},
  });
  const { messages } = await client.listMessagesPaginated('chan-1', { maxMessages: 25 });
  assert.equal(messages.length, 25);
});

test('listMessagesPaginated skips channels without access (403)', async () => {
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async () => jsonResponse({ message: 'Missing Access' }, { status: 403 }),
    sleepImpl: async () => {},
  });
  const { messages, skipped } = await client.listMessagesPaginated('chan-1');
  assert.equal(skipped, true);
  assert.equal(messages.length, 0);
});

test('createFollowup posts to the interaction webhook with mention pings disabled', async () => {
  let captured;
  const client = createDiscordClient({
    token: 'tok',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({ id: 'msg-1' });
    },
    sleepImpl: async () => {},
  });
  await client.createFollowup('app-1', 'interaction-token', { content: 'hello' });
  assert.equal(captured.url, 'https://discord.com/api/v10/webhooks/app-1/interaction-token');
  assert.equal(captured.init.method, 'POST');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.content, 'hello');
  assert.deepEqual(body.allowed_mentions, { parse: [] });
});

test('createDiscordClient requires a token', () => {
  assert.throws(() => createDiscordClient({ token: '' }), /bot token/);
});
