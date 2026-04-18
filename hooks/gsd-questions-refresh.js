#!/usr/bin/env node
// gsd-hook-version: 1.37.1
// gsd-questions-refresh.js — PostToolUse hook
// Détecte les modifications dans *-questions/*.md et injecte un signal
// de refresh dans le contexte Claude actif.
// OPT-IN: hooks.questions_autorefresh: true dans .planning/config.json

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    // Garde 1 : subagent guard — évite la boucle infinie (Pitfall 3)
    if (data.tool_input?.is_subagent || data.session_type === 'task') {
      process.exit(0);
    }

    // Garde 2 : opt-in via .planning/config.json
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      process.exit(0);
    }
    if (!config.hooks?.questions_autorefresh) {
      process.exit(0);
    }

    // Garde 3 : scope de matching
    const filePath = data.tool_input?.file_path || '';
    // Matcher : fichier .md dans questions/ ou {NN}-questions/
    const questionsMatch = /\/(?:\d{2}-)?questions\/.+\.md$/.test(filePath);
    if (!questionsMatch) {
      process.exit(0);
    }
    // Exclure blocked/ — déplacer une question vers blocked ne doit pas re-trigger
    if (filePath.includes('/blocked/')) {
      process.exit(0);
    }

    const basename = path.basename(filePath);
    const questionsDir = path.basename(path.dirname(filePath));
    const isInbox = basename === 'INBOX.md';
    const isIndex = basename === 'INDEX.md';

    // INDEX.md est généré par Claude lui-même lors du refresh — ignorer
    if (isIndex) {
      process.exit(0);
    }

    // Construire le message additionalContext
    const message = isInbox
      ? `INBOX.md modified in ${questionsDir}/ — process inbox content on next refresh.`
      : `${basename} modified in ${questionsDir}/ — refresh pending.`;

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message
      }
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
