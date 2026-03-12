#!/usr/bin/env node
/**
 * setup.js — First-time setup for shared-canvas
 * Run with: bun scripts/setup.js
 *
 * Steps:
 *   1. Check required tools (bun, spacetime)
 *   2. Install dependencies (root + spacetimedb module)
 *   3. Validate .env.local has a real Clerk key
 *   4. Publish module to maincloud
 *   5. Generate TypeScript client bindings
 */
import { spawnSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, readSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};

const log = {
  step:  (msg) => console.log(`\n${c.cyan}${c.bold}▶ ${msg}${c.reset}`),
  ok:    (msg) => console.log(`${c.green}✔ ${msg}${c.reset}`),
  warn:  (msg) => console.log(`${c.yellow}⚠ ${msg}${c.reset}`),
  error: (msg) => console.error(`${c.red}✖ ${msg}${c.reset}`),
  info:  (msg) => console.log(`  ${msg}`),
};

function run(cmd, opts = {}) {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: root,
    ...opts,
  });
  if (result.status !== 0) {
    log.error(`Command failed: ${cmd}`);
    process.exit(result.status ?? 1);
  }
}

function checkTool(tool, installUrl) {
  const result = spawnSync(tool, ['--version'], { shell: true, stdio: 'pipe' });
  if (result.status !== 0) {
    log.error(`'${tool}' not found.`);
    log.info(`Install it from: ${installUrl}`);
    process.exit(1);
  }
}

console.log(`\n${c.bold}🎨 Shared Canvas Grid — First-time Setup${c.reset}\n`);

// ── 1. Check required tools ────────────────────────────────────────────────
log.step('Checking required tools...');
checkTool('bun',       'https://bun.sh');
checkTool('spacetime', 'https://spacetimedb.com/install');
log.ok('All required tools found');

// ── 2. Install dependencies ────────────────────────────────────────────────
log.step('Installing root dependencies...');
run('bun install');
log.ok('Root dependencies installed');

log.step('Installing SpacetimeDB module dependencies...');
run('bun install', { cwd: join(root, 'spacetimedb') });
log.ok('Module dependencies installed');

// ── 3. Validate .env.local ────────────────────────────────────────────────
log.step('Checking environment config...');
const envPath = join(root, '.env.local');
if (!existsSync(envPath)) {
  log.warn('.env.local not found — creating a template');
  writeFileSync(envPath, [
    '# SpacetimeDB (maincloud)',
    '# The name you want to give your database',
    'VITE_SPACETIMEDB_DB_NAME=REPLACE_WITH_YOUR_DB_NAME',
    'VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com',
    '',
    '# Clerk Auth — get your keys from https://dashboard.clerk.com',
    'VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME',
    'CLERK_SECRET_KEY=sk_test_REPLACE_ME',
    '',
    '# Clerk Admin User ID (for the Admin panel)',
    '# Your User ID which you can find in the Clerk Dashboard',
    'VITE_ADMIN_CLERK_ID=user_REPLACE_ME',
  ].join('\n') + '\n');
  log.warn('Created .env.local template.');
  log.info('1. Create your SpacetimeDB account: https://spacetimedb.com');
  log.info('2. Create your Clerk account: https://clerk.com');
  log.info('3. Edit .env.local with your real keys and desired DB name.');
  log.info('4. Then re-run this script.');
  process.exit(0);
}

// ── 3a. Setup admin.ts ──────────────────────────────────────────────────
log.step('Setting up SpacetimeDB admin config...');
const adminExamplePath = join(root, 'spacetimedb', 'src', 'admin.ts.example');
const adminPath = join(root, 'spacetimedb', 'src', 'admin.ts');

if (!existsSync(adminPath)) {
  if (existsSync(adminExamplePath)) {
    const adminExampleContent = readFileSync(adminExamplePath, 'utf8');
    writeFileSync(adminPath, adminExampleContent);
    log.ok('Created spacetimedb/src/admin.ts from template');
  } else {
    log.error('admin.ts.example not found! Please check your repository.');
  }
} else {
  log.info('spacetimedb/src/admin.ts already exists');
}

const envContent = readFileSync(envPath, 'utf8');
if (envContent.includes('REPLACE_ME') || envContent.includes('REPLACE_WITH_YOUR_DB_NAME')) {
  log.warn('.env.local found but some values are still placeholders.');
  log.info('Edit .env.local with your real Clerk keys and DB name, then re-run.');
  process.exit(0);
}

// Extract DB Name
const dbNameMatch = envContent.match(/VITE_SPACETIMEDB_DB_NAME=(.+)/);
const dbName = dbNameMatch ? dbNameMatch[1].trim() : 'my-shared-canvas';

log.ok('.env.local configured');

// ── 4. Publish module to maincloud ─────────────────────────────────────────
log.step(`Publishing module "${dbName}" to maincloud...`);

// Check if DB already exists — if so, warn before overwriting
const probe = spawnSync(
  `spacetime logs ${dbName} --server maincloud -n 1`,
  { shell: true, stdio: 'pipe' }
);
const alreadyExists = probe.status === 0;

if (alreadyExists) {
  log.warn(`⚠️  Database "${dbName}" already exists on maincloud.`);
  log.warn('   Republishing will OVERWRITE existing data (snapshots, canvas, etc.).');
  process.stdout.write(`\n  Type ${c.bold}YES${c.reset} to continue, or anything else to cancel: `);
  const buf = Buffer.alloc(64);
  const n = readSync(0, buf, 0, buf.length, null);
  const answer = buf.slice(0, n).toString().trim();
  if (answer !== 'YES') {
    log.warn('Publish cancelled. Run `bun run spacetime:generate` if bindings are out of date.');
    process.exit(0);
  }
}

run(`spacetime publish ${dbName} --module-path spacetimedb --server maincloud -y`);
log.ok('Module published to maincloud');
log.info(`Dashboard: https://spacetimedb.com/databases/${dbName}`);

// ── 5. Generate TypeScript client bindings ─────────────────────────────────
log.step('Generating TypeScript client bindings...');
run('spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb');
log.ok('Client bindings generated → src/module_bindings/');

// ── Done ───────────────────────────────────────────────────────────────────
console.log(`\n${c.green}${c.bold}✔ Setup complete!${c.reset}`);
console.log(`\n  Run ${c.cyan}bun scripts/dev.js${c.reset} to launch the dev environment.\n`);
