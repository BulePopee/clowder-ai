// compute/index.cjs — ttfund-monitor v2.5.2
// Reads raw.json, computes derived indicators per formulas.md, outputs derived.json + derived-snapshot.md.
// Freshness auto-propagates from source indicators — no hand-written freshDerived/staleDerived.
// Usage: node compute/index.cjs --runId 20260706-1101-auto
// Output: runs/{runId}/derived.json, derived-snapshot.md

const fs = require('fs');
const path = require('path');

const { runtimeRoot: RUNTIME } = require('../lib/workspace.cjs');

const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);
const now = new Date();

// Helpers
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function fmt(n, d) { return n != null ? Number(n).toFixed(d || 2) : null; }

// Freshness severity ordering: fresh < staleSuccess < staleGap < no_date < missing < missingDerived
const FRESH_ORDER = { fresh: 0, staleSuccess: 1, staleGap: 2, no_date: 3, invalid_date: 3, missing: 4, missingDerived: 5 };

function worstFreshness(...statuses) {
  let worst = 'fresh';
  let worstScore = 0;
  for (const s of statuses) {
    const score = FRESH_ORDER[s] ?? 5;
    if (score > worstScore) { worstScore = score; worst = s; }
  }
  if (worstScore >= 4) return 'missingDerived';
  if (worstScore >= 2) return 'staleDerived';
  return 'freshDerived';
}

function getVal(raw, id) {
  const r = raw?.results?.[id];
  if (!r || r.value == null || r.error) return { v: null, fresh: 'missing' };
  return { v: r.value, fresh: r._freshStatus || 'unknown', date: r.date };
}

function z(v) { return v != null ? v : null; }

function computeDerived(raw) {
  const derived = {};
  const get = id => getVal(raw, id);

  // ── D1-D3: US yield spreads ──
  const b1 = get('B1'), b2 = get('B2'), b3 = get('B3');
  derived.D1 = { name: 'US 10Y-2Y', formula: 'B2 - B3', value: z(b2.v != null && b3.v != null ? fmt(b2.v - b3.v, 1) : null), unit: 'bp', freshness: worstFreshness(b2.fresh, b3.fresh), components: { B2: b2.fresh, B3: b3.fresh } };
  derived.D2 = { name: 'US 30Y-10Y', formula: 'B1 - B2', value: z(b1.v != null && b2.v != null ? fmt(b1.v - b2.v, 1) : null), unit: 'bp', freshness: worstFreshness(b1.fresh, b2.fresh), components: { B1: b1.fresh, B2: b2.fresh } };
  derived.D3 = { name: 'US 30Y-2Y', formula: 'B1 - B3', value: z(b1.v != null && b3.v != null ? fmt(b1.v - b3.v, 1) : null), unit: 'bp', freshness: worstFreshness(b1.fresh, b3.fresh), components: { B1: b1.fresh, B3: b3.fresh } };

  // ── D4-D6: CN yield spreads ──
  const b5 = get('B5'), b6 = get('B6'), b7 = get('B7');
  derived.D4 = { name: 'CN 10Y-2Y', formula: 'B6 - B7', value: z(b6.v != null && b7.v != null ? fmt(b6.v - b7.v, 1) : null), unit: 'bp', freshness: worstFreshness(b6.fresh, b7.fresh), components: { B6: b6.fresh, B7: b7.fresh } };
  derived.D5 = { name: 'CN 30Y-10Y', formula: 'B5 - B6', value: z(b5.v != null && b6.v != null ? fmt(b5.v - b6.v, 1) : null), unit: 'bp', freshness: worstFreshness(b5.fresh, b6.fresh), components: { B5: b5.fresh, B6: b6.fresh } };
  derived.D6 = { name: 'CN 30Y-2Y', formula: 'B5 - B7', value: z(b5.v != null && b7.v != null ? fmt(b5.v - b7.v, 1) : null), unit: 'bp', freshness: worstFreshness(b5.fresh, b7.fresh), components: { B5: b5.fresh, B7: b7.fresh } };

  // ── D7: CN-US spread ──
  derived.D7 = { name: 'CN-US 10Y', formula: 'B6 - B2', value: z(b6.v != null && b2.v != null ? fmt(b6.v - b2.v, 1) : null), unit: 'bp', freshness: worstFreshness(b6.fresh, b2.fresh), components: { B6: b6.fresh, B2: b2.fresh } };

  // ── D8-D9: CN money market ──
  const m2 = get('M2'), m2a = get('M2a'), m4 = get('M4');
  derived.D8 = { name: 'DR007-OMO', formula: 'M2 - M2a', value: z(m2.v != null && m2a.v != null ? fmt(m2.v - m2a.v, 2) : null), unit: 'bp', freshness: worstFreshness(m2.fresh, m2a.fresh), components: { M2: m2.fresh, M2a: m2a.fresh } };
  derived.D9 = { name: 'R007-DR007', formula: 'M4 - M2', value: z(m4.v != null && m2.v != null ? fmt(m4.v - m2.v, 2) : null), unit: 'bp', freshness: worstFreshness(m4.fresh, m2.fresh), components: { M4: m4.fresh, M2: m2.fresh } };

  // ── D10: US money market ──
  const n2 = get('N2'), n4 = get('N4');
  derived.D10 = { name: 'SOFR-IORB', formula: 'N2 - N4', value: z(n2.v != null && n4.v != null ? fmt((n2.v - n4.v) * 100, 0) : null), unit: 'bp', freshness: worstFreshness(n2.fresh, n4.fresh), components: { N2: n2.fresh, N4: n4.fresh } };

  // ── N7 derived: SOFR-IORB利差 ──
  derived.N7 = { name: 'SOFR-IORB利差', formula: 'N2 - N4', value: z(n2.v != null && n4.v != null ? fmt((n2.v - n4.v) * 100, 0) : null), unit: 'bp', freshness: worstFreshness(n2.fresh, n4.fresh), components: { N2: n2.fresh, N4: n4.fresh } };

  // ── D11-D13: Gold ratios ──
  const g4 = get('G4'), o1 = get('O1'), ag = get('AG'), g2 = get('G2'), x3 = get('X3');
  derived.D11 = { name: 'Gold/Oil Ratio', formula: 'G4 / O1', value: z(g4.v != null && o1.v != null ? fmt(g4.v / o1.v, 2) : null), unit: 'ratio', freshness: worstFreshness(g4.fresh, o1.fresh), components: { G4: g4.fresh, O1: o1.fresh } };
  derived.D12 = { name: 'Gold/Silver Ratio', formula: 'G4 / AG', value: z(g4.v != null && ag.v != null ? fmt(g4.v / ag.v, 2) : null), unit: 'ratio', freshness: worstFreshness(g4.fresh, ag.fresh), components: { G4: g4.fresh, AG: ag.fresh } };
  // D13: G11 domestic premium = (G2 * 31.1035 / X3) / G4 - 1
  const g13v = g2.v != null && x3.v != null && g4.v != null ? fmt(((g2.v * 31.1035 / x3.v) / g4.v - 1) * 100, 2) : null;
  derived.D13 = { name: 'G11 CN Premium', formula: '(G2*31.1035/X3)/G4-1', value: z(g13v), unit: '%', freshness: worstFreshness(g2.fresh, x3.fresh, g4.fresh), components: { G2: g2.fresh, X3: x3.fresh, G4: g4.fresh } };

  // ── D14: CNH-CNY ──
  const x4 = get('X4');
  derived.D14 = { name: 'CNH-CNY', formula: 'X4 - X3', value: z(x4.v != null && x3.v != null ? fmt(x4.v - x3.v, 4) : null), unit: 'CNY/USD', freshness: worstFreshness(x4.fresh, x3.fresh), components: { X4: x4.fresh, X3: x3.fresh } };

  // ── D15-D20: K-line moving averages ──
  const klConfigs = [
    { id: 'D15', name: 'Nasdaq 100 20MA', klineId: 'E1_kl', base: 'E1' },
    { id: 'D16', name: 'Nasdaq 100 PctChg', klineId: 'E1_kl', base: 'E1' },
    { id: 'D17', name: '沪深300 20MA', klineId: 'E2_kl', base: 'E2' },
    { id: 'D18', name: '沪深300 PctChg', klineId: 'E2_kl', base: 'E2' },
    { id: 'D19', name: '创业板 20MA', klineId: 'E3_kl', base: 'E3' },
    { id: 'D20', name: '创业板 PctChg', klineId: 'E3_kl', base: 'E3' },
  ];
  for (const cfg of klConfigs) {
    const kl = get(cfg.klineId);
    const isMA = cfg.id.endsWith('5') || cfg.id.endsWith('7') || cfg.id.endsWith('9');
    if (kl.v && Array.isArray(kl.v) && kl.v.length >= 20) {
      const closes = kl.v.map(row => row[4] != null ? row[4] : row[1]).filter(v => v != null);
      if (isMA) {
        const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        derived[cfg.id] = { name: cfg.name, formula: 'SMA(kl, 20)', value: fmt(ma20, 2), unit: '', freshness: worstFreshness(kl.fresh), components: { [cfg.klineId]: kl.fresh } };
      } else {
        const pctChg = closes.length >= 21 ? fmt((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21] * 100, 2) : null;
        derived[cfg.id] = { name: cfg.name, formula: '(latest - 20d_ago) / 20d_ago', value: z(pctChg), unit: '%', freshness: worstFreshness(kl.fresh), components: { [cfg.klineId]: kl.fresh } };
      }
    } else {
      const reason = !kl.v ? 'missing' : (!Array.isArray(kl.v) ? 'not_kline' : `only ${kl.v.length} records (<20)`);
      derived[cfg.id] = { name: cfg.name, formula: isMA ? 'SMA(kl, 20)' : '(latest-20d)/20d', value: null, unit: '', freshness: 'missingDerived', reason };
    }
  }

  // ── D21: Credit spread (AAA corporate - govt 3Y) ──
  const a2a = get('A2a'), a2g = get('A2g');
  derived.D21 = { name: 'Credit Spread AAA-Govt 3Y', formula: 'A2a - A2g', value: z(a2a.v != null && a2g.v != null ? fmt(a2a.v - a2g.v, 1) : null), unit: 'bp', freshness: worstFreshness(a2a.fresh, a2g.fresh), components: { A2a: a2a.fresh, A2g: a2g.fresh } };

  // ── D22: TIPS + BE = nominal check ──
  const b8 = get('B8'), b9 = get('B9');
  const d22v = b8.v != null && b9.v != null ? fmt(b8.v + b9.v, 2) : null;
  const d22diff = d22v != null && b2.v != null ? fmt(b2.v - parseFloat(d22v), 0) : null;
  derived.D22 = { name: 'TIPS+BE vs Nominal', formula: 'B8+B9 vs B2', value: z(d22v), diff_vs_B2: z(d22diff), unit: '%', freshness: worstFreshness(b8.fresh, b9.fresh), components: { B8: b8.fresh, B9: b9.fresh } };

  // ── D23: Gold futures basis ──
  const g5 = get('G5'), g1pm = get('G1_pm');
  derived.D23 = { name: 'Gold Futures-Spot Basis', formula: 'G5 - G1_pm', value: z(g5.v != null && g1pm.v != null ? fmt(g5.v - g1pm.v, 2) : null), unit: '元/克', freshness: worstFreshness(g5.fresh, g1pm.fresh), components: { G5: g5.fresh, G1_pm: g1pm.fresh } };

  // ── D24: Cross-border MMF spread ──
  const n3 = get('N3'), m3 = get('M3');
  derived.D24 = { name: 'MMF CN-US Spread', formula: 'N3 - M3', value: z(n3.v != null && m3.v != null ? fmt(n3.v - m3.v, 1) : null), unit: 'bp', freshness: worstFreshness(n3.fresh, m3.fresh), components: { N3: n3.fresh, M3: m3.fresh } };

  return derived;
}

function main() {
  console.log(`=== compute v1.0.0 ===`);
  console.log(`runId: ${runId}`);

  const raw = readJSON(path.join(RUN_DIR, 'raw.json'));
  if (!raw) { console.error('FATAL: raw.json not found'); process.exit(1); }

  const derived = computeDerived(raw);

  // Freshness summary
  const counts = { freshDerived: 0, staleDerived: 0, missingDerived: 0 };
  for (const [, d] of Object.entries(derived)) {
    const f = d.freshness;
    if (f === 'freshDerived') counts.freshDerived++;
    else if (f === 'missingDerived') counts.missingDerived++;
    else counts.staleDerived++;
  }

  const totalFormulas = Object.keys(derived).length;

  // Write derived.json
  const out = {
    meta: { runId, computedAt: now.toISOString(), version: '1.0.0', totalFormulas, counts },
    derived
  };
  fs.writeFileSync(path.join(RUN_DIR, 'derived.json'), JSON.stringify(out, null, 2));
  console.log(`  → derived.json (${totalFormulas} derived indicators)`);

  // Write derived-snapshot.md
  let md = `# 衍生指标 · ${now.toISOString().slice(0, 16).replace('T', ' ')}\n\n`;
  md += `## 元信息\n- 计算时间：${now.toISOString()}\n`;
  md += `- 数据基础：raw-snapshot.md (${raw.summary?.total || '?'} indicators)\n`;
  md += `- 公式来源：compute/formulas.md (v2.5.2)\n\n`;

  const sections = [
    { title: '美债利差', ids: ['D1', 'D2', 'D3'] },
    { title: '中国债利差', ids: ['D4', 'D5', 'D6'] },
    { title: '中美利差', ids: ['D7'] },
    { title: '中国货币市场利差', ids: ['D8', 'D9'] },
    { title: '美国货币市场利差', ids: ['D10', 'N7'] },
    { title: '黄金衍生', ids: ['D11', 'D12', 'D13'] },
    { title: '汇率衍生', ids: ['D14'] },
    { title: 'K线衍生', ids: ['D15', 'D16', 'D17', 'D18', 'D19', 'D20'] },
    { title: '补充计算', ids: ['D21', 'D22', 'D23', 'D24'] },
  ];

  for (const sec of sections) {
    md += `## ${sec.title}\n\n`;
    md += `| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |\n`;
    md += `|:--:|------|------|------|------|------|\n`;
    for (const did of sec.ids) {
      const d = derived[did];
      if (!d) continue;
      const val = d.value != null ? d.value : '🔴 缺失';
      const compInfo = d.components ? Object.entries(d.components).map(([k, v]) => `${k}:${v}`).join(', ') : '';
      const status = d.freshness === 'missingDerived' && d.reason ? `${d.freshness} (${d.reason})` : d.freshness;
      md += `| ${did} | ${d.name} | ${d.formula || '-'} | ${val} | ${d.unit || ''} | ${status} |\n`;
    }
    md += '\n';
  }

  md += `## 汇总\n\n`;
  md += `| 类别 | 数量 |\n`;
  md += `|------|------|\n`;
  md += `| freshDerived | ${counts.freshDerived} |\n`;
  md += `| staleDerived | ${counts.staleDerived} |\n`;
  md += `| missingDerived | ${counts.missingDerived} |\n\n`;
  md += `> 总公式数: ${totalFormulas} | freshDerived: ${counts.freshDerived} | staleDerived: ${counts.staleDerived} | missingDerived: ${counts.missingDerived}\n`;

  fs.writeFileSync(path.join(RUN_DIR, 'derived-snapshot.md'), md);
  console.log(`  → derived-snapshot.md`);
  console.log(`  Summary: ${counts.freshDerived} freshDerived / ${counts.staleDerived} staleDerived / ${counts.missingDerived} missingDerived`);
}

main();
