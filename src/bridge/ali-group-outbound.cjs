const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GROUP_JID = /^\d{10,25}@g\.us$/;
const ALI_LABEL = '🤖 Ali:';
const DEFAULT_DIR = '/data/ali-group-outbound-permits';
const PERMIT_LIFETIME_MS = 60_000;

function permitPath(groupJid, message, directory) {
  if (!GROUP_JID.test(groupJid || '') || typeof message !== 'string' ||
      !message.startsWith(ALI_LABEL)) throw new TypeError('Invalid ALI group reply permit');
  const digest = crypto.createHash('sha256').update(`${groupJid}\0${message}`).digest('hex');
  return path.join(directory, `${digest}.json`);
}

function createAliGroupReplyPermit(groupJid, message, {
  directory = process.env.ALI_GROUP_OUTBOUND_PERMIT_DIR || DEFAULT_DIR,
  now = Date.now,
} = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.statSync(directory).isDirectory() || (fs.statSync(directory).mode & 0o077)) {
    throw new Error('ALI group reply permit directory is not private');
  }
  const filename = permitPath(groupJid, message, directory);
  fs.writeFileSync(filename, JSON.stringify({ expiresAt: now() + PERMIT_LIFETIME_MS }),
    { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return filename;
}

function consumeAliGroupReplyPermit(groupJid, message, {
  directory = process.env.ALI_GROUP_OUTBOUND_PERMIT_DIR || DEFAULT_DIR,
  now = Date.now,
} = {}) {
  let filename;
  try {
    filename = permitPath(groupJid, message, directory);
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    let data;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o077)) return false;
      data = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } finally {
      fs.closeSync(fd);
    }
    fs.unlinkSync(filename);
    return Number.isFinite(data.expiresAt) && data.expiresAt >= now();
  } catch {
    return false;
  }
}

function clearAliGroupReplyPermit(filename) {
  try { fs.unlinkSync(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

module.exports = { ALI_LABEL, createAliGroupReplyPermit,
  consumeAliGroupReplyPermit, clearAliGroupReplyPermit };
