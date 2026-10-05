#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateConfig, loadConfig, rulesFor } = require('./sync-exclude');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'sync-exclude.js');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'sync.yml');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function syncMatrix() {
  const match = read(WORKFLOW).match(/^\s*repo:\s*\[([^\]]*)\]/m);
  assert.ok(match, 'sync.yml has a matrix repo list');
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}

// The rsync filter arguments of the "Sync lib" step, in order.
function workflowRsyncFilters() {
  const lines = read(WORKFLOW).split('\n');
  const start = lines.findIndex(line => /^\s*rsync -a \\$/.test(line));
  assert.notEqual(start, -1, 'sync.yml runs rsync -a');
  const filters = [];
  for (const line of lines.slice(start + 1)) {
    if (line.includes('source/lib/ target/lib/')) return filters;
    const arg = line.trim().replace(/\s*\\$/, '');
    const m = arg.match(/^(--(?:include|exclude|exclude-from))=(['"])(.*)\2$/);
    assert.ok(m, `unexpected rsync line in sync.yml: ${line}`);
    filters.push({ flag: m[1], value: m[3] });
  }
  assert.fail('rsync command in sync.yml does not end with source/lib/ target/lib/');
}

describe('sync-exclude.json', () => {
  it('is valid against this checkout and names only repos the sync matrix covers', () => {
    const config = loadConfig(path.join(ROOT, 'sync-exclude.json'), ROOT);
    const matrix = syncMatrix();
    for (const repo of Object.keys(config)) {
      assert.ok(matrix.includes(repo), `${repo} is in sync-exclude.json but not in the sync matrix`);
    }
  });

  it('puts the per-consumer rules before every other rsync filter', () => {
    const filters = workflowRsyncFilters();
    assert.equal(filters[0].flag, '--exclude-from');
    assert.equal(filters.filter(f => f.flag === '--exclude-from').length, 1);
  });
});

describe('rulesFor', () => {
  const config = {
    deslop: [
      { reason: 'a', paths: ['lib/perf/benchmark-runner.js', 'lib/sources/custom-handler.js'] },
      { reason: 'b', paths: ['lib/perf/benchmark-runner.js'] },
    ],
  };

  it('anchors each path at the lib/ transfer root, once', () => {
    assert.deepEqual(rulesFor(config, 'deslop'), ['/perf/benchmark-runner.js', '/sources/custom-handler.js']);
  });

  it('returns no rules for a repo without an entry, including inherited names', () => {
    assert.deepEqual(rulesFor(config, 'ship'), []);
    assert.deepEqual(rulesFor(config, 'constructor'), []);
    assert.deepEqual(rulesFor(config, '__proto__'), []);
  });
});

describe('validateConfig', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-exclude-test-'));
    write(path.join(root, 'lib', 'perf', 'benchmark-runner.js'), 'core\n');
    fs.mkdirSync(path.join(root, 'lib', 'utils'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const group = paths => [{ reason: 'kept on purpose', paths }];

  it('accepts a file under lib/', () => {
    assert.doesNotThrow(() => validateConfig({ deslop: group(['lib/perf/benchmark-runner.js']) }, root));
  });

  it('rejects a path agent-core does not have, or a directory', () => {
    assert.throws(() => validateConfig({ deslop: group(['lib/perf/missing.js']) }, root), /not a file in agent-core/);
    assert.throws(() => validateConfig({ deslop: group(['lib/utils']) }, root), /not a file in agent-core/);
  });

  it('rejects paths outside lib/, globs and dot segments', () => {
    for (const p of ['AGENTS.md', 'lib/', 'lib/perf/', 'lib/perf/*.js', 'lib/perf/../utils/x.js',
      'lib/./perf/benchmark-runner.js', 'lib//perf/benchmark-runner.js', 'lib\\perf\\benchmark-runner.js', 7]) {
      assert.throws(() => validateConfig({ deslop: group([p]) }, root), /plain file path under lib/, String(p));
    }
  });

  it('rejects a missing reason, empty paths, bad shapes and bad repo names', () => {
    assert.throws(() => validateConfig({ deslop: [{ reason: ' ', paths: ['lib/perf/benchmark-runner.js'] }] }, root), /needs a reason/);
    assert.throws(() => validateConfig({ deslop: [{ reason: 'x', paths: [] }] }, root), /non-empty paths/);
    assert.throws(() => validateConfig({ deslop: [] }, root), /non-empty array/);
    assert.throws(() => validateConfig({ deslop: ['lib/perf/benchmark-runner.js'] }, root), /must be an object/);
    assert.throws(() => validateConfig([], root), /top level/);
    assert.throws(() => validateConfig(JSON.parse('{"__proto__": []}'), root), /invalid repo name/);
    assert.throws(() => validateConfig({ 'Agent Core': group(['lib/perf/benchmark-runner.js']) }, root), /invalid repo name/);
  });
});

describe('sync-exclude CLI', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-exclude-cli-'));
    write(path.join(root, 'lib', 'perf', 'benchmark-runner.js'), 'core\n');
    write(path.join(root, 'sync-exclude.json'), JSON.stringify({
      deslop: [{ reason: 'kept', paths: ['lib/perf/benchmark-runner.js'] }],
    }));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  it('prints one anchored rule per line for a listed repo and nothing for others', () => {
    const listed = run('--repo', 'deslop', '--source', root);
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(listed.stdout, '/perf/benchmark-runner.js\n');
    const other = run('--repo', 'ship', '--source', root);
    assert.equal(other.status, 0, other.stderr);
    assert.equal(other.stdout, '');
  });

  it('exits 1 without --repo, on an unknown flag and on an invalid config', () => {
    assert.match(run('--source', root).stderr, /--repo is required/);
    assert.equal(run('--source', root).status, 1);
    assert.equal(run('--repo', 'deslop', '--bogus', 'x').status, 1);
    write(path.join(root, 'sync-exclude.json'), '{"deslop": [{"reason": "kept", "paths": ["lib/gone.js"]}]}');
    const bad = run('--repo', 'deslop', '--source', root);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /lib\/gone\.js is not a file in agent-core/);
  });
});

describe('workflow rsync filters with per-consumer rules', () => {
  let root;
  const hasRsync = !spawnSync('rsync', ['--version']).error;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-exclude-rsync-'));
    const src = path.join(root, 'source', 'lib');
    write(path.join(src, 'perf', 'benchmark-runner.js'), 'core runner\n');
    write(path.join(src, 'perf', 'benchmark-runner.test.js'), 'core test\n');
    write(path.join(src, 'utils', 'command-parser.js'), 'core parser\n');
    const dst = path.join(root, 'target', 'lib');
    write(path.join(dst, 'perf', 'benchmark-runner.js'), 'local runner\n');
    write(path.join(dst, 'utils', 'command-parser.js'), 'old parser\n');
    write(path.join(dst, 'utils', 'command-execution.js'), 'consumer only\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function sync(rules) {
    const rulesFile = path.join(root, 'sync-exclude.rules');
    fs.writeFileSync(rulesFile, rules.map(r => r + '\n').join(''));
    const args = ['-a', ...workflowRsyncFilters().map(f =>
      `${f.flag}=${f.flag === '--exclude-from' ? rulesFile : f.value}`)];
    const result = spawnSync('rsync', [...args, 'source/lib/', 'target/lib/'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return file => read(path.join(root, 'target', 'lib', file));
  }

  it('keeps an excluded consumer file and still syncs the rest', { skip: !hasRsync && 'rsync not installed' }, () => {
    const target = sync(['/perf/benchmark-runner.js']);
    assert.equal(target('perf/benchmark-runner.js'), 'local runner\n');
    assert.equal(target('utils/command-parser.js'), 'core parser\n');
    assert.equal(target('utils/command-execution.js'), 'consumer only\n');
    assert.equal(fs.existsSync(path.join(root, 'target', 'lib', 'perf', 'benchmark-runner.test.js')), false);
  });

  it('overwrites the same file for a consumer without the exclusion', { skip: !hasRsync && 'rsync not installed' }, () => {
    const target = sync([]);
    assert.equal(target('perf/benchmark-runner.js'), 'core runner\n');
  });
});
