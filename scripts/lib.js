/**
 * Shared helpers for local Node scripts:
 * load credentials from process.env or .dev.vars (Wrangler's local secrets file).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Parse a .dev.vars file (KEY=VALUE lines, # comments).
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function parseDevVarsFile(filePath) {
  if (!existsSync(filePath)) return {};
  const vars = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

/**
 * Load script configuration: .dev.vars first, then real environment
 * variables (which win), then inline --flag CLI arguments.
 *
 * @param {string[]} [argv]
 * @returns {Record<string, string>}
 */
export function loadScriptEnv(argv = process.argv.slice(2)) {
  const devVars = parseDevVarsFile(resolve(REPO_ROOT, '.dev.vars'));
  const env = { ...devVars, ...process.env };

  // Minimal --key value / --key=value parsing.
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      env[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      env[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      env[arg.slice(2)] = 'true';
    }
  }

  env.REPO_ROOT = REPO_ROOT;
  return env;
}

export { REPO_ROOT };
