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
const { docsPatterns } = require('./docs-patterns');

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

  it('a fence closes only on the same character, at least as long', () => {
    const file = write('code/fence-close.md', [
      '````',
      '```',
      '[a](in-long-fence.md)',
      '````',
      '',
      '~~~',
      '```',
      '[b](in-tilde-fence.md)',
      '~~~',
      '',
      '[after](gone-after-fences.md)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-after-fences.md']);
  });

  it('a backtick line with a backtick in its info string is inline code, not a fence', () => {
    const file = write('code/info.md', '```inline``` then [a](gone-same-line.md)\n\n[b](gone-next-para.md)\n');
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-same-line.md', 'gone-next-para.md']);
  });

  it('a fence in a blockquote ends with the quote', () => {
    const file = write('code/quote.md', '> ```\n> fns[i](arg)\n\n[a](gone-after-quote.md)\n');
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-after-quote.md']);
  });

  it('indented code is skipped; an indented ``` is a fence only inside a list item', () => {
    const file = write('code/indented.md', [
      'Text',
      '',
      '    fns[i](arg)',
      '    ```',
      '',
      '[a](gone-after-indented.md)',
      'A paragraph line',
      '    ```',
      '[c](gone-after-lazy-line.md)',
      '',
      '- item',
      '',
      '    list text with [b](gone-in-list.md)',
      '',
      '    ```js',
      '    fns[i](arg)',
      '',
      '    more(x)',
      '    ```',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-after-indented.md', 'gone-after-lazy-line.md', 'gone-in-list.md']);
  });

  it('an unmatched or escaped backtick does not hide links that follow it', () => {
    const file = write('code/stray.md', [
      'Press the backtick (`) key.',
      '',
      '[a](gone-next-paragraph.md) and `y`',
      '',
      '- escape with a backtick (`)',
      '- see [b](gone-next-item.md) and `z`',
      '',
      'An escaped \\` is text: [c](gone-after-escape.md) and `w`',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-next-paragraph.md', 'gone-next-item.md', 'gone-after-escape.md']);
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

  it('escaped and <...> targets are read whole, missing ones included', () => {
    write('parens2/half(.md', '# Half\n');
    const file = write('parens2/index.md', [
      '[a](<half(.md>) [b](<gone(.md>) [c](half\\(.md) [d](gone\\(.md)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['<gone(.md>', 'gone\\(.md']);
  });

  it('a link target does not run past a blank line', () => {
    const file = write('parens2/blank.md', '[open](never-closed\n\nText) and [b](gone-next.md).\n');
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['gone-next.md']);
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

  it('numbers colliding headings the way GitHub does', () => {
    const file = write('anchors/collide.md', [
      '# Foo', '', '# Foo', '', '# Foo-1', '', '# Bar-1', '', '# Bar', '', '# Bar', '',
      '[a](#foo) [b](#foo-1) [c](#foo-1-1) [d](#bar-1) [e](#bar) [f](#bar-2)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), []);
  });

  it('reads links, HTML tags and comparison signs in headings, and titles and escapes in anchor links', () => {
    write('anchors/a(b).md', '# AB\n');
    const file = write('anchors/forms.md', [
      '## [Foo](a(b).md) bar',
      '',
      '## <a id="x"></a>Tagged',
      '',
      '## 1 < 2 > 0',
      '',
      '## my_func',
      '',
      '[a](#foo-bar) [b](#tagged) [c](#1--2--0) [d](#tagged "Title") [e](#my\\_func)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), []);
  });
});

describe('broken_internal_link reads headings as GitHub renders them', () => {
  it('reduces a link whose text holds code to its text', () => {
    const file = write('headings/link-code.md', [
      '##### [`override` modifiers in class elements](https://devblogs.microsoft.com/typescript/announcing/)',
      '',
      '## [`a`](https://example.com/x) and [b](https://example.com/y(1)) and ![`c`](https://example.com/z.png)',
      '',
      '[a](#override-modifiers-in-class-elements) [b](#a-and-b-and-c)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), []);
  });

  it('drops HTML comments such as <!-- omit in toc -->', () => {
    const file = write('headings/comments.md', [
      '##### 1. Clone The Repository <!-- omit in toc -->',
      '',
      '## Two <!-- a --> comments <!-- b --> here',
      '',
      '## Open <!-- never closed',
      '',
      '[a](#1-clone-the-repository-) [b](#two--comments--here) [c](#open----never-closed)',
      '[stale](#1-clone-the-repository----omit-in-toc---)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#1-clone-the-repository----omit-in-toc---']);
  });

  it('keeps generic types as text but strips real HTML tags', () => {
    const file = write('headings/generics.md', [
      '### Queue<Data, Result>',
      '',
      '## Map<K, `V`>',
      '',
      '## Logo <img src="x.png" alt="logo"> here',
      '',
      '[a](#queuedata-result) [b](#mapk-v) [c](#logo--here)',
      '[stale](#queue)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#queue']);
  });

  it('decodes entities: named, decimal and hexadecimal', () => {
    const file = write('headings/entities.md', [
      '## :notebook_with_decorative_cover: &nbsp;What is it?',
      '',
      '## Q &amp; A',
      '',
      '## &#65;pple &#x42;anana',
      '',
      '## Not &constructor; or &copy; or &#0;',
      '',
      '## Big &#x110000; and &#9999999; end',
      '',
      '[a](#notebook_with_decorative_cover-what-is-it) [b](#q--a) [c](#apple-banana)',
      '[d](#not-constructor-or-copy-or-) [e](#big--and--end)',
      '[stale](#notebook_with_decorative_cover-nbspwhat-is-it)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#notebook_with_decorative_cover-nbspwhat-is-it']);
  });

  it('keeps code as written: no comment, entity, tag or emphasis handling inside it', () => {
    // U+E000 0 U+E001 is what the heading code uses to hold a code span's place.
    const lookalike = String.fromCharCode(0xe000) + '0' + String.fromCharCode(0xe001);
    const file = write('headings/code.md', [
      '## Keep `&nbsp;` and `<!-- x -->` in code',
      '',
      '## A `<b>` and `[t](u)` and `_x_`',
      '',
      '## _`code`_ emphasis',
      '',
      `## y${lookalike} \`code\``,
      '',
      '[a](#keep-nbsp-and----x----in-code) [b](#a-b-and-tu-and-_x_) [c](#code-emphasis) [d](#y0-code)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), []);
  });

  it('ends a heading at \\n, \\r\\n and \\r, not at U+2028 or U+2029', () => {
    const ls = String.fromCharCode(0x2028);
    const ps = String.fromCharCode(0x2029);
    const file = write('headings/separators.md', [
      `# a${ls}b`,
      '',
      `# c${ps}d`,
      '',
      `text${ls}# not a heading`,
      '',
      '[a](#ab) [b](#cd) [c](#a) [d](#not-a-heading)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), ['#a', '#not-a-heading']);

    const crlf = write('headings/crlf.md', '# One\r\n\r\n# Two\r# Three\n\n[a](#one) [b](#two) [c](#three)\n');
    assert.deepEqual(brokenLinks(analyze({ doc: crlf })), []);
  });
});

describe('broken_internal_link limits work on hostile input', () => {
  // cmark, which GitHub runs, ends a link target that nests more than 32
  // parentheses inside the link's own.
  const nested = n => '('.repeat(n) + 'x.md' + ')'.repeat(n);

  it('reads 32 nested parentheses in a target and gives up on 33', () => {
    const file = write('limits/nesting.md', [
      `[ok](${nested(32)})`,
      '',
      `[too deep](${nested(33)})`,
      '',
      '[after](gone.md)',
      ''
    ].join('\n'));
    assert.deepEqual(brokenLinks(analyze({ doc: file })), [nested(32), 'gone.md']);
  });

  it('applies the same limit to a link in a heading', () => {
    const file = write('limits/nesting-heading.md', [
      `## [Foo](${nested(32)}) bar`,
      '',
      `## [Foo](${nested(33)}) bar`,
      '',
      '[a](#foo-bar) [b](#fooxmd-bar)',
      ''
    ].join('\n'));
    // The first heading's link is a link (to a file that is not there) and
    // gives "foo-bar"; the second is plain text and gives "fooxmd-bar".
    assert.deepEqual(brokenLinks(analyze({ doc: file })), [nested(32)]);
  });

  it('looks up anchors in a set: 100k headings and 100k anchor links stay fast', () => {
    const n = 100000;
    const headings = Array.from({ length: n }, (_, i) => `# H${i}\n`).join('');
    const links = Array.from({ length: n }, (_, i) => `[a](#h${i})`).join(' ');
    const started = process.hrtime.bigint();
    const result = docsPatterns.broken_internal_link.check(`${headings}\n${links}\n`);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(result, null);
    // About 100 ms with a set, about 5 s with a list scan (on a 2025 laptop).
    assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
  });
});
