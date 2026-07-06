// lib/workspace.cjs — ttfund-monitor v2.5.1
// Unified path resolver. All scripts import this instead of hardcoding paths.
// Environment overrides: TTFUND_RUNTIME_ROOT, TTFUND_SKILL_ROOT

const fs = require('fs');
const path = require('path');

// ── Roots ──────────────────────────────────────────────────────
const skillRoot = process.env.TTFUND_SKILL_ROOT
  || (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) return dir;
      dir = path.dirname(dir);
    }
    throw new Error('Cannot find ttfund-monitor skill root (no SKILL.md found)');
  })();

// Walk up from skillRoot to find project root (where package.json lives),
// then resolve runtimeRoot relative to that.
function findProjectRoot(dir) {
  let d = dir;
  while (d !== path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    d = path.dirname(d);
  }
  // Fallback: skillRoot/../../.. (for standard .claude/skills/ deployment)
  return path.resolve(skillRoot, '../../..');
}

const runtimeRoot = process.env.TTFUND_RUNTIME_ROOT
  || path.join(findProjectRoot(skillRoot), 'data', 'ttfund-monitor');

// ── Derived paths ──────────────────────────────────────────────
function runDir(runId) {
  return path.join(runtimeRoot, 'runs', runId);
}

function currentFile() {
  return path.join(runtimeRoot, 'current.md');
}

// ── Tool config (optional, local-only) ─────────────────────────
function loadToolConfig() {
  const cfgPath = path.join(skillRoot, 'config', 'tools.json');
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
    catch (e) { console.error('workspace: failed to parse config/tools.json:', e.message); }
  }
  return null;
}

// HOME directory, no hardcoded fallback
const homeDir = process.env.HOME || process.env.USERPROFILE || null;

module.exports = { skillRoot, runtimeRoot, runDir, currentFile, loadToolConfig, homeDir };
