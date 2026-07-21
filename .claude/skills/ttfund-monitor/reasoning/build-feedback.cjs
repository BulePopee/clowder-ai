// reasoning/build-feedback.cjs — ttfund-monitor v2.6.0 (P3.2-A)
// A-layer deterministic cross-blueprint feedback engine.
// Reads reasoning-snapshot.json + temporal-diff.json + evidence-packet.json,
// applies rule sets R1-R4, outputs feedback.json.
// Does NOT access external data sources.
// Usage: node reasoning/build-feedback.cjs --runId 20260708-1058-auto
// Output: runs/{runId}/feedback.json

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
const now = new Date();
const builtAt = now.toISOString();

// ── Helpers ──────────────────────────────────────────────────
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { return null; }
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const CONFIDENCE_LEVELS = schema.confidenceLevels;
const INDICATOR_MAP = schema.indicatorToBlueprint;

// Critical indicator IDs (Tier 1 in temporal-diff or Core in guard rules)
const CRITICAL_IDS = new Set([
  'B1','B2','B3','B6','B8','B9','F1','F2','G2','G4','G7',
  'X1','X3','X4','E1','E2','E3','S1','O1'
]);

let nextFbId = 0;
function emitFeedback(obj) {
  nextFbId++;
  const id = `FB-${String(nextFbId).padStart(3, '0')}`;
  return {
    id,
    from_blueprint: obj.from_blueprint,
    from_field: obj.from_field || '',
    from_value: obj.from_value ?? null,
    to_blueprint: obj.to_blueprint,
    to_field: obj.to_field,
    signal: obj.signal || '',
    adjustment: {
      type: obj.type,
      target: obj.to_field,
      unit: obj.unit || 'percentage_point',
      delta: obj.delta || 0,
      singleCap: obj.singleCap ?? schema.adjustmentTypes[obj.type]?.singleCap ?? 0,
      cumulativeCap: obj.cumulativeCap ?? schema.adjustmentTypes[obj.type]?.cumulativeCap ?? 0,
      ...(obj.type === 'confidence_shift' ? {
        min: CONFIDENCE_LEVELS[CONFIDENCE_LEVELS.length - 1],
        max: CONFIDENCE_LEVELS[0]
      } : {}),
      ...(obj.value ? { value: obj.value } : {}),
      reason: obj.reason || ''
    }
  };
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  console.log('=== cross-blueprint feedback builder v1.0.0 ===');
  console.log(`runId: ${runId}`);
  console.log(`builtAt: ${builtAt}\n`);

  // Load inputs
  const reasoning = readJSON(path.join(RUN_DIR, 'reasoning-snapshot.json'));
  const temporal = readJSON(path.join(RUN_DIR, 'temporal-diff.json'));
  const evidence = readJSON(path.join(RUN_DIR, 'evidence-packet.json'));

  if (!reasoning) { console.error('FATAL: reasoning-snapshot.json not found'); process.exit(1); }
  if (!temporal) { console.warn('WARNING: temporal-diff.json not found — temporal rules (R3) will be skipped'); }
  if (!evidence) { console.warn('WARNING: evidence-packet.json not found — indicator values unavailable'); }

  const temporalDegraded = temporal?.meta?.status === 'degraded';
  if (temporalDegraded) console.log('  INFO: temporal-diff status=degraded — R3 delta scaled by 0.5');
  console.log(`  temporal status: ${temporal?.meta?.status || 'missing'}\n`);

  const crossRefs = [];

  // ── Extract values from reasoning snapshot ─────────────────
  const macro = reasoning.macro_regime || {};
  const gold = reasoning.gold_rate_conflict || {};
  const portfolio = reasoning.portfolio_action_gate || {};

  const regime = macro.steps?.step5_regime_classification?.regime || '';
  const regimeClaim = macro.regime_claim || '';
  const macroConfidence = macro.confidence || '';
  const goldScore = gold.weighted_score?.total ?? null;
  const realRateTrend = macro.steps?.step1_real_rate?.trend || '';
  const portfolioRec = portfolio.recommendation || '';
  const actionAdviceAllowed = reasoning.meta?.action_advice_allowed !== false;

  // Extract DXY from evidence packet
  let dxy = null;
  if (evidence) {
    const dxyEntry = (evidence.evidence || []).find(e => e.indicator === 'X1');
    if (dxyEntry && typeof dxyEntry.value === 'number') dxy = dxyEntry.value;
  }

  // ── R1: Macro Regime → Gold ────────────────────────────────
  console.log('── R1: Macro Regime → Gold ──');

  if (regime.includes('Divergence')) {
    const fb = emitFeedback({
      from_blueprint: 'macro-regime',
      from_field: 'macro_regime.steps.step5_regime_classification.regime',
      from_value: regime,
      to_blueprint: 'gold-rate-conflict',
      to_field: 'gold_rate_conflict.scenarios[FOMC July 29 hold + dovish signal].probability',
      type: 'scenario_probability_shift',
      unit: 'percentage_point',
      delta: 10,
      signal: 'Policy Divergence → US-China macro decoupling → gold safe-haven demand structurally elevated',
      reason: 'Policy Divergence regime strengthens structural gold demand narrative'
    });
    crossRefs.push(fb);
    console.log(`  ${fb.id}: scenario_probability_shift +10pp → gold (Policy Divergence)`);
  }

  if (regime === 'Risk-Off') {
    const fb = emitFeedback({
      from_blueprint: 'macro-regime',
      from_field: 'macro_regime.steps.step5_regime_classification.regime',
      from_value: regime,
      to_blueprint: 'gold-rate-conflict',
      to_field: 'gold_rate_conflict.scenarios[Geopolitical shock or financial accident].probability',
      type: 'scenario_probability_shift',
      unit: 'percentage_point',
      delta: 15,
      signal: 'Risk-Off → flight to safety demand for gold intensifies',
      reason: 'Risk-Off regime significantly elevates safe-haven gold demand'
    });
    crossRefs.push(fb);
    console.log(`  ${fb.id}: scenario_probability_shift +15pp → gold (Risk-Off)`);
  }

  if (regime === 'Stagflation-Lite') {
    const fb = emitFeedback({
      from_blueprint: 'macro-regime',
      from_field: 'macro_regime.steps.step5_regime_classification.regime',
      from_value: regime,
      to_blueprint: 'gold-rate-conflict',
      to_field: 'gold_rate_conflict.scenarios[FOMC July 29 hold + dovish signal].probability',
      type: 'scenario_probability_shift',
      unit: 'percentage_point',
      delta: 10,
      signal: 'Stagflation-Lite → gold as inflation hedge demand increases',
      reason: 'Stagflation environment increases gold\'s inflation-hedge appeal'
    });
    crossRefs.push(fb);
    console.log(`  ${fb.id}: scenario_probability_shift +10pp → gold (Stagflation-Lite)`);
  }

  // ── R2: Gold → Macro Regime ────────────────────────────────
  console.log('\n── R2: Gold → Macro Regime ──');

  // R2.1: Gold score ≤ -0.5 + DXY > 102 → confidence downgrade
  if (goldScore !== null && goldScore <= -0.5 && dxy !== null && dxy > 102) {
    const fb = emitFeedback({
      from_blueprint: 'gold-rate-conflict',
      from_field: 'gold_rate_conflict.weighted_score.total',
      from_value: goldScore,
      to_blueprint: 'macro-regime',
      to_field: 'macro_regime.confidence',
      type: 'confidence_shift',
      unit: 'level',
      delta: -1,
      signal: `Gold score ${goldScore} + DXY ${dxy} → both signaling tighter-than-regime-suggests conditions`,
      reason: 'Gold + DXY both signaling tighter conditions than current regime assessment implies'
    });
    crossRefs.push(fb);
    console.log(`  ${fb.id}: confidence_shift -1 → macro (gold≤-0.5 + DXY>102)`);
  }

  // R2.2: Gold structural flows inconsistent with Risk-Off
  // Check for CB accumulating + SPDR inflows from gold steps
  const cbTrend = gold.steps?.step2_positioning?.cb_trend || '';
  const spdrTrend = gold.steps?.step2_positioning?.spdr_trend || '';
  if (cbTrend === 'accumulating' && spdrTrend === 'inflows' && regime === 'Risk-Off') {
    const fb = emitFeedback({
      from_blueprint: 'gold-rate-conflict',
      from_field: 'gold_rate_conflict.steps.step2_positioning',
      from_value: { cb_trend: cbTrend, spdr_trend: spdrTrend },
      to_blueprint: 'macro-regime',
      to_field: 'macro_regime.confidence',
      type: 'confidence_shift',
      unit: 'level',
      delta: -1,
      signal: 'Gold structural flows (CB accumulating + SPDR inflows) inconsistent with pure Risk-Off',
      reason: 'Gold structural flows inconsistent with pure Risk-Off classification'
    });
    crossRefs.push(fb);
    console.log(`  ${fb.id}: confidence_shift -1 → macro (gold structural vs Risk-Off)`);
  }

  // ── R3: Temporal Diff → All Blueprints ────────────────────
  console.log('\n── R3: Temporal Diff → Blueprints ──');

  const tScale = temporalDegraded ? 0.5 : 1.0;
  let allThresholds = [];
  let approaching = [];
  let crossed = [];

  if (temporal) {
    const changes = temporal.directional_changes || [];

    // R3.1: Tier 1 indicators with significant magnitude → add invalidation conditions
    const significantChanges = changes.filter(c =>
      CRITICAL_IDS.has(c.indicator) && c.tier === 1 && c.magnitude === 'significant'
    );

    const addCount = Math.round(significantChanges.length * tScale);
    const toAdd = significantChanges.slice(0, addCount);

    for (const change of toAdd) {
      const targetBlueprint = INDICATOR_MAP[change.indicator] || 'macro-regime';
      const fb = emitFeedback({
        from_blueprint: 'temporal-diff',
        from_field: `directional_changes[${change.indicator}]`,
        from_value: { indicator: change.indicator, direction: change.direction, delta: change.delta, magnitude: change.magnitude },
        to_blueprint: targetBlueprint,
        to_field: targetBlueprint === 'macro-regime'
          ? 'macro_regime.invalidate_if'
          : 'gold_rate_conflict.invalidate_if',
        type: 'add_invalidation_condition',
        unit: 'text',
        delta: 1,
        value: `${change.indicator} (${change.name}) ${change.direction} ${change.deltaDisplay} in ${temporal.meta.daysSinceBaseline}d — may indicate regime shift starting`,
        reason: `${!actionAdviceAllowed ? 'blocked: ' : ''}${change.indicator} showed significant ${change.direction} movement (${change.deltaDisplay}) over ${temporal.meta.daysSinceBaseline}d`
      });
      crossRefs.push(fb);
      console.log(`  ${fb.id}: add_invalidation_condition → ${targetBlueprint} (${change.indicator} significant ${change.direction})`);
    }

    if (significantChanges.length > 0 && addCount === 0 && temporalDegraded) {
      console.log('  (R3.1: significant changes found but suppressed by temporal degraded scaling)');
    } else if (significantChanges.length === 0) {
      console.log('  (R3.1: no significant changes — skipped)');
    }

    // R3.2: Threshold crossings → add conditions_to_act
    approaching = temporal.threshold_crossings?.approaching || [];
    crossed = temporal.threshold_crossings?.crossed || [];
    allThresholds = [...crossed, ...approaching];

    // Filter: only emit for thresholds relevant to portfolio action gate
    const portfolioThresholds = allThresholds.filter(t =>
      /US 10Y|TIPS|VIX|DXY|CN 10Y|Defensive/i.test(t.threshold || '')
    );

    const thresholdCount = Math.round(Math.min(portfolioThresholds.length, 2) * tScale);
    for (let i = 0; i < thresholdCount; i++) {
      const t = portfolioThresholds[i];
      const fb = emitFeedback({
        from_blueprint: 'temporal-diff',
        from_field: `threshold_crossings.${crossed.includes(t) ? 'crossed' : 'approaching'}[${i}]`,
        from_value: { indicator: t.indicator, threshold: t.threshold, currentValue: t.currentValue, distance: t.distance },
        to_blueprint: 'portfolio-action-gate',
        to_field: 'portfolio_action_gate.action_gate.conditions_to_act',
        type: 'add_condition_to_act',
        unit: 'text',
        delta: 1,
        value: `If ${t.indicator} ${t.threshold} → defensive trigger may activate, re-evaluate portfolio stance`,
        reason: `${t.indicator} is ${t.distance || 'near'} threshold ${t.threshold}`
      });
      crossRefs.push(fb);
      console.log(`  ${fb.id}: add_condition_to_act → portfolio (${t.indicator} → ${t.threshold})`);
    }

    if (thresholdCount === 0 && allThresholds.length > 0) {
      console.log('  (R3.2: thresholds found but suppressed by temporal degraded scaling or filter)');
    } else if (allThresholds.length === 0) {
      console.log('  (R3.2: no threshold crossings — skipped)');
    }
  }

  // ── R4: Cross-Blueprint Conflict Detection ─────────────────
  console.log('\n── R4: Cross-Blueprint Conflict Detection ──');

  // R4.1: Macro real rate trend vs gold signal conflict
  if (realRateTrend && goldScore !== null) {
    const macroEasing = /falling|declining|easing/i.test(realRateTrend);
    const goldBearish = goldScore <= -0.3;

    if (macroEasing && goldBearish) {
      const fb = emitFeedback({
        from_blueprint: 'macro-regime',
        from_field: 'macro_regime.steps.step1_real_rate.trend',
        from_value: realRateTrend,
        to_blueprint: 'gold-rate-conflict',
        to_field: 'gold_rate_conflict.scenarios[FOMC July 29 hawkish hold or surprise hike].probability',
        type: 'scenario_probability_shift',
        unit: 'percentage_point',
        delta: 5,
        signal: `Macro real rate trend "${realRateTrend}" (easing) contradicts gold model score ${goldScore} (bearish)`,
        reason: 'Easing-rate narrative not confirmed by gold market pricing — add positioning caution'
      });
      crossRefs.push(fb);
      console.log(`  ${fb.id}: scenario_probability_shift +5pp → gold hawk scenario (rate/gold conflict)`);
    }
  }

  // R4.2: Portfolio HOLD but temporal shows approaching thresholds
  if (portfolioRec === '维持' && temporal && allThresholds && allThresholds.length > 0 && !temporalDegraded) {
    // Check if R3.2 already emitted conditions_to_act for portfolio
    const existingPortfolioConditions = crossRefs.filter(r =>
      r.adjustment.type === 'add_condition_to_act' &&
      r.to_blueprint === 'portfolio-action-gate'
    );

    if (existingPortfolioConditions.length === 0) {
      const fb = emitFeedback({
        from_blueprint: 'temporal-diff',
        from_field: 'threshold_crossings',
        from_value: { approaching: approaching.length, crossed: crossed.length },
        to_blueprint: 'portfolio-action-gate',
        to_field: 'portfolio_action_gate.action_gate.conditions_to_act',
        type: 'add_condition_to_act',
        unit: 'text',
        delta: 1,
        value: 'Monitor approaching thresholds — HOLD recommendation may need re-evaluation next run',
        reason: 'Temporal diff shows movement toward defensive thresholds while portfolio recommends HOLD'
      });
      crossRefs.push(fb);
      console.log(`  ${fb.id}: add_condition_to_act → portfolio (HOLD + approaching thresholds)`);
    } else {
      console.log('  (R4.2: already covered by R3.2 threshold conditions)');
    }
  }

  // ── Build adjustment summary ───────────────────────────────
  const byType = {};
  const byTarget = {};
  const cumulativeCaps = {};

  for (const ref of crossRefs) {
    const t = ref.adjustment.type;
    byType[t] = (byType[t] || 0) + 1;

    const target = ref.to_blueprint;
    byTarget[target] = (byTarget[target] || 0) + 1;

    const key = ref.adjustment.target;
    if (!cumulativeCaps[key]) {
      cumulativeCaps[key] = { totalDelta: 0, cap: ref.adjustment.cumulativeCap, ok: true };
    }
    cumulativeCaps[key].totalDelta += Math.abs(ref.adjustment.delta);
    cumulativeCaps[key].ok = cumulativeCaps[key].totalDelta <= cumulativeCaps[key].cap;
  }

  // ── Assemble feedback.json ─────────────────────────────────
  const feedback = {
    meta: {
      version: '1.0.0',
      builtAt,
      runId,
      inputs: {
        reasoningSnapshot: path.join(RUN_DIR, 'reasoning-snapshot.json'),
        temporalDiff: temporal ? path.join(RUN_DIR, 'temporal-diff.json') : 'missing',
        evidencePacket: evidence ? path.join(RUN_DIR, 'evidence-packet.json') : 'missing'
      },
      temporalDiffStatus: temporal?.meta?.status || 'missing'
    },
    cross_refs: crossRefs,
    adjustment_summary: {
      total: crossRefs.length,
      by_type: byType,
      by_target_blueprint: byTarget,
      cumulative_caps: cumulativeCaps,
      action_advice_allowed: actionAdviceAllowed
    }
  };

  // Write output
  const outPath = path.join(RUN_DIR, 'feedback.json');
  fs.writeFileSync(outPath, JSON.stringify(feedback, null, 2));
  console.log(`\n  → ${outPath}`);
  console.log(`  cross_refs: ${crossRefs.length}`);
  console.log(`  by_type: ${JSON.stringify(byType)}`);
  console.log(`  by_target: ${JSON.stringify(byTarget)}`);
  console.log(`  action_advice_allowed: ${actionAdviceAllowed}`);
}

main();
