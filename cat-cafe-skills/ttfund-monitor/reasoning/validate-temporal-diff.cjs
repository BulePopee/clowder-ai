// reasoning/validate-temporal-diff.cjs — ttfund-monitor v2.6.0 (P3.1)
// Structural + semantic validation of temporal-diff.json against temporal-diff-schema.json.
// Correction #1 (缅因猫): MUST PASS for ok/degraded status. Pipeline gates on this.
// For no_baseline: validates output well-formedness, skips comparison checks.
// Usage: node reasoning/validate-temporal-diff.cjs --runId 20260708-1058-auto
// Exit code 0 = pass, 1 = blocked issues

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME, skillRoot } = require('../lib/workspace.cjs');
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

const diff = readJSON(path.join(RUN_DIR, 'temporal-diff.json'));
const schema = readJSON(path.join(skillRoot, 'reasoning', 'temporal-diff-schema.json'));
const reasoning = readJSON(path.join(RUN_DIR, 'reasoning-snapshot.json'));

if (!diff) { console.error('FATAL: temporal-diff.json not found'); process.exit(1); }
if (!schema) { console.error('FATAL: temporal-diff-schema.json not found'); process.exit(1); }

const errors = [];
const warnings = [];

// ── Structural validation against schema ─────────────────────
function validateSchemaNode(schemaNode, data, jsonPath) {
  if (!schemaNode || typeof schemaNode !== 'object') return;
  if (schemaNode.type === 'array') {
    if (!Array.isArray(data)) {
      errors.push(`SCHEMA(${jsonPath}): expected array, got ${typeof data}`);
      return;
    }
    if (schemaNode.items && typeof schemaNode.items === 'object') {
      data.forEach((item, i) => validateSchemaNode(schemaNode.items, item, `${jsonPath}[${i}]`));
    }
    return;
  }
  if (schemaNode.type === 'object') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      const label = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
      errors.push(`SCHEMA(${jsonPath}): expected object, got ${label}`);
      return;
    }
    if (schemaNode.required) {
      for (const req of schemaNode.required) {
        if (!(req in data)) {
          errors.push(`SCHEMA(${jsonPath}): missing required field "${req}"`);
        }
      }
    }
    if (schemaNode.additionalProperties === false && schemaNode.properties) {
      const allowed = Object.keys(schemaNode.properties);
      for (const k of Object.keys(data)) {
        if (!allowed.includes(k)) {
          errors.push(`SCHEMA(${jsonPath}): unknown field "${k}" (not in schema)`);
        }
      }
    }
    if (schemaNode.properties) {
      for (const [prop, subSchema] of Object.entries(schemaNode.properties)) {
        if (data[prop] !== undefined) {
          validateSchemaNode(subSchema, data[prop], jsonPath ? `${jsonPath}.${prop}` : prop);
        }
      }
    }
    return;
  }
  const typeMap = { string: 'string', number: 'number', boolean: 'boolean' };
  const expected = typeMap[schemaNode.type];
  if (expected) {
    const actual = typeof data;
    if (actual !== expected && data != null) {
      errors.push(`SCHEMA(${jsonPath}): expected ${expected}, got ${actual}`);
    }
  }
  if (schemaNode.enum && !schemaNode.enum.includes(data)) {
    errors.push(`SCHEMA(${jsonPath}): "${data}" not in allowed values [${schemaNode.enum.join(', ')}]`);
  }
}

validateSchemaNode(schema, diff, '');

// ── Semantic validation ──────────────────────────────────────
const status = diff.meta?.status;

// 1. Meta consistency
if (status !== 'no_baseline') {
  if (!diff.meta?.baselineRunId) {
    errors.push(`META: status=${status} but baselineRunId is null`);
  }
  if (status === 'ok' && diff.meta?.baselineStatus !== 'validated') {
    warnings.push(`META: status=ok but baselineStatus=${diff.meta?.baselineStatus} (expected 'validated')`);
  }
}

// 2. Directional changes reasonableness (ok/degraded only)
if (status !== 'no_baseline') {
  const changes = diff.directional_changes || [];

  if (changes.length === 0) {
    errors.push('CHANGES: status is not no_baseline but directional_changes is empty');
  }

  // Count directions
  const dirCounts = {};
  for (const c of changes) {
    dirCounts[c.direction] = (dirCounts[c.direction] || 0) + 1;

    // Check that delta and direction are consistent
    if (c.direction === 'up' && c.delta != null && c.delta <= 0) {
      errors.push(`CHANGES(${c.indicator}): direction=up but delta=${c.delta}`);
    }
    if (c.direction === 'down' && c.delta != null && c.delta >= 0) {
      errors.push(`CHANGES(${c.indicator}): direction=down but delta=${c.delta}`);
    }
    if (c.direction === 'flat' && c.delta != null && Math.abs(c.delta) > 1e-10) {
      errors.push(`CHANGES(${c.indicator}): direction=flat but delta=${c.delta} (non-zero)`);
    }

    // new/lost must have null delta
    if ((c.direction === 'new' || c.direction === 'lost') && c.delta != null) {
      errors.push(`CHANGES(${c.indicator}): direction=${c.direction} but delta is not null`);
    }
    // new must have currentValue, lost must have baselineValue
    if (c.direction === 'new' && c.currentValue == null) {
      errors.push(`CHANGES(${c.indicator}): direction=new but currentValue is null`);
    }
    if (c.direction === 'lost' && c.baselineValue == null) {
      errors.push(`CHANGES(${c.indicator}): direction=lost but baselineValue is null`);
    }
  }

  // Warn if many unknowns
  if ((dirCounts['unknown'] || 0) > changes.length * 0.3) {
    warnings.push(`CHANGES: ${dirCounts['unknown']}/${changes.length} indicators unknown (>30%)`);
  }

  // 3. Consistency check reasonableness
  const cc = diff.consistency_check;
  if (cc) {
    for (const pair of (cc.divergent_pairs || [])) {
      if (!pair.pair || !pair.a || !pair.b) {
        errors.push(`CONSISTENCY: divergent pair missing required fields`);
      }
    }
  }

  // 4. Regime stability
  const rs = diff.regime_stability;
  if (rs) {
    if (rs.regimeChanged == null) {
      errors.push(`REGIME: regimeChanged must be boolean`);
    }
    if (rs.regimeChanged === true && rs.keyDifferences.length === 0) {
      warnings.push(`REGIME: regimeChanged=true but keyDifferences is empty`);
    }
  }

  // 5. Threshold crossings
  const tc = diff.threshold_crossings;
  if (tc) {
    for (const c of (tc.crossed || [])) {
      if (!c.indicator || !c.threshold) {
        errors.push(`THRESHOLD: crossed entry missing indicator or threshold`);
      }
      if (c.from === c.to) {
        warnings.push(`THRESHOLD(${c.indicator}): from === to (${c.from}), not a real crossing`);
      }
    }
  }
}

// 6. no_baseline: verify well-formedness
if (status === 'no_baseline') {
  if (diff.meta?.baselineRunId != null) {
    errors.push(`META: status=no_baseline but baselineRunId=${diff.meta.baselineRunId} is not null`);
  }
  if ((diff.directional_changes || []).length > 0) {
    errors.push(`CHANGES: status=no_baseline but directional_changes is not empty`);
  }
  if (diff.consistency_check?.summary !== '无可比基线') {
    warnings.push(`CONSISTENCY: no_baseline summary should be '无可比基线'`);
  }
}

// ── Output ───────────────────────────────────────────────────
console.log('=== temporal-diff validator v1.0.0 ===');
console.log(`runId: ${runId}`);
console.log(`status: ${status}\n`);

if (errors.length > 0) {
  console.log(`BLOCKED: ${errors.length} error(s):`);
  errors.forEach(e => console.log(`  ❌ ${e}`));
}
if (warnings.length > 0) {
  console.log(`WARNINGS: ${warnings.length}:`);
  warnings.forEach(w => console.log(`  ⚠️  ${w}`));
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('  ✅ All checks passed.');
}

console.log(`\nResult: ${errors.length} errors, ${warnings.length} warnings`);

// All statuses: errors are hard fail; only warnings are non-blocking.
if (errors.length > 0) {
  console.error(`FATAL: temporal-diff validation failed with ${errors.length} error(s)\n`);
  process.exit(1);
}

const passNote = status === 'no_baseline' ? ' (no_baseline — report uses "无可比基线" path)' : '';
console.log(`PASS${passNote}\n`);
process.exit(0);
