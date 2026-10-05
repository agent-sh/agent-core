#!/usr/bin/env node
'use strict';

/**
 * Tests for broken_internal_link as the docs analyzer runs it.
 *
 * A relative link resolves against the directory of the file that holds it,
 * the way GitHub and other markdown viewers resolve it. The analyzer used to
 * check links against a list of .md paths relative to the analyzed directory,
 * and against an empty list for a single file, so a single file reported
 * every relative file link as broken.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { analyze, analyzeDoc } = require('./docs-analyzer');

let root;

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function brokenLinks(result) {
  const issue = result.linkIssues.find(i => i.patternId === 'broken_internal_link');
  return issue ? issue.details : [];
}

function resultFor(results, file) {
  const found = [].concat(results).find(r => path.resolve(r.docPath) === path.resolve(file));
  assert.ok(found, `no result for ${file}`);
  return found;
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-analyzer-links-'));
  write('README.md', '# Project\n');
  write('lib/tool.js', 'module.exports = {};\n');
  write('docs/intro.md', '# Intro\n\n## Setup\n');
  write('docs/img/diagram.png', 'png');
  write('docs/guide/b.md', '# B\n');
  write('docs/guide/my notes.md', '# Notes\n');
  write('docs/guide/a.md', [
    '# A',
    '',
    'See [b](b.md), [b again](./b.md#b), [intro](../intro.md#setup),',
    '[readme](../../README.md), [tool](../../lib/tool.js), ',
    '[diagram](../img/diagram.png "Diagram"), [notes](<my notes.md>), [notes again](my%20notes.md)',
    'and [mail](mailto:team@example.com).',
    '',
    'Missing: [gone](gone.md) and [also gone](../nope.md#x).',
    ''
  ].join('\n'));
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('broken_internal_link resolves links against the linking file', () => {
  it('a single file: existing relative targets are not broken', () => {
    const result = analyze({ doc: path.join(root, 'docs/guide/a.md') });
    assert.deepEqual(brokenLinks(result), ['gone.md', '../nope.md#x']);
  });

  it('a directory: links from a nested file resolve against that file', () => {
    const results = analyze({ doc: path.join(root, 'docs') });
    assert.deepEqual(
      brokenLinks(resultFor(results, path.join(root, 'docs/guide/a.md'))),
      ['gone.md', '../nope.md#x']
    );
  });

  it('a file gets the same broken links alone as inside its directory', () => {
    const file = path.join(root, 'docs/guide/a.md');
    assert.deepEqual(
      brokenLinks(analyze({ doc: file })),
      brokenLinks(resultFor(analyze({ doc: path.join(root, 'docs') }), file))
    );
  });

  it('a relative doc path resolves against the working directory', () => {
    const cwd = process.cwd();
    try {
      process.chdir(path.join(root, 'docs'));
      assert.deepEqual(brokenLinks(analyzeDoc('guide/a.md')), ['gone.md', '../nope.md#x']);
    } finally {
      process.chdir(cwd);
    }
  });

  it('a file with only valid links reports no link issue', () => {
    const file = write('docs/clean.md', '# Clean\n\n[intro](intro.md) and [a](guide/a.md).\n');
    assert.equal(analyze({ doc: file }).linkIssues.length, 0);
  });
});
