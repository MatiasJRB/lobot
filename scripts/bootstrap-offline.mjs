import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributionFiles, packageMetadata, readDistributionFile, sha256, checkDistribution } from './check-distribution.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export function installOffline(destination) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24+ required');
  if (!destination || !path.isAbsolute(destination)) throw new Error('Explicit absolute destination required');
  const target = path.resolve(destination), parent = fs.realpathSync(path.dirname(target));
  const realTarget = path.join(parent, path.basename(target)), root = fs.realpathSync(sourceRoot);
  if (realTarget === root || realTarget.startsWith(root + path.sep) || fs.existsSync(target))
    throw new Error('Destination must be new and outside the checkout');
  // Validate everything before creating the isolated destination.
  const contents = distributionFiles.map(file => [file, readDistributionFile(sourceRoot, file)]);
  fs.mkdirSync(realTarget, { mode: 0o700 });
  try {
    const manifest = {};
    for (const [relative, content] of contents) {
      const output = path.join(realTarget, relative);
      fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      fs.writeFileSync(output, content, { flag: 'wx', mode: 0o600 });
      manifest[relative] = sha256(content);
    }
    const metadata = JSON.stringify(packageMetadata, null, 2) + '\n';
    fs.writeFileSync(path.join(realTarget, 'package.json'), metadata, { flag: 'wx', mode: 0o600 });
    manifest['package.json'] = sha256(metadata);
    fs.writeFileSync(path.join(realTarget, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { ...checkDistribution(realTarget), destination: realTarget };
  } catch (e) { fs.rmSync(realTarget, { recursive: true, force: true }); throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(installOffline(process.argv[2]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
