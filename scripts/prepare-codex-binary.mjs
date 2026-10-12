import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';

const source = join(process.cwd(), 'node_modules', '@openai', 'codex-linux-x64', 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex');
const outputDir = join(process.cwd(), 'api', 'lib');
const output = join(outputDir, 'codex.gz');
const publicDir = join(process.cwd(), 'public');

// Vercel's static output contains only the site's public assets, not API code
// or the private Codex archive included separately in the two Functions.
await mkdir(publicDir, { recursive: true });
const staticExtensions = /\.(?:html|css|js|webmanifest|svg|png|jpe?g|ico)$/i;
for (const entry of await readdir(process.cwd(), { withFileTypes: true })) {
  if (entry.isFile() && staticExtensions.test(entry.name)) {
    await copyFile(join(process.cwd(), entry.name), join(publicDir, entry.name));
  }
}
await cp(join(process.cwd(), 'zohoverify'), join(publicDir, 'zohoverify'), { recursive: true });

if (process.platform !== 'linux' && process.env.VERCEL) {
  throw new Error('Build Vercel untuk Codex harus berjalan di Linux x64.');
}
try {
  await stat(source);
} catch {
  if (process.env.VERCEL) throw new Error('Binary @openai/codex-linux-x64 tidak terpasang saat build Vercel.');
  console.log('Binary Linux Codex tidak terpasang; kompresi dilewati pada komputer lokal.');
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
await pipeline(createReadStream(source), createGzip({ level: 9 }), createWriteStream(output));
const { size } = await stat(output);
console.log(`Codex CLI siap dikemas: ${(size / 1024 / 1024).toFixed(1)} MiB (gzip).`);
