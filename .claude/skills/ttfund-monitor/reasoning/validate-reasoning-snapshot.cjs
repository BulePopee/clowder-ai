// reasoning/validate-reasoning-snapshot.cjs — ttfund-monitor v2.5.0
// Recursively validates reasoning-snapshot.json AND reasoning-snapshot.md
// Usage: node reasoning/validate-reasoning-snapshot.cjs --runId 20260630-1412-ragdoll-vzes
// Exit code 0 = pass, 1 = blocked issues

const fs = require('fs');
const path = require('path');

const RUNTIME = 'D:/clowder-ai/packages/api/data/ttfund-monitor';
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(_) { return null; } }

const snapshot = readJSON(path.join(RUN_DIR, 'reasoning-snapshot.json'));
const evidence = readJSON(path.join(RUN_DIR, 'evidence-packet.json'));
const mdPath = path.join(RUN_DIR, 'reasoning-snapshot.md');
const mdText = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : null;

if (!snapshot) { console.error('FATAL: reasoning-snapshot.json not found'); process.exit(1); }

const errors = [];
const warnings = [];

// ── Recursive JSON string collector ──────────────────────────
function collectStrings(obj, prefix) {
  const results = [];
  if (typeof obj === 'string') { results.push({ path: prefix, value: obj }); }
  else if (Array.isArray(obj)) { obj.forEach((v,i) => { results.push(...collectStrings(v, `${prefix}[${i}]`)); }); }
  else if (obj && typeof obj === 'object') {
    for (const [k,v] of Object.entries(obj)) { results.push(...collectStrings(v, `${prefix}.${k}`)); }
  }
  return results;
}
const allStrings = collectStrings(snapshot, 'root');

// ── Determine which sections are action-blocked ──────────────
const isGoldBlocked = snapshot.gold_rate_conflict?.action_gate?.action_allowed === false;
const isPortfolioBlocked = snapshot.portfolio_action_gate?.action_advice_allowed === false;

// ── Check 1: Forbidden MMF language (all strings, all contexts) ──
const forbiddenMmPatterns = [
  // English
  { pattern: /near[-\s]?cash/i, label: 'near-cash' },
  { pattern: /de[-\s]?facto\s+conservative/i, label: 'de-facto conservative' },
  { pattern: /bond[-\s]like/i, label: 'bond-like' },
  { pattern: /bond\s+exposure/i, label: 'bond exposure (MMF context)' },
  { pattern: /MMF.{0,30}(?:provides?|acts?\s+as)\s+(?:bond|fixed.income|cash|conservative)/i, label: 'MMF provides bond/fixed-income/cash exposure' },
  { pattern: /MMF\s+(?:offsets?|substitutes?|replaces?)\s+(?:HQB|cash|bond|fixed.income)/i, label: 'MMF offsets HQB/bond/cash gap' },
  { pattern: /MMF\s+(?:is|as)\s+(?:a\s+)?(?:bond|cash|fixed.income)/i, label: 'MMF classified as bond/cash' },
  { pattern: /(?:treat|use|count).{0,20}MMF.{0,20}(?:as|like).{0,10}(?:cash|bond)/i, label: 'treat MMF as cash/bond' },
  { pattern: /cash[-\s]?equivalent.{0,30}MMF/i, label: 'cash-equivalent MMF' },
  { pattern: /functionally.{0,10}(?:near|cash|conservative)/i, label: 'functionally near-cash' },
  // Chinese
  { pattern: /事实.{0,5}保守/, label: '事实保守' },
  { pattern: /近现金/, label: '近现金' },
  { pattern: /类现金仓/, label: '类现金仓' },
  { pattern: /抵现金缺口/, label: '抵现金缺口' },
  { pattern: /功能.{0,5}接[近进]现金/, label: '功能上接近现金' },
  { pattern: /MMF.{0,20}(?:保守|现金)/, label: 'MMF保守/现金' },
  { pattern: /只是不符合.{0,10}(?:定义|框架)/, label: '只是不符合定义框架 (弱化规则)' },
  { pattern: /仅仅.{0,5}不符合/, label: '仅仅不符合 (弱化规则)' },
  { pattern: /定义框架/, label: '定义框架 (弱化G003)' },
  { pattern: /纳入.{0,10}(?:固定收益|债券|现金)/, label: '纳入固定收益/债券/现金 (MMF分类错误)' },
  { pattern: /货币基金.{0,20}(?:抵扣|替代|充当|视为.*现金)/, label: '货币基金抵扣/替代现金' },
];

for (const { path: strPath, value } of allStrings) {
  for (const { pattern, label } of forbiddenMmPatterns) {
    if (pattern.test(value)) {
      errors.push(`MMF_LANG(${strPath}): "${label}" — "${value.slice(0, 120)}"`);
    }
  }
}

// ── Check 2: Action words in blocked sections ────────────────
const actionWords = [
  { pattern: /\badd\b/i, label: 'add' },
  { pattern: /加仓/, label: '加仓' },
  { pattern: /\boverweight\b/i, label: 'overweight' },
  { pattern: /\breduce\b/i, label: 'reduce' },
  { pattern: /减持/, label: '减持' },
  { pattern: /减仓/, label: '减仓' },
  { pattern: /超配/, label: '超配' },
  { pattern: /低配/, label: '低配' },
  { pattern: /重新买入/, label: '重新买入' },
  { pattern: /全部买入/, label: '全部买入' },
  { pattern: /全部卖出/, label: '全部卖出' },
  { pattern: /买入/, label: '买入' },
  { pattern: /卖出/, label: '卖出' },
  { pattern: /re-enter/i, label: 're-enter' },
  { pattern: /consider\s+(adding|buying)/i, label: 'consider adding/buying' },
  { pattern: /\bbuy\b/i, label: 'buy' },
  { pattern: /\bsell\b/i, label: 'sell' },
];

// Negation/protective context scrub
function isNegated(str) {
  return /(?:do\s+not|don'?t|does\s+not|不建议|不要|不\s{0,2}(?:加仓|减仓|买入|卖出|行动|调整|给出)|取消|暂停|中断|停止|不加仓|不减仓|不买入|不卖出|不调整|不给出|仅重新评估)/i.test(str);
}

function isConfidenceContext(str) {
  // "reduce conviction/confidence" is about confidence level, not trading
  return /reduce\s+(?:gold\s+)?conviction|reduce\s+confidence/i.test(str);
}

// Check JSON strings under blocked sections
const blockedPaths = [];
if (isGoldBlocked) blockedPaths.push('gold_rate_conflict');
if (isPortfolioBlocked) blockedPaths.push('portfolio_action_gate');

for (const blocked of blockedPaths) {
  for (const { path: strPath, value } of allStrings) {
    if (!strPath.includes(blocked)) continue;
    for (const { pattern, label } of actionWords) {
      if (pattern.test(value) && !isNegated(value) && !isConfidenceContext(value)) {
        errors.push(`ACTION_LEAK(JSON ${strPath}): ${blocked} blocked but "${label}" — "${value.slice(0, 150)}"`);
      }
    }
  }
}

// ── Check 3: JSON scenario portfolio_implication ─────────────
if (isGoldBlocked) {
  const scenarios = snapshot.gold_rate_conflict?.step5_scenarios || [];
  for (let i = 0; i < scenarios.length; i++) {
    const impl = scenarios[i].portfolio_implication || '';
    for (const { pattern, label } of actionWords) {
      if (pattern.test(impl) && !isNegated(impl)) {
        errors.push(`ACTION_LEAK(scenario[${i}]): gold blocked but portfolio_implication "${label}" — "${impl}"`);
      }
    }
  }
}

// ── Check 4: MD scanning ─────────────────────────────────────
if (mdText) {
  // Gold MD section
  if (isGoldBlocked) {
    const goldStart = mdText.search(/##\s+2\.\s+黄金/);
    if (goldStart !== -1) {
      const afterSection = mdText.slice(goldStart);
      const nextH2 = afterSection.slice(1).search(/^##\s+\d/m);
      const goldSection = nextH2 !== -1 ? afterSection.slice(0, nextH2 + 1) : afterSection;

      // Scrub negations and protective phrases
      const scrubbed = goldSection
        .replace(/(?:不建议|不要|不)\s{0,3}(?:加仓|减仓|买入|卖出|调整|行动)/g, '___NEG___')
        .replace(/不加仓|不减仓|不买入|不卖出|不调整/g, '___NEG___')
        .replace(/不给出.{0,8}(?:买入|卖出|加仓|减仓|调整|行动)/g, '___NEG___')
        .replace(/(?:取消|暂停|中断|停止).{0,8}(?:加仓|减仓|买入|卖出)/g, '___PROT___')
        .replace(/(?:do\s+not|don'?t)\s+\w+/gi, '___NEG___')
        .replace(/仅重新评估/g, '___NEG___');

      for (const { pattern, label } of actionWords) {
        if (pattern.test(scrubbed)) {
          const m = goldSection.match(new RegExp(`.{0,60}${pattern.source}.{0,60}`, 'i'));
          const ctx = m?.[0]?.trim() || '?';
          if (!isConfidenceContext(ctx)) {
            errors.push(`ACTION_LEAK(MD gold): gold blocked but "${label}" — "${ctx}"`);
          }
        }
      }

      // MMF language in gold section
      for (const { pattern, label } of forbiddenMmPatterns) {
        if (pattern.test(goldSection)) {
          const m = goldSection.match(new RegExp(`.{0,40}${pattern.source}.{0,40}`, 'i'));
          errors.push(`MMF_LANG(MD gold): "${label}" — "${m?.[0]?.trim() || '?'}"`);
        }
      }
    }
  }

  // MD: full-text MMF language check (these patterns always wrong regardless of section)
  const mmfMdPatterns = [
    { pattern: /功能.{0,5}接[近进]现金/, label: '功能上接近现金' },
    { pattern: /只是不符合.{0,10}(?:定义|框架)/, label: '只是不符合定义框架' },
    { pattern: /bond[-\s]like.{0,20}(?:exp|MMF)/i, label: 'bond-like' },
    { pattern: /near[-\s]?cash/i, label: 'near-cash' },
  ];
  for (const { pattern, label } of mmfMdPatterns) {
    if (pattern.test(mdText)) {
      const m = mdText.match(new RegExp(`.{0,50}${pattern.source}.{0,50}`, 'i'));
      errors.push(`MMF_LANG(MD): "${label}" — "${m?.[0]?.trim() || '?'}"`);
    }
  }
}

// ── Check 5: S4 empty semantics ──────────────────────────────
const allText = JSON.stringify(snapshot) + '\n' + (mdText || '');
const s4Bad = [
  /may\s+exist\s+but\s+not\s+captured/i,
  /可能.{0,10}没抓到/i,
  /采集失败/i,
  /capture\s*failed/i,
  /S4.*not captured/i,
];
for (const p of s4Bad) {
  if (p.test(allText)) {
    const m = allText.match(new RegExp(`.{0,50}${p.source}.{0,50}`, 'i'));
    errors.push(`S4_SEMANTICS: S4 empty = no trades, not capture failure — "${m?.[0]?.trim() || '?'}"`);
  }
}

// ── Check 6: Amount traceability ─────────────────────────────
if (evidence) {
  const evAmounts = new Set();
  const s = evidence.portfolio?.summary;
  if (s) {
    [s.total_assets, s.fund_assets, s.hqb_assets, s.gold_assets, s.pension_assets, s.mmf_assets]
      .forEach(v => { if (v != null) evAmounts.add(Number(v.toFixed(2))); });
  }
  (s?.holdings || []).forEach(h => {
    if (h.assetValue != null) evAmounts.add(Number(h.assetValue.toFixed(2)));
  });
  (evidence.evidence || []).forEach(e => {
    if (typeof e.value === 'number') evAmounts.add(Number(e.value.toFixed(2)));
  });

  const jsonText = JSON.stringify(snapshot);
  const amtRe = /(?:total_assets|cny|assets?)[:\s]*(\d+\.?\d*)/gi;
  let m;
  while ((m = amtRe.exec(jsonText)) !== null) {
    const val = parseFloat(m[1]);
    if (val > 100 && !evAmounts.has(Number(val.toFixed(2)))) {
      if (![...evAmounts].some(ea => Math.abs(ea - val) < 1)) {
        warnings.push(`AMOUNT_TRACE: ${val} near "${m[0].slice(0, 60)}" not in evidence packet`);
      }
    }
  }
}

// ── Output ───────────────────────────────────────────────────
console.log('=== reasoning-snapshot validator v1.2.0 ===');
console.log(`runId: ${runId}`);
console.log(`scanned: ${allStrings.length} JSON strings + ${mdText ? 'MD' : 'MD (missing)'}`);
console.log(`blocked: gold=${isGoldBlocked} portfolio=${isPortfolioBlocked}\n`);

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
process.exit(errors.length > 0 ? 1 : 0);
