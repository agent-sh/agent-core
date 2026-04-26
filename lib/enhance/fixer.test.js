#!/usr/bin/env node
'use strict';

/**
 * Tests for fixer.js security hardening.
 *
 * Focus:
 *   - applyFixes refuses to follow symlinks (read + write sides)
 *   - restoreFromBackup refuses to follow symlinks
 *   - assertNotSymlink helper behaves correctly
 *
 * Does NOT cover the fix-content transformations - those are exercised
 * elsewhere in the suite. These tests exist purely to pin the
 * symlink-refusal invariant so it cannot silently regress.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  applyFixes,
  restoreFromBackup,
  assertNotSymlink
} = require('./fixer.js');

// Windows requires either admin rights or Developer Mode to create symlinks.
// Detect that up front and skip gracefully rather than fail the suite.
function canCreateSymlinks(tmpDir) {
  const target = path.join(tmpDir, '_probe-target');
  const link = path.join(tmpDir, '_probe-link');
  try {
    fs.writeFileSync(target, 'x');
    fs.symlinkSync(target, link);
    fs.unlinkSync(link);
    fs.unlinkSync(target);
    return true;
  } catch {
    try { fs.unlinkSync(target); } catch {}
    try { fs.unlinkSync(link); } catch {}
    return false;
  }
}

describe('fixer.js symlink refusal', () => {
  let tmpDir;
  let symlinksSupported;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixer-symlink-'));
    symlinksSupported = canCreateSymlinks(tmpDir);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assertNotSymlink is a no-op for regular files', () => {
    const p = path.join(tmpDir, 'regular.md');
    fs.writeFileSync(p, 'hello');
    assert.doesNotThrow(() => assertNotSymlink(p));
  });

  it('assertNotSymlink is a no-op for nonexistent paths', () => {
    const p = path.join(tmpDir, 'does-not-exist.md');
    assert.doesNotThrow(() => assertNotSymlink(p));
  });

  it('assertNotSymlink throws ESYMLINK_REFUSED on symlinks', (t) => {
    if (!symlinksSupported) return t.skip('symlinks unavailable on this host');
    const target = path.join(tmpDir, 'target-a.md');
    const link = path.join(tmpDir, 'link-a.md');
    fs.writeFileSync(target, 'secret');
    fs.symlinkSync(target, link);

    assert.throws(
      () => assertNotSymlink(link),
      (err) => err.code === 'ESYMLINK_REFUSED'
    );
  });

  it('applyFixes refuses a symlinked markdown target and does not overwrite it', (t) => {
    if (!symlinksSupported) return t.skip('symlinks unavailable on this host');

    const secret = path.join(tmpDir, 'secret.txt');
    const link = path.join(tmpDir, 'agent.md');
    const secretBody = 'DO NOT OVERWRITE ME';
    fs.writeFileSync(secret, secretBody);
    fs.symlinkSync(secret, link);

    const issues = [{
      certainty: 'HIGH',
      filePath: link,
      patternId: 'missing_frontmatter',
      issue: 'no frontmatter',
      fix: 'add frontmatter'
    }];

    const result = applyFixes(issues, { dryRun: false, backup: true });

    // The symlink target MUST be untouched.
    assert.equal(fs.readFileSync(secret, 'utf8'), secretBody);

    // The backup sidecar must not exist (or, if it does, must not contain secret).
    const backupPath = `${link}.backup`;
    if (fs.existsSync(backupPath)) {
      // If this fires, backup path followed the symlink - a bug.
      assert.notEqual(fs.readFileSync(backupPath, 'utf8'), secretBody);
    }

    // And we should see an error entry referring to the symlink refusal.
    assert.ok(result.errors.length >= 1, 'expected at least one error entry');
    const refused = result.errors.find(e => /symlink/i.test(e.error || e.reason || ''));
    assert.ok(refused, `expected symlink refusal error, got ${JSON.stringify(result.errors)}`);
  });

  it('restoreFromBackup refuses if the restore target is a symlink', (t) => {
    if (!symlinksSupported) return t.skip('symlinks unavailable on this host');

    const secret = path.join(tmpDir, 'secret-restore.txt');
    const link = path.join(tmpDir, 'agent-restore.md');
    const backup = `${link}.backup`;
    const secretBody = 'SECRET RESTORE BODY';
    fs.writeFileSync(secret, secretBody);
    fs.symlinkSync(secret, link);
    fs.writeFileSync(backup, 'malicious backup payload');

    assert.throws(
      () => restoreFromBackup(link),
      (err) => err.code === 'ESYMLINK_REFUSED'
    );

    // Symlink target must be untouched.
    assert.equal(fs.readFileSync(secret, 'utf8'), secretBody);
  });
});
