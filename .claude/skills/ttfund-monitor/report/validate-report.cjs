// report/validate-report.cjs — ttfund-monitor v2.5.1
// Structural + semantic validation of report.md against report/schema.json.
// Usage: node report/validate-report.cjs --runId 20260630-1412-ragdoll-vzes
// Exit code 0 = pass, 1 = blocked issues

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME, runDir, skillRoot } = require('../lib/workspace.cjs');
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = runDir(runId);

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

const schema = readJSON(path.join(skillRoot, 'report', 'schema.json'));
const report = readText(path.join(RUN_DIR, 'report.md'));
const reasoning = readJSON(path.join(RUN_DIR, 'reasoning-snapshot.json'));

if (!schema) { console.error('FATAL: report/schema.json not found'); process.exit(1); }
if (!report) { console.error('FATAL: report.md not found'); process.exit(1); }

const errors = [];
const warnings = [];

// ── Helpers ───────────────────────────────────────────────────
function extractSection(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\S*\\s*.*$`, 'm');
  const m = text.match(re);
  if (!m) return null;
  const start = m.index;
  const after = text.slice(start + m[0].length);
  const nextH2 = after.search(/^##\s+/m);
  return nextH2 !== -1 ? after.slice(0, nextH2) : after;
}

function findAllH2(text) {
  const headings = [];
  const re = /^##\s+(.+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) headings.push(m[1].trim());
  return headings;
}

function countH2ByPrefix(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}`, 'gm');
  return (text.match(re) || []).length;
}

function findAllH3(text) {
  const headings = [];
  const re = /^###\s+(.+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) headings.push(m[1].trim());
  return headings;
}

function countTablesInText(text) {
  let count = 0;
  const lines = text.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) { inTable = true; count++; }
    } else {
      inTable = false;
    }
  }
  return count;
}

// ── Check 1: Section existence & content ──────────────────────
let sectionsFound = 0;
const h2s = findAllH2(report);

for (const [key, secDef] of Object.entries(schema.sections)) {
  const prefix = secDef.prefix || key;

  // minExpectedH2: check count of H2s with this prefix (used for 0-status etc.)
  if (secDef.minExpectedH2) {
    const count = countH2ByPrefix(report, prefix);
    if (count < secDef.minExpectedH2) {
      errors.push(`Ch${key}: expected ≥${secDef.minExpectedH2} H2s with prefix "${prefix}", found ${count}`);
    } else {
      sectionsFound++;
    }
    // Bugfix P2-C review: also check minTables for minExpectedH2 sections
    if (secDef.minTables) {
      // Collect all section texts under this prefix
      let combinedText = '';
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^##\\s+${escaped}\\S*\\s*.*$`, 'gm');
      let m;
      while ((m = re.exec(report)) !== null) {
        const start = m.index + m[0].length;
        const after = report.slice(start);
        const nextH2 = after.search(/^##\s+/m);
        combinedText += (nextH2 !== -1 ? after.slice(0, nextH2) : after) + '\n';
      }
      const tableCount = countTablesInText(combinedText);
      if (tableCount < secDef.minTables) {
        errors.push(`Ch${key}: ${tableCount} tables found across ${count} H2s, expected ≥${secDef.minTables}`);
      }
    }
    continue; // skip normal section extraction for these
  }

  const match = h2s.find(h => h.startsWith(prefix));

  if (match) {
    sectionsFound++;
    const secText = extractSection(report, prefix);

    // mustContain — key semantic markers (required sections: missing = error)
    if (secDef.mustContain && secText) {
      for (const needle of secDef.mustContain) {
        if (!secText.includes(needle)) {
          errors.push(`Ch${key}: required content marker "${needle}" not found`);
        }
      }
    }

    // Subsections (H3) — match by prefix
    if (secDef.subsections && secText) {
      const h3s = findAllH3(secText);
      const prefixes = secDef.subsections.prefixes || [];
      let h3Matched = 0;
      for (const pfx of prefixes) {
        if (h3s.some(h => h.startsWith(pfx) || h.includes(pfx))) h3Matched++;
      }
      if (h3Matched < (secDef.subsections.minRequired || prefixes.length)) {
        errors.push(`Ch${key}: ${h3Matched}/${prefixes.length} expected subsections found (minRequired: ${secDef.subsections.minRequired})`);
      }
    }

    // minTables
    if (secDef.minTables && secText) {
      const tableCount = countTablesInText(secText);
      if (tableCount < secDef.minTables) {
        errors.push(`Ch${key}: ${tableCount} tables found, expected ≥${secDef.minTables}`);
      }
    }

    // minSourceTags (per-section source labeling)
    if (secDef.minSourceTags && secText) {
      const tagCount = (secText.match(/ttfund|iFinD|Wind|mx-data|WebSearch|EastMoney/g) || []).length;
      if (tagCount < secDef.minSourceTags) {
        errors.push(`Ch${key}: only ${tagCount} source tags found (min: ${secDef.minSourceTags})`);
      }
    }
  } else if (secDef.required) {
    errors.push(`Ch${key}: required section (prefix "${prefix}") not found`);
  }
}

// ── Check 2: Global constraints ───────────────────────────────
const gc = schema.globalConstraints || {};

// runId present in first 5 lines
if (gc.runIdInFirstLines) {
  const head = report.split('\n').slice(0, 5).join('\n');
  if (!head.includes(runId)) {
    errors.push(`GLOBAL: runId "${runId}" not found in first 5 lines`);
  }
}

// Forbidden patterns
if (gc.forbiddenGlobalPatterns) {
  for (const pat of gc.forbiddenGlobalPatterns) {
    if (report.includes(pat)) {
      errors.push(`GLOBAL: forbidden pattern "${pat}" found`);
    }
  }
}

// ── Check 3: Source labeling ──────────────────────────────────
const sl = schema.sourceLabeling;
if (sl) {
  const totalTags = (report.match(/ttfund|iFinD|Wind|mx-data|WebSearch|EastMoney/g) || []).length;
  if (totalTags < sl.minTotalTags) {
    warnings.push(`SOURCE_LABELING: only ${totalTags} source tags found (min: ${sl.minTotalTags})`);
  }
}

// ── Check 4: Blocker semantics ────────────────────────────────
if (reasoning && schema.blockerSemantics) {
  const bs = schema.blockerSemantics;
  const guardBlockers = reasoning.meta?.guard_blockers || [];
  const isBlocked = guardBlockers.length > 0;

  if (isBlocked) {
    const ch6Text = extractSection(report, '6.');
    const ch5Text = extractSection(report, '5.');

    if (ch6Text) {
      if (!ch6Text.includes(bs.blockedOutputCh6)) {
        errors.push(`BLOCKER: ${guardBlockers.length} blocker(s) [${guardBlockers.join(', ')}] active but Ch6 missing "${bs.blockedOutputCh6}"`);
      } else {
        // Verify each blocker is referenced in Ch6 or the Ch0 area
        for (const b of guardBlockers) {
          const bId = b.split(':')[0].trim();
          const ch0Text = extractSection(report, '0.');
          if (!ch6Text.includes(bId) && (!ch0Text || !ch0Text.includes(bId))) {
            warnings.push(`BLOCKER: ${bId} not referenced in Ch0 or Ch6`);
          }
        }
      }

      const forbiddenActions = bs.forbiddenActions || bs.forbiddenWhenBlocked || [];
      const contextPatterns = bs.forbiddenContextPatterns || [
        "\\*\\*[^*\\n]{0,80}{action}[^*\\n]{0,80}\\*\\*",
        "建议[^。，\\n]{0,20}{action}"
      ];
      for (const action of forbiddenActions) {
        for (const ctxPat of contextPatterns) {
          const pat = ctxPat.replace('{action}', action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const adviceRe = new RegExp(pat, 'i');
          if (adviceRe.test(ch6Text)) {
            errors.push(`BLOCKER: Ch6 contains forbidden action "${action}" while blockers active`);
            break; // one match per action is enough
          }
        }
      }
    }

    if (ch5Text) {
      const forbiddenActions = bs.forbiddenActions || bs.forbiddenWhenBlocked || [];
      const contextPatterns = bs.forbiddenContextPatterns || [
        "\\*\\*[^*\\n]{0,80}{action}[^*\\n]{0,80}\\*\\*",
        "建议[^。，\\n]{0,20}{action}"
      ];
      for (const action of forbiddenActions) {
        for (const ctxPat of contextPatterns) {
          const pat = ctxPat.replace('{action}', action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const adviceRe = new RegExp(pat, 'i');
          if (adviceRe.test(ch5Text)) {
            errors.push(`BLOCKER: Ch5 contains forbidden action "${action}" while blockers active`);
            break;
          }
        }
      }
    }
  }
}

// ── Check 5: Section count ────────────────────────────────────
const expectedMin = Object.entries(schema.sections).filter(([, v]) => v.required).length;
if (sectionsFound < expectedMin) {
  errors.push(`COMPLETENESS: ${sectionsFound} sections found, need ≥${expectedMin}`);
}

// ── Output ───────────────────────────────────────────────────
console.log('=== report validator v1.0.0 ===');
console.log(`runId: ${runId}`);
console.log(`schema: v${schema.version}`);
console.log(`sections: ${sectionsFound}/${Object.keys(schema.sections).length} defined (${expectedMin} required)`);

const isBlocked = reasoning ? (reasoning.meta?.guard_blockers || []).length > 0 : null;
console.log(`blocked: ${isBlocked === null ? 'unknown (reasoning missing)' : isBlocked}\n`);

if (errors.length > 0) {
  console.log(`BLOCKED: ${errors.length} error(s):`);
  errors.forEach(e => console.log(`  ❌ ${e}`));
}
if (warnings.length > 0) {
  console.log(`WARNINGS: ${warnings.length}:`);
  warnings.forEach(w => console.log(`  ⚠️  ${w}`));
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('  ✅ All structural checks passed.');
}

console.log(`\nResult: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length > 0 ? 1 : 0);
