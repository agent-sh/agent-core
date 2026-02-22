#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function renderTemplate(template, vars) {
  let result = template;

  // Process conditional sections: {{#key}}...{{/key}}
  result = result.replace(/\{\{#(\w+)\}\}\n([\s\S]*?)\{\{\/\1\}\}\n/g, (_, key, block) => {
    const section = vars[key];
    if (!section || !section.items || section.items.length === 0) {
      return '';
    }
    // Replace {{items}} inside the block with bullet list
    const itemList = section.items.map(item => `- ${item}`).join('\n');
    return block.replace('{{items}}', itemList);
  });

  // Replace simple variables
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : '';
  });

  return result;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.target) {
    console.error('[ERROR] --target is required');
    process.exit(1);
  }
  if (!args.template) {
    console.error('[ERROR] --template is required');
    process.exit(1);
  }

  const targetDir = path.resolve(args.target);
  const templatePath = path.resolve(args.template);

  // Read template
  let template;
  try {
    template = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    console.error(`[ERROR] Cannot read template: ${err.message}`);
    process.exit(1);
  }

  // Read package.json
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
  } catch (err) {
    console.error(`[ERROR] Cannot read package.json: ${err.message}`);
    process.exit(1);
  }

  // Extract plugin name (strip @agentsys/ prefix)
  const pluginName = (pkg.name || '').replace(/^@agentsys\//, '');
  const description = pkg.description || '';

  // Read components.json (optional)
  let components = { agents: [], skills: [], commands: [] };
  const componentsPath = path.join(targetDir, 'components.json');
  if (fs.existsSync(componentsPath)) {
    try {
      components = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));
    } catch (err) {
      console.error(`[WARN] Cannot parse components.json: ${err.message}`);
    }
  }

  const vars = {
    pluginName,
    description,
    agents: { items: components.agents || [] },
    skills: { items: components.skills || [] },
    commands: { items: components.commands || [] },
  };

  const output = renderTemplate(template, vars);

  // Write CLAUDE.md
  const outputPath = path.join(targetDir, 'CLAUDE.md');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`[OK] Generated ${outputPath}`);
}

main();
