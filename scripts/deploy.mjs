// Deploy the studio (built front-end + PHP backend) to the live server over SSH,
// and run any new database migrations there BEFORE the PHP goes live.
//
//   npm run deploy                       dry run: build, then list what would change
//   npm run deploy -- --apply            do it
//
// Options
//   --apply                  upload + migrate (without it nothing on the server changes)
//   --skip-build             reuse the current dist/ (no typecheck, no vite build)
//   --skip-typecheck         build without the tsc check
//   --paths a,b              only deploy files whose path starts with one of these
//                            (e.g. --paths backend/api/clients.php,backend/database/)
//   --include .htaccess      also deploy a path that is on the never-touch list
//   --no-migrations          upload .sql files but do not run them
//   --full-migrations        replay EVERY migration (as the old one-shot runner did)
//   --ignore-migration-errors  carry on to the PHP upload even if a migration reported an error
//
// How it decides what to upload: it md5s the live files over SSH and compares
// them with dist/ (served from the web root) and backend/. Only new or changed
// files go up. Files that exist only on the server are listed, never deleted.
// Config (host, web root, never-touch list): scripts/deploy.config.json.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'scripts', 'deploy.config.json'), 'utf8'));

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const list = (f) => {
  const i = argv.indexOf(`--${f}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
};
const apply = has('apply');
const skipBuild = has('skip-build');
const pathFilter = list('paths');
const includes = list('include');
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

const HOST = cfg.sshHost;
const REMOTE_ROOT = (cfg.remoteRoot || '').replace(/\/+$/, '');
if (!REMOTE_ROOT) {
  fail(`Set "remoteRoot" in scripts/deploy.config.json (the studio web root on the server, relative to the SSH home, e.g. www/studio.taghunter.fr/public_html).`);
}
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// ---- small helpers ----------------------------------------------------------
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return r;
}
function ssh(command, opts = {}) {
  return run('ssh', ['-o', 'BatchMode=yes', HOST, command], opts);
}
const toRegex = (pattern) =>
  new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + (pattern.endsWith('/') ? '' : '$'));
const neverTouch = cfg.neverTouch.filter((p) => !includes.includes(p)).map((p) => ({ p, re: toRegex(p) }));
const alwaysAllow = new Set([...(cfg.alwaysAllow ?? []), ...includes]);
function isExcluded(rel) {
  if (alwaysAllow.has(rel)) return false;
  return neverTouch.some(({ p, re }) => re.test(rel) || (!p.includes('/') && p.startsWith('*') && re.test(rel.split('/').pop())));
}
const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');

function walk(dir, prefix, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const abs = join(dir, ent.name);
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (isExcluded(`${rel}/`)) continue;
      walk(abs, rel, out);
    } else if (ent.isFile() && !isExcluded(rel)) {
      out.set(rel, { abs, md5: md5(abs) });
    }
  }
}

// ---- 0. can we reach the server? --------------------------------------------
const ping = ssh(`cd ${shq(REMOTE_ROOT)} && pwd && test -d backend && echo OK`);
if (ping.status !== 0 || !ping.stdout.includes('OK')) {
  fail(`SSH check failed for ${HOST}:${REMOTE_ROOT}\n${(ping.stderr || ping.stdout).trim()}\n` +
    `(Is the key in SiteGround → SSH Keys Manager, and is remoteRoot right?)`);
}
const gitBranch = run('git', ['branch', '--show-current'], { cwd: root }).stdout.trim();
const dirty = run('git', ['status', '--short'], { cwd: root }).stdout.split('\n').filter(Boolean).length;
console.log(`Deploying ${root}\n  branch ${gitBranch || '?'}${dirty ? `, ${dirty} uncommitted change(s) included` : ''}\n  to ${HOST}:${ping.stdout.split('\n')[0]}\n`);

// ---- 1. build ---------------------------------------------------------------
if (!skipBuild) {
  if (!has('skip-typecheck')) {
    console.log('> npm run typecheck');
    if (run('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit', shell: true }).status !== 0) {
      fail('Typecheck failed. Fix it, or pass --skip-typecheck if the errors are known.');
    }
  }
  console.log('> npm run build');
  if (run('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true }).status !== 0) fail('Build failed.');
}
const distDir = join(root, 'dist');
if (!existsSync(join(distDir, 'index.html'))) fail('dist/index.html missing - run without --skip-build.');

// ---- 2. inventory: local vs live --------------------------------------------
const local = new Map();
walk(distDir, '', local); // dist/ is served from the web root
walk(join(root, 'backend'), 'backend', local);

const distTopDirs = readdirSync(distDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const scanDirs = ['backend', ...distTopDirs];
const prunes = cfg.neverTouch.filter((p) => p.endsWith('/') && !includes.includes(p)).map((p) => `-path ${shq(p.slice(0, -1))}`);
const findCmd =
  `cd ${shq(REMOTE_ROOT)} && ` +
  `{ find ${scanDirs.map(shq).join(' ')} \\( ${prunes.join(' -o ')} \\) -prune -o -type f -print0 2>/dev/null | xargs -0 -r md5sum; ` +
  `find . -maxdepth 1 -type f -print0 | xargs -0 -r md5sum; }`;
console.log('Comparing with the live server…');
const scan = ssh(findCmd);
if (scan.status !== 0 && !scan.stdout) fail(`Remote scan failed: ${scan.stderr}`);
const remote = new Map();
for (const line of scan.stdout.split('\n')) {
  const m = /^\\?([0-9a-f]{32}) [ *](.+)$/.exec(line);
  if (!m) continue;
  const rel = m[2].replace(/^\.\//, '');
  if (!isExcluded(rel)) remote.set(rel, m[1]);
}

const matchesFilter = (rel) => !pathFilter.length || pathFilter.some((p) => rel.startsWith(p));
const added = [];
const changed = [];
for (const [rel, f] of local) {
  if (!matchesFilter(rel)) continue;
  if (!remote.has(rel)) added.push(rel);
  else if (remote.get(rel) !== f.md5) changed.push(rel);
}
const remoteOnly = [...remote.keys()].filter((r) => !local.has(r) && matchesFilter(r));
const toUpload = [...added, ...changed].sort();

const isMigration = (rel) => /^backend\/database\/[^/]+\.sql$/.test(rel);
const migrations = toUpload.filter(isMigration).map((r) => r.split('/').pop());
const runMigrations = !has('no-migrations') && (has('full-migrations') || migrations.length > 0);

// ---- 3. report --------------------------------------------------------------
const show = (title, items, max = 80) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  items.slice(0, max).forEach((i) => console.log(`  ${i}`));
  if (items.length > max) console.log(`  … and ${items.length - max} more`);
};
show('NEW', added.sort());
show('CHANGED', changed.sort());
if (remoteOnly.length) {
  const byTop = {};
  remoteOnly.forEach((r) => {
    const top = r.includes('/') ? r.split('/').slice(0, r.startsWith('backend/') ? 2 : 1).join('/') : '(root)';
    byTop[top] = (byTop[top] || 0) + 1;
  });
  console.log(`\nOnly on the server, left alone (${remoteOnly.length}): ` +
    Object.entries(byTop).map(([k, v]) => `${k} ${v}`).join(', '));
}
console.log(`\nMigrations to run: ${
  has('no-migrations') ? 'none (--no-migrations)' : has('full-migrations') ? 'ALL (--full-migrations)' : migrations.length ? migrations.join(', ') : 'none'
}`);
const rootHt = join(distDir, '.htaccess');
if (!includes.includes('.htaccess') && existsSync(rootHt)) {
  const live = ssh(`cd ${shq(REMOTE_ROOT)} && md5sum .htaccess 2>/dev/null`).stdout.slice(0, 32);
  if (live && live !== md5(rootHt)) console.log('Note: the live root .htaccess differs from dist/.htaccess (not uploaded; --include .htaccess to push it).');
}

if (!toUpload.length && !runMigrations) {
  console.log('\nNothing to deploy - the server already matches.');
  process.exit(0);
}
if (!apply) {
  console.log('\nDry run - nothing changed on the server. Re-run with --apply to deploy.');
  process.exit(0);
}

// ---- 4. apply ---------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

function upload(files, label) {
  if (!files.length) return;
  const stage = join(tmpdir(), `studio-deploy-${stamp}-${label}`);
  rmSync(stage, { recursive: true, force: true });
  for (const rel of files) {
    const dest = join(stage, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(local.get(rel).abs, dest);
  }
  writeFileSync(join(stage, '.filelist'), files.join('\n') + '\n');
  // Relative names only: GNU tar/scp read "C:\…" as a remote host.
  let r = run('tar', ['-czf', 'deploy.tgz', '-T', '.filelist'], { cwd: stage });
  if (r.status !== 0) fail(`tar failed: ${r.stderr}`);
  const remoteTgz = `studio-deploy-${stamp}-${label}.tgz`;
  r = run('scp', ['-o', 'BatchMode=yes', '-q', 'deploy.tgz', `${HOST}:${remoteTgz}`], { cwd: stage });
  if (r.status !== 0) fail(`scp failed: ${r.stderr}`);
  r = ssh(`tar -xzf ~/${remoteTgz} -C ${shq(REMOTE_ROOT)} --no-overwrite-dir && rm -f ~/${remoteTgz}`);
  if (r.status !== 0) fail(`Remote extract failed: ${r.stderr}`);
  rmSync(stage, { recursive: true, force: true });
  console.log(`  uploaded ${files.length} file(s) [${label}]`);
}

// 4a. migration files (+ the runner and DB layer) first, then run them, THEN the PHP that needs the new schema.
const phase1 = toUpload.filter((r) => r.startsWith('backend/database/') || r === 'backend/apply_all_migrations.php');
const phase2 = toUpload.filter((r) => !phase1.includes(r));

console.log('\nUploading migrations…');
upload(phase1, 'db');

if (runMigrations) {
  const only = has('full-migrations') ? '' : ` --only=${shq(migrations.join(','))}`;
  console.log(`Running migrations on the server…\n`);
  const m = ssh(`cd ${shq(REMOTE_ROOT)} && php backend/apply_all_migrations.php${only}`);
  const out = `${m.stdout}${m.stderr}`;
  console.log(out.replace(/^/gm, '  | '));
  const errors = out.split('\n').filter((l) => /^\s+! |^ABORT|Fatal error|Parse error|!!!/.test(l));
  if (m.status !== 0 || errors.length) {
    if (!has('ignore-migration-errors')) {
      fail(`Migrations reported ${errors.length || 'an'} error(s) - the PHP was NOT uploaded.\n` +
        `Check them; if they are only "already exists", re-run with --apply --ignore-migration-errors.`);
    }
    console.log('Migration errors ignored (--ignore-migration-errors).');
  }
}

console.log('\nUploading app files…');
upload(phase2, 'app');

// ---- 5. smoke test ----------------------------------------------------------
console.log('\nSmoke test:');
let smokeOk = true;
for (const path of cfg.smokeUrls ?? []) {
  const url = cfg.siteUrl.replace(/\/$/, '') + path;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    console.log(`  ${res.status < 400 ? '✔' : '✖'} ${res.status} ${url}`);
    if (res.status >= 400) smokeOk = false;
  } catch (e) {
    console.log(`  ✖ ${url} - ${e.message}`);
    smokeOk = false;
  }
}
console.log(`\n${smokeOk ? '✔ Deployed.' : '! Deployed, but a smoke check failed - look at the site now.'} Hard-refresh the studio (Ctrl+F5) to load the new bundle.`);
process.exit(smokeOk ? 0 : 1);
