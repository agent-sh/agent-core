#!/usr/bin/env node
'use strict';

/**
 * analyzeAllAgents() on a single agent file and on a directory.
 *
 * The enhance-agent-prompts skill passes the user's path straight to
 * analyzeAllAgents(). It used to call readdirSync on that path, so a file
 * path threw ENOTDIR and `enhance-agent-prompts <file>` crashed.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { analyze, analyzeAllAgents } = require('./agent-analyzer');

let root;

// Bare Bash in tools: unrestricted_bash (HIGH). A single "## Example"
// section: example_count_suboptimal (LOW, reported only with verbose).
const RUNNER = [
  '---',
  'name: runner',
  'description: Runs the test suite and reports failures.',
  'tools: Bash',
  'model: haiku',
  '---',
  '',
  'You run the tests.',
  '',
  '## Example',
  '',
  'Input: npm test fails. Output: the failing test names.',
  ''
].join('\n');

const READER = [
  '---',
  'name: reader',
  'description: Reads files and reports typos.',
  'tools: Read, Grep',
  'model: haiku',
  '---',
  '',
  'You read files.',
  ''
].join('\n');

function patternIds(result) {
  const ids = [];
  for (const value of Object.values(result)) {
    if (!Array.isArray(value)) continue;
    for (const issue of value) {
      if (issue && typeof issue.patternId === 'string') ids.push(issue.patternId);
    }
  }
  return ids.sort();
}

function resultFor(results, file) {
  const found = results.find(r => path.resolve(r.agentPath) === path.resolve(file));
  assert.ok(found, `no result for ${file}`);
  return found;
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-analyzer-path-'));
  fs.mkdirSync(path.join(root, 'agents'));
  fs.writeFileSync(path.join(root, 'agents', 'runner.md'), RUNNER);
  fs.writeFileSync(path.join(root, 'agents', 'reader.md'), READER);
  fs.writeFileSync(path.join(root, 'agents', 'README.md'), '# Agents\n');
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('analyzeAllAgents', () => {
  it('analyzes a single agent file instead of throwing ENOTDIR', () => {
    const file = path.join(root, 'agents', 'runner.md');
    const results = analyzeAllAgents(file);
    assert.equal(results.length, 1);
    assert.equal(results[0].agentPath, file);
    assert.equal(results[0].agentName, 'runner');
    assert.ok(patternIds(results[0]).includes('unrestricted_bash'), JSON.stringify(patternIds(results[0])));
  });

  it('analyzes every agent file in a directory, skipping README.md', () => {
    const results = analyzeAllAgents(path.join(root, 'agents'));
    assert.deepEqual(results.map(r => r.agentName).sort(), ['reader', 'runner']);
    assert.ok(patternIds(resultFor(results, path.join(root, 'agents', 'runner.md'))).includes('unrestricted_bash'));
  });

  it('gives a file the same findings alone as inside its directory', () => {
    const file = path.join(root, 'agents', 'runner.md');
    for (const verbose of [false, true]) {
      assert.deepEqual(
        patternIds(analyzeAllAgents(file, { verbose })[0]),
        patternIds(resultFor(analyzeAllAgents(path.join(root, 'agents'), { verbose }), file))
      );
    }
  });

  it('passes verbose through for a single file', () => {
    const file = path.join(root, 'agents', 'runner.md');
    assert.ok(!patternIds(analyzeAllAgents(file)[0]).includes('example_count_suboptimal'));
    assert.ok(patternIds(analyzeAllAgents(file, { verbose: true })[0]).includes('example_count_suboptimal'));
  });

  it('accepts a relative file path', () => {
    const rel = path.relative(process.cwd(), path.join(root, 'agents', 'runner.md'));
    const results = analyzeAllAgents(rel);
    assert.equal(results.length, 1);
    assert.ok(patternIds(results[0]).includes('unrestricted_bash'));
  });

  it('returns [] for a path that does not exist', () => {
    assert.deepEqual(analyzeAllAgents(path.join(root, 'missing')), []);
    assert.deepEqual(analyzeAllAgents(path.join(root, 'agents', 'missing.md')), []);
  });
});

describe('analyze', () => {
  it('accepts an agent file as agentsDir', () => {
    const results = analyze({ agentsDir: path.join(root, 'agents', 'runner.md') });
    assert.equal(results.length, 1);
    assert.ok(patternIds(results[0]).includes('unrestricted_bash'));
  });
});
