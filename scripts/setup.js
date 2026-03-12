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

// ── 3. Validate environment and admin files ──────────────────────────────
log.step('Checking environment config...');
const envPath = join(root, '.env.local');
const adminPath = join(root, 'spacetimedb', 'src', 'admin.ts');
const adminExamplePath = join(root, 'spacetimedb', 'src', 'admin.ts.example');

// Ensure admin.ts exists
if (!existsSync(adminPath)) {
  if (existsSync(adminExamplePath)) {
    log.warn('spacetimedb/src/admin.ts not found — creating from template');
    writeFileSync(adminPath, readFileSync(adminExamplePath, 'utf8'));
    log.info('Created spacetimedb/src/admin.ts.');
    log.info('--> Action: Edit spacetimedb/src/admin.ts with your Clerk ID and desired DB Name.');
    process.exit(0);
  } else {
    log.error('admin.ts.example missing. Cannot initialize admin.ts.');
    process.exit(1);
  }
}

// Read admin.ts as source of truth
const adminContent = readFileSync(adminPath, 'utf8');
const dbNameMatch = adminContent.match(/export const DB_NAME = ['"](.+)['"]/);
const adminIdMatch = adminContent.match(/export const ADMIN_CLERK_ID = ['"](.+)['"]/);

if (!dbNameMatch || !adminIdMatch || adminContent.includes('REPLACE_ME')) {
  log.warn('spacetimedb/src/admin.ts is not fully configured.');
  log.info('Please fill in DB_NAME and ADMIN_CLERK_ID in spacetimedb/src/admin.ts.');
  process.exit(0);
}

const dbName = dbNameMatch[1].trim();
const adminId = adminIdMatch[1].trim();

// ── 3b. Sync to spacetime.json ──────────────────────────────────────────
log.step(`Syncing DB Name "${dbName}" to spacetime.json...`);
const spacetimeJsonPath = join(root, 'spacetime.json');
if (existsSync(spacetimeJsonPath)) {
  try {
    const spacetimeJson = JSON.parse(readFileSync(spacetimeJsonPath, 'utf8'));
    spacetimeJson.database = dbName;
    writeFileSync(spacetimeJsonPath, JSON.stringify(spacetimeJson, null, 2) + '\n');
    log.ok('spacetime.json updated');
  } catch (e) {
    log.error('Failed to update spacetime.json');
  }
}

// ── 3c. Sync to .env.local ──────────────────────────────────────────────
log.step('Syncing config to .env.local...');
let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

const envLines = [
  '# SpacetimeDB (maincloud)',
  `VITE_SPACETIMEDB_DB_NAME=${dbName}`,
  'VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com',
  '',
  '# Clerk Auth — get your keys from https://dashboard.clerk.com',
];

// If we already had envContent, preserve CLERK keys if they aren't placeholders
const clerkKeyMatch = envContent.match(/VITE_CLERK_PUBLISHABLE_KEY=(pk_test_.+)/);
const clerkSecretMatch = envContent.match(/CLERK_SECRET_KEY=(sk_test_.+)/);

const pubKey = (clerkKeyMatch && !clerkKeyMatch[1].includes('REPLACE')) ? clerkKeyMatch[1] : 'pk_test_REPLACE_ME';
const secKey = (clerkSecretMatch && !clerkSecretMatch[1].includes('REPLACE')) ? clerkSecretMatch[1] : 'sk_test_REPLACE_ME';

envLines.push(`VITE_CLERK_PUBLISHABLE_KEY=${pubKey}`);
envLines.push(`CLERK_SECRET_KEY=${secKey}`);
envLines.push('');
envLines.push('# Clerk Admin User ID (synced from admin.ts)');
envLines.push(`VITE_ADMIN_CLERK_ID=${adminId}`);

writeFileSync(envPath, envLines.join('\n') + '\n');

if (pubKey === 'pk_test_REPLACE_ME' || secKey === 'sk_test_REPLACE_ME') {
  log.warn('.env.local is missing real Clerk keys.');
  log.info('Please update VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local');
  process.exit(0);
}
log.ok('.env.local synchronized');

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
  log.warn('   Republishing will OVERWRITE existing data.');
  process.stdout.write(`\n  Type ${c.bold}YES${c.reset} to continue, or anything else to cancel: `);
  const buf = Buffer.alloc(64);
  const n = readSync(0, buf, 0, buf.length, null);
  const answer = buf.slice(0, n).toString().trim();
  if (answer !== 'YES') {
    log.warn('Publish cancelled.');
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
