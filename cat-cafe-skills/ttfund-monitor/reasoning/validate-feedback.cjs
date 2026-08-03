// reasoning/validate-feedback.cjs — ttfund-monitor v2.6.0 (P3.2-A)
// Validates feedback.json against schema contract + semantic rules.
// Usage: node reasoning/validate-feedback.cjs --runId 20260708-1058-auto
// Exit code 0 = pass, 1 = blocked issues

const fs = require('fs');
const path = require('path');
const { runtimeRoot, runDir, skillRoot } = require('../lib/workspace.cjs');

const SCHEMA_PATH = path.join(skillRoot, 'reasoning', 'feedback-schema.json');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = runDir(runId);

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

const feedback = readJSON(path.join(RUN_DIR, 'feedback.json'));
const schema = readJSON(SCHEMA_PATH);

if (!schema) { console.error('FATAL: feedback-schema.json not found'); process.exit(1); }
if (!feedback) { console.error('FATAL: feedback.json not found'); process.exit(1); }

const errors = [];
const warnings = [];

const CONFIDENCE_LEVELS = schema.confidenceLevels || ['高', '中高', '中', '低'];
const ADJUSTMENT_TYPES = schema.adjustmentTypes || {};
const FORBIDDEN_ACTION_WORDS = schema.forbiddenActionWords || [];

// ── Helpers ──────────────────────────────────────────────────
function resolveField(obj, fieldPath) {
  // Resolve dot-separated path with optional [key] array notation.
  // e.g., "macro_regime.confidence" or "gold_rate_conflict.scenarios[China premium].probability"
  if (!obj || !fieldPath) return { found: false, value: undefined };

  const parts = fieldPath.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return { found: false, value: undefined };

    const arrMatch = part.match(/^(.+?)\[(.+?)\]$/);
    if (arrMatch) {
      const [, key, indexKey] = arrMatch;
      if (!current[key] || !Array.isArray(current[key])) return { found: false, value: undefined };

      // Try numeric index first, then string match on a display field
      const numIdx = parseInt(indexKey, 10);
      if (!isNaN(numIdx) && numIdx < current[key].length) {
        current = current[key][numIdx];
      } else {
        // String match: find array element where a key field (e.g., "scenario") matches
        const found = current[key].find(item =>
          Object.values(item).some(v =>
            typeof v === 'string' && v.includes(indexKey)
          )
        );
        current = found || undefined;
      }
    } else {
      current = current[part];
    }
  }

  return { found: current !== undefined && current !== null, value: current };
}

function isValidFieldPath(fieldPath) {
  if (!fieldPath || typeof fieldPath !== 'string') return false;
  // Must match: word.word or word[key].word pattern
  return /^[a-zA-Z_]\w*(\[(.+?)\])?(\.[a-zA-Z_]\w*(\[(.+?)\])?)*$/.test(fieldPath);
}

// ── V1: Meta inputs existence ────────────────────────────────
console.log('=== feedback validator v1.0.0 ===');
console.log(`runId: ${runId}\n`);

const meta = feedback.meta || {};
const inputs = meta.inputs || {};

// reasoning-snapshot.json
const reasoningPath = inputs.reasoningSnapshot || path.join(RUN_DIR, 'reasoning-snapshot.json');
const reasoning = readJSON(reasoningPath);
if (!reasoning) {
  errors.push('V1: reasoning-snapshot.json not found or unreadable');
} else {
  console.log('  V1 OK: reasoning-snapshot.json readable');
}

// temporal-diff.json
const temporalPath = inputs.temporalDiff || path.join(RUN_DIR, 'temporal-diff.json');
const temporal = temporalPath === 'missing' ? null : readJSON(temporalPath);
if (inputs.temporalDiff === 'missing') {
  warnings.push('V1: temporal-diff.json missing — R3 rules were skipped');
} else if (!temporal) {
  warnings.push('V1: temporal-diff.json not found or unreadable');
} else {
  console.log('  V1 OK: temporal-diff.json readable');
}

// evidence-packet.json
const evidencePath = inputs.evidencePacket || path.join(RUN_DIR, 'evidence-packet.json');
const evidence = evidencePath === 'missing' ? null : readJSON(evidencePath);
if (inputs.evidencePacket === 'missing') {
  warnings.push('V1: evidence-packet.json missing');
} else if (!evidence) {
  warnings.push('V1: evidence-packet.json not found or unreadable');
} else {
  console.log('  V1 OK: evidence-packet.json readable');
}

// ── V2 & V3: Field path validation ───────────────────────────
const crossRefs = feedback.cross_refs || [];
let v2errors = 0;
let v3errors = 0;

for (const ref of crossRefs) {
  // V2: from_field must resolve in source blueprint
  if (ref.from_blueprint === 'temporal-diff' && temporal) {
    const result = resolveField(temporal, ref.from_field);
    if (!result.found && ref.from_field) {
      errors.push(`V2: FB ${ref.id} — from_field "${ref.from_field}" not found in temporal-diff.json`);
      v2errors++;
    }
  } else if (ref.from_blueprint !== 'temporal-diff' && reasoning) {
    const result = resolveField(reasoning, ref.from_field);
    if (!result.found && ref.from_field) {
      errors.push(`V2: FB ${ref.id} — from_field "${ref.from_field}" not found in reasoning-snapshot.json`);
      v2errors++;
    }
  }

  // V3: to_field must have valid path format
  if (!isValidFieldPath(ref.to_field)) {
    errors.push(`V3: FB ${ref.id} — to_field "${ref.to_field}" has invalid format`);
    v3errors++;
  }

  // V6: No override/replace type
  if (ref.adjustment?.type === 'override' || ref.adjustment?.type === 'replace') {
    errors.push(`V6: FB ${ref.id} — forbidden adjustment type "${ref.adjustment.type}" (override/replace not allowed)`);
  }
}

if (v2errors === 0) console.log('  V2 OK: all from_field paths resolvable');
if (v3errors === 0) console.log('  V3 OK: all to_field paths valid');

// ── V4 & V5: Bound checks ────────────────────────────────────
let v4errors = 0;

for (const ref of crossRefs) {
  const adj = ref.adjustment || {};
  const typeDef = ADJUSTMENT_TYPES[adj.type];

  if (typeDef) {
    // V4: single delta ≤ singleCap
    const singleCap = adj.singleCap ?? typeDef.singleCap;
    if (Math.abs(adj.delta) > singleCap) {
      errors.push(`V4: FB ${ref.id} — delta ${adj.delta} exceeds singleCap ${singleCap} (type: ${adj.type})`);
      v4errors++;
    }
  }
}

if (v4errors === 0) console.log('  V4 OK: all deltas within singleCap');

// V5: cumulative caps
const cumCaps = feedback.adjustment_summary?.cumulative_caps || {};
let v5errors = 0;

for (const [target, info] of Object.entries(cumCaps)) {
  if (!info.ok) {
    errors.push(`V5: target "${target}" — cumulative delta ${info.totalDelta} exceeds cap ${info.cap}`);
    v5errors++;
  }
}

// Also recompute cumulative caps from cross_refs to verify adjustment_summary
const computedCaps = {};
for (const ref of crossRefs) {
  const key = ref.adjustment.target;
  if (!computedCaps[key]) computedCaps[key] = 0;
  computedCaps[key] += Math.abs(ref.adjustment.delta);
}

for (const [target, info] of Object.entries(cumCaps)) {
  const computed = computedCaps[target] || 0;
  if (Math.abs(computed - info.totalDelta) > 0.01) {
    errors.push(`V5: target "${target}" — adjustment_summary totalDelta ${info.totalDelta} != computed ${computed}`);
    v5errors++;
  }
}

if (v5errors === 0) console.log('  V5 OK: all cumulative caps respected');

// ── V7: Unique IDs ───────────────────────────────────────────
const ids = crossRefs.map(r => r.id);
const uniqueIds = new Set(ids);
const invalidIds = ids.filter(id => !/^FB-\d{3,}$/.test(id));

if (uniqueIds.size !== ids.length) {
  errors.push(`V7: duplicate cross_ref IDs found (${ids.length} refs, ${uniqueIds.size} unique)`);
}
if (invalidIds.length > 0) {
  errors.push(`V7: invalid ID format: ${invalidIds.join(', ')} (expected FB-NNN)`);
}
if (uniqueIds.size === ids.length && invalidIds.length === 0) {
  console.log('  V7 OK: all cross_ref IDs unique and valid');
}

// ── V8: confidence_shift range ───────────────────────────────
let v8errors = 0;

for (const ref of crossRefs) {
  if (ref.adjustment?.type === 'confidence_shift') {
    const adj = ref.adjustment;
    if (Math.abs(adj.delta) > 1) {
      errors.push(`V8: FB ${ref.id} — confidence_shift delta ${adj.delta} exceeds ±1`);
      v8errors++;
    }
    if (adj.min && !CONFIDENCE_LEVELS.includes(adj.min)) {
      errors.push(`V8: FB ${ref.id} — confidence_shift min "${adj.min}" not in ${CONFIDENCE_LEVELS.join(', ')}`);
      v8errors++;
    }
    if (adj.max && !CONFIDENCE_LEVELS.includes(adj.max)) {
      errors.push(`V8: FB ${ref.id} — confidence_shift max "${adj.max}" not in ${CONFIDENCE_LEVELS.join(', ')}`);
      v8errors++;
    }
  }
}

if (v8errors === 0) console.log('  V8 OK: confidence_shift ranges valid');

// ── V9: adjustment_summary consistency ───────────────────────
const summary = feedback.adjustment_summary || {};
let v9errors = 0;

if (summary.total !== crossRefs.length) {
  errors.push(`V9: adjustment_summary.total ${summary.total} != actual cross_refs ${crossRefs.length}`);
  v9errors++;
}

// by_type check
const actualByType = {};
for (const ref of crossRefs) {
  const t = ref.adjustment.type;
  actualByType[t] = (actualByType[t] || 0) + 1;
}
for (const [type, count] of Object.entries(summary.by_type || {})) {
  if (actualByType[type] !== count) {
    errors.push(`V9: by_type.${type} expected ${actualByType[type] || 0}, got ${count}`);
    v9errors++;
  }
}

// by_target_blueprint check
const actualByTarget = {};
for (const ref of crossRefs) {
  const t = ref.to_blueprint;
  actualByTarget[t] = (actualByTarget[t] || 0) + 1;
}
for (const [target, count] of Object.entries(summary.by_target_blueprint || {})) {
  if (actualByTarget[target] !== count) {
    errors.push(`V9: by_target_blueprint.${target} expected ${actualByTarget[target] || 0}, got ${count}`);
    v9errors++;
  }
}

if (v9errors === 0) console.log('  V9 OK: adjustment_summary consistent with cross_refs');

// ── V10: Circular references ─────────────────────────────────
let v10errors = 0;

for (let i = 0; i < crossRefs.length; i++) {
  for (let j = i + 1; j < crossRefs.length; j++) {
    const a = crossRefs[i];
    const b = crossRefs[j];

    // A→B on same field and B→A on same field = circular
    if (a.from_blueprint === b.to_blueprint &&
        b.from_blueprint === a.to_blueprint &&
        a.from_field === b.to_field &&
        b.from_field === a.to_field) {
      errors.push(`V10: circular reference between FB ${a.id} and FB ${b.id} (${a.from_blueprint}↔${b.from_blueprint} on same fields)`);
      v10errors++;
    }
  }
}

if (v10errors === 0) console.log('  V10 OK: no circular references');

// ── V11: Blocker semantics ───────────────────────────────────
let v11errors = 0;

// action_advice_allowed from reasoning meta or from feedback adjustment_summary
const actionAllowed = reasoning?.meta?.action_advice_allowed;
const feedbackActionAllowed = feedback.adjustment_summary?.action_advice_allowed;

if (actionAllowed === false || feedbackActionAllowed === false) {
  const conditionToActRefs = crossRefs.filter(r => r.adjustment.type === 'add_condition_to_act');
  if (conditionToActRefs.length > 0) {
    errors.push(`V11: action_advice_allowed=false but ${conditionToActRefs.length} add_condition_to_act refs found: ${conditionToActRefs.map(r => r.id).join(', ')}`);
    v11errors++;
  }

  // add_invalidation_condition allowed but reason must start with "blocked: "
  const invalidConditions = crossRefs.filter(r =>
    r.adjustment.type === 'add_invalidation_condition' &&
    !r.adjustment.reason.startsWith('blocked: ')
  );
  if (invalidConditions.length > 0) {
    errors.push(`V11: action_advice_allowed=false — ${invalidConditions.length} add_invalidation_condition ref(s) must have reason prefixed "blocked: " (got: ${invalidConditions.map(r => r.id + ':' + r.adjustment.reason.slice(0, 40)).join(', ')})`);
    v11errors++;
  }
}

if (v11errors === 0) console.log('  V11 OK: blocker semantics respected');

// ── V12: Forbidden action words ──────────────────────────────
let v12errors = 0;

for (const ref of crossRefs) {
  const adj = ref.adjustment || {};
  const checkFields = [
    adj.value || '',
    adj.reason || '',
    ref.signal || ''
  ];

  for (const word of FORBIDDEN_ACTION_WORDS) {
    const wordLower = word.toLowerCase();
    for (const field of checkFields) {
      if (field.toLowerCase().includes(wordLower)) {
        errors.push(`V12: FB ${ref.id} — forbidden action word "${word}" found in adjustment "${field.slice(0, 80)}"`);
        v12errors++;
        break; // one error per ref is enough
      }
    }
  }
}

if (v12errors === 0) console.log('  V12 OK: no forbidden action words');

// ── Meta fields validation ───────────────────────────────────
if (!meta.version) errors.push('META: version missing');
if (!meta.builtAt) errors.push('META: builtAt missing');
if (!meta.runId) errors.push('META: runId missing');
if (meta.runId !== runId) errors.push(`META: runId mismatch (meta: ${meta.runId}, CLI: ${runId})`);

// ── Output ───────────────────────────────────────────────────
console.log(`\n=== Results: ${errors.length} error(s), ${warnings.length} warning(s) ===`);

if (errors.length > 0) {
  console.log('ERRORS:');
  errors.forEach(e => console.log(`  ❌ ${e}`));
}
if (warnings.length > 0) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log(`  ⚠️  ${w}`));
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('  ✅ All 12 checks passed.');
}

process.exit(errors.length > 0 ? 1 : 0);
