// pipeline/run.cjs — ttfund-monitor v2.6.0
// Single pipeline entry point. Orchestrates automatable stages, stops at LLM boundaries.
//
// Usage:
//   node pipeline/run.cjs --mode report --round routine
//   node pipeline/run.cjs --runId 20260701-1017-auto --from evidence
//   node pipeline/run.cjs --runId 20260701-1017-auto --from reason
//   node pipeline/run.cjs --runId 20260701-1017-auto --from report
//
// --from values:
//   source-probe — source-probe → DONE
//   collect  (default) — source-probe → collect → portfolio → [STOP: compute]
//   evidence — evidence → validate-reasoning → [STOP: B-layer]
//   reason   — temporal-diff → [STOP: report]
//   report   — temporal-diff → validate-report → consistency → DONE
//   diff     — temporal-diff only → DONE

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const { runtimeRoot, skillRoot } = require('../lib/workspace.cjs');
const { artifacts, stages } = require('./contracts.cjs');

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

if (!['source-probe', 'collect', 'evidence', 'reason', 'report', 'diff'].includes(fromStage)) {
  console.error(`ERROR: invalid --from value: ${fromStage}. Must be: source-probe, collect, evidence, reason, report, diff`);
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
const fromAlias = { 'source-probe': 'source-probe', collect: 'source-probe', evidence: 'evidence', reason: 'temporal-diff', report: 'temporal-diff', diff: 'temporal-diff' };
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

function checkArtifactById(artifactId) {
  const artifact = artifacts.find(a => a.id === artifactId);
  if (!artifact) return false;
  const p = artifact.path.replace('{runDir}', RUN_DIR).replace('{runtimeRoot}', runtimeRoot);
  return fs.existsSync(p);
}

function checkCurrentMd() {
  return fs.existsSync(path.join(runtimeRoot, 'current.md'));
}

// ── Manual stage output mapping ──────────────────────────────
// If all listed outputs exist, the manual stage is considered complete.
const manualOutputs = {
  compute: ['derived-snapshot.md', 'derived.json'],
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

    // Check inputs exist before execution (P5-C: runner-level blocking)
    if (stage.inputs && stage.inputs.length > 0) {
      const missing = stage.inputs.filter(id => !checkArtifactById(id));
      if (missing.length > 0) {
        console.error(`  FATAL: ${stage.label} — missing inputs: ${missing.join(', ')}`);
        console.error(`  Run earlier stages first.`);
        process.exit(1);
      }
    }

    console.log(`  Running: node ${stage.script} ${scriptArgs.join(' ')}`);
    const result = runStage(stage.script, scriptArgs);
    if (!result.ok) {
      if (stage.failurePolicy === 'warn' || stage.failurePolicy === 'degraded') {
        console.warn(`  WARN: ${stage.label} failed (exit ${result.exitCode}) — continuing (failurePolicy=${stage.failurePolicy}).`);
      } else {
        console.error(`\nFATAL: ${stage.label} failed (exit ${result.exitCode}). Pipeline stopped.`);
        process.exit(1);
      }
    }

    // --from diff: stop after validate-temporal-diff
    if (fromStage === 'diff' && sid === 'validate-temporal-diff') {
      console.log(`  ⏸  STOP — temporal-diff complete (--from diff)`);
      stoppedForLLM = true;
      break;
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
	      if (!checkArtifact('derived.json')) missing.push('derived.json');
    } else if (sid === 'report') {
      if (!checkArtifact('reasoning-snapshot.json')) missing.push('reasoning-snapshot.json');
      if (!checkArtifact('evidence-packet.json')) missing.push('evidence-packet.json');
      if (!checkArtifact('raw-snapshot.md')) missing.push('raw-snapshot.md');
    } else if (sid === 'temporal-diff') {
      if (!checkArtifact('reasoning-snapshot.json')) {
        missing.push('reasoning-snapshot.json');
        console.error('  NOTE: --from reason requires B-layer (reasoning-snapshot.json) to already exist.');
        console.error('  If B-layer not yet generated, use: node pipeline/run.cjs --runId <id> --from evidence');
      }
      if (!checkArtifact('raw.json')) missing.push('raw.json');
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
