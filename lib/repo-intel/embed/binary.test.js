#!/usr/bin/env node
'use strict';

/**
 * Tests for the embed binary resolver's ONNX Runtime bundling logic.
 *
 * Focus:
 *   - Bundled ORT dylib name is correct per platform
 *   - Bundled ORT path sits next to the embed binary (where the Rust
 *     resolver's "next to the executable" candidate looks)
 *   - platformBundlesOrt() excludes musl (no MS musl build; a glibc dylib
 *     cannot dlopen under musl)
 *
 * These tests do NOT hit the network or install any binary.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const embedBinary = require('./binary.js');

describe('embed binary ORT bundling', function () {
  it('bundled ORT name matches the current platform', function () {
    const name = embedBinary.getBundledOrtName();
    if (process.platform === 'win32') {
      assert.equal(name, 'onnxruntime.dll');
    } else if (process.platform === 'darwin') {
      assert.equal(name, 'libonnxruntime.dylib');
    } else {
      assert.equal(name, 'libonnxruntime.so');
    }
  });

  it('bundled ORT path is a sibling of the embed binary', function () {
    const binDir = path.dirname(embedBinary.getBinaryPath());
    const ortPath = embedBinary.getBundledOrtPath();
    assert.equal(path.dirname(ortPath), binDir);
    assert.equal(path.basename(ortPath), embedBinary.getBundledOrtName());
  });

  it('platformBundlesOrt() is false only for musl targets', function () {
    const key = embedBinary.getPlatformKey();
    const bundles = embedBinary.platformBundlesOrt();
    if (key && key.includes('musl')) {
      assert.equal(bundles, false, 'musl must not expect a bundled ORT');
    } else if (key) {
      assert.equal(bundles, true, 'non-musl supported platforms bundle ORT');
    } else {
      // Unsupported platform: no key, must not claim to bundle.
      assert.equal(bundles, false);
    }
  });
});
