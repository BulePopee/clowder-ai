// validate-indicator-contract.cjs — ttfund-monitor v2.8.0 (P5-B)
// Indicator onboarding contract validator: cross-references indicator-contracts.json
// against all config files, source adapters, temporal-diff, feedback, report sections.
// Usage:
//   node validate-indicator-contract.cjs
//   node validate-indicator-contract.cjs --indicator G7
//   node validate-indicator-contract.cjs --onboard R1         (diagnostic: exit 0)
//   node validate-indicator-contract.cjs --onboard R1 --strict (CI gate: exit 1 on gaps)
// Exit: 0 = pass/consistent, 1 = errors found (onboard only fails with --strict)

const fs = require('fs');
const path = require('path');

const skillRoot = __dirname;
const configDir = path.join(skillRoot, 'config');
const dataDir = path.join(skillRoot, '..', '..', '..', 'data', 'ttfund-monitor');

// ── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const indicatorFilter = args.includes('--indicator') ? args[args.indexOf('--indicator') + 1] : null;
const onboardId = args.includes('--onboard') ? args[args.indexOf('--onboard') + 1] : null;
const strict = args.includes('--strict');
const verbose = args.includes('--verbose');

let errors = 0;
let warnings = 0;

function fail(msg) { errors++; console.error(`  FAIL: ${msg}`); }
function warn(msg) { warnings++; console.warn(`  WARN: ${msg}`); }
function ok(msg) { if (verbose) console.log(`  OK: ${msg}`); }

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { return null; }
}

console.log(`\n=== Indicator Contract Validator (P5-B) ===`);
if (indicatorFilter) console.log(`indicator: ${indicatorFilter}`);
if (onboardId) console.log(`onboard check: ${onboardId}`);
console.log('');

// ── Load all configs ────────────────────────────────────────────
const indicatorContracts = readJSON(path.join(configDir, 'indicator-contracts.json'));
const sourceContracts = readJSON(path.join(configDir, 'source-contracts.json'));
const indicators = readJSON(path.join(configDir, 'indicators.json'));
const sources = readJSON(path.join(configDir, 'sources.json'));
const indicatorUnits = readJSON(path.join(configDir, 'indicator-units.json'));
const catalogPath = path.join(skillRoot, 'data', 'indicator-catalog.md');
const catalogMd = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null;

// Extra configs: temporal-diff tracked list, feedback schema, report sections
const temporalDiffPath = path.join(skillRoot, 'reasoning', 'build-temporal-diff.cjs');
const temporalDiffSrc = fs.existsSync(temporalDiffPath) ? fs.readFileSync(temporalDiffPath, 'utf8') : '';
const feedbackSchema = readJSON(path.join(skillRoot, 'reasoning', 'feedback-schema.json'));
const feedbackSrc = fs.existsSync(path.join(skillRoot, 'reasoning', 'build-feedback.cjs'))
  ? fs.readFileSync(path.join(skillRoot, 'reasoning', 'build-feedback.cjs'), 'utf8') : '';
const reportSchema = readJSON(path.join(skillRoot, 'report', 'schema.json'));
const reportSectionsDir = path.join(skillRoot, 'report', 'sections');

if (!indicatorContracts) { fail('indicator-contracts.json missing'); process.exit(1); }

// ── Onboard mode: check what a new indicator needs ───────────────
if (onboardId) {
  console.log(`── Onboard Check: ${onboardId} ──`);
  const existing = indicatorContracts.indicators[onboardId];
  if (existing) {
    warn(`${onboardId} already exists in indicator-contracts.json — not a new indicator`);
  }

  const needs = [];
  // Check sources.json for any batch item with this indicator
  const inSources = sources?.ifind?.batches?.some(b =>
    b.calls?.some(c => c.indicator === onboardId || c.id === onboardId)
  ) || sources?.wind?.calls?.some(c => c.indicator === onboardId || c.id === onboardId);
  if (!inSources) needs.push('sources.json: no call definition found');
  else ok(`sources.json: call definition exists`);

  // Check indicators.json
  if (!indicators?.indicatorNames?.[onboardId]) needs.push('indicators.json: no name entry');
  else ok(`indicators.json: name entry exists`);
  if (!indicators?.freshness?.[onboardId]) needs.push('indicators.json: no freshness rule');
  else ok(`indicators.json: freshness rule exists`);

  // Check source-contracts.json
  const inSourceContract = Object.values(sourceContracts?.sources || {}).some(
    s => s.isPrimaryFor?.includes(onboardId) || s.supportedIndicators?.prefixes?.includes(onboardId)
  );
  if (!inSourceContract) needs.push('source-contracts.json: not claimed by any source');
  else ok(`source-contracts.json: source contract exists`);

  // Check indicator-units.json
  if (indicatorUnits?.indicators?.[onboardId]) ok(`indicator-units.json: unit contract exists`);
  // (not mandatory — only if unit drift risk)

  // Check temporal-diff
  const inTemporal = new RegExp(`id:\\s*['"]${onboardId}['"]`).test(temporalDiffSrc);
  if (!inTemporal) needs.push('temporal-diff: not in TRACKED_INDICATORS');
  else ok(`temporal-diff: in TRACKED_INDICATORS`);

  // Check catalog
  if (catalogMd && new RegExp(`\\|\\s*${onboardId}\\s*\\|`).test(catalogMd)) ok(`indicator-catalog.md: entry exists`);
  else needs.push('indicator-catalog.md: no catalog entry');

  if (needs.length === 0) {
    console.log(`\n${onboardId} is fully onboarded — all contracts in place.`);
  } else {
    console.log(`\n${onboardId} needs ${needs.length} contract(s):`);
    for (const n of needs) console.log(`  - ${n}`);
  }

  // --onboard is diagnostic by default (exit 0); --strict gates CI (exit 1 on gaps)
  if (needs.length > 0 && strict) process.exit(1);
  process.exit(0);
}

// ── Full validation mode ────────────────────────────────────────
const indicatorsToCheck = indicatorFilter
  ? { [indicatorFilter]: indicatorContracts.indicators[indicatorFilter] }
  : indicatorContracts.indicators || {};

if (indicatorFilter && !indicatorsToCheck[indicatorFilter]) {
  fail(`Indicator "${indicatorFilter}" not found in indicator-contracts.json`);
  process.exit(1);
}

console.log(`Checking ${Object.keys(indicatorsToCheck).length} indicator(s)\n`);

for (const [id, contract] of Object.entries(indicatorsToCheck)) {
  console.log(`── ${id} (${contract.name}) ──`);

  // 1. Source contract check (or derived check for computed indicators)
  console.log('  [1/8] Source mapping:');
  if (contract.kind === 'derived') {
    // Derived indicators: verify derivedFrom components exist, skip source-contracts
    const derivedFrom = contract.source?.derivedFrom || [];
    if (derivedFrom.length === 0) {
      fail(`${id}: kind=derived but no source.derivedFrom declared`);
    } else {
      for (const compId of derivedFrom) {
        if (!indicators?.indicatorNames?.[compId]) {
          fail(`${id}: derivedFrom component "${compId}" not found in indicators.json`);
        } else {
          ok(`${id}: derivedFrom ${compId} ✓`);
        }
      }
    }
  } else {
    const primarySource = contract.source?.primary;
    if (!primarySource) {
      fail(`${id}: no primary source declared`);
    } else {
      const srcContract = sourceContracts?.sources?.[primarySource];
      if (!srcContract) {
        fail(`${id}: primary source "${primarySource}" not in source-contracts.json`);
      } else if (!srcContract.isPrimaryFor?.includes(id)) {
        fail(`${id}: "${primarySource}" contract does not list ${id} in isPrimaryFor`);
      } else {
        ok(`${id}: primary=${primarySource} ✓`);
      }

      // Check forbidden fallbacks are actually restricted in source contract.
      for (const fb of (contract.source?.forbiddenFallbacks || [])) {
        const fbContract = sourceContracts?.sources?.[primarySource];
        const restrictions = fbContract?.fallbackRestrictions?.[fb];
        if (restrictions?.forbiddenFor?.includes?.(id)) {
          ok(`${id}: fallback ${fb} correctly forbidden in source contract`);
        } else if (Array.isArray(restrictions?.allowedFor) && restrictions.allowedFor.includes('non_critical_only') && contract.critical) {
          ok(`${id}: fallback ${fb} correctly restricted (non_critical_only vs critical)`);
        } else {
          fail(`${id}: indicator contract forbids fallback "${fb}" but source contract (${primarySource}) does not enforce this — add ${id} to ${primarySource}.fallbackRestrictions.${fb}.forbiddenFor`);
        }
      }
    }
  }

  // 2. Unit contract check
  console.log('  [2/8] Unit contract:');
  if (contract.unit?.contractRequired) {
    const unitConfig = indicatorUnits?.indicators?.[contract.unit.configId || id];
    if (!unitConfig) {
      fail(`${id}: unit contract required but not found in indicator-units.json`);
    } else {
      ok(`${id}: unit contract exists (${unitConfig.canonicalUnit}, ${unitConfig.ranges?.length || 0} ranges)`);
    }
  } else {
    ok(`${id}: no unit contract required`);
  }

  // 3. Freshness check — hard fail on mismatch for contracted indicators
  console.log('  [3/8] Freshness:');
  const freshnessConfig = indicators?.freshness?.[id];
  if (!freshnessConfig) {
    fail(`${id}: no freshness rule in indicators.json — contract declared but config missing`);
  } else if (contract.freshness) {
    if (freshnessConfig.maxAgeDays !== contract.freshness.maxAgeDays) {
      fail(`${id}: maxAgeDays mismatch — contract=${contract.freshness.maxAgeDays}, indicators.json=${freshnessConfig.maxAgeDays}`);
    } else {
      ok(`${id}: maxAgeDays=${contract.freshness.maxAgeDays} ✓`);
    }
    if (freshnessConfig.staleAction !== contract.freshness.staleAction) {
      fail(`${id}: staleAction mismatch — contract=${contract.freshness.staleAction}, indicators.json=${freshnessConfig.staleAction}`);
    }
  }

  // 4. Temporal diff check
  console.log('  [4/8] Temporal diff:');
  if (contract.temporalDiff?.tracked) {
    const inTemporal = new RegExp(`id:\\s*['"]${id}['"]`).test(temporalDiffSrc);
    if (!inTemporal) {
      fail(`${id}: declared as temporal-diff tracked but not in TRACKED_INDICATORS`);
    } else {
      ok(`${id}: in TRACKED_INDICATORS ✓`);
    }
  } else {
    ok(`${id}: not tracked in temporal-diff`);
  }

  // 5. Feedback check — uses feedbackSchema.indicatorToBlueprint as ground truth
  console.log('  [5/8] Feedback:');
  if (contract.feedback?.tracked) {
    const blueprintMap = feedbackSchema?.indicatorToBlueprint;
    if (!blueprintMap) {
      warn(`${id}: declared as feedback-tracked but feedback-schema.json has no indicatorToBlueprint map`);
    } else if (blueprintMap[id]) {
      const expectedBlueprint = contract.feedback.blueprint;
      if (expectedBlueprint && blueprintMap[id] !== expectedBlueprint) {
        fail(`${id}: feedback blueprint mismatch — contract=${expectedBlueprint}, schema=${blueprintMap[id]}`);
      } else {
        ok(`${id}: in feedback-schema.json indicatorToBlueprint → ${blueprintMap[id]} ✓`);
      }
    } else {
      fail(`${id}: declared as feedback-tracked but not in feedback-schema.json indicatorToBlueprint map`);
    }
  } else {
    ok(`${id}: not tracked in feedback`);
  }

  // 6. Report exposure check — structural checks only; text-match is a soft signal
  console.log('  [6/8] Report:');
  if (contract.report?.exposure === 'direct') {
    const sectionFile = path.join(reportSectionsDir, `${contract.report.section}.md`);
    if (!fs.existsSync(sectionFile)) {
      fail(`${id}: report section "${contract.report.section}" not found at ${sectionFile}`);
    } else {
      ok(`${id}: section file ${contract.report.section}.md exists`);

      // Text-based presence check is a soft signal, not proof of consumption
      const sectionContent = fs.readFileSync(sectionFile, 'utf8');
      const displayName = contract.report.displayAs || contract.name;
      if (!sectionContent.includes(id) && !sectionContent.includes(displayName)) {
        warn(`${id}: section "${contract.report.section}.md" exists but neither "${id}" nor "${displayName}" found in text — report may not consume this indicator`);
      }
    }

    // Check report schema
    if (reportSchema?.sections) {
      const sectionKey = contract.report.section?.split('-')[0]; // "3-gold" → "3"
      const schemaSection = reportSchema.sections?.[sectionKey];
      if (!schemaSection) {
        warn(`${id}: report section key "${sectionKey}" not in report/schema.json sections`);
      }
    }
  } else if (contract.report?.exposure === 'indirect') {
    ok(`${id}: indirect report exposure (reasoning only)`);
  } else {
    ok(`${id}: no report exposure`);
  }

  // 7. Catalog entry check
  console.log('  [7/8] Catalog:');
  if (contract.catalogEntry) {
    if (!catalogMd) {
      warn(`${id}: catalogEntry declared but indicator-catalog.md not found — cannot verify`);
    } else if (new RegExp(`\\|\\s*${id}\\s*\\|`).test(catalogMd)) {
      ok(`${id}: catalog entry found in indicator-catalog.md ✓`);
    } else {
      fail(`${id}: catalogEntry declared but "${id}" not found in indicator-catalog.md`);
    }
  } else {
    ok(`${id}: no catalog entry required`);
  }

  // 8. Compute check — for derived indicators, verify formula exists in compute/index.cjs
  console.log('  [8/8] Compute:');
  if (contract.kind === 'derived') {
    if (!contract.compute) {
      fail(`${id}: kind=derived but no compute contract declared`);
    } else {
      const computeFile = contract.compute.file || 'compute/index.cjs';
      const computePath = path.join(skillRoot, computeFile);
      if (!fs.existsSync(computePath)) {
        fail(`${id}: compute file "${computeFile}" not found`);
      } else {
        const computeSrc = fs.readFileSync(computePath, 'utf8');
        const hasN7 = new RegExp(`derived\\.${id}\\s*=`).test(computeSrc);
        if (!hasN7) {
          fail(`${id}: derived formula not found in ${computeFile} — expected "derived.${id} = "`);
        } else {
          ok(`${id}: derived formula found in ${computeFile} ✓`);
        }

        // Verify components referenced in compute file
        for (const compId of (contract.compute.components || [])) {
          if (!new RegExp(`get\\('${compId}'\\)`).test(computeSrc)) {
            warn(`${id}: component "${compId}" not referenced in ${computeFile} (may be indirect)`);
          } else {
            ok(`${id}: component ${compId} referenced in compute ✓`);
          }
        }
      }
    }
  } else if (contract.compute) {
    ok(`${id}: has compute contract (raw indicator consumer)`);
  } else {
    ok(`${id}: no compute contract required`);
  }
}

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n=== Results: ${errors} error(s), ${warnings} warning(s) ===`);
if (errors > 0) {
  console.error('INDICATOR CONTRACT CHECK FAILED — cross-reference gaps found.\n');
  process.exit(1);
} else {
  console.log('INDICATOR CONTRACT CHECK PASSED — all declared contracts are consistent.\n');
  process.exit(0);
}
