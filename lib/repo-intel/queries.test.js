#!/usr/bin/env node
'use strict';

/**
 * Tests for repo-intel query argument validation.
 *
 * Focus: the assertString guard on file/symbol/concept-taking queries rejects
 * non-string / empty input with a TypeError before it can be stringified into
 * a bogus analyzer CLI argument. These do NOT run the analyzer binary - they
 * assert the guard fires first.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const queries = require('./queries.js');

const CWD = '/nonexistent-repo-for-validation-test';

describe('query argument validation', function () {
  // (fn, bad-arg) pairs: each must throw TypeError before touching the binary.
  const cases = [
    ['coupling', (q) => q.coupling(CWD, 123)],
    ['ownership', (q) => q.ownership(CWD, null)],
    ['fileHistory', (q) => q.fileHistory(CWD, undefined)],
    ['symbols', (q) => q.symbols(CWD, {})],
    ['areaOf', (q) => q.areaOf(CWD, 42)],
    ['dependents (symbol)', (q) => q.dependents(CWD, 999)],
    ['find', (q) => q.find(CWD, '')],
  ];

  for (const [name, call] of cases) {
    it(`${name} rejects a non-string / empty arg with TypeError`, function () {
      assert.throws(() => call(queries), TypeError);
    });
  }

  it('dependents validates the optional file arg when provided', function () {
    assert.throws(() => queries.dependents(CWD, 'validSymbol', 7), TypeError);
  });

  it('assertString error message names the offending argument', function () {
    assert.throws(
      () => queries.ownership(CWD, 123),
      /ownership: file must be a non-empty string/
    );
  });
});
