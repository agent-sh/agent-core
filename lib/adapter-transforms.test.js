#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const discovery = require('./discovery');
const transforms = require('./adapter-transforms');

let tempDir;

afterEach(() => {
  discovery.invalidateCache();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('platform adapter API', () => {
  it('exports the Cursor and Kiro functions used by consumer installers', () => {
    for (const name of ['getCursorRuleMappings', 'getKiroSteeringMappings']) {
      assert.equal(typeof discovery[name], 'function', `${name} must be exported`);
    }

    for (const name of [
      'transformRuleForCursor',
      'transformSkillForCursor',
      'transformCommandForCursor',
      'transformSkillForKiro',
      'transformCommandForKiro',
      'transformAgentForKiro',
      'generateCombinedReviewerAgent'
    ]) {
      assert.equal(typeof transforms[name], 'function', `${name} must be exported`);
    }
  });

  it('discovers Cursor and Kiro mappings from plugin commands', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-core-adapters-'));
    const pluginDir = path.join(tempDir, 'plugins', 'test-plugin');
    fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), '{}');
    fs.writeFileSync(
      path.join(pluginDir, 'commands', 'test-command.md'),
      '---\ndescription: Generic\ncodex-description: Codex\ncursor-description: Cursor\nkiro-description: Kiro\n---\nBody\n'
    );

    discovery.invalidateCache();
    const cursor = discovery.getCursorRuleMappings(tempDir);
    discovery.invalidateCache();
    const kiro = discovery.getKiroSteeringMappings(tempDir);

    assert.deepEqual(cursor[0], [
      'agentsys-test-plugin-test-command',
      'test-plugin',
      'test-command.md',
      'Cursor',
      'command',
      ''
    ]);
    assert.deepEqual(kiro[0], [
      'test-command',
      'test-plugin',
      'test-command.md',
      'Kiro'
    ]);
  });

  it('generates valid Kiro agent JSON with least-privilege tools', () => {
    const result = transforms.transformAgentForKiro(
      '---\nname: reviewer\ndescription: Reviews code\ntools: Read, Edit\n---\nReview carefully.\n'
    );
    const agent = JSON.parse(result);

    assert.equal(agent.name, 'reviewer');
    assert.equal(agent.description, 'Reviews code');
    assert.deepEqual(agent.tools, ['read', 'write']);
    assert.match(agent.prompt, /Review carefully/);
  });

  it('converts Cursor rules and removes Claude-only runtime syntax', () => {
    const result = transforms.transformRuleForCursor(
      '---\ndescription: Old\n---\n' +
        'const helper = require("./helper");\n' +
        'await Task({ subagent_type: "next-task:exploration-agent" });\n' +
        'Load ${CLAUDE_PLUGIN_ROOT}/rules.md\n',
      {
        description: 'Project "rule"',
        pluginInstallPath: '/opt/agentsys/test-plugin',
        globs: '*.js'
      }
    );

    assert.match(result, /description: "Project \\"rule\\""/);
    assert.match(result, /globs: "\*\.js"/);
    assert.match(result, /alwaysApply: true/);
    assert.match(result, /Invoke the exploration-agent agent/);
    assert.match(result, /\/opt\/agentsys\/test-plugin\/rules\.md/);
    assert.doesNotMatch(result, /require\(|Task\(|next-task:/);
  });

  it('converts Kiro Task and question calls into chat-native instructions', () => {
    const task = transforms.transformCommandForKiro(
      'await Task({ subagent_type: "deslop:deslop-agent", prompt: "Clean the diff" });',
      { pluginInstallPath: '/opt/agentsys/deslop', name: 'clean', description: 'Clean code' }
    );
    const question = transforms.transformCommandForKiro(
      'AskUserQuestion({ question: "Continue?", options: [{ label: "Yes", description: "Proceed" }] });',
      { pluginInstallPath: '/opt/agentsys/test', name: 'choose', description: 'Choose' }
    );

    assert.match(task, /Delegate to the `deslop-agent` subagent/);
    assert.match(task, /> Clean the diff/);
    assert.doesNotMatch(task, /Task\(|deslop:/);
    assert.match(question, /\*\*Continue\?\*\*/);
    assert.match(question, /1\. \*\*Yes\*\* - Proceed/);
    assert.doesNotMatch(question, /AskUserQuestion/);
  });
});
