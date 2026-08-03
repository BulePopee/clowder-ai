// reasoning/build-evidence-packet.cjs — ttfund-monitor v2.5.0
// A-layer: deterministic evidence assembler. Reads snapshots, applies guard rules, outputs structured packet.
// LLM renderer (B-layer) only consumes this packet — never touches raw data sources.
// Usage: node reasoning/build-evidence-packet.cjs --runId 20260630-1412-ragdoll-vzes
// Output: runs/{runId}/evidence-packet.json

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME } = require('../lib/workspace.cjs');
const { normalize } = require('../lib/unit-normalizer.cjs');
const GUARD_RULES_PATH = path.join(__dirname, 'guard-rules.json');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);
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
  const wind = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (wind) return new Date(+wind[1], +wind[2] - 1, +wind[3], +wind[4], +wind[5], +wind[6]);
  return null;
}

function ageDays(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function indicatorNames() {
  try { return require('../collector/indicators.cjs').indicatorNames || {}; }
  catch (_) { return {}; }
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  console.log(`=== evidence-packet builder v1.0.0 ===`);
  console.log(`runId: ${runId}`);
  console.log(`builtAt: ${builtAt}\n`);

  // Load snapshots
  const raw = readJSON(path.join(RUN_DIR, 'raw.json'));
  const derived = readJSON(path.join(RUN_DIR, 'derived.json'));
  const portfolio = readJSON(path.join(RUN_DIR, 'portfolio-snapshot.json'));
  const provenance = readJSON(path.join(RUN_DIR, 'provenance.json'));
  const gaps = readJSON(path.join(RUN_DIR, 'gaps.json')) || [];

  if (!raw) { console.error('FATAL: raw.json not found'); process.exit(1); }

  const names = indicatorNames();
  const criticalIds = new Set([
    'B1','B2','B3','B6','B8','B9','F1','F2','O1','G2','G4','X1','X3','X4','E1','E2','E3'
  ]);

  // ── Build evidence entries ─────────────────────────────────
  const evidence = [];
  for (const [id, r] of Object.entries(raw.results || {})) {
    const fStatus = r._freshStatus || 'unknown';
    const isCritical = criticalIds.has(id);
    const entry = {
      indicator: id,
      name: names[id] || id,
      value: r.value,
      date: r.date || null,
      ageDays: r.date ? ageDays(r.date) : null,
      source: r.source || 'unknown',
      unit: r.unit || '',
      freshness: fStatus,
      critical: isCritical,
      error: r.error || null
    };
    evidence.push(entry);
  }

  // ── Unit normalization notes (P4-A) ───────────────────────────
  // Only add notes, never change evidence values (per 缅因猫 review).
  const unitNormNotes = [];
  for (const e of evidence) {
    const result = normalize(e.indicator, { value: e.value, unit: e.unit });
    if (result.canonicalUnit !== null) {
      unitNormNotes.push({
        indicator: e.indicator,
        rawValue: result.rawValue,
        rawUnit: result.rawUnit,
        detectedUnit: result.detectedUnit,
        canonicalUnit: result.canonicalUnit,
        normalized: result.normalized,
        ruleId: result.ruleId,
        warning: result.warning
      });
    }
  }

  // Add derived indicators (Fix 6: strongly depends on derived.json)
  const derivedEntries = [];
  if (derived && derived.derived) {
    for (const [id, entry] of Object.entries(derived.derived)) {
      derivedEntries.push({
        indicator: id,
        name: entry.name || id,
        value: entry.value,
        unit: entry.unit || '',
        freshness: entry.freshness || 'unknown',
        critical: false,
        note: entry.reason || '',
        components: entry.components || {}
      });
    }
  } else {
    console.log('  WARNING: derived.json missing or empty — derived indicators absent from packet');
  }

  // ── Portfolio state ─────────────────────────────────────────
  const portfolioState = { available: false, statuses: {}, summary: null };
  if (portfolio && portfolio.sources) {
    portfolioState.available = true;
    const s1 = portfolio.sources.S1_holding;
    const s2 = portfolio.sources.S2_profit;
    const s3 = portfolio.sources.S3_analysis;
    const s4 = portfolio.sources.S4_trade;

    portfolioState.statuses = {
      S1_holding: s1?.status || 'unknown',
      S2_profit: s2?.status || 'unknown',
      S3_analysis: s3?.status || 'unknown',
      S4_trade: s4?.status || 'unknown'
    };

    if (s1?.status === 'ok' && s1.data?.total) {
      const t = s1.data.total;
      const list = (s1.data.list || []).filter(h => h.fundCode !== 'hqb');
      const fundTotal = list.reduce((sum, h) => sum + (parseFloat(h.assetValue) || 0), 0);
      const mmfTotal = list
        .filter(h => (h.ptype || h.pType) === 'fund' && (h.fundName || '').includes('货币'))
        .reduce((sum, h) => sum + (parseFloat(h.assetValue) || 0), 0);
      const hqbTotal = parseFloat(t.hqb) || 0;

      portfolioState.summary = {
        total_assets: parseFloat(t.total) || 0,
        fund_assets: parseFloat(t.fund) || 0,
        hqb_assets: hqbTotal,
        gold_assets: list.filter(h => (h.fundName || '').includes('黄金')).reduce((sum, h) => sum + (parseFloat(h.assetValue) || 0), 0),
        pension_assets: parseFloat(t.pension) || 0,
        mmf_assets: mmfTotal,
        mmf_names: list.filter(h => (h.ptype || h.pType) === 'fund' && (h.fundName || '').includes('货币')).map(h => h.fundName),
        holding_count: list.length,
        holdings: list.map(h => ({
          name: h.fundName,
          code: h.fundCode,
          pType: h.ptype || h.pType,
          assetValue: parseFloat(h.assetValue) || 0,
          holdProfit: h.holdProfit != null ? parseFloat(h.holdProfit) : null,
          holdProfitRate: h.holdProfitRate != null ? String(h.holdProfitRate).replace('%', '') + '%' : null,
          dailyProfit: h.dailyProfit != null ? parseFloat(h.dailyProfit) : null,
          isMMF: (h.fundName || '').includes('货币')
        }))
      };
    }

    if (s2?.status === 'ok' && s2.data?.total) {
      portfolioState.summary = portfolioState.summary || {};
      const tp = s2.data.total;
      portfolioState.summary.ytd_profit = tp.ytd_profit != null ? parseFloat(tp.ytd_profit) : null;
      portfolioState.summary.total_profit = tp.total_profit != null ? parseFloat(tp.total_profit) : null;
      portfolioState.summary.today_profit = tp.today_profit != null ? parseFloat(tp.today_profit) : null;
      portfolioState.summary.position_profit = tp.position_profit != null ? parseFloat(tp.position_profit) : null;
    }
  }

  // ── Gap summary ─────────────────────────────────────────────
  const gapSummary = {
    staleGap: [],
    missing: [],
    no_date: [],
    invalid_date: [],
    total_gaps: gaps.length
  };
  for (const g of gaps) {
    if (g.status === 'staleGap') gapSummary.staleGap.push(g);
    else if (g.status === 'no_date') gapSummary.no_date.push(g);
    else if (g.status === 'invalid_date') gapSummary.invalid_date.push(g);
    else gapSummary.missing.push(g);
  }

  // ── Apply guard rules ───────────────────────────────────────
  const guardRules = JSON.parse(fs.readFileSync(GUARD_RULES_PATH, 'utf8'));
  const blockers = [];
  const warnings = [];
  const infos = [];

  // G001: portfolio missing
  if (!portfolioState.available || portfolioState.statuses.S1_holding === 'failed') {
    blockers.push({ rule: 'G001', message: guardRules.rules.find(r => r.id === 'G001').message });
  }

  // G002: critical indicator staleGap
  const criticalStale = evidence.filter(e => e.critical && e.freshness === 'staleGap');
  if (criticalStale.length > 0) {
    const msg = guardRules.rules.find(r => r.id === 'G002').message
      .replace('{indicators}', criticalStale.map(e => e.indicator).join(', '));
    blockers.push({ rule: 'G002', message: msg, indicators: criticalStale.map(e => e.indicator) });
  }

  // G008: non-critical staleGap (warning)
  const nonCriticalStale = evidence.filter(e => !e.critical && e.freshness === 'staleGap');
  if (nonCriticalStale.length > 0) {
    const msg = guardRules.rules.find(r => r.id === 'G008').message
      .replace('{indicators}', nonCriticalStale.map(e => e.indicator).join(', '));
    warnings.push({ rule: 'G008', message: msg, indicators: nonCriticalStale.map(e => e.indicator) });
  }

  // G009: partial portfolio
  if (portfolioState.available &&
      (portfolioState.statuses.S2_profit === 'empty' || portfolioState.statuses.S3_analysis === 'unavailable')) {
    warnings.push({ rule: 'G009', message: guardRules.rules.find(r => r.id === 'G009').message });
  }

  // G011: weekend lag info
  const allStaleGap = evidence.filter(e => e.freshness === 'staleGap');
  const allStaleAgeDay = allStaleGap.every(e => e.ageDays != null && e.ageDays <= 2);
  if (allStaleGap.length > 0 && allStaleAgeDay) {
    infos.push({ rule: 'G011', message: guardRules.rules.find(r => r.id === 'G011').message });
  }

  // ── Determine reasoning / action gates ──────────────────────
  const reasoningAllowed = true; // reasoning always runs, but with caveats
  const actionAdviceAllowed = blockers.length === 0;

  // ── Freshness overview ──────────────────────────────────────
  const freshnessCounts = { fresh: 0, staleSuccess: 0, staleGap: 0, no_date: 0, invalid_date: 0, missing: 0 };
  for (const e of evidence) {
    const s = e.freshness;
    if (freshnessCounts.hasOwnProperty(s)) freshnessCounts[s]++;
    else if (s === 'unknown' && e.error) freshnessCounts.missing++;
  }

  // ── Assemble packet ─────────────────────────────────────────
  const packet = {
    meta: {
      runId,
      builtAt,
      version: '1.0.0',
      inputs: {
        raw: raw ? `${raw.summary?.total || '?'} indicators` : 'missing',
        derived: derived?.summary ? `${derived.summary.totalFormulas} derived` : 'missing',
        portfolio: portfolioState.available ? `S1=${portfolioState.statuses.S1_holding} S2=${portfolioState.statuses.S2_profit} S3=${portfolioState.statuses.S3_analysis} S4=${portfolioState.statuses.S4_trade}` : 'missing',
        provenance: provenance ? 'available' : 'missing',
        gaps: `${gaps.length} gaps`
      },
      unit_normalization_notes: unitNormNotes.length > 0 ? unitNormNotes : undefined
    },
    freshness: freshnessCounts,
    evidence,
    derived: derivedEntries,
    portfolio: portfolioState,
    gaps: gapSummary,
    guard_results: {
      blockers,
      warnings,
      infos,
      reasoning_allowed: reasoningAllowed,
      action_advice_allowed: actionAdviceAllowed
    },
    critical_stale_indicators: criticalStale.map(e => e.indicator),
    data_as_of: (() => {
      // best-guess "as of" date: latest date among fresh indicators
      const dates = evidence
        .filter(e => e.freshness === 'fresh' && e.date)
        .map(e => parseDate(e.date))
        .filter(d => d);
      if (dates.length === 0) return 'unknown';
      dates.sort((a, b) => b - a);
      return dates[0].toISOString().slice(0, 10);
    })()
  };

  // Write output
  const outPath = path.join(RUN_DIR, 'evidence-packet.json');
  fs.writeFileSync(outPath, JSON.stringify(packet, null, 2));
  console.log(`  → ${outPath}`);

  // Summary
  console.log(`\n=== Guard Results ===`);
  console.log(`  Blockers: ${blockers.length} ${blockers.length > 0 ? '— action_advice DISABLED' : '— OK'}`);
  if (blockers.length) blockers.forEach(b => console.log(`    [BLOCKER] ${b.rule}: ${b.message.slice(0, 100)}`));
  console.log(`  Warnings: ${warnings.length}`);
  if (warnings.length) warnings.forEach(w => console.log(`    [WARN] ${w.rule}: ${w.message.slice(0, 100)}`));
  console.log(`  Infos: ${infos.length}`);
  console.log(`\n  Reasoning: ${reasoningAllowed ? 'allowed' : 'BLOCKED'}`);
  console.log(`  Action Advice: ${actionAdviceAllowed ? 'allowed' : 'BLOCKED'}`);
  console.log(`  Data as of: ${packet.data_as_of}`);
  console.log(`  Fresh: ${freshnessCounts.fresh} | staleGap: ${freshnessCounts.staleGap} | missing: ${freshnessCounts.missing}`);
}

main();
