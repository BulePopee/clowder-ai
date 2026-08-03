# ttfund-monitor 依赖声明

本 SKILL 编排以下外部 SKILL/工具。执行前逐项检查，缺失时按 runMode 分级处理，不自动打包。

## 运行时依赖

| SKILL / 工具 | 用途 | 检查方式 | 不可用时提示 |
|-------------|------|---------|-----------|
| ttfund CLI | L1 宏观扫描（GOLD_INFO/INDEX_INFO）+ L5 账户分析（HOLDING/PROFIT/TRADE/PORTFOLIO） | 检查 `config/tools.template.json` 模板 + `config/tools.json`（本机，gitignored）+ status probe | 记录具体状态；仅确认无安装证据时提示安装 CLI |
| ifind-finance-data | L2 iFinD EDB 精确补全（COMEX/SPDR/CFTC/Brent/信用利差/kline） | 检查 `config/tools.template.json` 模板 + `config/tools.json`（本机，gitignored）+ 轻量 probe | 记录具体状态；仅确认无安装证据时提示安装 ifind-finance-data |
| wind-mcp-skill | L3 Wind 专项（F1/F2 Fed 政策 + N2 SOFR + X2 中间价 + E1 Nasdaq + M4 R007） | 检查注册表声明 + `$HOME/.agents/skills/wind-mcp-skill/` + `SKILL.md` + `scripts/cli.mjs` + 轻量 probe | 记录具体状态；路径/CLI/probe 失败不得写”未安装” |
| mx-data | L4 北向成交额 A3 补充 | 检查 `config/tools.template.json` 模板 + `config/tools.json`（本机，gitignored） | 非核心工具；不可用则 A3 备用标缺口 |
| WebSearch | L4 兜底：A1 MOVE / B4 FedWatch / F3 FOMC / N3 Crane 100 / A3 北向成交额 | 内置能力，无需安装 | — |

## 数据文件依赖

执行前必须能读到以下 memory 文件（自动加载，无需额外安装）：

| 文件 | 用途 |
|------|------|
| `user_investment.md` | 当前持仓明细 |
| `feedback_financial_rigor.md` | 投资逻辑自洽规则 |
| `feedback_no_backtest_as_real.md` | 回测≠真实规则 |

## 检查流程

所有工具的**确切位置**记录在 `config/tools.template.json`（模板）/ `config/tools.json`（本机，gitignored）；**调用语法、能力边界**记录在 `config/indicators.json` + `config/sources.json`。执行前查阅。

```
1. ttfund CLI → 检查 binary、`--version`、`status --env prod --json` → 记录 availabilityStatus
2. ifind-finance-data SKILL → 检查安装路径、入口文件、轻量 probe → 记录 availabilityStatus
3. wind-mcp-skill → 检查注册表声明、安装路径、`SKILL.md`、`scripts/cli.mjs`、轻量 probe → 记录 availabilityStatus
4. mx-data SKILL → 检查安装路径和 Python 入口 → 不可用时记录 warning
5. user_investment.md → 无则标缺口，继续执行（仅影响第5章持仓分析）
```

## 可用性状态分类

| 状态 | 含义 | 是否可写“未安装” |
|------|------|:--:|
| `registered` | 注册表声明存在，但尚未完成 probe | 否 |
| `path_missing` | 注册表路径在当前 shell 下不可见 | 否 |
| `cli_missing` | 路径存在但入口脚本/二进制缺失 | 否 |
| `probe_failed` | 入口存在但轻量 probe 执行失败 | 否 |
| `query_returned_null` | probe 可执行但查询无值/返回 null | 否 |
| `unavailable` | 当前 runtime 不可用，原因已记录 | 否 |
| `not_installed` | 注册表无记录，且路径、SKILL 文件、CLI/probe 均无证据 | 是 |

**禁止把 `path_missing` / `cli_missing` / `probe_failed` / `query_returned_null` 写成“技能没安装”。**
这些状态必须原样进入 `provenance.md`、`source-health.md` 和报告第 7 章。

## runMode 分级

核心数据工具：`ttfund / iFinD / Wind`。

- `validation`：核心数据工具任一 `unavailable` 或 `not_installed` → fatal，终止。
- `report`：仅当 `ttfund + iFinD + Wind` 全部 `unavailable/not_installed` 时 fatal；单个或部分核心工具不可用 → degraded 继续，按 `collect/source-map.md` 触发备选源/缺口。
- `mx-data`：非核心工具；不可用不阻断，只影响 A3 备用。
- `user_investment.md`：数据文件；缺失不阻断，只影响第 5 章。
