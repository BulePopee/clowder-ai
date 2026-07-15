// reasoning/build-temporal-diff.cjs — ttfund-monitor v2.6.0 (P3.1)
// Deterministic temporal diff builder. Reads current + baseline run, produces temporal-diff.json.
// Baseline lookup: check product existence + read stored consistency result (never calls validate-run-consistency.cjs).
// Direction determination: existence → null → delta (corrected order per 缅因猫 review).
// Usage: node reasoning/build-temporal-diff.cjs --runId 20260708-1058-auto
// Output: runs/{runId}/temporal-diff.json

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME, skillRoot } = require('../lib/workspace.cjs');
const { normalize } = require('../lib/unit-normalizer.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);
const RUNS_ROOT = path.join(RUNTIME, 'runs');
const now = new Date();
const builtAt = now.toISOString();

// ── Helpers ──────────────────────────────────────────────────
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { return null; }
}

function parseDate(raw) {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cn) return new Date(+cn[1], +cn[2] - 1, +cn[3]);
  const num = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (num) return new Date(+num[1], +num[2] - 1, +num[3]);
  return null;
}

// ── Thresholds by unit group ─────────────────────────────────
// Empirical buckets (NOT statistical σ), per 缅因猫 review.
const THRESHOLD_GROUPS = {
  '利率': { unit: '%', negligible: 0.03, moderate: 0.10, label: '<3bp / 3-10bp / >10bp' },
  '价格': { unit: '元/克', negligiblePct: 0.003, moderatePct: 0.01, label: '<0.3% / 0.3-1% / >1%' },
  '价格_USD': { unit: '$', negligiblePct: 0.003, moderatePct: 0.01, label: '<0.3% / 0.3-1% / >1%' },
  '指数': { unit: '', negligiblePct: 0.005, moderatePct: 0.02, label: '<0.5% / 0.5-2% / >2%' },
  '汇率': { unit: '', negligible: 0.001, moderate: 0.005, label: '<0.1% / 0.1-0.5% / >0.5%' },
  'bp': { unit: 'bp', negligible: 3, moderate: 10, label: '<3bp / 3-10bp / >10bp' },
  '持仓': { unit: '吨', negligiblePct: 0.01, moderatePct: 0.03, label: '<1% / 1-3% / >3%' },
};

function classifyMagnitude(delta, unit, value) {
  if (delta == null || isNaN(delta)) return 'N/A';

  // Percent-based groups (use abs(delta) / abs(value))
  if (['价格', '价格_USD', '指数', '持仓'].some(g => THRESHOLD_GROUPS[g].unit === unit || (unit && THRESHOLD_GROUPS[g].unit && unit.includes(THRESHOLD_GROUPS[g].unit)))) {
    let group;
    if (unit === '元/克') group = THRESHOLD_GROUPS['价格'];
    else if (unit === '$' || unit === '美元/盎司') group = THRESHOLD_GROUPS['价格_USD'];
    else if (unit === '吨') group = THRESHOLD_GROUPS['持仓'];
    else group = THRESHOLD_GROUPS['指数'];

    if (!value || value === 0) return 'N/A';
    const pct = Math.abs(delta / value);
    if (pct < group.negligiblePct) return 'negligible';
    if (pct < group.moderatePct) return 'moderate';
    return 'significant';
  }

  // Absolute-based groups
  if (unit === '%') {
    const g = THRESHOLD_GROUPS['利率'];
    if (Math.abs(delta) < g.negligible) return 'negligible';
    if (Math.abs(delta) < g.moderate) return 'moderate';
    return 'significant';
  }
  if (unit === 'bp') {
    const g = THRESHOLD_GROUPS['bp'];
    if (Math.abs(delta) < g.negligible) return 'negligible';
    if (Math.abs(delta) < g.moderate) return 'moderate';
    return 'significant';
  }

  // Default: use 指数 thresholds
  const dg = THRESHOLD_GROUPS['指数'];
  const ref = value && value !== 0 ? Math.abs(value) : 1;
  const pct = Math.abs(delta / ref);
  if (pct < dg.negligiblePct) return 'negligible';
  if (pct < dg.moderatePct) return 'moderate';
  return 'significant';
}

// ── Tracked indicators (Tier 1 = core direction, Tier 2 = supporting, Tier 3 = derived) ──
const TRACKED = [
  // Tier 1: Core direction indicators
  { id: 'B1', name: 'US 30Y', unit: '%', tier: 1, group: '利率' },
  { id: 'B2', name: 'US 10Y', unit: '%', tier: 1, group: '利率' },
  { id: 'B3', name: 'US 2Y', unit: '%', tier: 1, group: '利率' },
  { id: 'B6', name: 'CN 10Y', unit: '%', tier: 1, group: '利率' },
  { id: 'B8', name: '10Y TIPS', unit: '%', tier: 1, group: '利率' },
  { id: 'B9', name: '10Y Breakeven', unit: '%', tier: 1, group: '利率' },
  { id: 'G2', name: 'Au99.99', unit: '元/克', tier: 1, group: '价格' },
  { id: 'G4', name: 'COMEX黄金', unit: '$', tier: 1, group: '价格_USD' },
  { id: 'G7', name: 'SPDR持仓', unit: '吨', tier: 1, group: '持仓' },
  { id: 'E1', name: 'Nasdaq 100', unit: '', tier: 1, group: '指数' },
  { id: 'E2', name: '沪深300', unit: '', tier: 1, group: '指数' },
  { id: 'X1', name: 'DXY', unit: '', tier: 1, group: '汇率' },
  { id: 'X3', name: 'USD/CNY', unit: '', tier: 1, group: '汇率' },
  { id: 'X4', name: 'USD/CNH', unit: '', tier: 1, group: '汇率' },
  { id: 'F1', name: 'Fed rate', unit: '%', tier: 1, group: '利率' },
  { id: 'S1', name: 'VIX', unit: '', tier: 1, group: '指数' },
  // Tier 2: Supporting
  { id: 'A1', name: 'MOVE', unit: '', tier: 2, group: '指数' },
  { id: 'O1', name: 'Brent', unit: '$', tier: 2, group: '价格_USD' },
  { id: 'M2', name: 'DR007', unit: '%', tier: 2, group: '利率' },
  { id: 'N2', name: 'SOFR', unit: '%', tier: 2, group: '利率' },
  { id: 'N6', name: 'FRA-OIS', unit: 'bp', tier: 2, group: 'bp' },
  { id: 'B10', name: 'HY OAS', unit: 'bp', tier: 2, group: 'bp' },
];

// ── Baseline lookup ──────────────────────────────────────────
// Correction #2 (缅因猫): Check baseline product existence + read stored consistency result.
// Never call validate-run-consistency.cjs for the baseline.
function findBaseline() {
  if (!fs.existsSync(RUNS_ROOT)) return { status: 'no_baseline', runId: null };

  // Only runs BEFORE the current run (by runId date prefix)
  const dirs = fs.readdirSync(RUNS_ROOT)
    .filter(d => {
      const full = path.join(RUNS_ROOT, d);
      if (!fs.statSync(full).isDirectory()) return false;
      if (d === runId) return false;
      // Only include runs with date prefix older than current
      return d < runId;
    })
    .sort()
    .reverse();

  console.log(`  Scanning ${dirs.length} previous run(s) for baseline...`);

  for (const dir of dirs) {
    const reasoningPath = path.join(RUNS_ROOT, dir, 'reasoning-snapshot.json');
    if (!fs.existsSync(reasoningPath)) {
      console.log(`    ${dir}: no reasoning-snapshot.json, skip`);
      continue;
    }

    // Check required artifacts
    const rawPath = path.join(RUNS_ROOT, dir, 'raw.json');
    const derivedPath = path.join(RUNS_ROOT, dir, 'derived.json');
    const evidencePath = path.join(RUNS_ROOT, dir, 'evidence-packet.json');

    // Skip partial runs — continue searching for a complete one
    if (!fs.existsSync(rawPath)) {
      console.log(`    ${dir}: reasoning exists but raw.json missing, skip (searching for complete run)`);
      continue;
    }
    if (!fs.existsSync(derivedPath)) {
      console.log(`    ${dir}: reasoning exists but derived.json missing, skip (searching for complete run)`);
      continue;
    }

    // Check stored consistency result (written by validate-run-consistency.cjs)
    const consistencyPath = path.join(RUNS_ROOT, dir, '.consistency-result.json');
    if (fs.existsSync(consistencyPath)) {
      const cr = readJSON(consistencyPath);
      if (cr && cr.selfConsistent === true) {
        console.log(`    ${dir}: validated baseline (selfConsistent=true) → ok`);
        return { status: 'ok', runId: dir, baselineStatus: 'validated' };
      }
      console.log(`    ${dir}: consistency result selfConsistent=${cr?.selfConsistent ?? '?'} (errors=${cr?.errors ?? '?'}) → degraded`);
      return { status: 'degraded', runId: dir, baselineStatus: 'unvalidated',
        reason: `Baseline has ${cr?.errors ?? '?'} artifact consistency errors` };
    }

    // Has all artifacts but no consistency file yet
    console.log(`    ${dir}: all artifacts present but no consistency result → degraded`);
    return { status: 'degraded', runId: dir, baselineStatus: 'unvalidated',
      reason: 'Baseline artifacts complete but consistency not recorded' };
  }

  return { status: 'no_baseline', runId: null };
}

// ── Direction determination ──────────────────────────────────
// Correction #3 (缅因猫): existence check BEFORE null check.
function determineDirection(currentEntry, baselineEntry) {
  const curExists = currentEntry && currentEntry.value != null;
  const baseExists = baselineEntry && baselineEntry.value != null;

  // 1. Indicator existence — BEFORE null check
  if (curExists && !baselineEntry) return 'new';
  if (!currentEntry && baseExists) return 'lost';

  // 2. Value null check
  if (!curExists && !baseExists) return 'unknown';
  if (!curExists) return 'unknown';
  if (!baseExists) return 'new';

  // 3. Delta check
  const delta = currentEntry.value - baselineEntry.value;
  if (Math.abs(delta) < 1e-10) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function computeDelta(currentEntry, baselineEntry) {
  if (currentEntry == null || baselineEntry == null) return null;
  if (currentEntry.value == null || baselineEntry.value == null) return null;
  return currentEntry.value - baselineEntry.value;
}

function formatDeltaDisplay(delta, unit) {
  if (delta == null) return 'N/A';
  if (unit === 'bp') return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}bp`;
  if (unit === '%') return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}pp`;
  if (unit === '元/克') return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
  if (unit === '$') return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
}

// ── Get derived indicators ───────────────────────────────────
function getDerivedIndicators(derived) {
  if (!derived || !derived.derived) return {};
  const result = {};
  for (const [id, entry] of Object.entries(derived.derived)) {
    result[id] = { value: entry.value, name: entry.name || id, unit: entry.unit || '' };
  }
  return result;
}

// ── Consistency check ────────────────────────────────────────
function buildConsistencyCheck(changes) {
  const coherentPairs = [];
  const divergentPairs = [];

  // Check known pair relationships
  const pairs = [
    { a: 'B8', b: 'G4', label: 'TIPS vs Gold', expectInverse: true,
      desc: '实际利率↑应压制黄金, 同向则反常' },
    { a: 'X1', b: 'G4', label: 'DXY vs Gold', expectInverse: true,
      desc: '美元↑应压制黄金, 同向则反常' },
    { a: 'B2', b: 'B3', label: '10Y vs 2Y', expectInverse: false,
      desc: '期限结构, 同向为平行移动' },
    { a: 'B8', b: 'B9', label: 'TIPS vs Breakeven', expectInverse: false,
      desc: '名义=实际+通胀预期, 同向正常' },
    { a: 'S1', b: 'E1', label: 'VIX vs NDX', expectInverse: true,
      desc: 'VIX↑应压制NDX, 同向则反常' },
    { a: 'X3', b: 'X4', label: 'CNY vs CNH', expectInverse: false,
      desc: '在岸离岸汇率应同向' },
  ];

  const changeMap = {};
  for (const c of changes) changeMap[c.indicator] = c;

  for (const pair of pairs) {
    const a = changeMap[pair.a];
    const b = changeMap[pair.b];
    if (!a || !b) continue;
    if (a.direction === 'unknown' || b.direction === 'unknown') continue;
    if (a.direction === 'flat' || b.direction === 'flat') continue;
    if (a.direction === 'new' || a.direction === 'lost') continue;
    if (b.direction === 'new' || b.direction === 'lost') continue;

    const sameDir = a.direction === b.direction;
    if (pair.expectInverse ? !sameDir : sameDir) {
      coherentPairs.push({ pair: pair.label, a: pair.a, b: pair.b, aDir: a.direction, bDir: b.direction, note: pair.desc });
    } else {
      divergentPairs.push({ pair: pair.label, a: pair.a, b: pair.b, aDir: a.direction, bDir: b.direction, note: pair.desc });
    }
  }

  let summary;
  if (divergentPairs.length === 0) {
    summary = '关键指标对方向一致，无矛盾信号。';
  } else {
    summary = `${divergentPairs.length} 对指标出现方向背离: ${divergentPairs.map(p => p.pair).join('、')}。`;
  }

  return { coherent_pairs: coherentPairs, divergent_pairs: divergentPairs, summary };
}

// ── Regime stability ─────────────────────────────────────────
function buildRegimeStability(currentReasoning, baselineReasoning) {
  const curRegime = currentReasoning?.macro_regime?.regime_claim || '未知';
  const baseRegime = baselineReasoning?.macro_regime?.regime_claim || '未知';
  const changed = curRegime !== baseRegime && curRegime !== '未知' && baseRegime !== '未知';

  let keyDiffs = [];
  let stabilityNote = '';

  if (!currentReasoning || !baselineReasoning) {
    stabilityNote = '无法比较 regime — 一侧推理数据缺失。';
    keyDiffs = ['推理数据不完整'];
  } else if (changed) {
    keyDiffs.push(`Regime 从 "${baseRegime}" 变为 "${curRegime}"`);
    stabilityNote = 'Regime 已发生变化，需关注第2章主导驱动力是否随之改变。';
  } else {
    stabilityNote = curRegime === '未知' ? '无法确定 regime — 基线或当前推理不完整。' : 'Regime 未变，宏观经济格局稳定。';
  }

  return {
    currentRegime: curRegime,
    baselineRegime: baseRegime,
    regimeChanged: changed,
    keyDifferences: keyDiffs,
    stabilityNote
  };
}

// ── Threshold crossings ──────────────────────────────────────
const THRESHOLD_CROSSINGS = [
  { indicator: 'B8', threshold: 2.0, label: 'TIPS > 2.0%', tier: 1 },
  { indicator: 'B2', threshold: 5.0, label: 'US 10Y > 5.0%', tier: 1 },
  { indicator: 'B1', threshold: 5.0, label: 'US 30Y > 5.0%', tier: 1 },
  { indicator: 'S1', threshold: 20, label: 'VIX > 20', tier: 1 },
  { indicator: 'G2', threshold: 900, label: 'Au99.99 > 900', tier: 1 },
  { indicator: 'B6', threshold: 1.8, label: 'CN 10Y < 1.8%', tier: 1 },
];

function buildThresholdCrossings(currentRaw, baselineRaw) {
  const crossed = [];
  const approaching = [];

  if (!currentRaw || !currentRaw.results) return { crossed, approaching };

  for (const tc of THRESHOLD_CROSSINGS) {
    const cur = currentRaw.results[tc.indicator];
    const base = baselineRaw?.results?.[tc.indicator];

    if (!cur || cur.value == null) continue;

    const curCrossed = tc.indicator === 'B6'
      ? cur.value < tc.threshold
      : cur.value > tc.threshold;

    const baseCrossed = base && base.value != null
      ? (tc.indicator === 'B6' ? base.value < tc.threshold : base.value > tc.threshold)
      : null;

    if (curCrossed && baseCrossed === false) {
      crossed.push({
        indicator: tc.indicator,
        name: tc.label.split(' ')[0],
        threshold: tc.label,
        from: base.value,
        to: cur.value,
        direction: tc.indicator === 'B6' ? 'down' : 'up',
        tier: tc.tier
      });
    } else if (!curCrossed) {
      // Check approaching (within 20% of threshold)
      const margin = tc.indicator === 'B6'
        ? (cur.value - tc.threshold) / tc.threshold
        : (tc.threshold - cur.value) / tc.threshold;
      if (margin > 0 && margin < 0.2) {
        approaching.push({
          indicator: tc.indicator,
          name: tc.label.split(' ')[0],
          threshold: tc.label,
          currentValue: cur.value,
          distance: `${(margin * 100).toFixed(0)}%`
        });
      }
    }
  }

  return { crossed, approaching };
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  console.log(`=== temporal-diff builder v1.0.0 ===`);
  console.log(`runId: ${runId}`);
  console.log(`builtAt: ${builtAt}\n`);

  // Load current run artifacts
  const currentRaw = readJSON(path.join(RUN_DIR, 'raw.json'));
  const currentDerived = readJSON(path.join(RUN_DIR, 'derived.json'));
  const currentReasoning = readJSON(path.join(RUN_DIR, 'reasoning-snapshot.json'));

  if (!currentRaw) { console.error('FATAL: raw.json not found in current run'); process.exit(1); }

  // Find baseline
  const baseline = findBaseline();
  console.log(`\n  Baseline: status=${baseline.status} runId=${baseline.runId || 'N/A'}`);

  if (baseline.status === 'no_baseline') {
    // No baseline — produce minimal output
    const output = {
      meta: {
        status: 'no_baseline',
        currentRunId: runId,
        baselineRunId: null,
        baselineStatus: null,
        builtAt,
        version: '1.0.0',
        daysSinceBaseline: null,
        indicatorsCompared: 0,
        indicatorsUnavailableBoth: 0,
        indicatorsNew: 0,
        indicatorsLost: 0,
        warnings: ['无可比基线 — 未找到具有完整推理产物的前次运行']
      },
      directional_changes: [],
      consistency_check: { coherent_pairs: [], divergent_pairs: [], summary: '无可比基线' },
      regime_stability: { currentRegime: currentReasoning?.macro_regime?.regime_claim || '未知',
        baselineRegime: null, regimeChanged: false, keyDifferences: [], stabilityNote: '无可比基线' },
      threshold_crossings: { crossed: [], approaching: [] }
    };

    const outPath = path.join(RUN_DIR, 'temporal-diff.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`  → ${outPath}`);
    console.log(`\n=== temporal-diff: no_baseline ===`);
    return;
  }

  // Load baseline artifacts
  const baselineDir = path.join(RUNS_ROOT, baseline.runId);
  const baselineRaw = readJSON(path.join(baselineDir, 'raw.json'));
  const baselineDerived = readJSON(path.join(baselineDir, 'derived.json'));
  const baselineReasoning = readJSON(path.join(baselineDir, 'reasoning-snapshot.json'));

  // Compute days since baseline
  const curDate = new Date(builtAt);
  let baselineDate = null;
  if (baselineReasoning?.meta?.generatedAt) {
    baselineDate = parseDate(baselineReasoning.meta.generatedAt);
  } else if (baselineRaw?.collectedAt) {
    baselineDate = parseDate(baselineRaw.collectedAt);
  }
  const daysSinceBaseline = baselineDate
    ? Math.round((curDate - baselineDate) / (1000 * 60 * 60 * 24))
    : null;

  // Build directional changes
  const changes = [];
  let compared = 0, unavailableBoth = 0, newCount = 0, lostCount = 0;
  const warnings = [];

  for (const def of TRACKED) {
    const curRaw = currentRaw.results?.[def.id];
    const baseRaw = baselineRaw?.results?.[def.id];

    // Normalize units via shared contract (P4-A): detects & corrects cross-run unit drift
    const curNorm = normalize(def.id, curRaw);
    const baseNorm = normalize(def.id, baseRaw);

    const curEntry = curNorm.normalized
      ? { ...curRaw, value: curNorm.value, unit: curNorm.unit }
      : curRaw;
    const baseEntry = baseNorm.normalized
      ? { ...baseRaw, value: baseNorm.value, unit: baseNorm.unit }
      : baseRaw;

    if (curNorm.warning) warnings.push(curNorm.warning);
    if (baseNorm.warning && baseNorm.warning !== curNorm.warning) warnings.push(baseNorm.warning);

    const direction = determineDirection(curEntry, baseEntry);

    if (direction === 'new') { newCount++; }
    else if (direction === 'lost') { lostCount++; }
    else if (direction === 'unknown') { unavailableBoth++; }
    else { compared++; }

    const delta = computeDelta(curEntry, baseEntry);
    const magnitude = classifyMagnitude(delta, def.unit, curEntry?.value);

    changes.push({
      indicator: def.id,
      name: def.name,
      tier: def.tier,
      direction,
      currentValue: curEntry?.value ?? null,
      baselineValue: baseEntry?.value ?? null,
      delta: delta != null ? Number(delta.toFixed(6)) : null,
      deltaDisplay: formatDeltaDisplay(delta, def.unit),
      unit: def.unit,
      magnitude,
      thresholdGroup: def.group,
      currentDate: curEntry?.date || null,
      baselineDate: baseEntry?.date || null,
      normalized: curNorm.normalized || baseNorm.normalized,
      currentDetectedUnit: curNorm.detectedUnit,
      baselineDetectedUnit: baseNorm.detectedUnit
    });
  }

  // Add derived indicators (Tier 3)
  const curDerived = getDerivedIndicators(currentDerived);
  const baseDerived = getDerivedIndicators(baselineDerived);

  for (const [id, curD] of Object.entries(curDerived)) {
    const baseD = baseDerived[id];
    if (!baseD) continue; // Only compare derived that exist in both

    const delta = curD.value != null && baseD.value != null ? curD.value - baseD.value : null;
    let direction = 'unknown';
    if (curD.value != null && baseD.value != null) {
      if (Math.abs(delta) < 1e-10) direction = 'flat';
      else direction = delta > 0 ? 'up' : 'down';
    }

    changes.push({
      indicator: id,
      name: curD.name || id,
      tier: 3,
      direction,
      currentValue: curD.value ?? null,
      baselineValue: baseD.value ?? null,
      delta: delta != null ? Number(delta.toFixed(6)) : null,
      deltaDisplay: delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}` : 'N/A',
      unit: curD.unit || '',
      magnitude: 'N/A',
      thresholdGroup: '指数',
      currentDate: null,
      baselineDate: null
    });
  }

  // Build sections
  const consistencyCheck = buildConsistencyCheck(changes);
  const regimeStability = buildRegimeStability(currentReasoning, baselineReasoning);
  const thresholdCrossings = buildThresholdCrossings(currentRaw, baselineRaw);

  // Degraded baseline warnings
  if (baseline.status !== 'ok') {
    warnings.push(`基线状态: ${baseline.status} (${baseline.reason || baseline.baselineStatus})`);
  }
  if (daysSinceBaseline != null && daysSinceBaseline > 7) {
    warnings.push(`距基线 ${daysSinceBaseline} 天，跨周比较可能引入噪音`);
  }

  // Output
  const output = {
    meta: {
      status: baseline.status,
      currentRunId: runId,
      baselineRunId: baseline.runId,
      baselineStatus: baseline.baselineStatus,
      builtAt,
      version: '1.0.0',
      daysSinceBaseline,
      indicatorsCompared: compared,
      indicatorsUnavailableBoth: unavailableBoth,
      indicatorsNew: newCount,
      indicatorsLost: lostCount,
      warnings
    },
    directional_changes: changes,
    consistency_check: consistencyCheck,
    regime_stability: regimeStability,
    threshold_crossings: thresholdCrossings
  };

  const outPath = path.join(RUN_DIR, 'temporal-diff.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`  → ${outPath}`);

  // Summary
  console.log(`\n=== temporal-diff summary ===`);
  console.log(`  Status: ${baseline.status}`);
  console.log(`  Compared: ${compared} | New: ${newCount} | Lost: ${lostCount} | Unavailable: ${unavailableBoth}`);
  console.log(`  Regime changed: ${regimeStability.regimeChanged}`);
  console.log(`  Threshold crossings: ${thresholdCrossings.crossed.length}`);
  console.log(`  Divergent pairs: ${consistencyCheck.divergent_pairs.length}`);
}

main();
