import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createAliGroupReplyPermit, consumeAliGroupReplyPermit,
  clearAliGroupReplyPermit } = require('./ali-group-outbound.cjs');

test('ALI group outbound permit is private, short-lived and consumed once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ali-group-permit-'));
  const directory = path.join(root, 'private');
  const groupJid = '123456789012@g.us';
  const message = '🤖 Ali:\n\nRespuesta QA TEST.';
  try {
    const filename = createAliGroupReplyPermit(groupJid, message,
      { directory, now: () => 1000 });
    assert.equal(fs.statSync(directory).mode & 0o077, 0);
    assert.equal(fs.statSync(filename).mode & 0o077, 0);
    assert.equal(consumeAliGroupReplyPermit(groupJid, '🤖 Ali:\n\nOtro texto.',
      { directory, now: () => 2000 }), false);
    assert.equal(consumeAliGroupReplyPermit(groupJid, message,
      { directory, now: () => 2000 }), true);
    assert.equal(consumeAliGroupReplyPermit(groupJid, message,
      { directory, now: () => 2000 }), false);
    const expired = createAliGroupReplyPermit(groupJid, message,
      { directory, now: () => 1000 });
    assert.equal(consumeAliGroupReplyPermit(groupJid, message,
      { directory, now: () => 62_000 }), false);
    clearAliGroupReplyPermit(expired);
    assert.throws(() => createAliGroupReplyPermit(groupJid, 'Sin rótulo',
      { directory }), TypeError);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
