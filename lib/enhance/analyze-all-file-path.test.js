#!/usr/bin/env node
'use strict';

/**
 * analyzeAllSkills(), analyzeAllHooks(), analyzeAllDocs() and
 * analyzeAllPrompts() on a single file and on a directory.
 *
 * enhance's skills pass the user's path straight to these functions. Each
 * walked the path with readdirSync inside a try/catch, so a file path threw
 * ENOTDIR, the catch swallowed it, and the result was []: `enhance-skills
 * <SKILL.md>` and `enhance-hooks <file>` reported nothing.
 * agent-analyzer.test.js covers analyzeAllAgents(), which threw instead.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const skillAnalyzer = require('./skill-analyzer');
const hookAnalyzer = require('./hook-analyzer');
const docsAnalyzer = require('./docs-analyzer');
const promptAnalyzer = require('./prompt-analyzer');
const { skillPatterns } = require('./skill-patterns');
const { hookPatterns } = require('./hook-patterns');

let root;

// Each case: a directory of two files, a target file in it that triggers a
// HIGH certainty pattern, and a LOW certainty pattern the target also
// triggers. Skill and hook patterns have no LOW certainty today, so for those
// the verbose tests mark one pattern LOW while they run (lowOverride).
const CASES = [
  {
    name: 'analyzeAllSkills',
    run: skillAnalyzer.analyzeAllSkills,
    dir: 'skills',
    file: 'skills/deploy/SKILL.md',
    files: {
      // No name: missing_name. No "Use when user asks": missing_trigger_phrase.
      'skills/deploy/SKILL.md': '---\ndescription: Builds the docs site.\n---\n\nBuild the site.\n',
      'skills/reader/SKILL.md': '---\nname: reader\ndescription: Use when user asks to read files.\n---\n\nRead files.\n'
    },
    pathKey: 'skillPath',
    pattern: 'missing_name',
    lowPattern: 'missing_trigger_phrase',
    lowOverride: skillPatterns.missing_trigger_phrase
  },
  {
    name: 'analyzeAllHooks',
    run: hookAnalyzer.analyzeAllHooks,
    dir: 'hooks',
    file: 'hooks/guard.md',
    files: {
      // No name and no description: missing_name, missing_description.
      'hooks/guard.md': '---\ntitle: guard\n---\n\nBlock rm -rf.\n',
      'hooks/audit.md': '---\nname: audit\ndescription: Logs every Bash call.\n---\n\nLog it.\n'
    },
    pathKey: 'hookPath',
    pattern: 'missing_name',
    lowPattern: 'missing_description',
    lowOverride: hookPatterns.missing_description
  },
  {
    name: 'analyzeAllDocs',
    run: docsAnalyzer.analyzeAllDocs,
    dir: 'docs',
    file: 'docs/guide.md',
    files: {
      // H1 straight to H3: inconsistent_heading_levels. Mixed bullet markers:
      // structure_recommendations (LOW).
      'docs/guide.md': '# Guide\n\n### Setup\n\n- one\n* two\n',
      'docs/intro.md': '# Intro\n\n## About\n\nText.\n'
    },
    pathKey: 'docPath',
    pattern: 'inconsistent_heading_levels',
    lowPattern: 'structure_recommendations',
    lowOverride: null
  },
  {
    name: 'analyzeAllPrompts',
    run: promptAnalyzer.analyzeAllPrompts,
    dir: 'prompts',
    file: 'prompts/summarize.md',
    files: {
      // H1 straight to H3: heading_hierarchy_gaps. One "## Example":
      // suboptimal_example_count (LOW).
      'prompts/summarize.md': '# Task\n\n### Steps\n\nSummarize the input.\n\n## Example\n\nInput: a. Output: b.\n',
      'prompts/translate.md': '# Task\n\nTranslate the input to French.\n'
    },
    pathKey: 'promptPath',
    pattern: 'heading_hierarchy_gaps',
    lowPattern: 'suboptimal_example_count',
    lowOverride: null
  }
];

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

function abs(rel) {
  return path.join(root, rel);
}

function resultFor(c, results, file) {
  const found = results.filter(r => path.resolve(r[c.pathKey]) === path.resolve(file));
  assert.equal(found.length, 1, `one result for ${file} in ${JSON.stringify(results.map(r => r[c.pathKey]))}`);
  return found[0];
}

// Runs fn with the case's override pattern marked LOW, then restores it.
function withLowOverride(c, fn) {
  if (!c.lowOverride) return fn();
  const saved = c.lowOverride.certainty;
  c.lowOverride.certainty = 'LOW';
  try {
    return fn();
  } finally {
    c.lowOverride.certainty = saved;
  }
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-all-file-path-'));
  for (const c of CASES) {
    for (const [rel, content] of Object.entries(c.files)) {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), content);
    }
  }
  // A hook config next to the markdown hooks. The directory walk skips it.
  fs.writeFileSync(abs('hooks/hooks.json'), '{"hooks":{}}\n');
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

for (const c of CASES) {
  describe(c.name, () => {
    it('analyzes a single file as one result instead of returning []', () => {
      const results = c.run(abs(c.file));
      assert.equal(results.length, 1, JSON.stringify(results));
      assert.equal(path.resolve(results[0][c.pathKey]), abs(c.file));
      assert.ok(patternIds(results[0]).includes(c.pattern), JSON.stringify(patternIds(results[0])));
    });

    it('accepts a relative file path', () => {
      const results = c.run(path.relative(process.cwd(), abs(c.file)));
      assert.equal(results.length, 1);
      assert.ok(patternIds(results[0]).includes(c.pattern));
    });

    it('analyzes every file in a directory', () => {
      const results = c.run(abs(c.dir));
      assert.equal(results.length, Object.keys(c.files).length, JSON.stringify(results.map(r => r[c.pathKey])));
      assert.ok(patternIds(resultFor(c, results, abs(c.file))).includes(c.pattern));
    });

    it('gives a file the same findings alone as inside its directory', () => {
      for (const verbose of [false, true]) {
        assert.deepEqual(
          patternIds(c.run(abs(c.file), { verbose })[0]),
          patternIds(resultFor(c, c.run(abs(c.dir), { verbose }), abs(c.file)))
        );
      }
    });

    it('reports LOW certainty findings only with verbose, for a file and a directory', () => {
      withLowOverride(c, () => {
        for (const target of [abs(c.file), abs(c.dir)]) {
          const quiet = patternIds(resultFor(c, c.run(target), abs(c.file)));
          const loud = patternIds(resultFor(c, c.run(target, { verbose: true }), abs(c.file)));
          assert.ok(!quiet.includes(c.lowPattern), `${c.lowPattern} without verbose on ${target}: ${JSON.stringify(quiet)}`);
          assert.ok(loud.includes(c.lowPattern), `${c.lowPattern} missing with verbose on ${target}: ${JSON.stringify(loud)}`);
        }
      });
    });

    it('returns [] for a path that does not exist', () => {
      assert.deepEqual(c.run(abs(`${c.dir}/missing`)), []);
      assert.deepEqual(c.run(abs(`${c.dir}/missing.md`)), []);
    });
  });
}

describe('analyzeAllHooks on a file that is not markdown', () => {
  it('returns [], as the directory walk does for it', () => {
    assert.deepEqual(hookAnalyzer.analyzeAllHooks(abs('hooks/hooks.json')), []);
    const inDir = hookAnalyzer.analyzeAllHooks(abs('hooks')).map(r => path.basename(r.hookPath)).sort();
    assert.deepEqual(inDir, ['audit.md', 'guard.md']);
  });
});

describe('analyze() with a file as the directory option', () => {
  it('skills: analyze({ skillsDir: <file>, verbose })', () => {
    const c = CASES[0];
    withLowOverride(c, () => {
      const quiet = skillAnalyzer.analyze({ skillsDir: abs(c.file) });
      const loud = skillAnalyzer.analyze({ skillsDir: abs(c.file), verbose: true });
      assert.equal(quiet.length, 1);
      assert.ok(patternIds(quiet[0]).includes(c.pattern));
      assert.ok(!patternIds(quiet[0]).includes(c.lowPattern));
      assert.ok(patternIds(loud[0]).includes(c.lowPattern));
    });
  });

  it('hooks: analyze({ hooksDir: <file>, verbose })', () => {
    const c = CASES[1];
    withLowOverride(c, () => {
      const quiet = hookAnalyzer.analyze({ hooksDir: abs(c.file) });
      const loud = hookAnalyzer.analyze({ hooksDir: abs(c.file), verbose: true });
      assert.equal(quiet.length, 1);
      assert.ok(patternIds(quiet[0]).includes(c.pattern));
      assert.ok(!patternIds(quiet[0]).includes(c.lowPattern));
      assert.ok(patternIds(loud[0]).includes(c.lowPattern));
    });
  });
});
