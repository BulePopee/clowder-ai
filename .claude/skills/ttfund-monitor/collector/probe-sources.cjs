#!/usr/bin/env node
/**
 * probe-sources.cjs — ttfund-monitor 前置探测脚本
 * 探测核心工具可用性，按 DEPENDENCIES.md 状态分类输出
 * Usage: node collector/probe-sources.cjs [--runId <id>] [--json]
 */

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

// ── resolve $HOME ──────────────────────────────────────────────
const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir();
function resolveHome(p) {
  if (!p) return p;
  return p.replace(/\$HOME/g, HOME);
}

// ── helpers ─────────────────────────────────────────────────────
function probeCmd(cmd, args, cwd, timeoutMs, maxStdout) {
  const t = timeoutMs || 30000;
  const maxOut = maxStdout || 8000;
  try {
    const r = spawnSync(cmd, args, { cwd: cwd || process.cwd(), timeout: t, encoding: 'utf8' });
    return { ok: r.status === 0 && !(r.error), stdout: (r.stdout || '').slice(0, maxOut), stderr: (r.stderr || '').slice(0, 800), code: r.status, signal: r.signal, error: r.error ? r.error.message : null, truncated: (r.stdout || '').length > maxOut };
  } catch (e) {
    return { ok: false, stdout: '', stderr: '', code: null, error: e.message };
  }
}

function isInstalled(result) {
  return result.pathExists && result.cliExists;
}

// ── main probe per tool ─────────────────────────────────────────

function probeTtfund(indicatorsJson) {
  const cfg = indicatorsJson && indicatorsJson.sources && indicatorsJson.sources.ttfund;
  const cliPath = cfg ? resolveHome(cfg.cli) : null;
  const result = {
    tool: 'ttfund',
    installPath: cliPath,
    pathExists: cliPath ? fs.existsSync(cliPath) : false,
    cliExists: false,
    cliCheck: null,
    status: 'not_installed',
    details: ''
  };
  if (!cliPath) {
    result.details = 'indicators.json 中无 ttfund CLI 路径';
    return result;
  }
  if (!result.pathExists) {
    result.details = `CLI 不存在: ${cliPath}`;
    result.status = 'path_missing';
    return result;
  }

  result.cliExists = true;

  // lightweight probe: node <cli> status --env prod --json
  const probe = probeCmd('node', [cliPath, 'status', '--env', 'prod', '--json'], null, 15000, 16000);
  result.cliCheck = { code: probe.code, ok: probe.ok, truncated: probe.truncated || false, stderr: probe.stderr.slice(0, 400) };

  if (probe.ok) {
    try {
      const j = JSON.parse(probe.stdout);
      if (j && typeof j === 'object') {
        result.status = 'available';
        result.details = 'status probe 成功返回 JSON';
      } else {
        result.status = 'available';
        result.details = 'status 返回非 JSON 对象但 CLI 可用（exit 0）';
      }
    } catch (e) {
      // exit 0 but parse failed — often truncated output; CLI is available
      result.status = 'available';
      result.details = probe.truncated ? 'CLI 可用（status JSON 被截断超过 16KB，exit 0）' : `CLI 可用（status JSON 解析失败但 exit 0: ${e.message.slice(0, 100)}）`;
    }
  } else {
    result.status = 'probe_failed';
    result.details = probe.error || `status 非零退出 (${probe.code})`;
  }
  return result;
}

function probeIfind(indicatorsJson) {
  const cfg = indicatorsJson && indicatorsJson.sources && indicatorsJson.sources.ifind;
  const entryPath = cfg ? cfg.entry : null;
  const cwd = cfg ? cfg.cwd : null;
  const result = {
    tool: 'ifind',
    installPath: entryPath,
    cwd: cwd,
    pathExists: entryPath ? fs.existsSync(entryPath) : false,
    cliExists: false,
    cliCheck: null,
    configCheck: null,
    status: 'not_installed',
    details: ''
  };
  if (!entryPath) {
    result.details = 'indicators.json 中无 iFinD 入口路径';
    return result;
  }
  if (!result.pathExists) {
    result.details = `入口文件不存在: ${entryPath}`;
    result.status = 'path_missing';
    return result;
  }
  result.cliExists = true;

  // check mcp_config.json exists next to entry
  const configPath = path.join(path.dirname(entryPath), 'mcp_config.json');
  const configExists = fs.existsSync(configPath);
  result.configCheck = { path: configPath, exists: configExists };
  if (!configExists) {
    result.status = 'cli_missing';
    result.details = `mcp_config.json 缺失: ${configPath}`;
    return result;
  }

  // lightweight probe: import and call, check for error pattern
  const probe = probeCmd('node', ['-e', `
    try {
      const m = require(${JSON.stringify(entryPath)});
      if (typeof m === 'function' || typeof m === 'object') {
        console.log("ok");
      } else {
        console.log("unexpected_type");
      }
    } catch(e) {
      console.log("load_error:" + e.message);
    }
  `], cwd || process.cwd(), 15000);
  result.cliCheck = { ok: probe.ok, stdout: probe.stdout.trim(), stderr: probe.stderr.slice(0, 400) };

  if (probe.ok && probe.stdout.includes('ok')) {
    result.status = 'available';
    result.details = '入口模块加载成功，mcp_config.json 存在';
  } else if (probe.ok && probe.stdout.includes('unexpected_type')) {
    result.status = 'probe_failed';
    result.details = '入口模块加载成功但类型异常';
  } else {
    result.status = 'probe_failed';
    result.details = probe.stderr.slice(0, 200) || '入口模块加载失败';
  }
  return result;
}

function probeWind(indicatorsJson) {
  const cfg = indicatorsJson && indicatorsJson.sources && indicatorsJson.sources.wind;
  const entryPath = cfg ? resolveHome(cfg.entry) : null;
  const cwd = cfg ? resolveHome(cfg.cwd) : null;
  const installDir = cwd || (entryPath ? path.dirname(entryPath) : null);
  const skillPath = installDir ? path.join(installDir, 'SKILL.md') : null;

  const result = {
    tool: 'wind',
    installDir: installDir,
    entryPath: entryPath,
    pathExists: installDir ? fs.existsSync(installDir) : false,
    skillExists: skillPath ? fs.existsSync(skillPath) : false,
    cliExists: entryPath ? fs.existsSync(entryPath) : false,
    probeCheck: null,
    status: 'not_installed',
    details: ''
  };

  if (!installDir) {
    result.details = 'indicators.json 中无 Wind cwd';
    return result;
  }

  // Step 1-4: install evidence
  if (!result.pathExists && !result.cliExists && !result.skillExists) {
    result.details = `Wind 安装目录/CLI/SKILL 均不存在: ${installDir}`;
    result.status = 'not_installed';
    return result;
  }

  if (!result.pathExists) {
    result.status = 'path_missing';
    result.details = `安装目录不存在: ${installDir}`;
    return result;
  }
  if (!result.cliExists) {
    result.status = 'cli_missing';
    result.details = `CLI 不存在: ${entryPath}`;
    return result;
  }

  // Step 5: lightweight probe
  const probe = probeCmd('node', [entryPath, 'call', 'analytics_data', 'get_financial_data', '{"question":"联邦基金目标利率 最新值"}'], cwd, 30000);
  result.probeCheck = { code: probe.code, ok: probe.ok, stdLen: probe.stdout.length, stderr: probe.stderr.slice(0, 400) };

  if (probe.ok) {
    try {
      const j = JSON.parse(probe.stdout);
      result.status = 'available';
      result.details = 'probe 成功返回结构化数据';
      result.probeCheck.hasData = j && Object.keys(j).length > 0;
    } catch (e) {
      result.status = 'probe_failed';
      result.details = `probe 输出 JSON 解析失败: ${e.message}`;
    }
  } else {
    result.status = 'probe_failed';
    result.details = probe.error || `probe 非零退出 (${probe.code}): ${probe.stderr.slice(0, 200)}`;
  }

  return result;
}

function probeMxData(indicatorsJson) {
  const cfg = indicatorsJson && indicatorsJson.sources && indicatorsJson.sources.mxdata;
  const result = {
    tool: 'mx-data',
    installPath: null,
    pathExists: false,
    status: 'not_installed',
    details: ''
  };
  if (!cfg) {
    result.details = 'indicators.json 中无 mx-data 配置';
    return result;
  }
  // mx-data is non-critical; just check path existence
  result.installPath = cfg.entry || null;
  if (!result.installPath) {
    result.details = 'indicators.json 中无 mx-data 入口路径';
    return result;
  }
  result.pathExists = fs.existsSync(result.installPath);
  result.status = result.pathExists ? 'available' : 'path_missing';
  result.details = result.pathExists ? '入口文件存在' : `入口文件不存在: ${result.installPath}`;
  return result;
}

// ── Depth probe helpers ─────────────────────────────────────────
function dotGet(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    // handle array index like items[0]
    const arrMatch = p.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      cur = cur[arrMatch[1]];
      if (cur == null) return undefined;
      cur = cur[parseInt(arrMatch[2])];
    } else {
      cur = cur[p];
    }
  }
  return cur;
}

function isDateLike(v) {
  if (!v) return false;
  if (v instanceof Date) return true;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{8}$/.test(s) || /^\d{4}\/\d{2}\/\d{2}/.test(s);
}

function isNumeric(v) {
  if (v == null) return false;
  if (typeof v === 'number' && !isNaN(v)) return true;
  if (typeof v === 'string') {
    // Skip date-like strings (parseFloat("2025-12-11") = 2025 is a false positive)
    if (/^\d{4}-\d{2}-\d{2}/.test(v.trim()) || /^\d{8}$/.test(v.trim())) return false;
    const n = parseFloat(v.replace(/,/g, ''));
    return !isNaN(n) && isFinite(n);
  }
  return false;
}

function checkValue(v, kind) {
  if (v == null || v === '') return { ok: false, reason: 'null_or_empty' };
  if (kind === 'number') return { ok: isNumeric(v), reason: isNumeric(v) ? null : 'not_numeric' };
  if (kind === 'date') return { ok: isDateLike(v), reason: isDateLike(v) ? null : 'not_date' };
  if (kind === '$any') return { ok: true, reason: null };
  return { ok: true, reason: null };
}

// ── Depth probes ─────────────────────────────────────────────────

function probeTtfundDepth(cliPath, dpConfig) {
  if (!dpConfig || !dpConfig.enabled) return { verdict: 'skipped', checks: [], summary: 'depth probe disabled' };

  const args = dpConfig.argsTemplate.map(a => a.replace('{cliPath}', cliPath));
  const r = probeCmd(dpConfig.command, args, null, dpConfig.timeoutMs, 256000);

  const checks = [];
  let schemaOk = false;
  let allValuesOk = true;
  let allDatesOk = true;
  const failures = [];

  if (!r.ok) {
    failures.push(`CLI invoke failed (exit ${r.code}): ${r.stderr.slice(0, 200) || r.error || 'unknown'}`);
    return {
      verdict: 'failed',
      classification: /auth|login|token|expired/i.test(r.stderr) ? 'auth_missing' :
                      /timeout|ETIMEDOUT/i.test(r.stderr) ? 'timeout' : 'endpoint_failed',
      checks: [],
      failures,
      details: r.stderr.slice(0, 300) || r.error || 'CLI invoke failed'
    };
  }

  // Parse JSON response
  let data;
  try {
    const raw = JSON.parse(r.stdout);
    const parser = dpConfig.responseParser;
    data = parser.path ? dotGet(raw, parser.path) : raw;
    if (data == null) {
      failures.push('Response data path returned null — possible auth/endpoint issue');
      return {
        verdict: 'failed',
        classification: 'auth_missing',
        checks: [],
        failures,
        details: 'Parsed JSON OK but data path returned null'
      };
    }
    schemaOk = true;
  } catch (e) {
    failures.push(`JSON parse failed: ${e.message}`);
    return {
      verdict: 'failed',
      classification: 'schema_drift',
      checks: [],
      failures,
      details: `JSON parse error: ${e.message.slice(0, 200)}`
    };
  }

  // Check each required path (with date path fallbacks)
  for (const check of (dpConfig.checks || [])) {
    let v = dotGet(data, check.path);
    let dtOk = false;

    if (check.valueKind === 'date') {
      // For date checks, try multiple well-known date paths
      const datePaths = [
        check.path,
        'macro_fiscal.trade_date',
        'gold_quotes.au9999.date',
        'macro_fiscal.cpi_yoy.date',
        'trade_date',
        'date'
      ];
      for (const dp of datePaths) {
        v = dotGet(data, dp);
        if (isDateLike(v)) { dtOk = true; break; }
      }
    } else {
      // For value checks, also verify date from sibling/top-level paths
      const parentPath = check.path.split('.').slice(0, -1).join('.');
      const datePaths = [
        'macro_fiscal.trade_date',
        'gold_quotes.au9999.date',
        'trade_date',
        'date',
        'update_date'
      ];
      dtOk = datePaths.some(dp => isDateLike(dotGet(data, dp)));
      // Also check for date-like values in the same parent object
      if (!dtOk && parentPath) {
        const parent = dotGet(data, parentPath);
        if (parent && typeof parent === 'object') {
          dtOk = Object.entries(parent).some(([k, val]) => /date|time|day/i.test(k) && isDateLike(val));
        }
      }
    }

    const valueCheck = checkValue(v, check.valueKind);
    const checkResult = {
      checkId: `ttfund-${check.path.replace(/\./g, '-').replace(/[\[\]]/g, '')}`,
      label: check.label,
      indicatorId: check.indicatorId || null,
      critical: !!check.critical,
      callable: true,
      schemaOk: true,
      valueOk: valueCheck.ok,
      dateOk: dtOk,
      value: v != null ? (typeof v === 'object' ? '(object)' : String(v).slice(0, 80)) : null
    };

    if (!valueCheck.ok) {
      allValuesOk = false;
      checkResult.failureClass = 'value_missing';
      checkResult.details = `Value at ${check.path} ${valueCheck.reason}: ${v == null ? 'null' : String(v).slice(0, 40)}`;
    }
    if (!dtOk && check.valueKind !== 'date') {
      allDatesOk = false;
      checkResult.failureClass = checkResult.failureClass || 'date_missing';
      checkResult.details = (checkResult.details || '') + ' [date not found]';
    }

    checks.push(checkResult);
  }

  const failedChecks = checks.filter(c => c.failureClass);
  return {
    verdict: failedChecks.length === 0 ? 'ok' :
             checks.filter(c => c.critical && c.failureClass).length > 0 ? 'failed' : 'degraded',
    classification: failedChecks.length > 0 ?
      (failedChecks[0].failureClass === 'value_missing' ? 'value_missing' : 'date_missing') : null,
    checks,
    failures: failedChecks.map(c => c.details).filter(Boolean),
    details: failedChecks.length === 0 ? 'All depth checks passed' :
             `${failedChecks.length}/${checks.length} checks failed`
  };
}

function probeIfindDepth(entryPath, cwd, dpConfig) {
  if (!dpConfig || !dpConfig.enabled) return { verdict: 'skipped', checks: [], summary: 'depth probe disabled' };

  // iFinD requires async call — use inline Node script
  // Response structure matches collector index.cjs parseIfind → ifindFirst chain
  const funcArgs = dpConfig.functionCall.args.map(a => JSON.stringify(a)).join(', ');
  const script = `
(async () => {
  try {
    const { ${dpConfig.functionCall.export} } = require(${JSON.stringify(entryPath)});
    const raw = await ${dpConfig.functionCall.export}(${funcArgs});
    // Mirror collector: parseIfind(raw) → data → ifindFirst(data)
    let value = null, date = null;
    const text = raw?.data?.result?.content?.[0]?.text;
    if (text && raw.ok) {
      try {
        const inner = JSON.parse(text);
        const data = inner?.data;
        if (data?.datas?.length) {
          const rows = data.datas[0].data?.data;
          if (rows?.length) {
            date = rows[0]?.[0] || null;
            value = rows[0]?.[1] != null ? Number(rows[0][1]) : null;
          }
        }
      } catch(_) {}
    }
    console.log(JSON.stringify({ ok: true, value, date, hasData: value != null }));
  } catch(e) {
    console.log(JSON.stringify({ ok: false, error: e.message.slice(0, 500) }));
  }
})();
`;
  const r = probeCmd('node', ['-e', script], cwd, dpConfig.timeoutMs);

  if (!r.ok) {
    const errMsg = r.stderr.slice(0, 400) || r.error || 'unknown';
    const classification = /auth|login|token|expired|unauthorized|permission/i.test(errMsg) ? 'auth_missing' :
                           /timeout|ETIMEDOUT/i.test(errMsg) ? 'timeout' :
                           /cannot find module|require/i.test(errMsg) ? 'tool_missing' : 'endpoint_failed';
    return {
      verdict: 'failed',
      classification,
      checks: [],
      failures: [errMsg],
      details: `iFinD depth probe failed: ${errMsg.slice(0, 200)}`
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    return {
      verdict: 'failed',
      classification: 'schema_drift',
      checks: [],
      failures: [`JSON parse failed: ${r.stdout.slice(0, 200)}`],
      details: 'iFinD depth probe returned non-JSON output'
    };
  }

  if (!parsed.ok) {
    return {
      verdict: 'failed',
      classification: /auth|login|token/i.test(parsed.error || '') ? 'auth_missing' : 'endpoint_failed',
      checks: [],
      failures: [parsed.error || 'unknown error'],
      details: `iFinD call failed: ${(parsed.error || '').slice(0, 200)}`
    };
  }

  const extracted = parsed; // { ok, value, date, hasData }
  const checks = [];
  const vc = checkValue(extracted.value, 'number');
  const dc = checkValue(extracted.date, 'date');
  checks.push({
    checkId: 'ifind-b8-value',
    label: 'B8 TIPS 10Y value',
    indicatorId: 'B8',
    callable: true,
    schemaOk: true,
    valueOk: vc.ok,
    dateOk: dc.ok,
    value: extracted.value != null ? String(extracted.value) : null,
    failureClass: vc.ok ? null : 'value_missing',
    details: vc.ok ? null : `Value: ${vc.reason}`
  });
  checks.push({
    checkId: 'ifind-b8-date',
    label: 'B8 date',
    callable: true,
    schemaOk: true,
    valueOk: dc.ok,
    dateOk: dc.ok,
    value: extracted.date != null ? String(extracted.date) : null,
    failureClass: dc.ok ? null : 'date_missing',
    details: dc.ok ? null : `Date: ${dc.reason}`
  });

  const allOk = vc.ok && dc.ok;
  return {
    verdict: allOk ? 'ok' : extracted.hasData ? 'degraded' : 'failed',
    classification: !extracted.hasData ? 'no_data' : !vc.ok ? 'value_missing' : null,
    checks,
    failures: checks.filter(c => c.failureClass).map(c => c.details).filter(Boolean),
    details: allOk ? 'iFinD depth probe passed' : 'Some value checks failed'
  };
}

function probeWindDepth(entryPath, cwd, dpConfig) {
  if (!dpConfig || !dpConfig.enabled) return { verdict: 'skipped', checks: [], summary: 'depth probe disabled' };

  // Wind basic probe already does a real API call — enhance with value/date checks
  const args = dpConfig.argsTemplate.map(a => a === '{entryPath}' ? entryPath : a);
  const r = probeCmd(dpConfig.command, args, cwd, dpConfig.timeoutMs);

  if (!r.ok) {
    const errMsg = r.stderr.slice(0, 400) || r.error || 'unknown';
    return {
      verdict: 'failed',
      classification: /auth|login|token|policy_blocked/i.test(errMsg) ? 'auth_missing' :
                      /timeout/i.test(errMsg) ? 'timeout' : 'endpoint_failed',
      checks: [],
      failures: [errMsg],
      details: `Wind depth probe failed: ${errMsg.slice(0, 200)}`
    };
  }

  let data;
  try {
    data = JSON.parse(r.stdout);
  } catch (e) {
    return {
      verdict: 'failed',
      classification: 'schema_drift',
      checks: [],
      failures: [`JSON parse failed: ${r.stdout.slice(0, 200)}`],
      details: 'Wind depth probe returned non-JSON'
    };
  }

  // Wind response: nested MCP format. Mirror collector's parseWind:
  //   outer.content[0].text → JSON.parse → inner.data.data[0].rows
  // Prove the actual indicator data path, not just "some numeric exists".
  let rows = null;
  try {
    const text = data?.content?.[0]?.text;
    if (text) {
      const inner = JSON.parse(text);
      rows = inner?.data?.data?.[0]?.rows || null;
    }
  } catch (_) { rows = null; }

  const hasData = rows && Array.isArray(rows) && rows.length > 0;
  // Each row should be an array/object with at least one date + one numeric
  let foundValue = null;
  let foundDate = null;
  if (hasData) {
    for (const row of rows) {
      const vals = Array.isArray(row) ? row : Object.values(row);
      const nums = vals.filter(v => isNumeric(v));
      const dates = vals.filter(v => isDateLike(v));
      if (nums.length > 0 && dates.length > 0) {
        foundValue = nums[0];
        foundDate = dates[0];
        break;
      }
    }
    // try to find a date column from column names
    if (foundValue != null && foundDate == null) {
      try {
        const text = data?.content?.[0]?.text;
        if (text) {
          const inner = JSON.parse(text);
          const columns = inner?.data?.data?.[0]?.columns || [];
          const dateColIdx = columns.findIndex(c => /date|日期|time/i.test(c?.name || ''));
          if (dateColIdx >= 0 && Array.isArray(rows[0])) {
            foundDate = rows[0][dateColIdx];
          }
        }
      } catch (_) {}
    }
  }

  const valueOk = foundValue != null;
  const dateOk = foundDate != null && isDateLike(foundDate);

  return {
    verdict: hasData && valueOk ? 'ok' : hasData ? 'degraded' : 'failed',
    classification: !hasData ? 'no_data' : !valueOk ? 'value_missing' : null,
    checks: [{
      checkId: 'wind-ffr-probe',
      label: 'F1 Fed funds rate (via parseWind rows)',
      indicatorId: 'F1',
      callable: true,
      schemaOk: hasData,
      valueOk,
      dateOk,
      value: foundValue != null ? String(foundValue) : null,
      date: foundDate != null ? String(foundDate) : null,
      failureClass: !hasData ? 'no_data' : !valueOk ? 'value_missing' : !dateOk ? 'date_missing' : null,
      details: !hasData ? 'No rows at data.data[0].rows path' : !valueOk ? 'No numeric value in rows' : null
    }],
    failures: !hasData ? ['No rows at expected data path'] : !valueOk ? ['No numeric value in rows'] : [],
    details: hasData && valueOk ? `Wind depth probe passed (value=${foundValue}${foundDate ? ', date=' + foundDate : ''})` : 'Wind probe response lacks expected data'
  };
}

// ── Contract classification ──────────────────────────────────────
function classifyStatus(probeResult, contract) {
  const s = probeResult.status;
  if (s === 'available') return 'callable';
  if (s === 'not_installed') return 'tool_missing';
  if (s === 'path_missing') return 'tool_missing';
  if (s === 'cli_missing') return 'tool_missing';
  if (s === 'probe_failed') {
    const detail = (probeResult.details || '').toLowerCase();
    if (/auth|login|token|credentials|permission|unauthorized/i.test(detail)) return 'auth_missing';
    if (/timeout|network|connect|econnrefused|eacces/i.test(detail)) return 'auth_missing';
    if (/parse|schema|unexpected.*type|json/i.test(detail)) return 'schema_drift';
    return 'no_data';
  }
  return 'unknown';
}

function contractStatus(probeResult, contractClass) {
  if (contractClass === 'callable') return 'ok';
  // Check if this failure mode is allowed by the contract
  const allowed = probeResult._contractAllowedModes || [];
  if (allowed.includes(contractClass)) return 'degraded';
  return 'violation';
}

// ── main ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const runIdIdx = args.indexOf('--runId');
  const runId = runIdIdx >= 0 ? args[runIdIdx + 1] : null;
  const outIdx = args.indexOf('--output');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : null;

  const indicatorsJson = require('./indicators.cjs');

  let contracts = null;
  try {
    contracts = require('../config/source-contracts.json');
  } catch (e) {
    // source-contracts.json may not exist yet — degrade gracefully
  }

  const results = {
    checkedAt: new Date().toISOString(),
    tools: {
      ttfund: probeTtfund(indicatorsJson),
      ifind: probeIfind(indicatorsJson),
      wind: probeWind(indicatorsJson)
      // mx-data not in core 3; probed separately
    },
    mxdata: probeMxData(indicatorsJson),
    summary: {}
  };

  // aggregate: any non-available → degraded; all unavailable/not_installed → fatal
  const core = ['ttfund', 'ifind', 'wind'];
  const coreAvailable = core.filter(t => results.tools[t].status === 'available');
  const coreNotAvailable = core.filter(t => results.tools[t].status !== 'available');
  const coreAllUnavailable = core.every(t => {
    const s = results.tools[t].status;
    return s === 'unavailable' || s === 'not_installed';
  });

  results.summary = {
    available: coreAvailable,
    degraded: coreNotAvailable,
    allUnavailable: coreAllUnavailable,
    verdict: coreAllUnavailable ? 'fatal' : coreNotAvailable.length > 0 ? 'degraded' : 'ok'
  };

  // ── Run depth probes for available sources ────────────────────
  results.depthProbes = {};
  const depthPolicy = contracts?.depthProbePolicy || { requiredSources: ['ttfund', 'ifind', 'wind'] };
  let depthFailed = 0;
  let depthDegraded = 0;

  // ttfund depth probe
  if (results.tools.ttfund.status === 'available') {
    const ttfCli = results.tools.ttfund.installPath;
    const dpConfig = contracts?.sources?.ttfund?.depthProbe;
    results.depthProbes.ttfund = probeTtfundDepth(ttfCli, dpConfig);
  } else {
    results.depthProbes.ttfund = { verdict: 'skipped', checks: [], summary: 'basic probe not available, depth skipped' };
  }

  // iFinD depth probe
  if (results.tools.ifind.status === 'available') {
    const ifindEntry = results.tools.ifind.installPath;
    const ifindCwd = results.tools.ifind.cwd;
    const dpConfig = contracts?.sources?.ifind?.depthProbe;
    results.depthProbes.ifind = probeIfindDepth(ifindEntry, ifindCwd, dpConfig);
  } else {
    results.depthProbes.ifind = { verdict: 'skipped', checks: [], summary: 'basic probe not available, depth skipped' };
  }

  // Wind depth probe
  if (results.tools.wind.status === 'available') {
    const windEntry = results.tools.wind.entryPath;
    const windCwd = results.tools.wind.installDir;
    const dpConfig = contracts?.sources?.wind?.depthProbe;
    results.depthProbes.wind = probeWindDepth(windEntry, windCwd, dpConfig);
  } else {
    results.depthProbes.wind = { verdict: 'skipped', checks: [], summary: 'basic probe not available, depth skipped' };
  }

  // Compute depth probe verdict
  for (const [srcId, dp] of Object.entries(results.depthProbes)) {
    if (dp.verdict === 'failed') {
      if (depthPolicy.requiredSources?.includes(srcId)) {
        depthFailed++;
      } else {
        depthDegraded++;
      }
    } else if (dp.verdict === 'degraded') {
      depthDegraded++;
    }
  }

  const depthVerdict = depthFailed > 0 ? 'depth_failed' : depthDegraded > 0 ? 'depth_degraded' : 'ok';
  const combinedVerdict = results.summary.verdict === 'fatal' ? 'fatal' :
                          depthVerdict === 'depth_failed' ? 'depth_failed' :
                          depthVerdict === 'depth_degraded' ? 'depth_degraded' :
                          results.summary.verdict;

  // output
  const effectiveOutDir = outDir || (runId ? path.join(__dirname, '..', '..', '..', '..', 'data', 'ttfund-monitor', 'runs', runId) : null);
  if (!jsonFlag && !effectiveOutDir) {
    console.log('=== ttfund-monitor 前置探测 ===');
    console.log(`时间: ${results.checkedAt}`);
    console.log('');

    for (const t of core) {
      const r = results.tools[t];
      const icon = r.status === 'available' ? '✅' : r.status === 'not_installed' ? '❌' : '⚠️';
      console.log(`${icon} ${r.tool}: ${r.status}`);
      console.log(`   路径: ${r.installPath || r.installDir || '(无)'}`);
      console.log(`   详情: ${r.details}`);
      // Depth probe result
      const dp = results.depthProbes[t];
      if (dp && dp.verdict !== 'skipped') {
        const dpIcon = dp.verdict === 'ok' ? '  🔬' : dp.verdict === 'failed' ? '  🔴' : '  🟡';
        console.log(`${dpIcon} depth: ${dp.verdict} — ${dp.details}`);
      }
      console.log('');
    }

    console.log(`mx-data: ${results.mxdata.status}`);
    console.log('');
    console.log(`判定: ${combinedVerdict}`);
    console.log(`可用: [${results.summary.available.join(', ')}]`);
  }

  if (jsonFlag) {
    console.log(JSON.stringify(results, null, 2));
  }

  // ── Write source-probe.json ──────────────────────────────────
  if (effectiveOutDir) {
    fs.mkdirSync(effectiveOutDir, { recursive: true });

    // Merge all probed sources into a unified array
    const allSources = [
      { sourceId: 'ttfund', ...results.tools.ttfund },
      { sourceId: 'ifind', ...results.tools.ifind },
      { sourceId: 'wind', ...results.tools.wind },
      { sourceId: 'mx-data', ...results.mxdata },
      { sourceId: 'websearch', status: 'available', details: 'WebSearch always available in CLI environment' }
    ];

    const probeResults = allSources.map(s => {
      const contract = contracts?.sources?.[s.sourceId] || null;
      const contractModes = contract?.allowedFailureModes || [];
      s._contractAllowedModes = contractModes;
      const cls = classifyStatus(s, contract);
      const dp = results.depthProbes?.[s.sourceId] || { verdict: 'skipped', checks: [] };
      return {
        sourceId: s.sourceId,
        name: contract?.name || s.tool || s.sourceId,
        probeStatus: s.status,
        classification: cls,
        contractStatus: contractStatus(s, cls),
        contractExpected: contract ? true : false,
        details: s.details || '',
        installPath: s.installPath || s.installDir || null,
        probeCheck: s.cliCheck || s.probeCheck || null,
        depthProbe: {
          verdict: dp.verdict || 'skipped',
          classification: dp.classification || null,
          checks: dp.checks || [],
          failures: dp.failures || [],
          details: dp.details || ''
        }
      };
    });

    const totalCallable = probeResults.filter(p => p.classification === 'callable').length;
    const violations = probeResults.filter(p => p.contractStatus === 'violation');
    const degraded = probeResults.filter(p => p.contractStatus === 'degraded');
    const depthFailures = probeResults.filter(p => p.depthProbe?.verdict === 'failed');
    const depthDegradedList = probeResults.filter(p => p.depthProbe?.verdict === 'degraded');

    const probeOutput = {
      meta: {
        checkedAt: results.checkedAt,
        runId: runId || null,
        version: contracts?.version || '0.0.0',
        pipelineVersion: '2.8.0'
      },
      sources: probeResults,
      summary: {
        total: probeResults.length,
        callable: totalCallable,
        toolMissing: probeResults.filter(p => p.classification === 'tool_missing').length,
        authMissing: probeResults.filter(p => p.classification === 'auth_missing').length,
        schemaDrift: probeResults.filter(p => p.classification === 'schema_drift').length,
        noData: probeResults.filter(p => p.classification === 'no_data').length,
        contractViolations: violations.length,
        contractDegraded: degraded.length,
        depthProbe: {
          ok: probeResults.filter(p => p.depthProbe?.verdict === 'ok').length,
          failed: depthFailures.length,
          degraded: depthDegradedList.length,
          skipped: probeResults.filter(p => p.depthProbe?.verdict === 'skipped').length,
          verdict: depthVerdict
        },
        verdict: combinedVerdict
      }
    };

    fs.writeFileSync(path.join(effectiveOutDir, 'source-probe.json'), JSON.stringify(probeOutput, null, 2));
    console.log(`source-probe.json → ${path.join(effectiveOutDir, 'source-probe.json')}`);
  }

  // exit code: fatal=2, depth_failed=3, degraded/ok=0
  if (results.summary.verdict === 'fatal') process.exit(2);
  if (depthVerdict === 'depth_failed') process.exit(3);
  process.exit(0);
}

main();
