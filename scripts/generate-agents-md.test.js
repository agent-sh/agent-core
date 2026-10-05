#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'generate-agents-md.js');
const TEMPLATE = path.join(__dirname, '..', 'templates', 'AGENTS.md.tmpl');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-test-'));
}

function run(targetDir) {
  return execFileSync('node', [SCRIPT, '--target', targetDir, '--template', TEMPLATE], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runRaw(...args) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function writeJson(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
}

describe('generate-agents-md', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves manually maintained instructions and does not create a mirror', () => {
    writeJson(tmpDir, 'package.json', { name: 'custom' });
    const manual = '# Custom policy\r\n\r\nKeep this unique guidance.\r\n';
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), manual);
    run(tmpDir);
    assert.equal(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8'), manual);
    assert.equal(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), false);
  });

  it('refreshes only generator-owned content and preserves additions', () => {
    writeJson(tmpDir, 'package.json', { name: 'before' });
    run(tmpDir);
    const file = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(file, 'Local prefix\n' + fs.readFileSync(file, 'utf8') + '\nLocal suffix\n');
    writeJson(tmpDir, 'package.json', { name: 'after' });
    run(tmpDir);
    const updated = fs.readFileSync(file, 'utf8');
    assert.match(updated, /^Local prefix\n/);
    assert.match(updated, /\n# after\n/);
    assert.doesNotMatch(updated, /# before/);
    assert.match(updated, /\nLocal suffix\n$/);
    assert.equal(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), false);
  });

  it('rejects malformed managed markers without changing the file', () => {
    writeJson(tmpDir, 'package.json', { name: 'custom' });
    for (const value of [
      '<!-- agent-core:instructions:start -->\nOnly a start',
      '<!-- agent-core:instructions:end -->\n<!-- agent-core:instructions:start -->',
      '<!-- agent-core:instructions:start --><!-- agent-core:instructions:start --><!-- agent-core:instructions:end -->',
    ]) {
      const file = path.join(tmpDir, 'AGENTS.md');
      fs.writeFileSync(file, value);
      const result = runRaw('--target', tmpDir, '--template', TEMPLATE);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /malformed or duplicate/);
      assert.equal(fs.readFileSync(file, 'utf8'), value);
    }
  });

  it('rejects symlinks without changing the target', () => {
    writeJson(tmpDir, 'package.json', { name: 'custom' });
    const target = path.join(tmpDir, 'policy.md');
    fs.writeFileSync(target, 'Keep this');
    fs.symlinkSync(target, path.join(tmpDir, 'AGENTS.md'));
    const result = runRaw('--target', tmpDir, '--template', TEMPLATE);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'Keep this');
  });

  it('generates full AGENTS.md with all components (next-task shape)', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/next-task',
      description: 'Master workflow orchestrator',
    });
    writeJson(tmpDir, 'components.json', {
      agents: ['ci-fixer', 'ci-monitor', 'delivery-validator', 'exploration-agent',
        'implementation-agent', 'planning-agent', 'simple-fixer',
        'task-discoverer', 'test-coverage-checker', 'worktree-manager'],
      skills: ['discover-tasks', 'orchestrate-review', 'validate-delivery'],
      commands: ['delivery-approval', 'next-task'],
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# next-task/m);
    assert.match(output, /> Master workflow orchestrator/);
    assert.match(output, /## Agents/);
    assert.match(output, /- ci-fixer/);
    assert.match(output, /- worktree-manager/);
    assert.match(output, /## Skills/);
    assert.match(output, /- discover-tasks/);
    assert.match(output, /## Commands/);
    assert.match(output, /- next-task/);
    assert.match(output, /## Overview/);
    assert.match(output, /## Conventions/);
    assert.match(output, /## Dev commands/);
  });

  it('carries no stale template text', () => {
    writeJson(tmpDir, 'package.json', { name: '@agentsys/plain', description: 'Plain' });
    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.doesNotMatch(output, /## Critical Rules/);
    assert.doesNotMatch(output, /## Model Selection/);
    assert.doesNotMatch(output, /npm run validate/);
    assert.doesNotMatch(output, /GPU/);
    assert.doesNotMatch(output, /\*\*[^*]+\*\*/);
  });

  it('generates AGENTS.md with only commands (ship shape)', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/ship',
      description: 'Complete PR workflow',
    });
    writeJson(tmpDir, 'components.json', {
      agents: [],
      skills: [],
      commands: ['ship-ci-review-loop', 'ship-deployment', 'ship-error-handling', 'ship'],
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# ship/m);
    assert.ok(!output.includes('## Agents'));
    assert.ok(!output.includes('## Skills'));
    assert.match(output, /## Commands/);
    assert.match(output, /- ship$/m);
  });

  it('generates AGENTS.md with all empty components', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/empty-plugin',
      description: 'An empty plugin',
    });
    writeJson(tmpDir, 'components.json', {
      agents: [],
      skills: [],
      commands: [],
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# empty-plugin/m);
    assert.ok(!output.includes('## Agents'));
    assert.ok(!output.includes('## Skills'));
    assert.ok(!output.includes('## Commands'));
    assert.match(output, /## Conventions/);
  });

  it('handles missing components.json gracefully', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/no-components',
      description: 'No components file',
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# no-components/m);
    assert.ok(!output.includes('## Agents'));
    assert.ok(!output.includes('## Skills'));
    assert.ok(!output.includes('## Commands'));
  });

  it('strips @agentsys/ prefix from plugin name', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/my-plugin',
      description: 'Test',
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# my-plugin/m);
    assert.ok(!output.includes('@agentsys/'));
  });

  it('handles name without prefix', () => {
    writeJson(tmpDir, 'package.json', {
      name: 'plain-name',
      description: 'No prefix',
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# plain-name/m);
  });

  it('exits with error when --target is missing', () => {
    const result = runRaw('--template', TEMPLATE);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /\[ERROR\].*--target/);
  });

  it('exits with error when package.json is missing', () => {
    const result = runRaw('--target', tmpDir, '--template', TEMPLATE);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /\[ERROR\].*package\.json/);
  });

  it('warns on malformed components.json and still generates output', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/bad-components',
      description: 'Bad components',
    });
    fs.writeFileSync(path.join(tmpDir, 'components.json'), '{bad json');

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.match(output, /^# bad-components/m);
    assert.doesNotMatch(output, /## Agents/);
  });

  it('verifies stdout contains OK message', () => {
    writeJson(tmpDir, 'package.json', {
      name: 'stdout-test',
      description: 'Test',
    });

    const stdout = run(tmpDir);
    assert.match(stdout, /\[OK\] Generated/);
  });
});
