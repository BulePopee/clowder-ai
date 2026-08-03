// portfolio/collect.cjs — ttfund-monitor v2.4.0
// Portfolio data collector: ACCOUNT_HOLDING + ACCOUNT_PROFIT + PORTFOLIO_ANALYSIS + TRADE_QUERY
// Usage: node portfolio/collect.cjs --runId 20260626-0948-ragdoll-vzes
// Output: runs/{runId}/portfolio-snapshot.json, portfolio-snapshot.md

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const { runtimeRoot: RUNTIME, homeDir: HOME, loadToolConfig } = require('../lib/workspace.cjs');

function resolveToolPath(cfgPath) {
  if (!cfgPath) return null;
  if (!cfgPath.includes('$HOME')) return cfgPath;
  if (!HOME) throw new Error('$HOME in tool path but HOME is not set (no HOME/USERPROFILE env)');
  return cfgPath.replace(/\$HOME/g, HOME);
}

function defaultTtfundCli() {
  if (!HOME) throw new Error('TTFund CLI path not configured (tools.json missing) and HOME is not set (no HOME/USERPROFILE env)');
  return path.join(HOME, 'AppData/Local/TTFund/ttskill-base/ttskill-base-win32-x64-0.1.1/bin/ttskill.js');
}

const TTSKILL = resolveToolPath(loadToolConfig()?.ttfund?.cli) || defaultTtfundCli();

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--runId');
if (runIdIdx === -1) { console.error('ERROR: --runId required'); process.exit(1); }
const runId = args[runIdIdx + 1];
const RUN_DIR = path.join(RUNTIME, 'runs', runId);
const now = new Date();
const collectedAt = now.toISOString();

// ── Helpers ──────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Format percentage: strips trailing % before appending, handles "--"
function fmtPct(v) {
  if (v == null || v === '--') return '--';
  const s = String(v).replace(/%/g, '');
  return s === '--' ? '--' : s + '%';
}

function _esc(s) { return JSON.stringify(String(s)); }

function _run(actionCmd, body) {
  const _body = typeof body === 'string' ? body : JSON.stringify(body);
  const args = ['invoke', actionCmd.skill, '--action', actionCmd.action, '--env', 'prod', '--body', _body];
  const r = cp.spawnSync('node', [TTSKILL, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 300) || `exit ${r.status}`);
  return JSON.parse(r.stdout);
}

// Response root differs by skill:
// - ACCOUNT_HOLDING, ACCOUNT_PROFIT, TRADE_QUERY → data.raw_result.body
// - PORTFOLIO_ANALYSIS → data.raw_result.body.data
function bodyOf(r, skill) {
  if (skill === 'PORTFOLIO_ANALYSIS') return r?.data?.raw_result?.body?.data || null;
  return r?.data?.raw_result?.body || null;
}

async function withRetry(fn, maxRetries = 2, label = '') {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result != null) return { result, attempts: attempt + 1 };
      lastErr = new Error('null value');
    } catch (e) { lastErr = e; }
    if (attempt < maxRetries) {
      console.log(`  [retry] ${label} attempt ${attempt + 1}/${maxRetries + 1}`);
      await sleep(1000);
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════
// COLLECT
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log(`=== portfolio-collect v2.4.0 ===`);
  console.log(`runId: ${runId}`);
  console.log(`start: ${collectedAt}\n`);

  const snapshot = {
    meta: { runId, version: '2.4.0', collectedAt },
    sources: {}
  };

  // ── S1: ACCOUNT_HOLDING ──
  console.log('── S1: ACCOUNT_HOLDING ──');
  const s1 = { status: 'ok', error: null, data: {} };
  try {
    await collectS1(s1);
  } catch (e) {
    s1.status = 'failed'; s1.error = e.message.slice(0, 200);
    console.error(`  S1 FAILED: ${e.message}`);
  }
  snapshot.sources.S1_holding = s1;

  // ── S2: ACCOUNT_PROFIT ──
  console.log('── S2: ACCOUNT_PROFIT ──');
  const s2 = { status: 'ok', error: null, data: {} };
  try {
    await collectS2(s2);
    // status set inside collectS2 from action-level aggregation
  } catch (e) {
    s2.status = 'failed'; s2.error = e.message.slice(0, 200);
    console.error(`  S2 FATAL: ${e.message}`);
  }
  snapshot.sources.S2_profit = s2;

  // ── S3: PORTFOLIO_ANALYSIS ──
  console.log('── S3: PORTFOLIO_ANALYSIS ──');
  const s3 = { status: 'ok', error: null, data: {} };
  try {
    await collectS3(s3);
    const actions = Object.keys(s3.data);
    const fetched = actions.filter(k => s3.data[k]?.fetched).length;
    const failed = actions.filter(k => !s3.data[k]?.fetched);
    const all403 = failed.length > 0 && failed.every(k => s3.data[k]?.unavailable);
    if (fetched === 0) {
      s3.status = all403 ? 'unavailable' : 'failed';
      if (!all403) s3.error = failed.map(k => `${k}: ${s3.data[k]?.error || 'unknown'}`).join('; ').slice(0, 200);
    } else if (fetched < actions.length) {
      s3.status = 'partial';
    }
  } catch (e) {
    s3.status = 'failed'; s3.error = e.message.slice(0, 200);
    console.error(`  S3 FAILED: ${e.message}`);
  }
  snapshot.sources.S3_analysis = s3;

  // ── S4: TRADE_QUERY ──
  console.log('── S4: TRADE_QUERY ──');
  const s4 = { status: 'ok', error: null, data: {} };
  try {
    await collectS4(s4);
    if (!s4.data.list?.length) s4.status = 'empty';
  } catch (e) {
    s4.status = e.message === 'null value' ? 'empty' : 'failed';
    s4.error = e.message.slice(0, 200);
    console.error(`  S4 ${s4.status === 'empty' ? 'EMPTY' : 'FAILED'}: ${e.message}`);
  }
  snapshot.sources.S4_trade = s4;

  // ── WRITE OUTPUTS ──
  if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive: true });

  const jsonPath = path.join(RUN_DIR, 'portfolio-snapshot.json');
  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n  → ${jsonPath}`);

  const mdPath = path.join(RUN_DIR, 'portfolio-snapshot.md');
  writeSnapshotMd(mdPath, snapshot);
  console.log(`  → ${mdPath}`);

  // Summary
  const statuses = Object.entries(snapshot.sources).map(([k, v]) => `${k}=${v.status}`).join(' ');
  console.log(`\n=== DONE (${statuses}) ===`);
}

// ── S1 Collectors ───────────────────────────────────────────

async function collectS1(s1) {
  // holding_total
  console.log('  holding_total...');
  const { result: totalR } = await withRetry(
    () => { const r = _run({ skill: 'ACCOUNT_HOLDING', action: 'holding_total' }, '{}'); return bodyOf(r, 'ACCOUNT_HOLDING')?.holding_total_result || null; },
    2, 'holding_total'
  );
  s1.data.total = totalR;

  // holding_list
  console.log('  holding_list...');
  const { result: listR } = await withRetry(
    () => { const r = _run({ skill: 'ACCOUNT_HOLDING', action: 'holding_list' }, '{}'); return bodyOf(r, 'ACCOUNT_HOLDING')?.holding_list_result || null; },
    2, 'holding_list'
  );
  s1.data.list = listR || [];

  // holding_hqb
  console.log('  holding_hqb...');
  const { result: hqbR } = await withRetry(
    () => { const r = _run({ skill: 'ACCOUNT_HOLDING', action: 'holding_hqb' }, '{}'); return bodyOf(r, 'ACCOUNT_HOLDING')?.holding_hqb_result || null; },
    2, 'holding_hqb'
  );
  s1.data.hqb = hqbR;

  // holding_gold
  console.log('  holding_gold...');
  const { result: goldR } = await withRetry(
    () => { const r = _run({ skill: 'ACCOUNT_HOLDING', action: 'holding_gold' }, '{}'); return bodyOf(r, 'ACCOUNT_HOLDING')?.holding_gold_result || null; },
    2, 'holding_gold'
  );
  s1.data.gold = goldR;

  // holding_pension
  console.log('  holding_pension...');
  const { result: pensionR } = await withRetry(
    () => { const r = _run({ skill: 'ACCOUNT_HOLDING', action: 'holding_pension' }, '{}'); return bodyOf(r, 'ACCOUNT_HOLDING')?.holding_pension_result || null; },
    2, 'holding_pension'
  );
  s1.data.pension = pensionR;
}

// ── S2 Collectors ───────────────────────────────────────────

async function collectS2(s2) {
  const _status = { total: null, fund: null };

  // total_profit (independent)
  console.log('  total_profit...');
  try {
    const { result: totalR } = await withRetry(
      () => { const r = _run({ skill: 'ACCOUNT_PROFIT', action: 'total_profit' }, '{}'); const b = bodyOf(r, 'ACCOUNT_PROFIT'); return b?.total_profit_result ? b : null; },
      1, 'total_profit'
    );
    s2.data.total = totalR;
    _status.total = totalR ? 'ok' : 'empty';
  } catch (e) {
    s2.data.total = null;
    _status.total = e.message === 'null value' ? 'empty' : 'failed';
    console.error(`    total_profit ${_status.total}: ${e.message.slice(0, 80)}`);
  }

  // fund_profit (independent)
  console.log('  fund_profit...');
  try {
    const { result: fundR } = await withRetry(
      () => { const r = _run({ skill: 'ACCOUNT_PROFIT', action: 'fund_profit' }, '{}'); const b = bodyOf(r, 'ACCOUNT_PROFIT'); return b?.fund_profit_result || null; },
      1, 'fund_profit'
    );
    s2.data.funds = fundR || null;
    _status.fund = fundR ? 'ok' : 'empty';
  } catch (e) {
    s2.data.funds = null;
    _status.fund = e.message === 'null value' ? 'empty' : 'failed';
    console.error(`    fund_profit ${_status.fund}: ${e.message.slice(0, 80)}`);
  }

  // Aggregate S2 status
  const agg = [_status.total, _status.fund];
  if (agg.every(s => s === 'ok'))      s2.status = 'ok';
  else if (agg.some(s => s === 'ok'))   s2.status = 'partial';
  else if (agg.every(s => s === 'empty')) s2.status = 'empty';
  else                                   s2.status = 'failed';
}

// ── S3 Collectors ───────────────────────────────────────────

async function collectS3(s3) {
  const actions = [
    { key: 'asset_type_pct',   action: 'asset_type_pct' },
    { key: 'fund_type_pct',    action: 'fund_type_pct' },
    { key: 'hold_perform',     action: 'hold_perform' },
    { key: 'bull_bear',        action: 'bull_bear' },
    { key: 'capm',             action: 'capm' },
    { key: 'irr',              action: 'irr' },
  ];

  for (const a of actions) {
    console.log(`  ${a.action}...`);
    try {
      const { result } = await withRetry(
        () => {
          const r = _run({ skill: 'PORTFOLIO_ANALYSIS', action: a.action }, '{}');
          const b = bodyOf(r, 'PORTFOLIO_ANALYSIS');
          return b || null;
        },
        1, a.action   // 403/empty won't recover with retry
      );
      s3.data[a.key] = { fetched: true, data: result };
      console.log(`    OK`);
    } catch (e) {
      const is403 = e.message?.includes('403') || e.stdout?.includes('403');
      s3.data[a.key] = { fetched: false, error: e.message.slice(0, 200), unavailable: is403 };
      console.error(`    ${is403 ? 'UNAVAILABLE' : 'FAILED'}: ${e.message.slice(0, 120)}`);
    }
  }
}

// ── S4 Collectors ───────────────────────────────────────────

async function collectS4(s4) {
  console.log('  trade_query...');
  const { result: tradeR } = await withRetry(
    () => { const r = _run({ skill: 'TRADE_QUERY', action: 'trade_query' }, '{}'); const b = bodyOf(r, 'TRADE_QUERY'); return b?.trade_list_result?.trades || null; },
    1, 'trade_query'
  );
  s4.data.list = tradeR || [];
}

// ── Snapshot MD Generator ────────────────────────────────────

function writeSnapshotMd(filePath, snap) {
  const meta = snap.meta;
  const s1 = snap.sources.S1_holding?.data || {};
  const s2 = snap.sources.S2_profit?.data || {};
  const s3 = snap.sources.S3_analysis?.data || {};
  const s4 = snap.sources.S4_trade?.data || {};
  const statuses = Object.entries(snap.sources).map(([k, v]) => `${k.replace('_', '')}=${v.status}`).join(' ');

  let md = `# 账户持仓快照 · ${meta.collectedAt.slice(0, 16).replace('T', ' ')} CST\n\n`;

  // Meta
  md += `## 元信息\n`;
  md += `- runId: ${meta.runId}\n`;
  md += `- 采集时间: ${meta.collectedAt}\n`;
  md += `- 数据源状态: ${statuses}\n`;
  md += `- 三栏隔离: 实盘 ✓ | 模拟(MP10447790) 未采集 | 回测("持仓优化0428") 未采集\n\n`;

  // ═══ S1 ═══
  md += `## S1 持仓总览\n\n`;

  if (snap.sources.S1_holding?.status === 'failed') {
    md += `🔴 采集失败: ${snap.sources.S1_holding.error}\n\n`;
  } else {
    const t = s1.total || {};
    md += `### 资产汇总\n`;
    md += `| 类别 | 金额(元) |\n|------|----------|\n`;
    md += `| 总资产 | ${t.total ?? '--'} |\n`;
    md += `| 活期宝 | ${t.hqb ?? '--'} |\n`;
    md += `| 基金 | ${t.fund ?? '--'} |\n`;
    md += `| 黄金 | ${t.gold ?? '--'} |\n`;
    md += `| 投顾 | ${t.tg ?? '--'} |\n`;
    md += `| 养老 | ${t.pension ?? '--'} |\n\n`;

    const list = (s1.list || []).filter(h => h.fundCode !== 'hqb'); // exclude hqb summary row
    if (list.length) {
      md += `### 持仓明细\n`;
      md += `| # | 基金名称 | 代码 | pType | 资产(元) | 持仓收益(元) | 持仓收益率 | 持有收益(元) | 持有收益率 | 日收益 |\n`;
      md += `|---|---------|------|-------|---------|------------|-----------|------------|-----------|--------|\n`;
      list.forEach((h, i) => {
        const pType = h.ptype || h.pType || '--';
        const dp = h.dailyProfit != null ? `${h.dailyProfit} (${h.toOrYesDayProfit ? '今' : '昨'})` : '--';
        const hpr = fmtPct(h.holdProfitRate);
        const cpr = fmtPct(h.constantProfitRate);
        md += `| ${i + 1} | ${h.fundName || '--'} | ${h.fundCode || '--'} | ${pType} | ${h.assetValue ?? '--'} | ${h.holdProfit ?? '--'} | ${hpr} | ${h.constantProfit ?? '--'} | ${cpr} | ${dp} |\n`;
      });
      md += '\n';
    }

    const hqb = s1.hqb;
    if (hqb?.holds?.length) {
      md += `### 活期宝明细\n`;
      md += `| 基金 | 代码 | 份额(元) | 七日年化 | 未付收益 |\n`;
      md += `|------|------|---------|----------|----------|\n`;
      hqb.holds.forEach(h => {
        md += `| ${h.fundName || '--'} | ${h.fundCode || '--'} | ${h.assetValue ?? '--'} | ${fmtPct(h.annual7D)} | ${h.unpaidProfit ?? '--'} |\n`;
      });
      md += '\n';
    }

    const gold = s1.gold;
    if (gold && parseFloat(gold.amount) > 0) {
      md += `### 黄金持仓\n`;
      md += `| 金额(元) | 重量(克) | 持有收益率 | 持仓收益率 | 累计收益率 | 今日盈亏 |\n`;
      md += `|---------|---------|-----------|-----------|-----------|----------|\n`;
      md += `| ${gold.amount} | ${gold.weight ?? '--'} | ${fmtPct(gold.holdProfitRate)} | ${fmtPct(gold.positionProfitRate)} | ${fmtPct(gold.totalProfitRate)} | ${gold.todayProfit ?? '--'} |\n\n`;
    }
  }

  // ═══ S2 ═══
  md += `## S2 收益汇总\n\n`;

  const s2Status = snap.sources.S2_profit?.status;
  if (s2Status === 'failed') {
    md += `🔴 采集失败: ${snap.sources.S2_profit.error}\n\n`;
  } else if (s2Status === 'empty') {
    md += `⚠️ 收益数据为空：API 返回成功但无收益明细（可能账户暂无收益记录或会话需刷新）\n\n`;
  } else if (s2Status === 'partial') {
    md += `⚠️ 部分收益数据可用\n\n`;
  }
  if (s2Status !== 'failed' && s2Status !== 'empty') {
    const tp = s2.total || {};
    md += `| 口径 | 金额(元) | 收益率 |\n|------|---------|--------|\n`;
    md += `| YTD 收益 | ${tp.ytd_profit ?? '--'} | — |\n`;
    md += `| 累计总收益 | ${tp.total_profit ?? '--'} | ${fmtPct(tp.total_profit_rate)} |\n`;
    md += `| 持有收益 | ${tp.hold_profit ?? '--'} | ${fmtPct(tp.hold_profit_rate)} |\n`;
    md += `| 持仓收益 | ${tp.position_profit ?? '--'} | ${fmtPct(tp.position_profit_rate)} |\n`;
    md += `| 今日收益 | ${tp.today_profit ?? '--'} | — |\n\n`;

    const funds = s2.funds || [];
    if (funds.length) {
      md += `### 逐只收益\n`;
      md += `| 基金 | 持仓收益 | 持仓收益率 | 持有收益 | 持有收益率 | 累计收益 | 今日收益 |\n`;
      md += `|------|---------|-----------|---------|-----------|---------|---------|\n`;
      funds.forEach(f => {
        md += `| ${f.fundName || '--'} | ${f.positionProfit ?? '--'} | ${fmtPct(f.positionProfitRate)} | ${f.constantProfit ?? '--'} | ${fmtPct(f.constantProfitRate)} | ${f.totalProfit ?? '--'} | ${f.todayProfit ?? '--'} |\n`;
      });
      md += '\n';
    }
  }

  // ═══ S3 ═══
  md += `## S3 组合分析\n\n`;

  const s3Status = snap.sources.S3_analysis?.status;
  if (s3Status === 'failed') {
    md += `🔴 采集失败: ${snap.sources.S3_analysis.error}\n\n`;
  } else if (s3Status === 'unavailable') {
    md += `⚠️ PORTFOLIO_ANALYSIS 技能当前不可用（HTTP 403）\n\n`;
  } else {
    // asset_type_pct
    const atp = s3.asset_type_pct;
    if (atp?.fetched && atp.data?.asset_type_data?.length) {
      md += `### 大类资产占比（历史均值）\n`;
      md += `| 类型 | 平均占比(%) |\n|------|------------|\n`;
      atp.data.asset_type_data.forEach(r => { md += `| ${r.index} | ${r['平均占比(%)']} |\n`; });
      md += '\n';
    }

    // fund_type_pct
    const ftp = s3.fund_type_pct;
    if (ftp?.fetched && ftp.data?.fund_type_data?.length) {
      md += `### 基金类型占比（历史均值）\n`;
      md += `| 类型 | 平均占比(%) |\n|------|------------|\n`;
      ftp.data.fund_type_data.forEach(r => { md += `| ${r.index} | ${r['平均占比(%)']} |\n`; });
      md += '\n';
    }

    // hold_perform (last 5 days)
    const hp = s3.hold_perform;
    if (hp?.fetched && hp.data?.hold_data?.length) {
      const recent = hp.data.hold_data.slice(-5);
      md += `### 近期表现（最近 5 日）\n`;
      md += `| 日期 | 日收益(%) | 净值 | 基准净值 | 最大回撤(%) |\n`;
      md += `|------|----------|------|---------|------------|\n`;
      recent.forEach(r => { md += `| ${r.pdate} | ${r.ret} | ${r.nav} | ${r.benchmark_nav} | ${r['最大回撤%']} |\n`; });
      md += '\n';
    }

    // bull_bear
    const bb = s3.bull_bear;
    if (bb?.fetched && bb.data?.bull_bear_data?.length) {
      md += `### 牛熊阶段\n`;
      md += `| 区间 | 状态 | 持仓收益(%) | 基准收益(%) | 超额(%) |\n`;
      md += `|------|------|------------|------------|---------|\n`;
      bb.data.bull_bear_data.forEach(r => { md += `| ${r.start_dt}~${r.end_dt} | ${r.situation_name} | ${r['持仓收益%']} | ${r['基准收益%']} | ${r['超额收益%']} |\n`; });
      md += '\n';
    }

    // capm
    const capm = s3.capm;
    if (capm?.fetched && capm.data?.capm_data) {
      const c = capm.data.capm_data;
      md += `### CAPM 归因\n`;
      md += `- Alpha: ${c.alpha ?? '--'}\n`;
      md += `- Beta: ${c.beta ?? '--'}\n`;
      md += `- R²: ${c.r_squared ?? '--'}\n`;
      md += `- P-value: ${c.p_value ?? '--'}\n\n`;
    }

    // irr
    const irr = s3.irr;
    md += `### IRR\n`;
    md += irr?.fetched ? `数据可用\n\n` : `无数据（当前账户不支持 IRR 计算）\n\n`;
  }

  // ═══ S4 ═══
  md += `## S4 近期交易\n\n`;

  const s4Status = snap.sources.S4_trade?.status;
  if (s4Status === 'failed') {
    md += `🔴 采集失败: ${snap.sources.S4_trade.error}\n\n`;
  } else if (s4Status === 'empty') {
    md += `⚠️ 近期无交易记录\n\n`;
  } else {
    const trades = s4.list || [];
    if (trades.length) {
      md += `| 日期 | 类型 | 基金/组合 | 代码 | 金额(元) | 状态 | 渠道 |\n`;
      md += `|------|------|----------|------|---------|------|------|\n`;
      trades.forEach(t => { md += `| ${t.date || '--'} | ${t.type || '--'} | ${t.fundName || '--'} | ${t.fundCode || '--'} | ${t.amount ?? '--'} | ${t.status || '--'} | ${t.tradeType || '--'} |\n`; });
      md += '\n';
    } else {
      md += `无近期交易记录\n\n`;
    }
  }

  fs.writeFileSync(filePath, md);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
