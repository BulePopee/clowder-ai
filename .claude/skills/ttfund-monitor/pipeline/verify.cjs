// pipeline/verify.cjs — ttfund-monitor v2.6.2 (P4-B)
// Pipeline contract verifier: walks the stage graph, checks artifact existence
// (both inputs and outputs), runs auto validator stages, reports first broken stage.
// Usage:
//   node pipeline/verify.cjs --runId 20260714-1609-auto
//   node pipeline/verify.cjs --runId 20260714-1609-auto --from temporal-diff
//   node pipeline/verify.cjs --runId 20260714-1609-auto --verbose

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { runtimeRoot: RUNTIME, skillRoot } = require('../lib/workspace.cjs');
const { artifacts, stages } = require('./contracts.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const runDir = path.join(RUNTIME, 'runs', runId);
const fromIdx = args.indexOf('--from');
const fromStage = fromIdx !== -1 ? args[fromIdx + 1] : null;
const verbose = args.includes('--verbose');

// ── Helpers ──────────────────────────────────────────────────
function resolveArtifactPath(template) {
  return template.replace('{runDir}', runDir).replace('{runtimeRoot}', RUNTIME);
}

function getArtifact(artifactId) {
  return artifacts.find(a => a.id === artifactId);
}

function failureStyle(policy) {
  if (policy === 'hard_fail') return 'FAIL';
  if (policy === 'degraded') return 'NOTE';
  return 'WARN';
}

// ── Artifact existence check ──────────────────────────────────
function checkArtifact(artifactId) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return { id: artifactId, exists: false, path: 'UNKNOWN', hard: true, error: `Artifact "${artifactId}" not in contract` };
  const filePath = resolveArtifactPath(artifact.path);
  const exists = fs.existsSync(filePath);
  const required = artifact.required !== false;
  const failurePolicy = artifact.failure || (required ? 'hard_fail' : 'optional');
  return { id: artifactId, path: filePath, exists, required, failurePolicy };
}

// ── Script execution ──────────────────────────────────────────
function runScript(scriptPath, label) {
  const fullPath = path.join(skillRoot, scriptPath);
  if (!fs.existsSync(fullPath)) {
    return { passed: false, output: '', error: `Script not found: ${fullPath}` };
  }
  try {
    const cmd = `node "${fullPath}" --runId ${runId}`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
    // exit 0 = primary pass signal. Text patterns are belt-and-suspenders for false green.
    const text = output.trim();
    const textPass = text.includes('PASS') || text.includes('CONSISTENCY CHECK PASSED') ||
      text.includes('checks passed') || text.includes('All structural checks') ||
      (text.includes('0 error') && text.includes('0 warning'));
    if (!textPass) {
      return { passed: false, output: verbose ? text : '',
        error: `Script "${label}" exited 0 but output did not match any success pattern. Output may indicate silent failure.` };
    }
    return { passed: true, output: verbose ? text : '', error: null };
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    const stdout = e.stdout?.toString() || '';
    return {
      passed: false,
      output: verbose ? (stdout + '\n' + stderr).trim() : '',
      error: `Exited ${e.status}: ${stderr.slice(0, 300)}`
    };
  }
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  console.log(`=== Pipeline Verify (P4-B) ===`);
  console.log(`runId: ${runId}`);
  console.log(`runDir: ${runDir}`);
  if (fromStage) console.log(`from: ${fromStage}`);
  console.log('');

  if (!fs.existsSync(runDir)) {
    console.error(`FATAL: run directory not found: ${runDir}`);
    process.exit(1);
  }

  // Resolve --from
  let startIdx = 0;
  if (fromStage) {
    startIdx = stages.findIndex(s => s.id === fromStage);
    if (startIdx === -1) {
      console.error(`FATAL: unknown stage "${fromStage}"`);
      console.error(`Known stages: ${stages.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
  }

  // Walk stages in topological order
  let firstBrokenStage = null;
  let allPassed = true;

  for (let i = startIdx; i < stages.length; i++) {
    const stage = stages[i];
    const stageArtifacts = artifacts.filter(a => a.stage === stage.id);
    const stageInputs = stage.inputs || [];
    const stageOutputs = stage.outputs || [];
    const isValidatorStage = stageOutputs.length === 0 && stage.auto;

    console.log(`── ${stage.label} (${stage.id}) ──`);

    let stageBroken = false;

    // 0. Check input artifacts exist (for ALL stages, not just --from mode)
    for (const artifactId of stageInputs) {
      const result = checkArtifact(artifactId);
      if (!result.exists) {
        const style = failureStyle(result.failurePolicy);
        console.log(`  ${style}: input ${artifactId} (${path.basename(result.path)}) — MISSING [${result.failurePolicy}]`);
        if (result.failurePolicy === 'hard_fail') {
          if (!firstBrokenStage) firstBrokenStage = stage;
          stageBroken = true;
        }
      }
    }

    // 1. Check output artifacts exist
    for (const artifact of stageArtifacts) {
      const result = checkArtifact(artifact.id);
      if (!result.exists) {
        const style = failureStyle(result.failurePolicy);
        console.log(`  ${style}: ${artifact.id} (${path.basename(result.path)}) — MISSING [${result.failurePolicy}]`);
        if (result.failurePolicy === 'hard_fail') {
          if (!firstBrokenStage) firstBrokenStage = stage;
          stageBroken = true;
        }
      } else {
        console.log(`  ✓ ${artifact.id}`);
      }
    }

    // 2. Run stage's own script if it's an auto validator stage (outputs empty = pure validator)
    if (isValidatorStage) {
      console.log(`  → ${stage.script}:`);
      const result = runScript(stage.script, stage.label);
      if (result.passed) {
        console.log(`    PASS`);
      } else {
        console.log(`    FAIL`);
        if (result.output) console.log(result.output.split('\n').map(l => `    │ ${l}`).join('\n'));
        if (result.error) console.log(`    │ ${result.error}`);
        if (!firstBrokenStage) firstBrokenStage = stage;
        stageBroken = true;
        allPassed = false;
      }
    }

    // 3. Manual stages: note what's needed
    if (!stage.auto && !isValidatorStage) {
      console.log(`  ⏸  MANUAL — ${stage.manualInstruction || stage.note || 'Requires human/LLM intervention'}`);
    }

    // 4. For build stages (auto, has outputs), indicate validators that will gate downstream
    if (stageOutputs.length > 0 && stage.auto && stage.validators && stage.validators.length > 0) {
      console.log(`  Validated by: ${stage.validators.join(', ')}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n=== Verify Summary ===`);
  if (allPassed && !firstBrokenStage) {
    console.log(`VERIFY PASSED — all stages complete, all validators green.`);
  } else {
    console.log(`VERIFY FAILED`);
    if (firstBrokenStage) {
      const stage = firstBrokenStage;
      const isValidator = stage.outputs && stage.outputs.length === 0 && stage.auto;
      console.log(`\nFirst broken stage: ${stage.id} (${stage.label})`);

      if (isValidator && stage.dependsOn && stage.dependsOn.length > 0) {
        // Validator failed — the root cause is likely the build stage it depends on
        const parentStage = stages.find(s => s.id === stage.dependsOn[0]);
        if (parentStage && parentStage.rebuildCommand) {
          console.log(`Validator stage failed. Root cause is likely upstream.`);
          console.log(`Upstream rebuild: ${parentStage.rebuildCommand.replace('{runId}', runId)}`);
        }
        console.log(`Then re-verify:  node pipeline/verify.cjs --runId ${runId} --from ${stage.id}`);
      } else if (stage.auto && stage.rebuildCommand) {
        console.log(`Rebuild: ${stage.rebuildCommand.replace('{runId}', runId)}`);
      } else if (!stage.auto) {
        console.log(`This is a manual stage. Instruction:`);
        console.log(`  ${stage.manualInstruction || stage.note}`);
        console.log(`After completing manually, re-run:`);
        console.log(`  node pipeline/verify.cjs --runId ${runId} --from ${stage.id}`);
      }
    }
    process.exit(1);
  }
}

main();
