import fs from 'node:fs';
import path from 'node:path';

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
export function validateConfig(value) {
  if (!exact(value, ['version', 'executionOwner', 'cases', 'whatsapp']) || value.version !== 1 ||
      value.executionOwner !== 'existing-worker' || !Array.isArray(value.cases) ||
      !value.cases.length || value.cases.length > 100 || new Set(value.cases).size !== value.cases.length ||
      value.cases.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]{2,79}$/.test(id) || /mango/i.test(id)) ||
      !exact(value.whatsapp, ['accountId', 'self']) || value.whatsapp.accountId !== 'default' ||
      typeof value.whatsapp.self !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value.whatsapp.self))
    throw new Error('Invalid infrastructure configuration');
  return structuredClone(value);
}

export function loadPrivateConfig(file, { packageRoot } = {}) {
  if (!packageRoot || !path.isAbsolute(file)) throw new Error('Explicit private config and package root required');
  const root = fs.realpathSync(packageRoot), real = fs.realpathSync(file);
  const stat = fs.lstatSync(file), parent = fs.statSync(path.dirname(real));
  if (real === root || real.startsWith(root + path.sep) || !stat.isFile() || stat.isSymbolicLink() ||
      (stat.mode & 0o077) || (parent.mode & 0o077) || stat.size > 16384 ||
      (process.getuid && stat.uid !== process.getuid())) throw new Error('Config must be private and outside distribution');
  return validateConfig(JSON.parse(fs.readFileSync(real, 'utf8')));
}
