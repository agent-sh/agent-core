#!/usr/bin/env node
'use strict';

/**
 * Per-consumer sync exclusions.
 *
 * sync-exclude.json maps a consumer repo to groups of lib/ files the core
 * sync must leave alone there, each group with its reason. This script
 * validates the whole file and prints the rsync exclude rules for one
 * consumer, one per line, for `rsync --exclude-from`. The sync workflow puts
 * that rule file first in its filter list, so an exclusion wins over the
 * allowlist includes and the consumer keeps its own copy.
 *
 * An excluded file stops receiving agent-core changes in that consumer until
 * its entry is removed, so an entry is for a deliberate local difference,
 * not for a fix that belongs in agent-core.
 *
 * Every sync job validates the whole file, not only its own consumer's
 * entry. A bad entry anywhere fails all jobs, including a repo key that is
 * not in the matrix of .github/workflows/sync.yml: a typo there would
 * otherwise print no rules and let the sync overwrite the files the entry
 * meant to keep.
 *
 * Usage:
 *   node scripts/sync-exclude.js --repo <consumer> [--source <agent-core root>] [--config <file>]
 */

const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = path.join('.github', 'workflows', 'sync.yml');
const REPO_NAME = /^[a-z0-9][a-z0-9._-]*$/;
// Plain relative file paths only: no globs, backslashes, empty or dot segments.
const UNSAFE_PATH = /[*?[\]\\]|\/\/|(^|\/)\.{1,2}(\/|$)/;

function fail(message) {
  throw new Error(`sync-exclude: ${message}`);
}

/**
 * The consumer repos the sync workflow runs for: the inline `repo: [a, b]`
 * list of the job matrix in <sourceRoot>/.github/workflows/sync.yml.
 *
 * @param {string} sourceRoot
 * @returns {string[]}
 */
function readMatrix(sourceRoot) {
  const workflowPath = path.join(sourceRoot, WORKFLOW);
  let text;
  try {
    text = fs.readFileSync(workflowPath, 'utf8');
  } catch (err) {
    fail(`cannot read ${workflowPath}: ${err.message}`);
  }
  const match = text.match(/^\s*repo:\s*\[([^\]]*)\]/m);
  const repos = match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  if (repos.length === 0) fail(`no inline matrix repo list (repo: [a, b]) in ${workflowPath}`);
  return repos;
}

/**
 * Check the parsed config, that every key is a repo in the sync matrix and
 * that every listed path is a file under sourceRoot (agent-core's checkout).
 * Throws on the first problem.
 *
 * @param {unknown} config
 * @param {string} sourceRoot
 * @param {string[]} matrix consumer repos the sync workflow runs for
 * @returns {Record<string, Array<{reason: string, paths: string[]}>>}
 */
function validateConfig(config, sourceRoot, matrix) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('top level must be an object keyed by consumer repo name');
  }
  for (const [repo, groups] of Object.entries(config)) {
    if (!REPO_NAME.test(repo)) fail(`invalid repo name ${JSON.stringify(repo)}`);
    if (!matrix.includes(repo)) {
      fail(`${repo} is not in the sync matrix of ${WORKFLOW} (${matrix.join(', ')}); fix the repo name`);
    }
    if (!Array.isArray(groups) || groups.length === 0) {
      fail(`${repo}: expected a non-empty array of { reason, paths } groups`);
    }
    for (const group of groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        fail(`${repo}: each group must be an object with reason and paths`);
      }
      if (typeof group.reason !== 'string' || !group.reason.trim()) {
        fail(`${repo}: every group needs a reason`);
      }
      if (!Array.isArray(group.paths) || group.paths.length === 0) {
        fail(`${repo}: every group needs a non-empty paths array`);
      }
      for (const p of group.paths) {
        if (typeof p !== 'string' || !p.startsWith('lib/') || p.endsWith('/') || UNSAFE_PATH.test(p)) {
          fail(`${repo}: ${JSON.stringify(p)} must be a plain file path under lib/`);
        }
        const stat = fs.statSync(path.join(sourceRoot, p), { throwIfNoEntry: false });
        if (!stat || !stat.isFile()) {
          fail(`${repo}: ${p} is not a file in agent-core, so the sync never writes it; drop the entry`);
        }
      }
    }
  }
  return config;
}

/**
 * Read and validate the config file against the sync matrix and lib/ of
 * sourceRoot.
 *
 * @param {string} configPath
 * @param {string} sourceRoot
 */
function loadConfig(configPath, sourceRoot) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    fail(`cannot read ${configPath}: ${err.message}`);
  }
  return validateConfig(parsed, sourceRoot, readMatrix(sourceRoot));
}

/**
 * rsync exclude rules for one consumer, anchored at the root of the lib/
 * transfer (`source/lib/` -> `target/lib/`). A repo with no entry gets none.
 *
 * @param {Record<string, Array<{paths: string[]}>>} config
 * @param {string} repo
 * @returns {string[]}
 */
function rulesFor(config, repo) {
  const groups = Object.prototype.hasOwnProperty.call(config, repo) ? config[repo] : [];
  const paths = new Set(groups.flatMap(group => group.paths));
  return [...paths].map(p => '/' + p.slice('lib/'.length));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--repo', '--source', '--config'].includes(flag)) fail(`unknown argument ${flag}`);
    if (i + 1 >= argv.length) fail(`missing value for ${flag}`);
    args[flag.slice(2)] = argv[i + 1];
  }
  if (!args.repo) fail('--repo is required');
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const sourceRoot = path.resolve(args.source || path.join(__dirname, '..'));
  const configPath = path.resolve(args.config || path.join(sourceRoot, 'sync-exclude.json'));
  const rules = rulesFor(loadConfig(configPath, sourceRoot), args.repo);
  if (rules.length > 0) process.stdout.write(rules.join('\n') + '\n');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { readMatrix, validateConfig, loadConfig, rulesFor };
