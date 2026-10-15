#!/usr/bin/env node
// Bundles the Lambda handlers (API + jobs) with esbuild.
//
// Input is the `tsc` output in dist/ (run `nest build` first): esbuild does not emit
// `emitDecoratorMetadata`, which Nest dependency injection needs, so we bundle the JS that tsc
// already produced instead of the TypeScript sources. See docs/adr/0011-lambda-esbuild-migrations.md.
//
// Output: dist-lambda/<name>/index.mjs (+ .map and extra files) and dist-lambda/<name>.zip.
// Entries whose compiled source does not exist yet are skipped with a warning.
//
// Usage: node scripts/bundle-lambda.mjs [name ...]
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { zipSync } from 'fflate';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(apiDir, 'dist');
const outRoot = join(apiDir, 'dist-lambda');

/** Handler entries. `source` is relative to dist/; `copy` maps apiDir paths to bundle paths. */
const ENTRIES = [
  { name: 'api', source: 'lambda.js' },
  { name: 'migrate', source: 'jobs/migrate.job.js', copy: { 'prisma/migrations': 'migrations' } },
  { name: 'expiry-alert', source: 'jobs/expiry-alert.job.js' },
  { name: 'recall-step', source: 'jobs/recall-step.job.js' },
];

/**
 * Optional packages that Nest/Swagger/pino `require()` inside try/catch. They are not installed,
 * so they stay external and the runtime fallback kicks in. Everything else is bundled (including
 * the AWS SDK, so the deployed code does not depend on the SDK version shipped by the runtime).
 */
const EXTERNAL = [
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/static',
  'class-transformer/storage',
  'pino-pretty',
];

// CommonJS dependencies call require()/__dirname; ESM output has neither.
const BANNER = [
  "import { createRequire as __tfCreateRequire } from 'node:module';",
  "import { fileURLToPath as __tfFileURLToPath } from 'node:url';",
  "import { dirname as __tfDirname } from 'node:path';",
  'globalThis.require ??= __tfCreateRequire(import.meta.url);',
  'globalThis.__filename ??= __tfFileURLToPath(import.meta.url);',
  'globalThis.__dirname ??= __tfDirname(globalThis.__filename);',
].join('\n');

const only = process.argv.slice(2);
const selected = only.length ? ENTRIES.filter((entry) => only.includes(entry.name)) : ENTRIES;

if (!existsSync(distDir)) {
  console.error('dist/ not found: run `nest build` first (pnpm bundle:lambda does it).');
  process.exit(1);
}

const entriesDir = join(outRoot, '.entries');
mkdirSync(entriesDir, { recursive: true });

const results = [];
for (const entry of selected) {
  const source = join(distDir, entry.source);
  if (!existsSync(source)) {
    console.warn(`warning: skipping "${entry.name}": ${relative(apiDir, source)} not found`);
    continue;
  }

  // Wrapper: resolve SSM secrets into env (top-level await, during the Lambda init phase) before
  // the handler module is evaluated, so modules that read process.env at import time also work.
  const wrapper = join(entriesDir, `${entry.name}.mjs`);
  writeFileSync(
    wrapper,
    [
      `import { loadRuntimeSecrets } from ${importPath(join(distDir, 'lambda/runtime-secrets.js'))};`,
      'await loadRuntimeSecrets();',
      `const mod = await import(${importPath(source)});`,
      'export const handler = mod.handler;',
      '',
    ].join('\n'),
  );

  const outDir = join(outRoot, entry.name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const outfile = join(outDir, 'index.mjs');
  const started = performance.now();
  await build({
    entryPoints: [wrapper],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    minify: true,
    // Nest uses class names in module tokens and logs: keep them through minification.
    keepNames: true,
    sourcemap: true,
    sourcesContent: false,
    legalComments: 'none',
    mainFields: ['module', 'main'],
    external: EXTERNAL,
    banner: { js: BANNER },
    logLevel: 'warning',
    logOverride: { 'empty-import-meta': 'silent' },
  });

  for (const [from, to] of Object.entries(entry.copy ?? {})) {
    cpSync(join(apiDir, from), join(outDir, to), { recursive: true });
  }

  const zipPath = join(outRoot, `${entry.name}.zip`);
  writeFileSync(zipPath, zipSync(collectFiles(outDir), { level: 6, mtime: new Date(1980, 0, 1) }));

  results.push({
    name: entry.name,
    'index.mjs (KB)': kb(statSync(outfile).size),
    'zip (KB)': kb(statSync(zipPath).size),
    'time (ms)': Math.round(performance.now() - started),
  });
}

rmSync(entriesDir, { recursive: true, force: true });
console.table(results);

/** Files of a directory as { 'relative/path': bytes }, with stable ordering. */
function collectFiles(dir, base = dir, files = {}) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collectFiles(path, base, files);
    else files[relative(base, path).split(sep).join('/')] = readFileSync(path);
  }
  return files;
}

/** Relative specifier from the wrapper directory, as a JS string literal. */
function importPath(target) {
  return JSON.stringify(relative(entriesDir, target).split(sep).join('/'));
}

function kb(bytes) {
  return Math.round(bytes / 1024);
}
