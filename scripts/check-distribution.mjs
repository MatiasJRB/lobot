import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Fixed allowlist; never recursively export the checkout, private state or seeds.
export const distributionFiles = Object.freeze([
  'src/core/config.js', 'src/core/infrastructure.js',
  'src/adapters/dot/index.js', 'src/adapters/whatsapp/index.js',
  'src/adapters/openclaw/index.js', 'src/adapters/codex/index.js',
  'config/infrastructure.example.json', 'config/infrastructure.schema.json',
  'docs/PACKAGE.md', 'docs/PACKAGE_CONTRACTS.md', 'docs/PACKAGE_SECURITY.md',
  'docs/PACKAGE_BOOTSTRAP.md', 'LICENSE',
]);
export const packageMetadata = Object.freeze({
  name: 'lobot-infrastructure', version: '0.1.0', private: true, type: 'module',
  engines: { node: '>=24' }, license: 'MIT',
  exports: { './core': './src/core/infrastructure.js', './config': './src/core/config.js',
    './dot': './src/adapters/dot/index.js', './whatsapp': './src/adapters/whatsapp/index.js',
    './openclaw': './src/adapters/openclaw/index.js', './codex': './src/adapters/codex/index.js' },
});
export const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
export function readDistributionFile(root, relative) {
  const file = path.join(root, relative), realRoot = fs.realpathSync(root);
  let cursor = root;
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Distribution symlink refused');
  }
  if (!fs.realpathSync(file).startsWith(realRoot + path.sep) || !fs.statSync(file).isFile())
    throw new Error('Distribution escape refused');
  const data = fs.readFileSync(file);
  if (data.length > 100000) throw new Error('Unexpected distribution file size');
  if (/\/Users\/|\/home\/[^\s/]+\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|-----BEGIN .*PRIVATE KEY|\b(?:sk-|ghp_)[A-Za-z0-9]{16,}|CANARY_PRIVATE_CONFIG/i.test(data.toString()))
    throw new Error(`Private content detected in ${relative}`);
  return data;
}
export function checkDistribution(root) {
  const expected = [...distributionFiles, 'package.json', 'manifest.json'].sort();
  const files = [];
  function walk(directory, prefix = '') {
    for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + e.name;
      if (e.isDirectory()) walk(path.join(directory, e.name), relative + '/');
      else if (e.isFile()) files.push(relative);
      else throw new Error('Non-regular distribution entry');
    }
  }
  walk(root);
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected)) throw new Error('Unexpected distribution contents');
  if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'package.json')))) !== JSON.stringify(packageMetadata))
    throw new Error('Unexpected package metadata');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...distributionFiles, 'package.json'].sort()))
    throw new Error('Unexpected manifest contents');
  for (const relative of [...distributionFiles, 'package.json'])
    if (sha256(readDistributionFile(root, relative)) !== manifest[relative]) throw new Error('Distribution hash mismatch');
  return { ok: true, files: files.length, dependencies: 0, servicesStarted: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(checkDistribution(path.resolve(process.argv[2])))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
