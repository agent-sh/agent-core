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

describe('broken_internal_link skips code', () => {
  it('links inside fenced code and inline code are not checked', () => {
    const file = write('code/a.md', [
      '# Code',
      '',
      '```js',
      'const x = fns[i](arg);',
      'See [old](gone-in-fence.md).',
      '```',
      '',
      '~~~',
      '[tilde](gone-in-tilde.md)',
      '~~~',
      '',
      'Call `fns[i](arg)` or ``a[`b`](c)`` inline.',
      '',
      'Prose links still count: [`analyze()`](real.md) and [`fix()`](gone-in-prose.md).',
      ''
    ].join('\n'));
    write('code/real.md', '# Real\n');
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-in-prose.md']);
  });

  it('a "# comment" line inside a fenced block is not a heading', () => {
    const file = write('code/b.md', [
      '# Setup',
      '',
      '```bash',
      '# install deps',
      'npm install',
      '```',
      '',
      '[setup](#setup) and [install](#install-deps).',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#install-deps']);
  });

  it('fenced code is skipped in a file with CRLF line endings', () => {
    // The blank line inside the block ends an inline code span, so only
    // fence detection can skip it.
    const file = write('code/crlf.md', '# CRLF\r\n\r\n```js\r\nfns[i](arg);\r\n\r\nfns[j](arg);\r\n```\r\n\r\n[gone](gone-crlf.md)\r\n');
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-crlf.md']);
  });
});

describe('broken_internal_link reads parentheses in link targets', () => {
  it('balanced, escaped and angle-bracket parentheses stay in the path', () => {
    write('parens/file(1).md', '# One\n');
    write('parens/a (b).md', '# AB\n');
    write('parens/half(.md', '# Half\n');
    const file = write('parens/index.md', [
      '# Index',
      '',
      '[one](file(1).md), [one with title](file(1).md "Title (draft)"),',
      '[escaped](half\\(.md), [angle](<a (b).md>), [anchor](file(1).md#one),',
      '[missing](gone(2).md) (a note in parentheses after the link).',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone(2).md']);
  });
});

describe('broken_internal_link generates GitHub heading anchors', () => {
  it('matches the anchors GitHub gives each heading', () => {
    const file = write('anchors/a.md', [
      '# Research & Testing',
      '',
      '## Setup',
      '',
      '## Setup',
      '',
      '## my_func',
      '',
      '## Über uns',
      '',
      '## The `analyze()` options',
      '',
      '## Closing hashes ##',
      '',
      '## _Note_: read this',
      '',
      '## [Link](https://example.com) text',
      '',
      '[a](#research--testing) [b](#setup) [c](#setup-1) [d](#my_func) [e](#über-uns)',
      '[f](#%C3%BCber-uns) [g](#the-analyze-options) [h](#closing-hashes)',
      '[i](#note-read-this) [j](#link-text)',
      '',
      '[old slug](#research-testing) [third setup](#setup-2)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#research-testing', '#setup-2']);
  });
});
