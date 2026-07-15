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
      console.log('');
    }

    console.log(`mx-data: ${results.mxdata.status}`);
    console.log('');
    console.log(`判定: ${results.summary.verdict}`);
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
      return {
        sourceId: s.sourceId,
        name: contract?.name || s.tool || s.sourceId,
        probeStatus: s.status,
        classification: cls,
        contractStatus: contractStatus(s, cls),
        contractExpected: contract ? true : false,
        details: s.details || '',
        installPath: s.installPath || s.installDir || null,
        probeCheck: s.cliCheck || s.probeCheck || null
      };
    });

    const totalCallable = probeResults.filter(p => p.classification === 'callable').length;
    const violations = probeResults.filter(p => p.contractStatus === 'violation');
    const degraded = probeResults.filter(p => p.contractStatus === 'degraded');

    const probeOutput = {
      meta: {
        checkedAt: results.checkedAt,
        runId: runId || null,
        version: contracts?.version || '0.0.0',
        pipelineVersion: '2.7.0'
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
        verdict: violations.length > 0 ? 'contract_violation' : results.summary.verdict === 'fatal' ? 'fatal' : degraded.length > 0 ? 'degraded' : 'ok'
      }
    };

    fs.writeFileSync(path.join(effectiveOutDir, 'source-probe.json'), JSON.stringify(probeOutput, null, 2));
    console.log(`source-probe.json → ${path.join(effectiveOutDir, 'source-probe.json')}`);
  }

  // exit code: fatal=2, degraded/ok=0 (degraded 不卡管道，由 SKILL 按 runMode 决策)
  if (results.summary.verdict === 'fatal') process.exit(2);
  process.exit(0);
}

main();
