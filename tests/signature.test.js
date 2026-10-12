/**
 * Signature-verification tests: Ed25519 over (timestamp + body), timestamp
 * freshness, and malformed-input hardening.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  verifyInteractionSignature,
  verifyInteractionRequest,
  isTimestampFresh,
  hexToBytes,
} from '../src/discord.js';
import { makeSigningKeypair } from './helpers.js';

const NOW = 1_800_000_000;

test('hexToBytes validates hex input', () => {
  assert.equal(hexToBytes('abcd')?.length, 2);
  assert.equal(hexToBytes('abc'), null);
  assert.equal(hexToBytes('zz'), null);
  assert.equal(hexToBytes(''), null);
  assert.equal(hexToBytes(null), null);
});

test('isTimestampFresh accepts fresh timestamps and rejects stale ones', () => {
  assert.equal(isTimestampFresh(String(NOW), NOW), true);
  assert.equal(isTimestampFresh(String(NOW - 299), NOW), true);
  assert.equal(isTimestampFresh(String(NOW - 301), NOW), false);
  assert.equal(isTimestampFresh(String(NOW + 301), NOW), false);
  assert.equal(isTimestampFresh('not-a-number', NOW), false);
  assert.equal(isTimestampFresh(undefined, NOW), false);
});

test('valid signature verifies', async () => {
  const keypair = makeSigningKeypair();
  const body = JSON.stringify({ type: 1 });
  const ts = String(NOW);
  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: keypair.publicKeyHex,
      signatureHex: keypair.sign(ts, body),
      timestamp: ts,
      body,
    }),
    true,
  );
});

test('tampered body fails verification', async () => {
  const keypair = makeSigningKeypair();
  const ts = String(NOW);
  const signatureHex = keypair.sign(ts, '{"type":1}');
  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: keypair.publicKeyHex,
      signatureHex,
      timestamp: ts,
      body: '{"type":2}',
    }),
    false,
  );
});

test('wrong public key fails verification', async () => {
  const keypair = makeSigningKeypair();
  const other = makeSigningKeypair();
  const body = '{"type":1}';
  const ts = String(NOW);
  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: other.publicKeyHex,
      signatureHex: keypair.sign(ts, body),
      timestamp: ts,
      body,
    }),
    false,
  );
});

test('malformed signature or key fails closed', async () => {
  const keypair = makeSigningKeypair();
  const body = '{"type":1}';
  const ts = String(NOW);
  const goodSig = keypair.sign(ts, body);

  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: keypair.publicKeyHex,
      signatureHex: 'deadbeef',
      timestamp: ts,
      body,
    }),
    false,
  );
  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: 'ab',
      signatureHex: goodSig,
      timestamp: ts,
      body,
    }),
    false,
  );
  assert.equal(
    await verifyInteractionSignature({
      publicKeyHex: keypair.publicKeyHex,
      signatureHex: goodSig,
      timestamp: ts,
      body: 42,
    }),
    false,
  );
});

test('verifyInteractionRequest enforces headers and freshness', async () => {
  const keypair = makeSigningKeypair();
  const body = JSON.stringify({ type: 1, id: '1' });
  const ts = String(NOW);
  const signature = keypair.sign(ts, body);

  assert.equal(
    await verifyInteractionRequest({
      publicKeyHex: keypair.publicKeyHex,
      signature,
      timestamp: ts,
      body,
      nowSeconds: NOW,
    }),
    true,
  );

  // Missing headers.
  assert.equal(
    await verifyInteractionRequest({
      publicKeyHex: keypair.publicKeyHex,
      signature: null,
      timestamp: ts,
      body,
      nowSeconds: NOW,
    }),
    false,
  );

  // Stale timestamp is rejected before the crypto check matters.
  assert.equal(
    await verifyInteractionRequest({
      publicKeyHex: keypair.publicKeyHex,
      signature,
      timestamp: String(NOW - 3600),
      body,
      nowSeconds: NOW,
    }),
    false,
  );
});
