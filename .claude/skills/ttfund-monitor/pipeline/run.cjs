// pipeline/run.cjs — ttfund-monitor v2.5.1
// Single pipeline entry point. Orchestrates automatable stages, stops at LLM boundaries.
//
// Usage:
//   node pipeline/run.cjs --mode report --round routine
//   node pipeline/run.cjs --runId 20260701-1017-auto --from evidence
//   node pipeline/run.cjs --runId 20260701-1017-auto --from report
//
// --from values:
//   collect  (default) — collect → portfolio → [STOP: compute]
//   evidence — evidence → validate-reasoning → [STOP: B-layer]
//   reason   — verify B-layer artifacts → [STOP: report]
//   report   — consistency validator → DONE

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const { runtimeRoot, skillRoot } = require('../lib/workspace.cjs');
const { stages } = require('./contracts.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flagVal(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

const mode = flagVal('--mode') || 'report';
const round = flagVal('--round') || 'routine';
const fromStage = flagVal('--from') || 'collect';
const explicitRunId = flagVal('--runId');

if (!['collect', 'evidence', 'reason', 'report'].includes(fromStage)) {
  console.error(`ERROR: invalid --from value: ${fromStage}. Must be: collect, evidence, reason, report`);
  process.exit(1);
}
if (fromStage !== 'collect' && !explicitRunId) {
  console.error('ERROR: --runId is required when --from is not "collect"');
  process.exit(1);
}

// ── runId ────────────────────────────────────────────────────
const now = new Date();
const runId = explicitRunId
  || `${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-auto`;

const RUN_DIR = path.join(runtimeRoot, 'runs', runId);

// ── Stage index lookup ───────────────────────────────────────
const stageMap = {};
for (const s of stages) stageMap[s.id] = s;
// --from aliases: user-facing names → internal stage IDs
const fromAlias = { collect: 'collect', evidence: 'evidence', reason: 'reason-b', report: 'report' };
const resolvedStage = fromAlias[fromStage];
const stageOrder = stages.map(s => s.id);
const startIdx = stageOrder.indexOf(resolvedStage);

// ── Helpers ──────────────────────────────────────────────────
function runStage(scriptRelPath, scriptArgs) {
  const scriptPath = path.join(skillRoot, scriptRelPath);
  if (!fs.existsSync(scriptPath)) {
    console.error(`  ERROR: script not found: ${scriptPath}`);
    return { ok: false, error: 'script_missing' };
  }
  const res = cp.spawnSync('node', [scriptPath, ...scriptArgs], {
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 300000, // 5 min for collector
    windowsHide: true
  });
  if (res.error) {
    console.error(`  ERROR: spawn failed: ${res.error.message}`);
    return { ok: false, error: res.error.message };
  }
  return { ok: res.status === 0, exitCode: res.status };
}

function checkArtifact(relPath) {
  // relPath is relative to RUN_DIR, e.g. 'raw-snapshot.md'
  const p = path.join(RUN_DIR, relPath);
  return fs.existsSync(p);
}

function checkCurrentMd() {
  return fs.existsSync(path.join(runtimeRoot, 'current.md'));
}

// ── Manual stage output mapping ──────────────────────────────
// If all listed outputs exist, the manual stage is considered complete.
const manualOutputs = {
  compute: ['derived-snapshot.md'],
  'reason-b': ['reasoning-snapshot.json'],
  report: ['report.md']
};

// ── Stage-by-stage runner ────────────────────────────────────
let stoppedForLLM = false;

console.log(`=== ttfund-monitor pipeline v2.5.1 ===`);
console.log(`runId: ${runId}  mode: ${mode}  from: ${fromStage}`);
console.log(`skillRoot: ${skillRoot}`);
console.log(`runtimeRoot: ${runtimeRoot}\n`);

// Ensure run directory exists for all stages except maybe first-time collect.
if (fromStage !== 'collect') {
  if (!fs.existsSync(RUN_DIR)) {
    console.error(`ERROR: run directory not found: ${RUN_DIR}`);
    console.error('Run collect first: node pipeline/run.cjs --mode report --round routine');
    process.exit(1);
  }
}

for (let i = startIdx; i < stageOrder.length; i++) {
  const sid = stageOrder[i];
  const stage = stageMap[sid];

  console.log(`── ${stage.label} ──`);

  if (stage.auto) {
    // ── Auto stage ──
    const scriptArgs = sid === 'collect'
      ? stage.args(runId, mode)
      : stage.args(runId);

    console.log(`  Running: node ${stage.script} ${scriptArgs.join(' ')}`);
    const result = runStage(stage.script, scriptArgs);
    if (!result.ok) {
      console.error(`\nFATAL: ${stage.label} failed (exit ${result.exitCode}). Pipeline stopped.`);
      process.exit(1);
    }
  } else {
    // ── Manual (LLM) stage ──
    // If output already exists, skip this manual stage and continue pipeline.
    const outputs = manualOutputs[sid] || [];
    const allOutputsExist = outputs.length > 0 && outputs.every(f => checkArtifact(f));

    if (allOutputsExist) {
      console.log(`  (already complete — ${outputs.join(', ')} exists, skipping)`);
      continue;
    }

    // Check upstream dependencies
    const missing = [];
    if (sid === 'compute') {
      if (!checkArtifact('raw-snapshot.md')) missing.push('raw-snapshot.md');
    } else if (sid === 'reason-b') {
      if (!checkArtifact('evidence-packet.json')) missing.push('evidence-packet.json');
      if (!checkArtifact('derived-snapshot.md')) missing.push('derived-snapshot.md');
    } else if (sid === 'report') {
      if (!checkArtifact('reasoning-snapshot.json')) missing.push('reasoning-snapshot.json');
      if (!checkArtifact('evidence-packet.json')) missing.push('evidence-packet.json');
      if (!checkArtifact('raw-snapshot.md')) missing.push('raw-snapshot.md');
    }

    if (missing.length > 0) {
      console.error(`  ERROR: missing upstream artifacts: ${missing.join(', ')}`);
      console.error(`  Run earlier stages first.`);
      process.exit(1);
    }

    console.log(`  ⏸  STOP — ${stage.note}`);
    stoppedForLLM = true;
    break;
  }
}

// ── Summary ──────────────────────────────────────────────────
console.log();
if (stoppedForLLM) {
  console.log(`=== PIPELINE PAUSED ===`);
  console.log(`Next step: ${(() => {
    // Find which manual stage we stopped at
    for (let i = startIdx; i < stageOrder.length; i++) {
      const sid = stageOrder[i];
      if (!stageMap[sid].auto) {
        const outputs = manualOutputs[sid] || [];
        if (!outputs.every(f => checkArtifact(f))) {
          return `Complete "${stageMap[sid].label}", then resume:`;
        }
      }
    }
    return 'Resume:';
  })()}`);
  console.log(`  node pipeline/run.cjs --runId ${runId} --from ${fromStage}`);
} else {
  console.log(`=== PIPELINE COMPLETE ===`);
  console.log(`runId: ${runId}`);
}
