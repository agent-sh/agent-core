#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'generate-claudemd.js');
const TEMPLATE = path.join(__dirname, '..', 'templates', 'CLAUDE.md.tmpl');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudemd-test-'));
}

function run(targetDir) {
  return execFileSync('node', [SCRIPT, '--target', targetDir, '--template', TEMPLATE], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function writeJson(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
}

describe('generate-claudemd', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates full CLAUDE.md with all components (next-task shape)', () => {
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
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    assert.match(output, /^# next-task/m);
    assert.match(output, /> Master workflow orchestrator/);
    assert.match(output, /## Agents/);
    assert.match(output, /- ci-fixer/);
    assert.match(output, /- worktree-manager/);
    assert.match(output, /## Skills/);
    assert.match(output, /- discover-tasks/);
    assert.match(output, /## Commands/);
    assert.match(output, /- next-task/);
    assert.match(output, /## Critical Rules/);
    assert.match(output, /## Model Selection/);
    assert.match(output, /## Core Priorities/);
  });

  it('generates CLAUDE.md with only commands (ship shape)', () => {
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
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    assert.match(output, /^# ship/m);
    assert.ok(!output.includes('## Agents'));
    assert.ok(!output.includes('## Skills'));
    assert.match(output, /## Commands/);
    assert.match(output, /- ship$/m);
  });

  it('generates CLAUDE.md with all empty components', () => {
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
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    assert.match(output, /^# empty-plugin/m);
    assert.ok(!output.includes('## Agents'));
    assert.ok(!output.includes('## Skills'));
    assert.ok(!output.includes('## Commands'));
    assert.match(output, /## Critical Rules/);
  });

  it('handles missing components.json gracefully', () => {
    writeJson(tmpDir, 'package.json', {
      name: '@agentsys/no-components',
      description: 'No components file',
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

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
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    assert.match(output, /^# my-plugin/m);
    assert.ok(!output.includes('@agentsys/'));
  });

  it('handles name without prefix', () => {
    writeJson(tmpDir, 'package.json', {
      name: 'plain-name',
      description: 'No prefix',
    });

    run(tmpDir);
    const output = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    assert.match(output, /^# plain-name/m);
  });
});
