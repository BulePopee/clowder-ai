# Section 5: Position Impact

## Purpose

持仓逐一影响分析。持仓数据优先从 `portfolio-snapshot.md` 读取，`user_investment.md` memory 仅作交叉参考。

## Input

- 主源: `{runtimeRoot}/runs/{runId}/portfolio-snapshot.md`（S1 持仓 + S2 收益 + S3 分析 + S4 交易）
- 交叉参考: `user_investment.md` memory（静态配置: 基金分组、再平衡规则、投资习惯）
- 宏观影响推演: `raw-snapshot.md` + `derived-snapshot.md`

## Template

```markdown
## 5. 持仓影响判断

> 持仓数据来自 `portfolio-snapshot.md` (runId={runId})；画像背景参考 `user_investment.md` memory。

### 组合状态

| 指标 | 值 | 来源 |
|------|-----|------|
| 总资产 | {total} 元 | S1 holding_total |
| YTD 收益 | {ytd_profit} 元 | S2 total_profit |
| 在途交易 | {onWayCount} 笔 | S4 trade_query |

### 组合风险映射

| 持仓 | 暴露因子 | 当前 regime 下影响 | 最大风险 | 观察触发器 | 对冲/动作 |
|------|----------|-------------------|----------|------------|-----------|
| {fund} | {利率/美元/黄金/成长股/中国流动性/信用} | {有利/不利/中性} | {risk} | {trigger} | {action or no-action} |

### 持仓逐项影响

| 持仓 | 当前影响 | 证据 | 结论 |
|------|----------|------|------|
| {asset} ({assetValue} 元, {holdProfitRate} 持仓收益率) | {impact assessment} | {snapshot fields} | {observe/discuss/action} |

### 近期交易

| 日期 | 类型 | 基金 | 金额 | 状态 |
|------|------|------|------|------|
| {date} | {type} | {fundName} | {amount} | {status} |

**操作建议**：{overall advice}
```

## Source Priority

1. **当前持仓 + 收益**: `portfolio-snapshot.md` (S1 + S2) — 实时数据，唯一权威源
2. **组合分析**: `portfolio-snapshot.md` (S3) — 历史均值占比/表现/CAPM
3. **近期交易**: `portfolio-snapshot.md` (S4) — 在途订单 + 已清仓确认
4. **画像背景**: `user_investment.md` memory — 仅限基金分组、再平衡规则、投资习惯等静态配置
5. **宏观推演**: `raw-snapshot.md` + `derived-snapshot.md` — 市场 regime 对持仓影响

## Hard Rules

- 持仓资产、收益、仓位、当日净值必须来自 `portfolio-snapshot.md`；缺失则标 gap，不得用 memory 旧值填补
- `user_investment.md` memory 与 `portfolio-snapshot.md` 不一致时 → 以 snapshot 为准，末尾标注 "⚠️ memory 待更新"
- 遵循 `portfolio/spec.md` 全部 6 条硬规则（货币≠现金、onWay 不折算、已清仓确认、memory 非真相源、三栏隔离、收益口径区分）
- 已清仓基金不出现在持仓表中；如 memory 仍记录，在注记中说明 "已清仓 (来源: S4 TRADE_QUERY {date})"

## Note

L5 账户数据 (ACCOUNT_HOLDING/ACCOUNT_PROFIT/PORTFOLIO_ANALYSIS/TRADE_QUERY) 由 `portfolio/` 模块独立采集，与 macro snapshot 同一 runId。报告阶段不调用数据源，只读 snapshot。
