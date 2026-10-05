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
      'transformSkillForCodex',
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

describe('install layout transforms', () => {
  // agentsys installs each plugin at ~/.agentsys/plugins/<plugin>/ and loads
  // skills from the platform's own skills directory, not from the plugin.
  const installPath = '/home/u/.agentsys/plugins/deslop';
  const skill = [
    '`scripts/detect.js` is at the plugin root, two directories up from this skill.',
    '`<plugin>` is the plugin root, two directories up from the skill.',
    '`<plugin>` below is the plugin root, two directories up from this skill (`${CLAUDE_PLUGIN_ROOT}` in Claude Code).',
    'Run ${CLAUDE_PLUGIN_ROOT}/scripts/detect.js.',
    'Runner: `ls ${CLAUDE_PLUGIN_ROOT}/../../consult/*/acp/run.js` or Glob `**/consult/*/acp/run.js`.',
    ''
  ].join('\n');

  for (const [platform, transform] of [
    ['Kiro', (content) => transforms.transformSkillForKiro(content, { pluginInstallPath: installPath })],
    ['Cursor', (content) => transforms.transformSkillForCursor(content, { pluginInstallPath: installPath })],
    ['Codex', (content) => transforms.transformSkillForCodex(content, { pluginInstallPath: installPath })]
  ]) {
    it(`points ${platform} skills at the plugin install path`, () => {
      const result = transform(skill);

      assert.match(result, /`scripts\/detect\.js` is at the plugin root, `\/home\/u\/\.agentsys\/plugins\/deslop`\./);
      assert.match(result, /`<plugin>` is the plugin root, `\/home\/u\/\.agentsys\/plugins\/deslop`\./);
      assert.match(result, /`<plugin>` below is the plugin root, `\/home\/u\/\.agentsys\/plugins\/deslop`\.$/m);
      assert.match(result, /Run \/home\/u\/\.agentsys\/plugins\/deslop\/scripts\/detect\.js\./);
      assert.match(result, /`ls \/home\/u\/\.agentsys\/plugins\/consult\/acp\/run\.js`/);
      assert.match(result, /`\*\*\/consult\/\*\*\/acp\/run\.js`/);
      assert.doesNotMatch(result, /two directories up|CLAUDE_PLUGIN_ROOT|\/\*\//);
    });
  }

  it('keeps Codex skill frontmatter and maps AskUserQuestion', () => {
    const result = transforms.transformSkillForCodex(
      '---\nname: deslop\ndescription: Clean slop\n---\nAsk with AskUserQuestion.\n  multiSelect: false\n',
      { pluginInstallPath: installPath }
    );

    assert.match(result, /^---\nname: deslop\ndescription: Clean slop\n---\n/);
    assert.match(result, /Ask with request_user_input\./);
    assert.doesNotMatch(result, /multiSelect/);
  });

  it('points OpenCode skills at the install path but keeps the PLUGIN_ROOT placeholder', () => {
    const result = transforms.transformSkillBodyForOpenCode(skill, undefined, { pluginInstallPath: installPath });

    assert.match(result, /`scripts\/detect\.js` is at the plugin root, `\/home\/u\/\.agentsys\/plugins\/deslop`\./);
    assert.match(result, /`ls \/home\/u\/\.agentsys\/plugins\/consult\/acp\/run\.js`/);
    assert.match(result, /Run \$\{PLUGIN_ROOT\}\/scripts\/detect\.js\./);
    assert.match(result, /`\*\*\/consult\/\*\*\/acp\/run\.js`/);
    assert.doesNotMatch(result, /two directories up/);
  });

  it('rewrites versioned-cache paths in commands and agents on every platform', () => {
    const command = '---\ndescription: Debate\n---\n' +
      'Find the runner with `ls ${CLAUDE_PLUGIN_ROOT}/../../consult/*/acp/run.js` (or Glob `**/consult/*/acp/run.js`).\n';
    const agent = '---\nname: consult-agent\ndescription: Consult\ntools: Read\n---\n' +
      'If it appears unexpanded, Glob for `**/consult/*/skills/consult/SKILL.md`.\n';
    const debatePath = '/home/u/.agentsys/plugins/debate';
    const runner = '`ls /home/u/.agentsys/plugins/consult/acp/run.js`';

    const kiroPrompt = transforms.transformCommandForKiro(command, { pluginInstallPath: debatePath, name: 'debate', description: 'Debate' });
    const kiroAgent = JSON.parse(transforms.transformAgentForKiro(agent, { pluginInstallPath: debatePath })).prompt;
    const codex = transforms.transformForCodex(command, { skillName: 'debate', description: 'Debate', pluginInstallPath: debatePath });
    const cursor = transforms.transformCommandForCursor(command, { pluginInstallPath: debatePath });
    const opencode = transforms.transformBodyForOpenCode(command + agent);

    for (const result of [kiroPrompt, codex, cursor]) {
      assert.ok(result.includes(runner), result);
      assert.ok(result.includes('`**/consult/**/acp/run.js`'), result);
      assert.ok(!result.includes('/*/'), result);
    }
    assert.ok(kiroAgent.includes('`**/consult/**/skills/consult/SKILL.md`'), kiroAgent);
    // OpenCode keeps a ${PLUGIN_ROOT} placeholder, so only its globs change.
    assert.ok(opencode.includes('`**/consult/**/acp/run.js`'), opencode);
    assert.ok(opencode.includes('`**/consult/**/skills/consult/SKILL.md`'), opencode);
  });
});
