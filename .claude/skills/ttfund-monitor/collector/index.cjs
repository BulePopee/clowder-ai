// collector/index.cjs — ttfund-monitor v2.4.0
// Structured data collector: ttfund + iFinD + Wind
// Usage: node collector/index.cjs [--round routine] [--runId 20260624-xxxx]
// Output: runs/{runId}/raw.json, raw-snapshot.md, provenance.json, provenance.md, gaps.json, websearch-tasks.md

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const cfg = require('./indicators.cjs');
const { runtimeRoot: RUNTIME, homeDir: HOME } = require('../lib/workspace.cjs');

// ── CLI ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const round = args.includes('--round') ? args[args.indexOf('--round') + 1] : 'routine';
const freshnessOnly = args.includes('--freshness-only');
const now = new Date();
const ts = () => now.toISOString().replace(/:/g, '-').slice(0, 19);
const runId = args.includes('--runId')
  ? args[args.indexOf('--runId') + 1]
  : `${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-auto`;

const RUN_DIR = path.join(RUNTIME, 'runs', runId);

// ── Helpers ──────────────────────────────────────────────────
function resolve(p) {
  if (p.includes('$HOME')) {
    if (!HOME) throw new Error('$HOME in path but HOME is not set (no HOME/USERPROFILE env): ' + p);
    return p.replace(/\$HOME/g, HOME);
  }
  return p;
}

function dotGet(obj, dotPath) {
  let o = obj;
  for (const k of dotPath.split('.')) {
    if (o == null) return undefined;
    const m = k.match(/^(\w+)\[(-?\d+)\]$/);
    if (m) { o = Array.isArray(o[m[1]]) ? o[m[1]][parseInt(m[2])] : undefined; }
    else { o = o[k]; }
  }
  return o;
}

// spawn with args array — avoids shell quoting issues on Windows
function run(nodePath, nodeArgs, opts = {}) {
  const r = cp.spawnSync('node', [nodePath, ...nodeArgs], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    ...opts
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = new Error(r.stderr ? r.stderr.slice(0, 300) : `exit code ${r.status}`);
    err.stdout = r.stdout;
    throw err;
  }
  return r.stdout;
}

// ── Date parser (robust: handles ISO, Chinese, Wind, numeric) ──
function parseDate(raw) {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  // ISO / standard
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Chinese: "2026年6月25日"
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cn) return new Date(+cn[1], +cn[2] - 1, +cn[3]);
  // Numeric: "20260625"
  const num = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (num) return new Date(+num[1], +num[2] - 1, +num[3]);
  // Wind: "20260624 16:00:02"
  const wind = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (wind) return new Date(+wind[1], +wind[2] - 1, +wind[3], +wind[4], +wind[5], +wind[6]);
  return null; // invalid_date
}

// ── iFinD helpers ────────────────────────────────────────────
function parseIfind(r) {
  if (!r?.ok || !r?.data?.result?.content?.[0]?.text) return null;
  try { return JSON.parse(r.data.result.content[0].text)?.data || null; }
  catch (_) { return null; }
}

function ifindFirst(data) {
  if (!data?.datas?.length) return null;
  const s = data.datas[0].data;
  return s?.data?.length ? s.data[0] : null;
}

function ifindKline(data) {
  return data?.datas?.[0]?.data?.data || null;
}

// ── Wind helpers ─────────────────────────────────────────────
function parseWind(stdout) {
  try {
    const outer = JSON.parse(stdout);
    const text = outer?.content?.[0]?.text;
    if (!text) return null;
    const inner = JSON.parse(text);
    const rows = inner?.data?.data?.[0]?.rows;
    return rows?.length ? rows[0] : null;
  } catch (_) { return null; }
}

// ── Month strings for iFinD queries ──────────────────────────
const MN = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const ym = now.getMonth();
const yy = now.getFullYear();
const pm = ym === 0 ? 11 : ym - 1;
const py = ym === 0 ? yy - 1 : yy;
const MONTH = `${yy}年${MN[ym]}`;
const MONTH_PREV = `${py}年${MN[pm]}`;
const YEAR = `${yy}`;

// ── Retry helpers ─────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, maxRetries = 2, label = '') {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result != null) return { result, attempts: attempt + 1 };
      lastErr = new Error('null value');
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) {
      console.log(`  [retry] ${label} attempt ${attempt + 1}/${maxRetries + 1} failed, retrying...`);
      await sleep(1000);
    }
  }
  throw lastErr;
}

// ── Freshness-only recheck (for post-WebSearch reflow) ───────
function freshnessRecheck(runDir, cfg) {
  const rawPath = path.join(runDir, 'raw.json');
  if (!fs.existsSync(rawPath)) {
    console.error(`raw.json not found at ${rawPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const { results } = raw;
  const freshness = cfg.freshness || {};
  let freshCount = 0, staleSuccessCount = 0, staleGapCount = 0, invalidDateCount = 0;
  const freshnessGaps = [];

  for (const [id, r] of Object.entries(results)) {
    const f = freshness[id];
    r._freshStatus = 'unknown';
    if (!f) continue;
    if (r.value == null || r.error) { r._freshStatus = 'missing'; continue; }
    if (!r.date) { r._freshStatus = 'no_date'; staleGapCount++; freshnessGaps.push({ indicator: id, status: 'no_date', source: r.source || 'unknown' }); continue; }

    const parsed = parseDate(r.date);
    if (!parsed) {
      r._freshStatus = 'invalid_date';
      invalidDateCount++;
      freshnessGaps.push({ indicator: id, status: 'invalid_date', rawDate: String(r.date), source: r.source || 'unknown' });
      console.log(`  [invalid_date] ${id}: "${r.date}"`);
      continue;
    }
    const ageDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < f.maxAgeDays + 1) {
      r._freshStatus = 'fresh';
      freshCount++;
    } else if (f.staleAction === 'acceptable') {
      r._freshStatus = 'staleSuccess';
      staleSuccessCount++;
    } else {
      r._freshStatus = 'staleGap';
      if (f.staleAction === 'fallback_not_implemented') r._staleNote = 'fallback_not_implemented';
      staleGapCount++;
      freshnessGaps.push({ indicator: id, status: r._freshStatus, ageDays: Math.round(ageDays), maxAgeDays: f.maxAgeDays, date: r.date, source: r.source || 'unknown' });
      console.log(`  [stale] ${id}: ${r.date} (${ageDays.toFixed(0)}d > ${f.maxAgeDays}d max)`);
    }
  }

  const activeCount = freshCount + staleSuccessCount;
  const missing = Object.values(results).filter(r => r.value == null || r.error).length;
  const total = Object.keys(results).length;

  // Update raw.json summary
  raw.summary = { total, collected: activeCount, missing, fresh: freshCount, staleSuccess: staleSuccessCount, staleGap: staleGapCount, invalidDate: invalidDateCount };
  raw.collectedAt = new Date().toISOString();
  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  console.log(`  fresh:${freshCount} staleSuccess:${staleSuccessCount} staleGap:${staleGapCount} invalidDate:${invalidDateCount} missing:${missing}`);

  // Merge freshness gaps into gaps.json: remove stale freshness gaps, re-add fresh ones
  const freshnessStatuses = new Set(['staleGap', 'no_date', 'invalid_date']);
  let existingGaps = [];
  const gapsPath = path.join(runDir, 'gaps.json');
  if (fs.existsSync(gapsPath)) {
    try { existingGaps = JSON.parse(fs.readFileSync(gapsPath, 'utf8')); } catch (_) {}
  }
  // Keep only non-freshness gaps (collection errors) + new freshness gaps
  const preservedGaps = existingGaps.filter(g => !freshnessStatuses.has(g.status));
  const allGaps = [...preservedGaps, ...freshnessGaps];
  // Dedup freshness gaps by indicator+status+source within the new batch
  const seen = new Set();
  const deduped = [];
  for (const g of allGaps) {
    const key = freshnessStatuses.has(g.status) ? `${g.indicator}|${g.status}|${g.source || ''}` : `${g.indicator}|${g.status}|${g.error || ''}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(g); }
  }
  fs.writeFileSync(gapsPath, JSON.stringify(deduped, null, 2));

  // Regenerate raw-snapshot.md
  regenerateSnapshotMd(runDir, results, cfg, { total, freshCount, staleSuccessCount, staleGapCount, invalidDateCount, missing, allGaps: deduped });
  // Regenerate provenance.md
  regenerateProvMd(runDir, raw, deduped);

  console.log(`  Recheck complete: raw.json, gaps.json, raw-snapshot.md, provenance.md updated`);
}

// ── Shared md generators (used by both main and freshnessRecheck) ──
function regenerateSnapshotMd(runDir, results, cfg, summary) {
  const sectionOrder = [
    { key: 'A', name: 'A 预警层' },
    { key: 'B', name: 'B 债券' },
    { key: 'M', name: 'M 中国货币市场' },
    { key: 'N', name: 'N 美国货币市场' },
    { key: 'F', name: 'F 美联储政策' },
    { key: 'E', name: 'E 股市指数' },
    { key: 'O', name: 'O 原油' },
    { key: 'G', name: 'G 黄金' },
    { key: 'X', name: 'X 汇率' },
    { key: 'S', name: 'S 情绪' },
    { key: 'R', name: 'R 候选' },
  ];
  const sectionMap = {};
  for (const [id, r] of Object.entries(results)) {
    const prefix = id.match(/^[A-Z]/)?.[0] || 'Z';
    if (!sectionMap[prefix]) sectionMap[prefix] = [];
    sectionMap[prefix].push({ id, ...r });
  }

  let md = `# 数据快照 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\n`;
  md += `## 元信息\n- 采集时间：${new Date().toISOString()} CST\n`;
  md += `- 覆盖：${summary.total} attempted | fresh:${summary.freshCount} staleSuccess:${summary.staleSuccessCount} staleGap:${summary.staleGapCount} invalidDate:${summary.invalidDateCount} missing:${summary.missing}\n`;
  md += `- 缺口：${summary.allGaps?.length > 0 ? summary.allGaps.map(g => g.indicator).join(', ') : '无'}\n\n`;
  md += `## 原始数据\n\n`;

  for (const sec of sectionOrder) {
    const items = sectionMap[sec.key];
    if (!items || items.length === 0) continue;
    md += `### ${sec.name}\n`;
    md += `| 编号 | 名称 | 值 | 数据日期 | 来源 |\n`;
    md += `|:--:|------|------|------|------|\n`;
    for (const item of items) {
      const val = item.value != null && !item.error
        ? (typeof item.value === 'object' ? `[kline:${item.value.length}]` : item.value)
        : '🔴 缺口';
      const date = item.date || '-';
      const source = `${item.source}${item.note ? ' ' + item.note : ''}`;
      const displayName = cfg.indicatorNames?.[item.id] || item.id;
      md += `| ${item.id} | ${displayName} | ${val} | ${date} | ${source} |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(runDir, 'raw-snapshot.md'), md);
}

function regenerateProvMd(runDir, raw, allGaps) {
  let md = `# Provenance — ${raw.runId}\n\n`;
  md += `## Meta\n- runId: ${raw.runId}\n- collectedAt: ${raw.collectedAt || new Date().toISOString()}\n\n`;
  md += `## Summary\n- total: ${raw.summary?.total || '?'}\n- fresh: ${raw.summary?.fresh || 0}\n- staleSuccess: ${raw.summary?.staleSuccess || 0}\n- staleGap: ${raw.summary?.staleGap || 0}\n- invalidDate: ${raw.summary?.invalidDate || 0}\n- missing: ${raw.summary?.missing || 0}\n\n`;
  if (allGaps?.length > 0) {
    md += `## 缺口分类\n| 编号 | 原因类别 | 详情 |\n|------|------|------|\n`;
    for (const g of allGaps) {
      md += `| ${g.indicator} | ${g.status} | ${g.error || g.rawDate || `${g.ageDays || '?'}d / max ${g.maxAgeDays || '?'}d`} |\n`;
    }
  }
  fs.writeFileSync(path.join(runDir, 'provenance.md'), md);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`=== ttfund-monitor collector v2.4.0 ===`);
  console.log(`runId: ${runId}  round: ${round}`);
  console.log(`start: ${now.toISOString()}\n`);

  fs.mkdirSync(RUN_DIR, { recursive: true });

  if (freshnessOnly) {
    console.log('Mode: --freshness-only (recheck freshness on existing raw.json)\n');
    freshnessRecheck(RUN_DIR, cfg);
    return;
  }
  const results = {};
  const prov = { runId, round, startTime: now.toISOString(), sources: {} };
  const gaps = [];

  // ════════════ TTFUND ════════════
  console.log('── ttfund ──');
  const ttfCli = resolve(cfg.sources.ttfund.cli);
  prov.sources.ttfund = { calls: [] };

  for (const call of cfg.sources.ttfund.calls) {
    const t0 = Date.now();
    try {
      const { result: d, attempts } = await withRetry(async () => {
        const out = run(ttfCli, ['invoke', call.skill, '--action', 'query', '--env', 'prod', '--body', call.body]);
        const r = JSON.parse(out);
        return r?.data?.raw_result?.body?.data || null;
      }, 2, call.name);

      const datePaths = call.datePath || ['macro_fiscal.trade_date', 'gold_quotes.au9999.date'];
	      let date = null;
	      for (const dp of datePaths) {
	        date = dotGet(d, dp);
	        if (date) break;
	      }

      let ok = 0;
      for (const [id, spec] of Object.entries(call.extracts)) {
        const v = dotGet(d, spec.path);
        results[id] = {
          indicator: id, value: v ?? null, date, source: 'ttfund', unit: spec.unit || ''
        };
        if (v != null) ok++;
      }

      // G2 intermittent fix: re-fetch GOLD_INFO once if au9999 is missing but other gold data present
      if (call.name === 'GOLD_INFO' && results.G2?.value == null && results.G3?.value != null) {
        console.log(`  G2 missing, retrying GOLD_INFO after 5s delay...`);
        await new Promise(r => setTimeout(r, 5000));
        try {
          const out2 = run(ttfCli, ['invoke', call.skill, '--action', 'query', '--env', 'prod', '--body', call.body]);
          const r2 = JSON.parse(out2);
          const d2 = r2?.data?.raw_result?.body?.data || null;
          if (d2) {
            const g2v = dotGet(d2, 'gold_quotes.au9999.close');
            if (g2v != null) {
              results.G2 = { indicator: 'G2', value: g2v, date, source: 'ttfund', unit: '元/克' };
              ok++;
              console.log(`  G2 recovered: ${g2v}`);
            }
          }
        } catch (e2) {
          console.error(`  G2 retry failed: ${e2.message.slice(0, 100)}`);
        }
      }

      prov.sources.ttfund.calls.push({ call: call.name, durationMs: Date.now() - t0, extracted: ok, attempts, status: 'ok' });
      console.log(`  ${call.name}: ${ok} values extracted`);
    } catch (e) {
      prov.sources.ttfund.calls.push({ call: call.name, durationMs: Date.now() - t0, error: e.message.slice(0, 200), status: 'failed' });
      console.error(`  ${call.name} FAILED: ${e.message.slice(0, 120)}`);
      for (const [id, spec] of Object.entries(call.extracts)) {
        if (!results[id]) results[id] = { indicator: id, value: null, date: null, source: 'ttfund', unit: spec.unit || '', error: e.message.slice(0, 200) };
      }
    }
  }

  // ════════════ IFIND ════════════
  console.log('\n── iFinD ──');
  const ifind = cfg.sources.ifind;
  const ifindPath = resolve(ifind.entry);
  const { call: iCall } = require(ifindPath);

  let iCount = 0, iOk = 0, iRetried = 0, iMonthFallback = 0;
  for (const batch of ifind.batches) {
    for (const item of batch.calls) {
      iCount++;
      const q = item.query.replace(/\$MONTH/g, MONTH).replace(/\$MONTH_PREV/g, MONTH_PREV).replace(/\$YEAR/g, YEAR);
      const qPrev = MONTH !== MONTH_PREV
        ? item.query.replace(/\$MONTH/g, MONTH_PREV).replace(/\$MONTH_PREV/g, MONTH_PREV).replace(/\$YEAR/g, YEAR) : null;
      try {
        const { result: data, attempts } = await withRetry(async () => {
          const doFetch = (qry) => iCall('edb', 'get_edb_data', { query: qry }).then(r => ({ r, parsed: parseIfind(r) }));
          // Try current month first
          let { parsed } = await doFetch(q);
          // If empty data and prev month differs, fall back to previous month
          if (qPrev && (!parsed || !parsed.datas?.length || !parsed.datas[0]?.data?.data?.length)) {
            ({ parsed } = await doFetch(qPrev));
          }
          if (!parsed) return null;
          if (item.type === 'single') {
            const fv = ifindFirst(parsed);
            return fv ? { type: 'single', val: fv } : null;
          } else {
            const kl = ifindKline(parsed);
            return kl?.length ? { type: 'kline', val: kl } : null;
          }
        }, 0, item.id);
        if (attempts > 0) iRetried++;

        if (data.type === 'single') {
          const rawVal = data.val[1];
          const scaledVal = rawVal != null && item.scale ? rawVal * item.scale : rawVal;
          results[item.indicator] = {
            indicator: item.indicator, value: scaledVal, date: data.val[0],
            source: 'ifind', unit: item.unit || ''
          };
        } else {
          results[item.indicator] = {
            indicator: item.indicator,
            value: data.val,
            date: data.val[0]?.[0] || null,
            source: 'ifind', unit: item.unit || '', note: `kline:${data.val.length}`
          };
        }
        iOk++;
      } catch (e) {
        results[item.indicator] = { indicator: item.indicator, value: null, date: null, source: 'ifind', unit: item.unit || '', error: e.message.slice(0, 200) };
        gaps.push({ indicator: item.indicator, source: 'ifind', status: e.message === 'null value' ? 'null_value' : 'error', error: e.message.slice(0, 200) });
      }
      await new Promise(r => setTimeout(r, ifind.batchDelayMs));
    }
  }
  prov.sources.ifind = { totalCalls: iCount, success: iOk, failed: iCount - iOk, retried: iRetried, batchCount: ifind.batches.length };
  console.log(`  ${iCount} calls, ${iOk} OK, ${iCount - iOk} null/error${iRetried > 0 ? ` (${iRetried} retried)` : ''}`);

  // ════════════ WIND ════════════
  console.log('\n── Wind ──');
  const windEntry = resolve(cfg.sources.wind.entry);
  const windCwd = resolve(cfg.sources.wind.cwd);
  prov.sources.wind = { calls: [] };

  for (const call of cfg.sources.wind.calls) {
    const t0 = Date.now();
    const vi = call.valueCol ?? 1;
    const di = call.dateCol ?? 0;
    try {
      const { result: row, attempts } = await withRetry(async () => {
        const body = JSON.stringify({ question: call.question });
        const out = run(windEntry, ['call', 'analytics_data', 'get_financial_data', body], { cwd: windCwd });
        const parsed = parseWind(out);
        return parsed?.[vi] != null ? parsed : null;
      }, 2, call.id);

      results[call.indicator] = {
        indicator: call.indicator,
        value: row[vi],
        date: row[di],
        source: 'wind', unit: call.unit || ''
      };
      const status = 'ok';
      prov.sources.wind.calls.push({ call: call.id, durationMs: Date.now() - t0, indicator: call.indicator, attempts, status });
      console.log(`  ${call.id}: OK value=${row[vi]}${attempts > 1 ? ` (retried ${attempts - 1}x)` : ''}`);
    } catch (e) {
      results[call.indicator] = { indicator: call.indicator, value: null, date: null, source: 'wind', unit: call.unit || '', error: e.message.slice(0, 200) };
      gaps.push({ indicator: call.indicator, source: 'wind', status: 'error', error: e.message.slice(0, 200) });
      prov.sources.wind.calls.push({ call: call.id, durationMs: Date.now() - t0, indicator: call.indicator, status: 'failed', error: e.message.slice(0, 200) });
      console.error(`  ${call.id} FAILED: ${e.message.slice(0, 120)}`);
    }
  }

  // ════════════ MXDATA ════════════
  console.log('\n── mx-data: skipped (WebSearch primary for A3) ──');
  prov.sources.mxdata = { status: 'skipped', note: 'A3 via WebSearch (EastMoney primary)' };

  // ════════════ WRITE OUTPUTS ════════════
  console.log('\n── Freshness check ──');

  const freshness = cfg.freshness || {};
  let freshCount = 0, staleSuccessCount = 0, staleGapCount = 0, invalidDateCount = 0;
  for (const [id, r] of Object.entries(results)) {
    const f = freshness[id];
    r._freshStatus = 'unknown';
    if (!f) continue;
    if (r.value == null || r.error) { r._freshStatus = 'missing'; continue; }
    if (!r.date) { r._freshStatus = 'no_date'; staleGapCount++; gaps.push({ indicator: id, status: 'no_date', source: r.source || 'unknown' }); continue; }

    const parsed = parseDate(r.date);
    if (!parsed) {
      r._freshStatus = 'invalid_date';
      invalidDateCount++;
      gaps.push({ indicator: id, status: 'invalid_date', rawDate: String(r.date), source: r.source || 'unknown' });
      console.log(`  [invalid_date] ${id}: "${r.date}"`);
      continue;
    }
    const ageDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < f.maxAgeDays + 1) {
      r._freshStatus = 'fresh';
      freshCount++;
    } else if (f.staleAction === 'acceptable') {
      r._freshStatus = 'staleSuccess';
      staleSuccessCount++;
    } else {
      r._freshStatus = 'staleGap';
      if (f.staleAction === 'fallback_not_implemented') r._staleNote = 'fallback_not_implemented';
      staleGapCount++;
      gaps.push({ indicator: id, status: r._freshStatus, ageDays: Math.round(ageDays), maxAgeDays: f.maxAgeDays, date: r.date, source: r.source || 'unknown' });
      console.log(`  [stale] ${id}: ${r.date} (${ageDays.toFixed(0)}d > ${f.maxAgeDays}d max)`);
    }
  }

  // Recompute collected/missing with freshness awareness
  const activeCount = freshCount + staleSuccessCount;
  const rawCollected = Object.values(results).filter(r => r.value != null && !r.error).length;
  const missing = Object.values(results).filter(r => r.value == null || r.error).length;
  const total = Object.keys(results).length;

  console.log(`  fresh:${freshCount} staleSuccess:${staleSuccessCount} staleGap:${staleGapCount} invalidDate:${invalidDateCount} missing:${missing}`);

  // ════════════ WRITE OUTPUTS ════════════
  console.log('\n── Writing outputs ──');

  // raw.json
  fs.writeFileSync(path.join(RUN_DIR, 'raw.json'), JSON.stringify({
    runId, round, version: cfg.version,
    collectedAt: new Date().toISOString(),
    summary: { total, collected: activeCount, missing, fresh: freshCount, staleSuccess: staleSuccessCount, staleGap: staleGapCount, invalidDate: invalidDateCount },
    results
  }, null, 2));

  // provenance.json
  prov.endTime = new Date().toISOString();
  const wsItems = cfg.websearch?.items || [];
  prov.summary = { totalItems: total, activeItems: activeCount, fresh: freshCount, staleSuccess: staleSuccessCount, staleGap: staleGapCount, invalidDate: invalidDateCount, missing, websearchPending: wsItems.length };
  fs.writeFileSync(path.join(RUN_DIR, 'provenance.json'), JSON.stringify(prov, null, 2));

  // gaps.json
  fs.writeFileSync(path.join(RUN_DIR, 'gaps.json'), JSON.stringify(gaps, null, 2));

  // websearch-tasks.md
  let md = `# WebSearch Tasks — runId: ${runId}\n## Generated: ${new Date().toISOString()}\n\n`;
  md += `Execute these ${wsItems.length} WebSearch queries. For each: record value, date, source URL.\n\n`;
  md += `| ID | Name | Query | Unit | Critical |\n`;
  md += `|:--:|------|-------|------|:--:|\n`;
  for (const item of wsItems) {
    md += `| ${item.id} | ${item.name} | \`${item.query}\` | ${item.unit} | ${item.critical ? 'yes' : 'no'} |\n`;
  }
  md += `\n## Results (fill per item)\n\n`;
  for (const item of wsItems) {
    md += `### ${item.id} — ${item.name}\n- **Value**: \n- **Date**: \n- **Source URL**: \n- **Notes**: \n\n`;
  }
  fs.writeFileSync(path.join(RUN_DIR, 'websearch-tasks.md'), md);

  // ── raw-snapshot.md (formatted from raw.json, per snapshot-schema.md) ──
  const sectionOrder = [
    { key: 'A', name: 'A 预警层' },
    { key: 'B', name: 'B 债券' },
    { key: 'M', name: 'M 中国货币市场' },
    { key: 'N', name: 'N 美国货币市场' },
    { key: 'F', name: 'F 美联储政策' },
    { key: 'E', name: 'E 股市指数' },
    { key: 'O', name: 'O 原油' },
    { key: 'G', name: 'G 黄金' },
    { key: 'X', name: 'X 汇率' },
    { key: 'S', name: 'S 情绪' },
    { key: 'R', name: 'R 候选' },
  ];

  let snapshotMd = `# 数据快照 · ${now.toISOString().slice(0, 16).replace('T', ' ')}\n\n`;
  snapshotMd += `## 元信息\n`;
  snapshotMd += `- 轮次：${round}\n`;
  snapshotMd += `- 采集时间：${prov.startTime} - ${prov.endTime || now.toISOString()} CST\n`;
  snapshotMd += `- 覆盖：${total} attempted | fresh:${freshCount} staleSuccess:${staleSuccessCount} staleGap:${staleGapCount} invalidDate:${invalidDateCount} missing:${missing}\n`;
  snapshotMd += `- 缺口：${gaps.length > 0 ? gaps.map(g => g.indicator).join(', ') : '无'}\n\n`;
  snapshotMd += `## 原始数据\n\n`;

  // Group results by section
  const sectionMap = {};
  for (const [id, r] of Object.entries(results)) {
    const prefix = id.match(/^[A-Z]/)?.[0] || 'Z';
    if (!sectionMap[prefix]) sectionMap[prefix] = [];
    sectionMap[prefix].push({ id, ...r });
  }

  for (const sec of sectionOrder) {
    const items = sectionMap[sec.key];
    if (!items || items.length === 0) continue;
    snapshotMd += `### ${sec.name}\n`;
    snapshotMd += `| 编号 | 名称 | 值 | 数据日期 | 来源 |\n`;
    snapshotMd += `|:--:|------|------|------|------|\n`;
    for (const item of items) {
      const val = item.value != null && !item.error
        ? (typeof item.value === 'object' ? `[kline:${item.value.length}]` : item.value)
        : '🔴 缺口';
      const date = item.date || '-';
      const source = `${item.source}${item.note ? ' ' + item.note : ''}`;
      const displayName = cfg.indicatorNames?.[item.id] || item.id;
      snapshotMd += `| ${item.id} | ${displayName} | ${val} | ${date} | ${source} |\n`;
    }
    snapshotMd += '\n';
  }
  fs.writeFileSync(path.join(RUN_DIR, 'raw-snapshot.md'), snapshotMd);

  // ── provenance.md (formatted from provenance.json, per snapshot-schema.md) ──
  let provMd = `# Provenance — ${runId}\n\n`;
  provMd += `## Meta\n`;
  provMd += `- runId: ${runId}\n`;
  provMd += `- startTime: ${prov.startTime}\n`;
  provMd += `- endTime: ${prov.endTime || now.toISOString()}\n\n`;
  provMd += `## Tool Versions\n`;
  provMd += `| 工具 | 调用次数 | 成功 |\n`;
  provMd += `|------|:--:|:--:|\n`;
  provMd += `| ttfund | ${prov.sources.ttfund?.calls?.length || 0} | ${prov.sources.ttfund?.calls?.filter(c => c.status === 'ok').length || 0} |\n`;
  provMd += `| iFinD | ${prov.sources.ifind?.totalCalls || 0} | ${prov.sources.ifind?.success || 0} |\n`;
  provMd += `| Wind | ${prov.sources.wind?.calls?.length || 0} | ${prov.sources.wind?.calls?.filter(c => c.status === 'ok').length || 0} |\n`;
  provMd += `| mx-data | 0 | — (skipped) |\n`;
  provMd += `| WebSearch | ${wsItems.length} | — (pending) |\n\n`;
  provMd += `## Adapter Execution Matrix\n\n`;
  provMd += `| Adapter | 已执行 | status |\n`;
  provMd += `|---------|:--:|------|\n`;
  provMd += `| ttfund | ${prov.sources.ttfund?.calls?.length || 0} | ${prov.sources.ttfund?.calls?.some?.(c => c.status === 'failed') ? 'partial' : 'ok'} |\n`;
  provMd += `| iFinD | ${prov.sources.ifind?.totalCalls || 0} | ${(prov.sources.ifind?.failed || 0) > 0 ? 'partial' : 'ok'} |\n`;
  provMd += `| Wind | ${prov.sources.wind?.calls?.length || 0} | ${prov.sources.wind?.calls?.some?.(c => c.status === 'failed') ? 'partial' : 'ok'} |\n`;
  provMd += `| mx-data | 0 | skipped (A3 via WebSearch) |\n`;
  provMd += `| WebSearch | ${wsItems.length} | pending |\n\n`;
  if (gaps.length > 0) {
    provMd += `## 缺口分类\n`;
    provMd += `| 编号 | 原因类别 | 详情 |\n`;
    provMd += `|------|------|------|\n`;
    for (const g of gaps) {
      provMd += `| ${g.indicator} | ${g.status} | ${g.error || '-'} |\n`;
    }
  }
  fs.writeFileSync(path.join(RUN_DIR, 'provenance.md'), provMd);

  // ── Summary ──
  console.log(`\n=== DONE ===`);
  console.log(`Structured: ${activeCount} active / ${staleGapCount} stale / ${invalidDateCount} invalidDate / ${missing} missing / ${total} total (fresh:${freshCount} staleSuccess:${staleSuccessCount})`);
  console.log(`WebSearch: ${wsItems.length} tasks pending`);
  console.log(`Output: ${RUN_DIR}/`);
  console.log(`  raw.json  raw-snapshot.md  provenance.json  provenance.md  gaps.json  websearch-tasks.md`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
