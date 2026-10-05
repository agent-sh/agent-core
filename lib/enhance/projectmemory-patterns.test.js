#!/usr/bin/env node
'use strict';

/**
 * Heading coverage for the project-memory structure checks. The agent-core
 * AGENTS.md template and the consumer files use "## Conventions" and
 * "## Project overview"; these checks must accept them, not push writers
 * back to a "## Critical Rules" section.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { projectMemoryPatterns } = require('./projectmemory-patterns');

function flags(patternId, content) {
  return projectMemoryPatterns[patternId].check(content) !== null;
}

describe('missing_critical_rules', () => {
  for (const heading of [
    '## Critical Rules',
    '## Priority Rules',
    '### Critical Rules',
    '## Rules',
    '## Working rules',
    '## Conventions',
    '## Coding conventions',
    '## Must-know',
  ]) {
    it(`accepts "${heading}"`, () => {
      assert.equal(flags('missing_critical_rules', `# Project\n\n${heading}\n\n- Rule\n`), false);
    });
  }

  it('accepts an XML critical-rules block', () => {
    assert.equal(flags('missing_critical_rules', '# Project\n\n<critical-rules>\n- Rule\n</critical-rules>\n'), false);
  });

  it('flags a file with no rules heading', () => {
    const content = '# Project\n\nFollow the rules below.\n\n## Architecture\n\n## Rulesets\n\n## Commands\n';
    assert.equal(flags('missing_critical_rules', content), true);
  });
});

describe('missing_architecture', () => {
  for (const heading of ['## Architecture', '## Overview', '## Project overview', '## Layout', '## Project structure']) {
    it(`accepts "${heading}"`, () => {
      assert.equal(flags('missing_architecture', `# Project\n\n${heading}\n\nText.\n`), false);
    });
  }

  it('flags a file with no overview or layout', () => {
    assert.equal(flags('missing_architecture', '# Project\n\n## Rules\n\nSome rules here.\n'), true);
  });
});
