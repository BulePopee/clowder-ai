# Module: Portfolio Spec
# Role: Account/Portfolio Data Contract & Field Boundary

## Purpose

定义 L5 账户层四数据源的字段边界、调用契约、硬规则。macro 指标 (GOLD_INFO/INDEX_INFO) 不在本模块范围内——见 `collect/source-map.md`。

## Architecture

```
portfolio/
├── spec.md             ← 本文件：字段边界 + 硬规则
├── snapshot-schema.md  ← 输出格式定义
└── (future) collect.cjs  ← portfolio 采集器子命令
```

Pipeline integration: 第 5 章报告消费 `portfolio/` 模块产出的 `portfolio-snapshot.md`，替代当前从 `user_investment.md` memory 读取的临时方案。

## Data Sources

### S1: ACCOUNT_HOLDING

CLI: `ttskill invoke ACCOUNT_HOLDING --action <action> --env prod --body '{}'`
Response root: `data.raw_result.body`

| Action | 说明 | 关键字段 |
|--------|------|---------|
| `holding_total` | 交易账户总资产汇总 | `holding_total_result.total` (元), `holding_total_result.hqb` (活期宝), `holding_total_result.fund` (基金), `holding_total_result.tg` (投顾), `holding_total_result.gdlc` (高端理财), `holding_total_result.pension` (养老), `holding_total_result.gold` (黄金) |
| `holding_list` | 持仓资产明细列表 | `holding_list_result[].fundName`, `fundCode`, `assetValue` (元), `dailyProfit`, `toOrYesDayProfit` (false=昨日, true=今日), `holdProfit` (持仓收益金额), `holdProfitRate` (持仓收益率), `constantProfit` (持有收益金额), `constantProfitRate` (持有收益率), `pType` (hqb/fund/gdlc/tg) |
| `holding_hqb` | 活期宝货币基金明细 | `holding_hqb_result.holds[].fundCode`, `fundName`, `assetValue` (份额), `availableVol` (可取), `currentRealBalance` (可用), `unpaidProfit` (未付收益), `annual7D` (%), `unitAccrual` (万份收益) |
| `holding_gold` | 银行黄金持仓 | `holding_gold_result.amount` (元), `weight` (克), `holdCost`, `holdProfit`, `holdProfitRate` (持有), `positionCost`, `positionProfit`, `positionProfitRate` (持仓), `todayProfit`, `totalProfit`, `totalProfitRate` (累计), `currentGoldPrice` |
| `holding_pension` | 养老资产持仓 | `holding_pension_result.totalAssetValue`, `totalDailyProfit`, `details[].bankCode`, `fundCode`, `fundName`, `assetValue` |

**Field contract**:
- `pType` 分类: `hqb`=活期宝, `fund`=基金, `gdlc`=高端理财, `tg`=投顾
- `toOrYesDayProfit`: false 时 `dailyProfit` 为昨日收益，不是今日
- `holdProfit` ≠ `constantProfit` ≠ 累计收益——三个独立口径，不得混淆
- `holdProfitRate` ≠ `constantProfitRate`——分别对应持仓/持有收益率
- 活期宝汇总行 `fundCode=hqb`，与 `holding_hqb_result.holds[]` 中各货币基金明细不同
- 可取 (`availableVol`) ≠ 可用 (`currentRealBalance`)——取现看可取，扣款看可用
- `holding_gold_result.holdProfit` 和 `holding_gold_result.positionProfit` 成本计算方式不同（平均持仓成本 vs 摊薄成本）
- **硬规则: `holding_list_result` 只返回当前有效持仓。已清仓基金不出现在此列表中**

### S2: ACCOUNT_PROFIT

CLI: `ttskill invoke ACCOUNT_PROFIT --action <action> --env prod --body '{}'`
Response root: `data.raw_result.body`

| Action | 说明 | 关键字段 |
|--------|------|---------|
| `total_profit` | 账户总收益汇总 | `total_profit` (累计总收益), `total_profit_rate` (%), `hold_profit` (持有收益), `hold_profit_rate` (%), `hqb_profit` (活期宝累计), `fund_profit` (基金累计), `today_profit` (今日收益), `ytd_profit` (YTD收益), `position_profit` (持仓收益), `position_profit_rate` (%) |
| `fund_profit` | 逐只基金收益明细 | `fund_profit_result[].fundCode`, `fundName`, `positionProfit` (持仓收益), `positionProfitRate` (%), `constantProfit` (持有收益), `constantProfitRate` (%), `totalProfit` (累计收益), `totalProfitRate` (%), `todayProfit` |

**Field contract**:
- `total_profit` (累计) ≠ `hold_profit` (持有) ≠ `position_profit` (持仓)——同 S1 的三种口径
- `ytd_profit` = 今年以来总收益
- `fund_profit_result` 按基金维度展开，独立于 `holding_list_result` 的时间窗口
- `today_profit` 是账户级今日收益汇总

### S3: PORTFOLIO_ANALYSIS

CLI: `ttskill invoke PORTFOLIO_ANALYSIS --action <action> --env prod --body '{}'`
Response root: `data.raw_result.body.data`

| Action | 说明 | 关键字段 |
|--------|------|---------|
| `asset_type_pct` | 大类资产占比（历史均值） | `asset_type_data[].index` (资产类型), `asset_type_data[]["平均占比(%)"]` |
| `fund_type_pct` | 基金类型占比（历史均值） | `fund_type_data[].index` (基金类型), `fund_type_data[]["平均占比(%)"]` |
| `hold_perform` | 组合历史表现（日内） | `hold_data[].pdate`, `ret` (日收益%), `nav` (组合净值), `benchmark_nav`, `最大回撤%`, `胜率%`, `最大连续上涨日`, `最大连续下跌日`, `最大回撤区` |
| `bull_bear` | 牛熊市阶段表现 | `bull_bear_data[].start_dt`, `end_dt`, `situation_name`, `持仓收益%`, `基准收益%`, `超额收益%`, `最大回撤%` |
| `capm` | CAPM 归因分析 | `capm_data.alpha` (年化超额), `beta`, `r_squared`, `p_value`, `n_obs`, `annualized_alpha` |
| `irr` | 内部收益率 | **当前账户无 IRR 数据**（返回错误），可用时字段待探测 |

**Field contract**:
- `asset_type_pct` / `fund_type_pct` 返回历史均值占比（成立以来平均），不是当前时点
- `hold_perform` 是日内数据，按 `pdate` 排序，日期范围取决于组合成立时间
- `bull_bear` 按牛熊阶段切分，`situation_name` 描述市场状态
- `capm` 的 Beta 以基准为标的，Alpha 年化
- **硬规则: 所有占比数据来自 PORTFOLIO_ANALYSIS 的历史均值管道，不可与 S1 `holding_list_result` 当前资产金额直接对比**

### S4: TRADE_QUERY

CLI: `ttskill invoke TRADE_QUERY --action trade_query --env prod --body '{}'`
Response root: `data.raw_result.body`

| Action | 说明 | 关键字段 |
|--------|------|---------|
| `trade_query` | 近期交易记录查询 | `trade_list[].date`, `type` (买入/卖出/定投/撤单/调仓), `fundName`, `fundCode`, `amount` (元), `status` (success/failed/cancelled/onWay), `tradeType` (银行卡/活期宝/组合), `comboName` (组合名，仅组合交易时存在) |

**Field contract**:
- `status=onWay` 表示交易在途，尚未确认
- `status=cancelled` 表示已撤单
- 组合交易 (`tradeType=组合`) 的 `amount` 是组合总金额，不含具体基金拆分
- 仅最近约 3 个月交易（TTFund 平台限制），远期交易需人工查
- **清仓确认见 R3 硬规则**：单基金卖出与组合调仓确认流程不同，不可混用

## Hard Rules

### R1: 货币基金 ≠ 现金
活期宝 (`pType=hqb`) 和货币基金 (`pType=fund` + fund_type=货币) 是流动性资产，不是现金。报告中不得将货币基金归入"现金"类。现金仅指银行卡余额（ttfund 不可查，需人工确认）。

### R2: onWay 不折算
`TRADE_QUERY` 中 `status=onWay` 的交易不计入当前持仓。`holding_list_result` 中的 `assetValue` 已经是确认后的份额，不包含在途订单。报告中的"调仓进度"是交易动作的记录，不是资产明细。

### R3: 已清仓确认协议

**单基金卖出**: 同时满足两条才可声称"已清仓":
1. `holding_list_result` 中无此 `fundCode`
2. `TRADE_QUERY` 中存在该基金的单基金卖出记录且 `status=success`

仅满足条件 1 不足——可能是 holding 接口未刷新。

**组合调仓卖出**: `TRADE_QUERY` 中 `tradeType=组合` 只有组合级记录（`comboName`），不拆分到单只基金。确认流程分两级:
1. `holding_list_result` 中无此 `fundCode` + `TRADE_QUERY` 中有对应组合调仓记录 → 标 `holding_absent + combo_trade_observed`（不宣称逐只清仓确认）
2. 若组合调仓有明细拆分（如 portfolio analysis 的调仓明细或用户提供的拆分表）→ 可逐只确认

不得仅凭组合调仓的 `status=success` 推断组合内每只基金均已清仓完成。

### R4: memory 不是实时真相源
`user_investment.md` memory 是人肉更新快照，不是实时数据。第 5 章报告必须从 `portfolio-snapshot.md`（由 `portfolio/` 模块产出）读取当前持仓，memory 仅做交叉参考。若 memory 与 snapshot 不一致 → 以 snapshot 为准，标注 memory 更新建议。

### R5: 三栏隔离
实盘持仓、模拟交易账户、回测组合三者严格隔离:
- 实盘: S1-S4 全部四个源（ttfund ACCOUNT_* 系列）
- 模拟: MP10447790 ("70联接组合")，ttfund 模拟交易账户接口
- 回测: "持仓优化0428"，仅统计数据，不可写入"持仓收益"或"当前市值"
报告/讨论中混淆任一栏 → 标注错误并修正。

### R6: 持有收益率 vs 持仓收益率
持有收益率 (`constantProfitRate`) 和持仓收益率 (`holdProfitRate`) 是不同口径:
- 持仓收益率 = 以当前持仓成本为基础
- 持有收益率 = 以历史买入成本为基础（含已卖出部分的收益留存）
两者数值可能不同，报告中必须标注使用的是哪个口径，不可混用。

## Data Contract Summary

```
portfolio-collect ──► portfolio-snapshot.json ──► portfolio-snapshot.md
                     {S1+S2+S3+S4 原始值}        {格式化，供报告第 5 章消费}

portfolio-snapshot.md 的消费者：
- report/sections/5-holdings.md — 持仓逐一影响分析
- report/decision-engine.md — 组合切换建议（仅读取规则配置，不从 snapshot 读阈值）
```

## Dependencies

- ttfund CLI (ttskill.js) — 全部四个源
- 无外部数据源依赖（不同于 macro 采集需要 iFinD/Wind/WebSearch）
- 采集频率：跟随监测管道（与 macro snapshot 同一 runId），非独立排程
