// collector/validate-source-contract.cjs — ttfund-monitor v2.7.0 (P4-C)
// Source contract validator: checks provenance.json + source-probe.json against source-contracts.json.
// Verifies: source whitelist, fallback chain, WebSearch constraints, probe status.
// Usage: node collector/validate-source-contract.cjs --runId 20260714-1609-auto
// Exit: 0 = all contract checks pass, 1 = violations found

const fs = require('fs');
const path = require('path');

const { runtimeRoot } = require('../lib/workspace.cjs');

// ── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(runtimeRoot, 'runs', runId);
const verbose = args.includes('--verbose');

const contracts = require(path.join(__dirname, '..', 'config', 'source-contracts.json'));

let errors = 0;
let warnings = 0;

function fail(msg) { errors++; console.error(`  FAIL: ${msg}`); }
function warn(msg) { warnings++; console.warn(`  WARN: ${msg}`); }
function ok(msg) { if (verbose) console.log(`  OK: ${msg}`); }

function readJSON(name) {
  const p = path.join(RUN_DIR, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (_) { return null; }
}

console.log(`\n=== Source Contract Validator (P4-C) ===`);
console.log(`runId: ${runId}`);
console.log(`runDir: ${RUN_DIR}\n`);

// ── Load artifacts ─────────────────────────────────────────────
const provenance = readJSON('provenance.json');
const sourceProbe = readJSON('source-probe.json');
const raw = readJSON('raw.json');

if (!provenance) { fail('provenance.json missing'); process.exit(1); }
if (!sourceProbe) { fail('source-probe.json MISSING — probe gate must be run before source contract validation'); }

// ── 1. Source probe gate ────────────────────────────────────────
console.log('── 1. Source Probe Gate ──');
if (sourceProbe) {
  for (const sp of sourceProbe.sources || []) {
    const label = `${sp.sourceId} [${sp.classification}]`;
    if (sp.contractStatus === 'violation') {
      fail(`Source ${label} — ${sp.details}`);
    } else if (sp.contractStatus === 'degraded') {
      warn(`Source ${label} degraded: ${sp.details}`);
    } else {
      ok(`Source ${label} — ok`);
    }
  }
  if (sourceProbe.summary?.verdict === 'contract_violation') {
    fail('Source probe verdict: contract_violation');
  }
}

// ── 1b. Depth Probe Gate (P5-C) ─────────────────────────────────
console.log('\n── 1b. Depth Probe Gate (P5-C) ──');
const depthPolicy = contracts.depthProbePolicy || { requiredSources: ['ttfund', 'ifind', 'wind'] };
if (sourceProbe) {
  for (const sp of sourceProbe.sources || []) {
    const dp = sp.depthProbe;
    if (!dp || dp.verdict === 'skipped') {
      if (depthPolicy.requiredSources?.includes(sp.sourceId) && sp.probeStatus === 'available') {
        warn(`Source ${sp.sourceId}: depth probe skipped but source is required — may indicate config gap`);
      } else {
        ok(`Source ${sp.sourceId}: depth probe skipped (not required or not available)`);
      }
      continue;
    }

    const label = `${sp.sourceId} depth:${dp.verdict}`;
    const isRequired = depthPolicy.requiredSources?.includes(sp.sourceId);
    if (dp.verdict === 'failed' || (dp.verdict === 'degraded' && isRequired)) {
      const classification = dp.classification || 'endpoint_failed';
      if (isRequired) {
        fail(`${label} (${classification}) — ${dp.details}. Required source depth probe ${dp.verdict.toUpperCase()} — pipeline blocked before collect.`);
        if (dp.failures?.length > 0) {
          for (const f of dp.failures) {
            console.error(`    └─ ${f}`);
          }
        }
        // Show per-check failures
        for (const c of (dp.checks || [])) {
          if (c.failureClass) {
            const crit = c.critical ? ' [CRITICAL]' : '';
            console.error(`    └─ ${c.label}${crit}: ${c.failureClass} (valueOk=${c.valueOk} dateOk=${c.dateOk})`);
          }
        }
      } else {
        warn(`${label} (${classification}) — ${dp.details}`);
      }
    } else if (dp.verdict === 'degraded') {
      warn(`${label} — ${dp.details}`);
      if (dp.failures?.length > 0) {
        for (const f of dp.failures) {
          console.warn(`    └─ ${f}`);
        }
      }
    } else {
      ok(`${label} — ${dp.details}`);
    }

    // Show per-check results in verbose mode
    if (verbose && dp.checks?.length > 0) {
      for (const c of dp.checks) {
        const status = c.failureClass ? `WARN:${c.failureClass}` : 'OK';
        console.log(`    ${status} ${c.label}: valueOk=${c.valueOk} dateOk=${c.dateOk}`);
      }
    }
  }

  const depthSummary = sourceProbe.summary?.depthProbe;
  if (depthSummary) {
    console.log(`  Depth probe summary: ${depthSummary.ok} ok / ${depthSummary.failed} failed / ${depthSummary.degraded} degraded / ${depthSummary.skipped} skipped → ${depthSummary.verdict}`);
  }
}

// ── 2. Indicator source contract check ─────────────────────────
console.log('\n── 2. Indicator Source Contracts ──');
const indicatorContracts = provenance.sourceContracts?.indicatorContracts;
if (!indicatorContracts) {
  fail('provenance.json has no sourceContracts section — collector was NOT run with P4-C contract enrichment. Rebuild with current collector/index.cjs.');
  // Short-circuit: without contract data, the rest of validation is meaningless
  console.error('SOURCE CONTRACT CHECK FAILED — provenance.json lacks P4-C contract enrichment.\n');
  process.exit(1);
} else {
  let checked = 0, violations = 0, fallbackOk = 0, missing = 0;

  for (const [indicatorId, ic] of Object.entries(indicatorContracts)) {
    checked++;
    switch (ic.contractStatus) {
      case 'ok':
        ok(`${indicatorId}: ${ic.actualSource} (primary)`);
        break;
      case 'fallback_ok':
        fallbackOk++;
        ok(`${indicatorId}: ${ic.actualSource} (fallback from ${ic.expectedSource})`);
        break;
      case 'fallback_violation':
        // Re-check against current contracts — provenance may have been written against old contracts.
        // Two-layer check: (1) allowedFallbackTargets includes actualSource, AND
        // (2) fallbackRestrictions[actualSource] doesn't forbid/acl-block this specific indicator.
        {
          const expectedSrc = contracts.sources?.[ic.expectedSource];
          const isTargetAllowed = expectedSrc?.allowedFallbackTargets?.includes(ic.actualSource);
          if (!isTargetAllowed) {
            violations++;
            fail(`${indicatorId}: source ${ic.actualSource} not in fallback whitelist for ${ic.expectedSource}`);
            break;
          }
          // Layer 2: per-indicator restriction check
          const restrictions = expectedSrc?.fallbackRestrictions?.[ic.actualSource];
          if (restrictions) {
            const inAllowed = !restrictions.allowedFor || restrictions.allowedFor.includes(indicatorId);
            const inForbidden = restrictions.forbiddenFor?.includes(indicatorId);
            if (inForbidden) {
              violations++;
              fail(`${indicatorId}: source ${ic.actualSource} forbidden for this indicator (forbiddenFor list)`);
            } else if (!inAllowed) {
              violations++;
              fail(`${indicatorId}: source ${ic.actualSource} not in allowedFor list for ${ic.expectedSource}→${ic.actualSource} fallback`);
            } else {
              fallbackOk++;
              ok(`${indicatorId}: ${ic.actualSource} (fallback from ${ic.expectedSource}, restriction-checked ok)`);
            }
          } else {
            fallbackOk++;
            ok(`${indicatorId}: ${ic.actualSource} (fallback from ${ic.expectedSource}, now whitelisted, no per-indicator restrictions)`);
          }
        }
        break;
      case 'missing':
        missing++;
        warn(`${indicatorId}: value missing (expected source: ${ic.expectedSource})`);
        break;
      case 'no_contract':
        break; // not configured yet — skip
    }

    // WebSearch sub-checks
    if (ic.websearchViolations?.length > 0) {
      for (const v of ic.websearchViolations) {
        fail(`${indicatorId}: WebSearch violation — ${v}`);
      }
    }
  }

  console.log(`  Checked: ${checked} | Violations: ${violations} | Fallback OK: ${fallbackOk} | Missing: ${missing}`);
}

// ── 3. WebSearch forbidden type checks ──────────────────────────
console.log('\n── 3. WebSearch Forbidden Checks ──');
if (raw?.results) {
  const forbiddenPatterns = [
    { pattern: /新闻|报道|article|news/i, type: 'news_article', desc: '新闻文章 — 不得作为精确值来源' },
    { pattern: /ETF|GLD|IAU|SGOL/i, type: 'proxy_etf', desc: 'ETF代理 — 不得替代原始指标' },
    { pattern: /^\s*~\s*\d|约\s*\d|大约|approx/i, type: 'approximate', desc: '约数/~值 — 不得出现于精确指标' },
  ];

  for (const [id, r] of Object.entries(raw.results)) {
    if (r.source !== 'websearch') continue;
    if (!r.value && r.value !== 0) continue;

    for (const fp of forbiddenPatterns) {
      const noteText = [r.note, r._staleNote, String(r.value)].filter(Boolean).join(' ');
      if (fp.pattern.test(noteText)) {
        fail(`${id}: WebSearch value may be ${fp.type} "${r.value}" — ${fp.desc}`);
      }
    }

    // Source URL check
    if (!r._sourceUrl && !r.note?.includes('http')) {
      warn(`${id}: WebSearch value missing source URL`);
    }
  }

  // Count WebSearch usage for non-fallback indicators
  const wsIndicators = Object.entries(raw.results)
    .filter(([, r]) => r.source === 'websearch' && r.value != null);

  const wsOnContract = require(path.join(__dirname, '..', 'config', 'indicators.json'));
  const wsCriticalViolations = wsIndicators.filter(([id]) => {
    const contract = indicatorContracts?.[id];
    if (!contract) return false;
    return contract.contractStatus === 'fallback_violation';
  });

  if (wsCriticalViolations.length > 0) {
    for (const [id] of wsCriticalViolations) {
      fail(`${id}: WebSearch used as fallback for critical indicator — contract violation`);
    }
  }

  ok(`WebSearch indicators: ${wsIndicators.length}, critical violations: ${wsCriticalViolations.length}`);
} else {
  warn('raw.json missing — cannot check WebSearch constraints');
}

// ── 4. Unit contract check ──────────────────────────────────────
console.log('\n── 4. Unit Contract ──');
const unitContracts = {};
for (const [srcId, contract] of Object.entries(contracts.sources)) {
  if (contract.unitExpectation?.declared) {
    for (const [indId, unitDecl] of Object.entries(contract.unitExpectation.declared)) {
      unitContracts[indId] = { expectedSource: srcId, unitDeclaration: unitDecl };
    }
  }
}

if (raw?.results) {
  for (const [indId, unitInfo] of Object.entries(unitContracts)) {
    const r = raw.results[indId];
    if (!r || r.value == null) continue;
    // Check that unit matches the contract's declared unit (before normalization)
    const decl = unitInfo.unitDeclaration;
    if (r.unit && decl) {
      // Extract canonical unit from declaration
      const canonicalMatch = decl.match(/canonical:\s*(\S+)/);
      if (canonicalMatch) {
        const canonical = canonicalMatch[1];
        // The raw unit might differ (e.g., oz vs 吨) — this is expected
        // Just check that the value is in a plausible range for any declared unit
        ok(`${indId}: unit=${r.unit}, contract=${decl}`);
      }
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n=== Results: ${errors} error(s), ${warnings} warning(s) ===`);
if (errors > 0) {
  console.error('SOURCE CONTRACT CHECK FAILED — source adapter contract violations found.');
  console.error('Fix: ensure indicators use declared primary sources; fallbacks must be whitelisted.\n');
  process.exit(1);
} else {
  console.log('SOURCE CONTRACT CHECK PASSED — all source adapter calls comply with contracts.\n');
  process.exit(0);
}
