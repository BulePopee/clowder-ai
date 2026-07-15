// validate-run-consistency.cjs — ttfund-monitor v2.5.1
// Cross-artifact consistency checker. Detects broken artifact chains.
// Usage: node validate-run-consistency.cjs --runId 20260701-1017-auto
// Exit: 0 = consistent, 1 = inconsistency found (HARD FAIL)

const fs = require('fs');
const path = require('path');
const { runtimeRoot, runDir, currentFile } = require('./lib/workspace.cjs');
const { artifacts } = require('./pipeline/contracts.cjs');
const { normalize, loadUnitConfig } = require('./lib/unit-normalizer.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = runDir(runId);

let errors = 0;
let warnings = 0;
let isBlocked = false;    // hoisted: used by both section 3 and 4
let ePortAvail = false;  // hoisted: used by sections 2-4

function fail(msg) { errors++; console.error(`  FAIL: ${msg}`); }
function warn(msg) { warnings++; console.warn(`  WARN: ${msg}`); }
function ok(msg) { console.log(`  OK: ${msg}`); }

function readJSON(name) {
  const p = path.join(RUN_DIR, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return null; }
}

function readText(name) {
  const p = path.join(RUN_DIR, name);
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}

console.log(`\n=== consistency validator v1.0.0 ===`);
console.log(`runId: ${runId}`);
console.log(`runDir: ${RUN_DIR}\n`);

// ── 1. Artifact existence (driven by shared contracts) ──────
console.log('── 1. Artifact existence ──');
const coreArtifacts = artifacts.filter(a =>
  a.path.startsWith('{runDir}') && (a.required || a.requiredForReport)
);
for (const a of coreArtifacts) {
  const fname = a.path.replace('{runDir}/', '');
  const p = path.join(RUN_DIR, fname);
  if (fs.existsSync(p)) {
    ok(`${a.producedBy} (${fname})`);
  } else if (a.failure === 'g001_blocker') {
    fail(`${a.producedBy} (${fname}) MISSING — ${a.failureNote || 'triggers G001 blocker'}`);
  } else {
    fail(`${a.producedBy} (${fname}) MISSING`);
  }
}
// current.md is checked separately (not in run dir)
if (fs.existsSync(currentFile())) ok(`current.md`);
else warn(`current.md MISSING (may not have been generated yet)`);

// ── 2. Evidence → Reasoning consistency ─────────────────────
console.log('\n── 2. Evidence → Reasoning consistency ──');
const evidence = readJSON('evidence-packet.json');
const reasoning = readJSON('reasoning-snapshot.json');

if (evidence && reasoning) {
  // 2a. Guard blocker count
  const eBlockers = evidence.guard_results?.blockers || [];
  const rBlockers = reasoning.meta?.guard_blockers || [];
  if (eBlockers.length === rBlockers.length) {
    ok(`Blocker count matches (evidence:${eBlockers.length}, reasoning:${rBlockers.length})`);
  } else {
    fail(`Blocker count MISMATCH (evidence:${eBlockers.length}, reasoning:${rBlockers.length})`);
  }

  // 2b. Guard warning count
  const eWarns = evidence.guard_results?.warnings || [];
  const rWarns = reasoning.meta?.guard_warnings || [];
  if (eWarns.length === rWarns.length) {
    ok(`Warning count matches (evidence:${eWarns.length}, reasoning:${eWarns.length})`);
  } else {
    fail(`Warning count MISMATCH (evidence:${eWarns.length}, reasoning:${eWarns.length})`);
  }

  // 2c. Portfolio available consistency
  ePortAvail = evidence.portfolio?.available || false;
  const hasG001 = rBlockers.some(b => b.includes('G001'));
  if (ePortAvail && hasG001) {
    fail('Portfolio available in evidence but G001 still in reasoning blockers');
  } else if (!ePortAvail && !hasG001) {
    warn('Portfolio NOT available in evidence but no G001 in reasoning — check evidence-packet.json');
  } else {
    ok(`Portfolio availability consistent (available:${ePortAvail}, G001:${hasG001})`);
  }

  // 2d. Action advice allowed
  const eAllowed = evidence.guard_results?.action_advice_allowed;
  const rAllowed = reasoning.meta?.action_advice_allowed;
  if (eAllowed === rAllowed) {
    ok(`Action advice gate matches (evidence:${eAllowed}, reasoning:${rAllowed})`);
  } else {
    fail(`Action advice gate MISMATCH (evidence:${eAllowed}, reasoning:${rAllowed})`);
  }

  // 2e. Coverage / freshness
  const eCov = evidence.freshness;
  const rCov = reasoning.meta?.data_coverage;
  if (rCov) {
    ok(`Data coverage present in reasoning: ${rCov}`);
  } else {
    warn('Data coverage missing in reasoning meta');
  }

  // 2f. Blueprints degraded must not falsely claim portfolio data missing
  const rDegraded = reasoning.meta?.blueprints_degraded || [];
  const degradedClaimsMissing = rDegraded.some(
    d => d.includes('portfolio') && /数据不可用|数据缺失/.test(d)
  );
  if (degradedClaimsMissing && ePortAvail) {
    fail('Portfolio blueprint claims data missing but evidence shows portfolio available');
  } else if (!degradedClaimsMissing && rDegraded.some(d => d.includes('portfolio'))) {
    ok('Portfolio blueprint degraded with correct reason (e.g. G002 blocker, not missing data)');
  }
} else {
  if (!evidence) fail('Cannot run evidence→reasoning checks: evidence-packet.json missing');
  if (!reasoning) fail('Cannot run evidence→reasoning checks: reasoning-snapshot.json missing');
}

// ── 3. Reasoning → Report consistency ───────────────────────
console.log('\n── 3. Reasoning → Report consistency ──');
const report = readText('report.md');

if (reasoning && report) {
  const rActionGate = reasoning.portfolio_action_gate?.action_gate;
  const actionType = rActionGate?.action_type || '';
  isBlocked = actionType.includes('无法给出行动建议');

  // 3a. Blocker → "无法给出行动建议" in report
  if (isBlocked) {
    if (/无法给出行动建议/.test(report)) {
      ok('Report correctly outputs "无法给出行动建议" (blockers active)');
    } else {
      fail('Blockers active but report does NOT contain "无法给出行动建议"');
    }
  }

  // 3b. NO standalone "HOLD" as action advice when blocked
  if (isBlocked) {
    // "HOLD" in Ch6 context as action advice is forbidden when blocked
    const ch6 = report.match(/## 6\. 决策结论[\s\S]*?(?=## 7\.|$)/);
    if (ch6) {
      const ch6Text = ch6[0];
      // "HOLD" is ok in compound context like "禁止输出 HOLD" but not as advice
      if (/\*\*HOLD\*\*/.test(ch6Text) && !/禁止/.test(ch6Text)) {
        fail('Report Ch6 contains standalone HOLD despite blocker active');
      } else {
        ok('Report Ch6 does not use HOLD as standalone action advice');
      }
    }
  }

  // 3c. Portfolio available → no "持仓: 全部不可用"
  if (ePortAvail) {
    if (/持仓[：:]\s*全部不可用/.test(report)) {
      fail('Portfolio available but report Ch7 still says "持仓: 全部不可用"');
    } else {
      ok('Report does not falsely claim portfolio unavailable');
    }
  }

  // 3d. Report references correct runId
  if (report.includes(`runId: ${runId}`) || report.includes(`**runId**: ${runId}`)) {
    ok(`Report references correct runId: ${runId}`);
  } else {
    warn('Report may not reference correct runId — verify manually');
  }

  // 3e. Blocker count in report
  const rBlockerCount = reasoning.meta?.guard_blockers?.length || 0;
  const blockerRe = new RegExp(`${rBlockerCount}\\s*blocker`);
  if (blockerRe.test(report)) {
    ok(`Report blocker count matches reasoning: ${rBlockerCount}`);
  } else {
    warn(`Could not verify blocker count in report (reasoning:${rBlockerCount}) — check Ch0 guard table`);
  }
} else {
  if (!reasoning) fail('Cannot run reasoning→report checks: reasoning-snapshot.json missing');
  if (!report) fail('Cannot run reasoning→report checks: report.md missing');
}

// ── 4. Report → current.md consistency ──────────────────────
console.log('\n── 4. Report → current.md consistency ──');
const current = (() => {
  const p = currentFile();
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
})();

if (report && current) {
  // 4a. RunId in current
  if (current.includes(runId)) {
    ok(`current.md references correct runId: ${runId}`);
  } else {
    fail(`current.md does NOT reference runId ${runId}`);
  }

  // 4b. Blocker semantics in current
  if (isBlocked) {
    if (/无法给出行动建议/.test(current)) {
      ok('current.md correctly outputs "无法给出行动建议"');
    } else {
      fail('current.md missing "无法给出行动建议" despite blocker');
    }
  }

  // 4c. Portfolio state in current
  if (ePortAvail) {
    if (/组合状态[：:].*不可用/.test(current) || /portfolio.*degraded/i.test(current)) {
      fail('current.md says portfolio degraded/unavailable but evidence shows available');
    } else {
      ok('current.md does not falsely claim portfolio unavailable');
    }
  }
} else {
  if (!report) fail('Cannot run report→current checks: report.md missing');
  if (!current) warn('Cannot run report→current checks: current.md missing');
}

// ── 5. Feedback consistency (P3.2-A) ──────────────────────────
console.log('\n── 5. Feedback consistency ──');
const feedback = readJSON('feedback.json');

if (feedback && reasoning) {
  // 5a. feedback meta.runId matches reasoning meta.runId
  if (feedback.meta?.runId === reasoning.meta?.runId) {
    ok(`Feedback runId matches reasoning (${feedback.meta.runId})`);
  } else {
    fail(`Feedback runId (${feedback.meta?.runId}) does NOT match reasoning (${reasoning.meta?.runId})`);
  }

  // 5b. action_advice_allowed consistency
  const fActionAllowed = feedback.adjustment_summary?.action_advice_allowed;
  const rActionAllowed = reasoning.meta?.action_advice_allowed;
  if (fActionAllowed === rActionAllowed) {
    ok(`action_advice_allowed consistent (feedback:${fActionAllowed}, reasoning:${rActionAllowed})`);
  } else {
    fail(`action_advice_allowed MISMATCH (feedback:${fActionAllowed}, reasoning:${rActionAllowed})`);
  }

  // 5c. cross_refs from_field can be resolved in reasoning or temporal
  const crossRefs = feedback.cross_refs || [];
  let unresolvedFields = 0;
  for (const ref of crossRefs) {
    if (ref.from_blueprint === 'temporal-diff') continue; // checked separately
    if (ref.from_blueprint === 'macro-regime' && !reasoning.macro_regime) {
      unresolvedFields++;
    } else if (ref.from_blueprint === 'gold-rate-conflict' && !reasoning.gold_rate_conflict) {
      unresolvedFields++;
    } else if (ref.from_blueprint === 'portfolio-action-gate' && !reasoning.portfolio_action_gate) {
      unresolvedFields++;
    }
  }
  if (unresolvedFields === 0) {
    ok(`All ${crossRefs.length} cross_refs reference available blueprints`);
  } else {
    fail(`${unresolvedFields} cross_ref(s) reference unavailable blueprints`);
  }

  // 5d. adjustment_summary cumulative_caps check
  const cumCaps = feedback.adjustment_summary?.cumulative_caps || {};
  let capViolations = 0;
  for (const [target, info] of Object.entries(cumCaps)) {
    if (!info.ok) {
      capViolations++;
      fail(`cumulative cap violated for "${target}": delta ${info.totalDelta} > cap ${info.cap}`);
    }
  }
  if (capViolations === 0) {
    ok(`All cumulative caps respected (${Object.keys(cumCaps).length} targets)`);
  }

  // 5e. cross_ref count consistency
  const summaryCount = feedback.adjustment_summary?.total || 0;
  if (summaryCount === crossRefs.length) {
    ok(`cross_ref count consistent (${crossRefs.length})`);
  } else {
    fail(`cross_ref count MISMATCH (summary:${summaryCount}, actual:${crossRefs.length})`);
  }
} else if (feedback && !reasoning) {
  fail('feedback.json exists but reasoning-snapshot.json missing — cannot verify consistency');
} else if (!feedback) {
  warn('feedback.json MISSING — P3.2-A feedback not yet generated for this run');
}

// ── 6. Unit consistency (P4-A) ──────────────────────────────────
console.log('\n── 6. Unit consistency ──');
const unitConfig = loadUnitConfig();
const configIndicatorIds = Object.keys(unitConfig.indicators || {});

if (configIndicatorIds.length > 0) {
  const raw = readJSON('raw.json');
  const temporalDiff = readJSON('temporal-diff.json');

  // 6a. Configured indicator raw value check: value must fall in known range
  if (raw && raw.results) {
    for (const id of configIndicatorIds) {
      const r = raw.results[id];
      if (!r || r.value == null) continue;
      const result = normalize(id, { value: r.value, unit: r.unit });
      if (result.detectedUnit === null) {
        warn(`§6a ${id}: value ${result.rawValue} outside all known range groups — unit drift cannot be detected`);
      } else if (result.normalized) {
        ok(`§6a ${id}: detected as ${result.detectedUnit}, normalized to ${result.canonicalUnit} (${result.rawValue} → ${Number(result.value).toFixed(2)})`);
      } else {
        ok(`§6a ${id}: in canonical range (${result.detectedUnit}), no normalization needed`);
      }
    }
  } else {
    warn('§6a Cannot check: raw.json missing');
  }

  // 6b. Temporal-diff normalization audit
  if (temporalDiff) {
    const tdWarnings = temporalDiff.meta?.warnings || [];
    const normWarnings = tdWarnings.filter(w => w && w.includes('单位归一化'));
    const changes = temporalDiff.directional_changes || [];
    const normalizedChanges = changes.filter(c => c.normalized);

    if (normalizedChanges.length > 0 && normWarnings.length === 0) {
      fail('§6b Temporal-diff has normalized indicators but no normalization warnings');
    } else if (normalizedChanges.length > 0) {
      ok(`§6b ${normalizedChanges.length} normalized indicator(s) with ${normWarnings.length} warning(s)`);
    } else {
      ok('§6b No normalization applied (all indicators in canonical units)');
    }
  }

  // 6c. Cross-run unit consistency: baseline vs current detectedUnit drift
  if (temporalDiff) {
    const changes = temporalDiff.directional_changes || [];
    let crossRunDrifts = 0;
    for (const c of changes) {
      if (!c.currentDetectedUnit && !c.baselineDetectedUnit) continue;
      if (c.currentDetectedUnit && c.baselineDetectedUnit &&
          c.currentDetectedUnit !== c.baselineDetectedUnit) {
        if (c.normalized) {
          console.log(`  INFO: §6c ${c.indicator}: baseline(${c.baselineDetectedUnit}) vs current(${c.currentDetectedUnit}) unit drift — already normalized`);
        } else {
          warn(`§6c ${c.indicator}: baseline(${c.baselineDetectedUnit}) vs current(${c.currentDetectedUnit}) unit drift NOT normalized`);
          crossRunDrifts++;
        }
      }
    }
    if (crossRunDrifts === 0) {
      ok('§6c Cross-run unit consistency: no unhandled drifts');
    }
  }
} else {
  console.log('  (no indicators configured for unit normalization)');
}

// ── Summary ──────────────────────────────────────────────────
console.log(`\n=== Results: ${errors} error(s), ${warnings} warning(s) ===`);
if (errors > 0) {
  console.error('CONSISTENCY CHECK FAILED — artifact chain is broken.');
  console.error('Fix: rebuild downstream artifacts from the first inconsistent stage.\n');
  process.exit(1);
} else {
  console.log('CONSISTENCY CHECK PASSED — all artifacts are consistent.\n');
  process.exit(0);
}
