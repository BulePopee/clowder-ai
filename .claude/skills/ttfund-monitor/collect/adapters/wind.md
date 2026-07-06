# Module: Wind Adapter
# Role: L3 Data Source — CLI Interface

## Entry

- Path: `$HOME/.agents/skills/wind-mcp-skill/`
- Skill file: `$HOME/.agents/skills/wind-mcp-skill/SKILL.md`
- CLI file: `$HOME/.agents/skills/wind-mcp-skill/scripts/cli.mjs`
- Command: `cd <path> && node scripts/cli.mjs call analytics_data get_financial_data '{"question":"<query>"}'`

## Availability Check

Probe in this order and record the first failing state:

| Step | Check | Failure status |
|------|-------|----------------|
| 1 | registry has `wind-mcp-skill` entry | `not_installed` only if no other install evidence exists |
| 2 | `$HOME/.agents/skills/wind-mcp-skill/` exists | `path_missing` |
| 3 | `SKILL.md` exists | `path_missing` |
| 4 | `scripts/cli.mjs` exists | `cli_missing` |
| 5 | lightweight CLI call starts and returns structured output/error | `probe_failed` |
| 6 | query executes but value is null | `query_returned_null` |

`path_missing` / `cli_missing` / `probe_failed` / `query_returned_null` are **availability states**, not installation facts. Do not report them as “Wind 未安装” or “技能没安装”.

### Lightweight Probe

```bash
cd "$HOME/.agents/skills/wind-mcp-skill"
node scripts/cli.mjs call analytics_data get_financial_data '{"question":"联邦基金目标利率 最新值"}'
```

Probe interpretation:
- CLI starts + structured response with value → available
- CLI starts + structured response but value null → `query_returned_null` for that query; continue retry/fallback policy
- process exits non-zero / auth error / malformed response → `probe_failed` with stderr summary
- path or file missing → `path_missing` / `cli_missing`; do not call it `not_installed`

## Available server_type

| type | use |
|------|-----|
| `stock_data` | A股行情/财务 |
| `global_stock_data` | 港股/美股 |
| `fund_data` | 基金/ETF |
| `index_data` | 指数/板块 |
| `bond_data` | 债券估值 |
| `economic_data` | 宏观EDB |
| `analytics_data` | **主力调用 — 通用结构化取数** |

## Covered Queries (6 items, all via `analytics_data`)

| Query | Note |
|-------|------|
| `联邦基金目标利率 最新值` | F1 — iFinD 数据为空 |
| `核心PCE物价指数 同比 最新` | F2 — iFinD 数据为空 |
| `SOFR利率 最新` | N2 — iFinD 数据为空 |
| `美元兑人民币中间价 最新` | X2 — ttfund 只返回即期 |
| `纳斯达克100指数 最新价格` | E1 — ttfund 不支持 NDX |
| `银行间7天质押式回购加权利率 最新` | M4 — iFinD 间歇性空 |

## Known Issues

- A3 北向资金受 2024年7月 政策限制不可用 (非数据源问题)
- `analytics_data` 字段结构正确但部分查询可能返回 null
- Nasdaq 100 返回值单位需注意 (万 → ×10000)
- `economic_data` / `bond_data` 可作为 analytics_data 返回 null 时的重试备选 server_type

## Field Reference

`$HOME/.agents/skills/wind-mcp-skill/references/tool-contracts.md`

## Design Note

本 adapter 只描述调用方式和已知限制。指标映射见 `source-map.md`。
