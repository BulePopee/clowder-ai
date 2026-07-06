# Module: Indicator Catalog
# Role: Indicator Definitions & Single-Indicator Thresholds

## Purpose

全部直接指标的精确定义和单指标红黄绿阈值。被 report 和 decision-engine 引用。指标数量以 `config/indicators.json` 为准。

## Format

| 编号 | 名称 | 含义 | 基准值 | 🟢 | 🟡 | 🔴 | thresholdIds |

---

## A 预警层

| 编号 | 名称 | 含义 | 基准值 | 🟢 | 🟡 | 🔴 | thresholdIds |
|:--:|------|------|------|------|------|------|------|
| A1 | MOVE | 美债波动率指数 | <110 | <110 | 110-140 | >140 | MOVE_NORMAL, MOVE_WARNING, MOVE_ALERT |
| A2 | 信用利差(AAA−国债3Y) | 信用风险溢价 | <100bp | <100bp | 100-200bp | >200bp | CREDIT_NORMAL, CREDIT_WARNING, CREDIT_ALERT |
| A3 | 北向成交额 | A股外资活跃度 | >1000亿 | >1000亿 | 500-1000亿 | <500亿 | NF_NORMAL, NF_WARNING, NF_ALERT |

## B 债券

| 编号 | 名称 | 含义 | 基准值 | 🟢 | 🟡 | 🔴 | thresholdIds |
|:--:|------|------|------|------|------|------|------|
| B1 | US 30Y | 美国长期利率锚 | 4.0% | <4.6% | 4.6-5.0% | >5.0% | YIELD_ANCHORED, YIELD_WARNING_LOW, YIELD_WARNING_HIGH, YIELD_CRITICAL |
| B2 | US 10Y | 美国中期基准利率 | 3.5% | — | — | — | — |
| B3 | US 2Y | 美联储政策预期 | 3.5% | — | — | — | — |
| B4 | CME FedWatch | 加息/降息概率 | — | 降息>50% | 持平为主 | 加息>50% | FED_DOVISH, FED_NEUTRAL, FED_HAWKISH |
| B5 | CN 30Y | 中国超长端利率 | 2.5% | — | — | — | — |
| B6 | CN 10Y | 中国中期基准利率 | 2.5% | — | — | — | — |
| B7 | CN 2Y | 中国短端利率 | 1.5% | — | — | — | — |
| B8 | 10Y TIPS real yield | 美国实际利率(名义−通胀预期) | 1.5% | <2.0% | 2.0-2.5% | >2.5% | TIPS_LOOSE, TIPS_TIGHT, TIPS_VERY_TIGHT |
| B9 | 10Y breakeven inflation | 市场隐含通胀预期 | 2.0% | 2.0-2.5% | 2.5-3.0% | >3.0% | BE_STABLE, BE_ELEVATED, BE_ALERT |
| B10 | HY OAS | 美国高收益信用利差(BoAML) | 400bp | <400bp | 400-600bp | >600bp | HY_TIGHT, HY_STRESS, HY_CRISIS |

> B8+B9 ≈ B2 (名义利率拆分)。B8 上升 + B9 稳定 = 实际利率冲击 → 黄金/纳指承压。B8 稳定 + B9 上升 = 通胀预期冲击 → 黄金支撑。

## M 中国货币市场

| 编号 | 名称 | 基准值 | thresholdIds |
|:--:|------|------|------|
| M1 | SHIBOR 3M | 1.5% | — |
| M2 | DR007 | 1.5% | — |
| M2a | OMO 7D | 1.4% | — |
| M3 | 货基7日年化 | 1.5% | — |
| M4 | R007 | 1.5% | — |
| M5 | 货基AUM | — | — |

## N 美国货币市场

| 编号 | 名称 | 基准值 | thresholdIds |
|:--:|------|------|------|
| N1 | US 3M T-Bill | 3.5% | — |
| N2 | SOFR | 3.63% | — |
| N3 | Crane 100 MMF | 3.5% | — |
| N4 | IORB | 3.65% | — |
| N5 | MMF AUM | — | — |
| N6 | FRA-OIS利差 | 0bp | FRA_OIS_STRESS=20bp, FRA_OIS_CRISIS=40bp |
| N7 | TED利差 | 30bp | TED_ELEVATED=50bp, TED_STRESS=100bp |

> N6 与 SOFR−IORB 互补：N6 测 3M 远期融资压力。N7 测银行间信用压力(LIBOR−TBill)。

## F 美联储政策

| 编号 | 名称 | 含义 | thresholdIds |
|:--:|------|------|------|
| F1 | 联邦基金利率上限 | 当前政策利率 | — |
| F2 | 核心PCE YoY | 美联储锚定通胀指标 | PCE_TARGET=2.0% |
| F3 | 下次FOMC | 政策利率调整窗口 | — |

## E 股市指数

| 编号 | 名称 | thresholdIds |
|:--:|------|------|
| E1 | Nasdaq 100 | — |
| E2 | 沪深300 | — |
| E3 | 创业板指 | — |
| E4 | Nasdaq 20日涨跌幅 | — |
| E5 | 沪深300 20日涨跌幅 | — |
| E6 | 创业板指 20日涨跌幅 | — |

## O 原油

| 编号 | 名称 | 🟢 | 🟡 | 🔴 | thresholdIds |
|:--:|------|------|------|------|------|
| O1 | Brent | <$80 | $80-90 | >$90 | BRENT_DISINFLATION, BRENT_WARNING, BRENT_ALERT |
| O2 | WTI | <$75 | $75-85 | >$85 | — |

## G 黄金

### 价格层 (G1-G4)

| 编号 | 名称 | 含义 | thresholdIds |
|:--:|------|------|------|
| G1 | SGE基准价 | 上海金交所每日早/晚双定盘价 | — |
| G2 | Au99.99 | 上海金交所Au99.99现货OHLC | — |
| G3 | Au(T+D) | 上海金交所延期合约OHLC | — |
| G4 | COMEX黄金 | COMEX期货收盘+伦敦PM定盘价 | GOLD_SAFE=$4300, GOLD_CRITICAL=$4100 |

### 资金/供需层 (G5-G8)

| 编号 | 名称 | 含义 | thresholdIds |
|:--:|------|------|------|
| G5 | 上期所金主力 | 上期所黄金主力合约OHLC+成交量 | — |
| G6 | 央行黄金储备 | 人行月度黄金储备(万盎司)+近3月趋势 | — |
| G7 | SPDR GLD持仓 | 全球最大黄金ETF持仓量(吨) | — |
| G8 | CFTC净多头 | COMEX管理基金多−空持仓(张), ~3d滞后 | — |

### 衍生信号层 (G9-G11)

| 编号 | 名称 | 含义 | thresholdIds |
|:--:|------|------|------|
| G9 | 金油比 | COMEX÷Brent, >50=极端避险 | GOLD_OIL_EXTREME=50 |
| G10 | 金银比 | COMEX金÷COMEX银, >90=避险极端或白银低估 | GOLD_SILVER_EXTREME=90 |
| G11 | 国内溢价 | −3%~+3% 正常, <−3% 恐慌抛售, >+5% 资本外逃/避险过热, 单日变化 ±2% → 黄金章节警示 | DOMESTIC_PREMIUM_ALERT=5%, DOMESTIC_DISCOUNT_PANIC=−3%, DOMESTIC_DELTA_WARN=±2% |

## X 汇率

| 编号 | 名称 | thresholdIds |
|:--:|------|------|
| X1 | DXY | — |
| X2 | PBOC中间价 | — |
| X3 | USD/CNY | — |
| X4 | USD/CNH | — |
| X5 | CNH−CNY | — |

## S 情绪

| 编号 | 名称 | 🟢 | 🟡 | 🔴 | thresholdIds |
|:--:|------|------|------|------|------|
| S1 | VIX | <20 | 20-30 | >30 | VIX_CALM, VIX_WARNING, VIX_ALERT |
| S2 | CNN F&G | >50 | 30-50 | <30 | FG_GREED, FG_NEUTRAL, FG_FEAR |
| S3 | AAII sentiment | 30-50 | 20-30 / 50-60 | <20 / >60 | AAII_NEUTRAL, AAII_BEARISH, AAII_BULLISH, AAII_EXTREME_BEAR, AAII_EXTREME_BULL |

> S3 与 S2 互补：AAII 为散户调查(周频)，CNN F&G 为综合情绪。AAII <20 = 极度悲观(contrarian bullish)，>60 = 极度乐观(contrarian bearish)。

## R 候选指标

| 编号 | 名称 | 含义 | thresholdIds |
|:--:|------|------|------|
| R3 | IG OAS (投资级信用利差) | 美国投资级公司债OAS, ~73bp (WebSearch周频) | IG_TIGHT=50bp, IG_STRESS=150bp |
| R4 | CBOE put/call ratio | 期权市场情绪, total P/C ~0.92 (WebSearch日快照) | PUT_CALL_FEAR=1.0, PUT_CALL_EXTREME=1.2 |

> R1/R2 已升级为正式指标 (B10/N7)。R3/R4 数据源为 WebSearch (非API)，连续 2 轮稳定且解释力强 → 纳入正式组。

---

## Threshold IDs

| ID | Indicator | Condition |
|----|-----------|-----------|
| YIELD_ANCHORED | B1 | < 4.6% |
| YIELD_WARNING_LOW | B1 | 4.6% |
| YIELD_WARNING_HIGH | B1 | 5.0% |
| YIELD_CRITICAL | B1 | > 5.0% |
| BRENT_DISINFLATION | O1 | < $80 |
| BRENT_WARNING | O1 | $80-$90 |
| BRENT_ALERT | O1 | > $90 |
| GOLD_SAFE | G4 | > $4,300 |
| GOLD_CRITICAL | G4 | < $4,100 |
| HIKE_PROB_WARNING | B4 | > 40% |
| HIKE_CONFIRMED | B4 | > 60% |
| MOVE_NORMAL | A1 | < 110 |
| VIX_CALM | S1 | < 20 |
| FG_FEAR | S2 | < 30 |
| FG_GREED | S2 | > 50 |
| FG_NEUTRAL | S2 | 30-50 |
| GOLD_OIL_EXTREME | G9 | > 50 |
| GOLD_SILVER_EXTREME | G10 | > 90 |
| DOMESTIC_PREMIUM_ALERT | G11 | > 5% |
| DOMESTIC_DISCOUNT_PANIC | G11 | < −3% |
| DOMESTIC_DELTA_WARN | G11 | 单日变化 ≥ ±2% |
| TIPS_LOOSE | B8 | < 2.0% |
| TIPS_TIGHT | B8 | 2.0-2.5% |
| TIPS_VERY_TIGHT | B8 | > 2.5% |
| BE_STABLE | B9 | 2.0-2.5% |
| BE_ELEVATED | B9 | 2.5-3.0% |
| BE_ALERT | B9 | > 3.0% |
| HY_TIGHT | B10 | < 400bp |
| HY_STRESS | B10 | 400-600bp |
| HY_CRISIS | B10 | > 600bp |
| FRA_OIS_STRESS | N6 | > 20bp |
| FRA_OIS_CRISIS | N6 | > 40bp |
| TED_ELEVATED | N7 | > 50bp |
| TED_STRESS | N7 | > 100bp |
| AAII_NEUTRAL | S3 | 30-50 |
| AAII_BEARISH | S3 | 20-30 |
| AAII_BULLISH | S3 | 50-60 |
| AAII_EXTREME_BEAR | S3 | < 20 |
| AAII_EXTREME_BULL | S3 | > 60 |
| IG_TIGHT | R3 | < 50bp |
| IG_STRESS | R3 | > 150bp |
| PUT_CALL_FEAR | R4 | > 1.0 |
| PUT_CALL_EXTREME | R4 | > 1.2 |

## Invariants

- 不含采集方式（见 `collect/source-map.md`）
- 不含计算公式（见 `compute/formulas.md`）
- 不含组合条件逻辑（见 `report/decision-engine.md`）
