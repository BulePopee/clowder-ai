# Module: ttfund Adapter
# Role: L1 Data Source — CLI Interface (v1.1.0)

## Entry

- Path: `~/AppData/Local/TTFund/ttskill-base/ttskill-base-win32-x64-0.1.1/bin/ttskill.js`
- Command: `node <path> invoke <skill_id> --action query --env prod --body '<json>'`
- Skills installed under `TTFUND_` prefix (v1.1.0 convention)

## Available Commands & Response Fields

### TTFUND_GOLD_INFO (`--action query --body '{}'`)

Response path: `data.raw_result.body.data`

**macro_fiscal** (treasury yields + macro data):
- `macro_fiscal.treasury_yields.us_30y` → B1 (number, e.g. 4.93)
- `macro_fiscal.treasury_yields.us_10y` → B2 (number)
- `macro_fiscal.treasury_yields.us_2y` → B3 (number)
- `macro_fiscal.treasury_yields.cn_10y` → B6 (number)
- `macro_fiscal.cpi_yoy.value` → CPI (number)
- `macro_fiscal.dow.close` → DOW
- `macro_fiscal.sp500.close` → S&P 500
- `macro_fiscal.nasdaq.close` → NASDAQ Composite
- `macro_fiscal.cftc_holding.usd_net` → CFTC USD Net Long

**gold_quotes**:
- `gold_quotes.sge_benchmark.morning_price / evening_price` → G1
- `gold_quotes.au9999` → G2 (open/high/low/close/change_pct)
- `gold_quotes.au_td.close` → G3
- `gold_quotes.gold_futures_shfe.close / volume` → G5
- `gold_quotes.central_bank_gold.gold_reserves` → G6 (万盎司)

**risk_indicators**:
- `risk_indicators.dxy.INDICATOR_VAL` → X1 DXY
- `risk_indicators.vix.INDICATOR_VAL` → S1 VIX
- `risk_indicators.exchprice.EXCHPRICE` → X3 USD/CNY

Note: `--summary` strips data — collect without it.

### TTFUND_INDEX_INFO (`--action query --body '{"index_id":"000300"}'`)

Response path: `data.raw_result.body.data`

- `quote.current_point` → E2 (e.g. 4941.6)
- `quote.change_pct` → 涨跌幅
- `quote.ytd_return` → 年内收益
- `performance.return_1d/1w/1m/3m/6m/1y`

Known: `index_id:"399006"` (创业板指) does NOT return `quote.current_point` — requires iFinD kline or WebSearch fallback.

### TTFUND_HUOQIBAO_LIST (`--action query --body '{}'`)

Response path: `data.raw_result.body.data`

- `total_count` → 基金数量
- `items[].yield_7d_annualized` → 7日年化收益率
- `items[].fund_code`, `items[].fund_name`
- `yield_date` → 数据日期

### 账户层 (L5，按需触发)

```bash
ttskill invoke ACCOUNT_HOLDING --action holding_total --env prod --body '{}'
ttskill invoke ACCOUNT_HOLDING --action holding_list --env prod --body '{}'
ttskill invoke ACCOUNT_PROFIT --action profit_summary --env prod --body '{}'
ttskill invoke TRADE_QUERY --action trade_query --env prod --body '{}'
```

## Availability Check

```bash
node <path>/ttskill.js status --env prod --json      # login status + installed skills
```

## Known Issues

- `TTFUND_GOLD_INFO.au9999` 偶发 null → WebSearch fallback
- `TTFUND_INDEX_INFO` 399006 无 current_point → iFinD kline / WebSearch
- 偶发超时 → 重试 1 次 (间隔 3s)
- PowerShell: 用文件传参 (避免引号解析)；bash/Git Bash: 直接内联 JSON
- `--summary` flag 会截断数据 → 采集时不带
- v1.1.0 响应结构变更：`treasury_yields` + `macro_data` → 统一为 `macro_fiscal`
- skill ID 使用 `TTFUND_` 前缀 (非旧 `GOLD_INFO`/`INDEX_INFO` 短名)

## v1.1.0 Migration Notes

旧版 (wrapper) 调用方式 `node skills/ttfund-0.1.1/call-node.js invoke GOLD_INFO --action gold_info` 已废弃。
新版直接调用 ttskill CLI，所有 skill 使用 `--action query` 作为统一 action。
响应路径统一为 `data.raw_result.body.data.*`（通过 ttskill 网关标准化）。

## Design Note

本 adapter 只描述工具调用方式和响应结构。哪些字段映射到哪些指标 → 见 `source-map.md`。
