// collector/websearch-fill.cjs — ttfund-monitor v2.9.0
// WebSearch pending auto-fill/reflow pipeline stage.
// 3 modes: template (generate), fill (reflow), validate (dry-run).
// Contract enforcement: recalculates writePolicy from source-contracts.json,
// never trusts LLM-filled contractDecision/writePolicy (guardrail per review).
//
// Usage:
//   node collector/websearch-fill.cjs --runId X --mode template
//   node collector/websearch-fill.cjs --runId X --mode fill
//   node collector/websearch-fill.cjs --runId X --mode validate

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME } = require('../lib/workspace.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flagVal(f) { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; }
const runId = flagVal('--runId');
const mode = flagVal('--mode') || 'validate';
if (!runId) { console.error('ERROR: --runId required'); process.exit(1); }
if (!['template', 'fill', 'validate'].includes(mode)) {
  console.error('ERROR: --mode must be template, fill, or validate');
  process.exit(1);
}

const RUN_DIR = path.join(RUNTIME, 'runs', runId);
const now = new Date();

// ── Helpers ──────────────────────────────────────────────────
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

// ── Contract resolution (recalculated, never trusted from LLM) ──
function resolveWritePolicy(indicatorId, sourceContracts, sourcesCfg, isCritical) {
  const wsContract = sourceContracts?.sources?.websearch;
  if (!wsContract) return { policy: 'blocked_by_contract', reason: 'no websearch contract' };

  // 1. Check blocked_by_contract: any source explicitly forbids websearch for this indicator
  for (const [srcId, src] of Object.entries(sourceContracts.sources)) {
    const restrictions = src.fallbackRestrictions?.websearch;
    if (restrictions?.forbiddenFor?.includes(indicatorId)) {
      return {
        policy: 'blocked_by_contract',
        reason: `${srcId} contract explicitly forbids websearch fallback for ${indicatorId}`,
        expectedSource: srcId,
        actualSource: 'websearch',
        writePolicy: 'blocked'
      };
    }
  }

  // 2. Check allowed_exception: specific exemption (reserved for future)
  // (none currently defined)

  // 3. Check fillable_websearch: websearch is the designated primary collector
  if (wsContract.isPrimaryFor?.includes(indicatorId)) {
    return {
      policy: 'fillable_websearch',
      reason: `websearch is designated primary collector for ${indicatorId}`,
      expectedSource: 'websearch',
      actualSource: 'websearch',
      writePolicy: 'write_to_raw'
    };
  }

  // 4. Check fallback_allowed: websearch is designated fallback
  if (wsContract.isFallbackFor?.includes(indicatorId)) {
    return {
      policy: 'fallback_allowed',
      reason: `websearch is designated fallback for ${indicatorId}`,
      expectedSource: resolveExpectedSource(indicatorId, sourceContracts),
      actualSource: 'websearch',
      writePolicy: 'write_to_raw'
    };
  }

  // 5. Check if any source allows websearch as fallback target
  const expectedSrc = resolveExpectedSource(indicatorId, sourceContracts);
  if (expectedSrc) {
    const srcContract = sourceContracts.sources[expectedSrc];
    if (srcContract?.allowedFallbackTargets?.includes('websearch')) {
      const restrictions = srcContract.fallbackRestrictions?.websearch;
      if (!restrictions) {
        return {
          policy: 'fallback_allowed',
          reason: `${expectedSrc} allows websearch fallback with no per-indicator restrictions`,
          expectedSource: expectedSrc,
          actualSource: 'websearch',
          writePolicy: 'write_to_raw'
        };
      }
      if (Array.isArray(restrictions.allowedFor) && restrictions.allowedFor.includes('non_critical_only')) {
        if (!isCritical) {
          return {
            policy: 'fallback_allowed',
            reason: `${expectedSrc} allows websearch for non-critical indicators`,
            expectedSource: expectedSrc,
            actualSource: 'websearch',
            writePolicy: 'write_to_raw'
          };
        }
      }
    }
  }

  // Default: no path to websearch
  return {
    policy: 'blocked_by_contract',
    reason: `no contract path from any source to websearch for ${indicatorId}`,
    expectedSource: expectedSrc || 'unknown',
    actualSource: 'websearch',
    writePolicy: 'blocked'
  };
}

function resolveExpectedSource(indicatorId, sourceContracts) {
  for (const [srcId, contract] of Object.entries(sourceContracts.sources)) {
    if (contract.isPrimaryFor?.includes(indicatorId)) return srcId;
  }
  for (const [srcId, contract] of Object.entries(sourceContracts.sources)) {
    if (contract.supportedIndicators?.prefixes) {
      for (const prefix of contract.supportedIndicators.prefixes) {
        if (indicatorId === prefix || indicatorId.startsWith(prefix + '_')) return srcId;
      }
    }
  }
  return null;
}

// ── Load configs ─────────────────────────────────────────────
const sourcesCfg = require(path.join(__dirname, '..', 'config', 'sources.json'));
const sourceContracts = require(path.join(__dirname, '..', 'config', 'source-contracts.json'));

const wsItems = sourcesCfg.websearch?.items || [];
const wsDisclosures = sourcesCfg.websearch?.disclosures || [];

// ── Mode: template ───────────────────────────────────────────
function modeTemplate() {
  console.log(`=== websearch-fill template ===`);
  console.log(`runId: ${runId}\n`);

  const items = [];

  // Fillable items from websearch.items
  for (const item of wsItems) {
    const contract = resolveWritePolicy(item.id, sourceContracts, sourcesCfg, item.critical || false);
    items.push({
      id: item.id,
      name: item.name,
      query: item.query,
      unit: item.unit,
      critical: item.critical || false,
      status: 'pending',
      value: null,
      date: null,
      sourceUrl: null,
      sourceTitle: null,
      confidence: null,
      failureClass: null,
      notes: null,
      contractEnforcement: {
        expectedSource: contract.expectedSource,
        actualSource: 'websearch',
        contractDecision: contract.policy,
        contractReason: contract.reason,
        writePolicy: contract.writePolicy,
        sourceTitle: null,
        sourceDate: null,
        retrievedAt: null
      }
    });
  }

  // Blocked disclosures (F1, F2)
  const disclosures = [];
  for (const d of wsDisclosures) {
    disclosures.push({
      id: d.id,
      name: d.name,
      query: d.query || null,
      writePolicy: 'blocked_by_contract',
      contractReason: d.reason || 'source contract forbids websearch',
      disclosureNote: null,
      disclosureDate: null
    });
  }

  const template = {
    runId,
    generatedAt: now.toISOString(),
    filledAt: null,
    items,
    disclosures,
    summary: {
      total: items.length + disclosures.length,
      fillable: items.length,
      blocked: disclosures.length,
      success: 0,
      failed: 0,
      pending: items.length
    }
  };

  const outPath = path.join(RUN_DIR, 'websearch-results.json');
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(template, null, 2));
  console.log(`  → websearch-results.json (${items.length} fillable + ${disclosures.length} blocked)`);
  console.log(`  Fillable: ${items.map(i => i.id).join(', ')}`);
  if (disclosures.length > 0) {
    console.log(`  Blocked (disclosure only): ${disclosures.map(d => d.id).join(', ')}`);
  }
  console.log(`\nNext: LLM fills value/date/sourceUrl/sourceTitle for each pending item, then:`);
  console.log(`  node collector/websearch-fill.cjs --runId ${runId} --mode fill`);
}

// ── Mode: fill ───────────────────────────────────────────────
function modeFill() {
  console.log(`=== websearch-fill reflow ===`);
  console.log(`runId: ${runId}\n`);

  const wsResultsPath = path.join(RUN_DIR, 'websearch-results.json');
  const wsResults = readJSON(wsResultsPath);
  if (!wsResults) { console.error('FATAL: websearch-results.json not found — run --mode template first'); process.exit(1); }

  const rawPath = path.join(RUN_DIR, 'raw.json');
  const raw = readJSON(rawPath);
  if (!raw) { console.error('FATAL: raw.json not found'); process.exit(1); }

  const provenancePath = path.join(RUN_DIR, 'provenance.json');
  const provenance = readJSON(provenancePath);
  if (!provenance) { console.error('FATAL: provenance.json not found'); process.exit(1); }

  let successCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  const provenanceRecords = [];

  for (const item of wsResults.items || []) {
    // Skip already-reflowed items (terminal state)
    if (item.status === 'reflowed') {
      console.log(`  ${item.id}: reflowed — skipping`);
      continue;
    }

    // Guardrail: recalculate contract, never trust LLM
    const contract = resolveWritePolicy(item.id, sourceContracts, sourcesCfg, item.critical || false);

    // Override LLM-filled contractEnforcement with recalculated values
    item.contractEnforcement = {
      expectedSource: contract.expectedSource,
      actualSource: 'websearch',
      contractDecision: contract.policy,
      contractReason: contract.reason,
      writePolicy: contract.writePolicy,
      sourceTitle: item.sourceTitle || null,
      sourceDate: item.date || null,
      retrievedAt: item.status === 'filled' ? now.toISOString() : null
    };

    if (item.status !== 'filled') {
      console.log(`  ${item.id}: ${item.status} — skipping`);
      if (item.status === 'failed') failedCount++;
      continue;
    }

    // Blocked indicators: never write to raw.json
    if (contract.policy === 'blocked_by_contract') {
      console.log(`  ${item.id}: BLOCKED by contract — value moved to disclosures, NOT written to raw.json`);
      blockedCount++;

      // Add to disclosures in websearch-results.json
      if (!wsResults.disclosures) wsResults.disclosures = [];
      const existingIdx = wsResults.disclosures.findIndex(d => d.id === item.id);
      const disclosureEntry = {
        id: item.id,
        name: item.name,
        writePolicy: 'blocked_by_contract',
        contractReason: contract.reason,
        disclosureNote: `LLM filled value=${item.value} (date=${item.date}) but contract forbids websearch — advisory only`,
        disclosureDate: now.toISOString()
      };
      if (existingIdx >= 0) {
        wsResults.disclosures[existingIdx] = disclosureEntry;
      } else {
        wsResults.disclosures.push(disclosureEntry);
      }

      // Record in provenance but NOT in raw.json results
      provenanceRecords.push({
        indicator: item.id,
        expectedSource: contract.expectedSource,
        actualSource: 'websearch',
        contractDecision: contract.policy,
        contractReason: contract.reason,
        writePolicy: 'blocked',
        value: item.value,
        date: item.date,
        sourceUrl: item.sourceUrl,
        sourceTitle: item.sourceTitle,
        retrievedAt: now.toISOString(),
        disposition: 'blocked_by_contract — value NOT written to raw.json'
      });
      continue;
    }

    // Validate required fields
    const missingFields = [];
    if (!item.sourceUrl) missingFields.push('sourceUrl');
    if (!item.date) missingFields.push('date');
    if (item.value == null) missingFields.push('value');

    if (missingFields.length > 0) {
      console.log(`  ${item.id}: FAILED — missing: ${missingFields.join(', ')}`);
      item.status = 'failed';
      item.failureClass = 'missing_fields';
      failedCount++;
      continue;
    }

    // Forbidden value check
    const forbiddenTypes = sourceContracts?.forbiddenFallbackTypes || {};
    const valueStr = String(item.value);
    const noteStr = [item.notes, item.sourceTitle].filter(Boolean).join(' ');
    const combined = `${valueStr} ${noteStr}`;
    const forbiddenHit = Object.entries(forbiddenTypes).find(([, desc]) => {
      const patterns = {
        news_article: /新闻|报道|article|news/i,
        proxy_etf: /ETF|GLD|IAU|SGOL/i,
        approximate: /^\s*~\s*\d|约\s*\d|大约|approx/i,
      };
      return patterns[Object.keys(forbiddenTypes).find(k => forbiddenTypes[k] === desc)]?.test(combined);
    });

    if (forbiddenHit) {
      console.log(`  ${item.id}: FAILED — forbidden value type: ${forbiddenHit[0]}`);
      item.status = 'failed';
      item.failureClass = `forbidden_${forbiddenHit[0]}`;
      failedCount++;
      continue;
    }

    // Write to raw.json
    raw.results[item.id] = {
      indicator: item.id,
      value: item.value,
      date: item.date,
      source: 'websearch',
      unit: item.unit || '',
      _sourceUrl: item.sourceUrl,
      _sourceTitle: item.sourceTitle || null,
      _filledAt: now.toISOString(),
      _fallback: contract.policy === 'fallback_allowed' ? true : undefined,
      _freshStatus: 'fresh' // will be recomputed on next freshness check
    };

    // Mark as reflowed (terminal) — distinguishes from LLM-filled-but-not-reflowed
    item.status = 'reflowed';
    successCount++;
    console.log(`  ${item.id}: OK — ${contract.policy} → raw.json (${item.value} ${item.unit || ''})`);

    provenanceRecords.push({
      indicator: item.id,
      expectedSource: contract.expectedSource,
      actualSource: 'websearch',
      contractDecision: contract.policy,
      contractReason: contract.reason,
      writePolicy: contract.writePolicy,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      sourceDate: item.date,
      retrievedAt: now.toISOString(),
      value: item.value,
      confidence: item.confidence || null,
      disposition: contract.policy === 'fillable_websearch'
        ? 'written_to_raw (primary collector)'
        : 'written_to_raw (fallback)'
    });
  }

  // Process disclosures from blocked items
  for (const d of wsResults.disclosures || []) {
    if (d.writePolicy === 'blocked_by_contract' && d.disclosureNote) {
      console.log(`  ${d.id}: disclosure recorded (blocked by contract, not in raw)`);
    }
  }

  // Update raw.json summary: cumulative counts from all items (not just this invocation)
  const cumulativePending = wsResults.items.filter(i => i.status === 'pending').length;
  const cumulativeFailed = wsResults.items.filter(i => i.status === 'failed').length;
  const cumulativeReflowed = wsResults.items.filter(i => i.status === 'reflowed').length;
  const fillableIds = wsItems.map(w => w.id);
  const newPendingIds = wsResults.items
    .filter(i => i.status === 'pending' && fillableIds.includes(i.id))
    .map(i => i.id);
  // Count actual websearch results in raw (cumulative, from all fills)
  const rawWsCount = Object.values(raw.results || {}).filter(r => r.source === 'websearch' && r.value != null).length;
  const blockedDisclosureCount = (wsResults.disclosures || []).filter(d => d.disclosureNote).length;

  raw.summary.websearchPending = cumulativePending;
  raw.summary.websearchPendingIds = newPendingIds;
  raw.summary.websearchFilled = rawWsCount;
  raw.summary.websearchFailed = cumulativeFailed;
  raw.summary.websearchBlocked = blockedDisclosureCount;

  // Add websearchDisclosures to raw.json summary (informational, not pending)
  raw.summary.websearchDisclosures = (wsResults.disclosures || []).map(d => ({
    id: d.id,
    reason: d.contractReason || 'blocked_by_contract',
    hasAdvisoryNote: !!d.disclosureNote
  }));

  // Write raw.json
  raw.collectedAt = now.toISOString();
  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  console.log(`\n  raw.json updated: ${successCount} filled, ${failedCount} failed, ${blockedCount} blocked`);

  // Update provenance.json (both root summary and websearch section)
  if (!provenance.websearch) provenance.websearch = {};
  provenance.websearch = {
    runId,
    filledAt: now.toISOString(),
    records: provenanceRecords,
    summary: {
      total: wsResults.items.length + (wsResults.disclosures || []).length,
      fillable: wsResults.items.length,
      blocked: (wsResults.disclosures || []).length,
      reflowed: cumulativeReflowed,
      failed: cumulativeFailed,
      pending: cumulativePending
    }
  };
  // Sync root provenance summary to reflect reflow state
  if (provenance.summary) {
    provenance.summary.websearchFilled = cumulativeReflowed;
    provenance.summary.websearchBlocked = blockedDisclosureCount;
    provenance.summary.websearchPending = cumulativePending;
  }
  fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));
  console.log(`  provenance.json updated`);

  // Update websearch-results.json with cumulative counts
  wsResults.filledAt = now.toISOString();
  wsResults.summary = {
    total: wsResults.items.length + (wsResults.disclosures || []).length,
    fillable: wsResults.items.length,
    blocked: (wsResults.disclosures || []).length,
    reflowed: cumulativeReflowed,
    failed: cumulativeFailed,
    pending: cumulativePending
  };
  fs.writeFileSync(wsResultsPath, JSON.stringify(wsResults, null, 2));
  console.log(`  websearch-results.json updated`);

  // Regenerate derived
  console.log(`\n── Regenerating derived ──`);
  const { execSync } = require('child_process');
  try {
    execSync(`node "${path.join(__dirname, '..', 'compute', 'index.cjs')}" --runId ${runId}`, {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 30000,
      windowsHide: true
    });
    console.log(`  derived.json + derived-snapshot.md regenerated`);
  } catch (e) {
    console.error(`  WARN: derived regeneration failed: ${e.message.slice(0, 200)}`);
  }

  console.log(`\n=== DONE: ${successCount} filled, ${failedCount} failed, ${blockedCount} blocked ===`);
  console.log(`Next: node collector/validate-source-contract.cjs --runId ${runId}`);
}

// ── Mode: validate ───────────────────────────────────────────
function modeValidate() {
  console.log(`=== websearch-fill validate (dry-run) ===`);
  console.log(`runId: ${runId}\n`);

  const wsResultsPath = path.join(RUN_DIR, 'websearch-results.json');
  const wsResults = readJSON(wsResultsPath);

  const rawPath = path.join(RUN_DIR, 'raw.json');
  const raw = readJSON(rawPath);

  let errs = 0;
  let warns = 0;

  // 1. Check websearch-results.json exists
  if (!wsResults) {
    console.error(`  FAIL: websearch-results.json not found — run --mode template first`);
    process.exit(1);
  }

  // 2. Check pending vs filled counts
  const pending = wsResults.items?.filter(i => i.status === 'pending').length || 0;
  const filled = wsResults.items?.filter(i => i.status === 'filled').length || 0;
  const failed = wsResults.items?.filter(i => i.status === 'failed').length || 0;
  const blocked = wsResults.disclosures?.length || 0;

  console.log(`  Items: ${wsResults.items?.length || 0} total | ${filled} filled | ${failed} failed | ${pending} pending`);
  console.log(`  Disclosures (blocked): ${blocked}`);

  // 3. Check no blocked items in raw.json results
  if (raw?.results) {
    const wsDisclosureIds = (wsResults.disclosures || []).map(d => d.id);
    for (const dId of wsDisclosureIds) {
      const r = raw.results[dId];
      if (r && r.source === 'websearch' && r.value != null) {
        console.error(`  FAIL: ${dId} is blocked_by_contract but has websearch value in raw.json — MUST be removed`);
        errs++;
      }
    }
    if (errs === 0) console.log(`  No blocked items in raw.json results`);
  }

  // 4. Check F1/F2 pending semantics
  const rawPending = raw?.summary?.websearchPendingIds || [];
  const rawDisclosures = raw?.summary?.websearchDisclosures || [];
  for (const dId of ['F1', 'F2']) {
    if (rawPending.includes(dId)) {
      console.error(`  FAIL: ${dId} is in websearchPendingIds — should be in websearchDisclosures only`);
      errs++;
    }
  }
  for (const d of rawDisclosures) {
    if (!['F1', 'F2'].includes(d.id)) {
      console.warn(`  WARN: unexpected disclosure: ${d.id}`);
      warns++;
    }
  }

  // 5. Check filled items have required fields
  for (const item of wsResults.items || []) {
    if (item.status !== 'filled') continue;
    if (!item.sourceUrl) { console.warn(`  WARN: ${item.id} filled but missing sourceUrl`); warns++; }
    if (!item.date) { console.warn(`  WARN: ${item.id} filled but missing date`); warns++; }
    if (item.value == null) { console.warn(`  WARN: ${item.id} filled but value is null`); warns++; }
  }

  // 6. Check contract enforcement was recalculated (not LLM-original)
  for (const item of wsResults.items || []) {
    if (item.status !== 'filled') continue;
    const ce = item.contractEnforcement;
    if (!ce) {
      console.warn(`  WARN: ${item.id} missing contractEnforcement — may not have been reflowed`);
      warns++;
      continue;
    }
    const expected = resolveWritePolicy(item.id, sourceContracts, sourcesCfg, item.critical || false);
    if (ce.contractDecision !== expected.policy) {
      console.error(`  FAIL: ${item.id} contractDecision mismatch — stored=${ce.contractDecision}, expected=${expected.policy}`);
      errs++;
    }
  }

  // 7. Summary consistency: websearch-results.json internal
  console.log(`\n── 7. Summary Consistency ──`);
  const reflowedCount = wsResults.items?.filter(i => i.status === 'reflowed').length || 0;
  const failedCount = wsResults.items?.filter(i => i.status === 'failed').length || 0;
  const pendingCount = wsResults.items?.filter(i => i.status === 'pending').length || 0;
  const blockedCount = (wsResults.disclosures || []).filter(d => d.disclosureNote).length;

  if (wsResults.summary?.reflowed !== reflowedCount) {
    console.error(`  FAIL: websearch-results summary.reflowed=${wsResults.summary?.reflowed} but actual reflowed items=${reflowedCount}`);
    errs++;
  } else {
    console.log(`  ✓ websearch-results summary.reflowed=${reflowedCount} matches items`);
  }
  if (wsResults.summary?.failed !== failedCount) {
    console.error(`  FAIL: websearch-results summary.failed=${wsResults.summary?.failed} but actual failed items=${failedCount}`);
    errs++;
  }
  if (wsResults.summary?.pending !== pendingCount) {
    console.error(`  FAIL: websearch-results summary.pending=${wsResults.summary?.pending} but actual pending items=${pendingCount}`);
    errs++;
  }

  // 8. Summary consistency: raw.json vs reality
  if (raw?.results) {
    const actualWsFilled = Object.values(raw.results).filter(r => r.source === 'websearch' && r.value != null).length;
    if (raw.summary?.websearchFilled !== actualWsFilled) {
      console.error(`  FAIL: raw.summary.websearchFilled=${raw.summary?.websearchFilled} but actual websearch results=${actualWsFilled}`);
      errs++;
    } else {
      console.log(`  ✓ raw.summary.websearchFilled=${actualWsFilled} matches raw results`);
    }
    if (raw.summary?.websearchBlocked !== blockedCount) {
      console.error(`  FAIL: raw.summary.websearchBlocked=${raw.summary?.websearchBlocked} but actual blocked disclosures=${blockedCount}`);
      errs++;
    } else {
      console.log(`  ✓ raw.summary.websearchBlocked=${blockedCount} matches disclosures`);
    }
    if (raw.summary?.websearchPending !== pendingCount) {
      console.error(`  FAIL: raw.summary.websearchPending=${raw.summary?.websearchPending} but actual pending=${pendingCount}`);
      errs++;
    } else {
      console.log(`  ✓ raw.summary.websearchPending=${pendingCount} matches ws items`);
    }
  }

  // 9. Summary consistency: provenance summary
  const provenancePath = path.join(RUN_DIR, 'provenance.json');
  const provenance = readJSON(provenancePath);
  if (provenance?.summary) {
    if (provenance.summary.websearchPending !== pendingCount) {
      console.error(`  FAIL: provenance.summary.websearchPending=${provenance.summary.websearchPending} but ws pending=${pendingCount}`);
      errs++;
    } else {
      console.log(`  ✓ provenance.summary.websearchPending=${pendingCount} matches`);
    }
    if (provenance.summary.websearchFilled != null && provenance.summary.websearchFilled !== reflowedCount) {
      console.error(`  FAIL: provenance.summary.websearchFilled=${provenance.summary.websearchFilled} but reflowed=${reflowedCount}`);
      errs++;
    }
  }

  // 10. Stale narrative scan — catch known expired phrases in key artifacts
  console.log(`\n── 10. Stale Narrative Scan ──`);
  const stalePatterns = [
    // TED利差 only when NOT in deprecation context (check both before and after)
    { pattern: /(?<!废弃.{0,30}|DEPRECATED.{0,30}|替换.{0,30}|替代.{0,30})TED利差(?!.{0,30}(?:废弃|DEPRECATED|替换|派生|替代|SOFR))/g, label: 'TED利差 as active (N7已替换为SOFR-IORB)' },
    { pattern: /TED\s*LIBOR\s*废弃/g, label: 'TED LIBOR废弃 — N7已替换为SOFR-IORB派生' },
    { pattern: /A1.{0,20}MOVE.{0,20}(?:null|🔴|缺口|missing|缺失)(?!.{0,80}(?:rejected|news_article|blocked|contract|拒绝|拦截|合同))/gi, label: 'A1 MOVE null/gap WITHOUT rejection context — WebSearch attempted fill, verify if genuinely blocked or filler missed it' },
    { pattern: /WebSearch\s*10\s*项\s*待补采/g, label: 'WebSearch 10项待补采 (7已reflow/2blocked)' },
    { pattern: /10\s*WebSearch\s*待补采/g, label: '10 WebSearch待补采 (7已reflow/2blocked)' },
    { pattern: /B4\s*FedWatch\s*未采集/g, label: 'B4 FedWatch未采集 (WebSearch已补采38%)' },
  ];
  // Files that are actively maintained (exclude old snapshots that are frozen at collect time)
  const scanFiles = ['report.md', 'reasoning-snapshot.json', 'reasoning-snapshot.md',
    'websearch-tasks.md', 'current.md', 'provenance.md'];
  let scannedCount = 0;
  let foundStale = 0;
  for (const filename of scanFiles) {
    const fp = path.join(RUN_DIR, filename);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf8');
    scannedCount++;
    for (const sp of stalePatterns) {
      const matches = content.match(sp.pattern);
      if (matches) {
        // Collect line numbers for precise reporting
        const lines = content.split('\n');
        const hitLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (sp.pattern.test(lines[i])) {
            hitLines.push(i + 1);
            sp.pattern.lastIndex = 0; // reset global regex
          }
        }
        console.error(`  FAIL: ${filename}:${hitLines.join(',')} — "${sp.label}" (${matches.length} occurrence(s))`);
        foundStale += matches.length;
        errs++;
      }
    }
  }
  if (foundStale === 0) {
    console.log(`  ✓ Scanned ${scannedCount} files — 0 stale narratives found`);
  } else {
    console.error(`  ${foundStale} stale narrative(s) found across ${scannedCount} scanned files`);
  }

  console.log(`\n=== Validate: ${errs} error(s), ${warns} warning(s) ===`);
  if (errs > 0) process.exit(1);
  console.log(`VALIDATE PASSED\n`);
}

// ── Dispatch ─────────────────────────────────────────────────
if (mode === 'template') modeTemplate();
else if (mode === 'fill') modeFill();
else if (mode === 'validate') modeValidate();
