# Module: Source Map
# Role: Indicator → Source Priority Registry

## Purpose

纯稳定配置。定义每项指标的主源、备选源、提取路径、freshness SLA。
不含运行状态（探测结果在 source-health.md）。

## Freshness Fields

| 字段 | 含义 |
|------|------|
| `maxAgeDays` | 数据超过此天数视为 stale |
| `staleAction` | `fallback`=触发备选源 / `staleGap`=计入缺口 / `acceptable`=不触发 fallback（月度/事件驱动数据） |

## Sections

### A 预警 (3 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| A1 | MOVE | websearch | — | — | 5 | staleGap |
| A2 | 信用利差(AAA−国债3Y) | ifind | wind | — | 7 | fallback |
| A3 | 北向成交额 | eastmoney | mx-data | websearch | 1 | fallback |

### B 债券-美国 (6 项 + 2 派生利率拆解)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| B1 | US 30Y | ttfund | ifind | — | 1 | fallback |
| B2 | US 10Y | ttfund | ifind | — | 1 | fallback |
| B3 | US 2Y | ttfund | ifind | — | 1 | fallback |
| B4 | CME FedWatch | websearch | — | — | 3 | staleGap |
| B8 | 10Y TIPS real yield | ifind | — | — | 1 | staleGap |
| B9 | 10Y breakeven inflation | ifind | — | — | 1 | staleGap |

> B8+B9 拆分 B2 名义利率：B2 ≈ B8 + B9。B8 上升=实际利率冲击→黄金/纳指承压；B9 上升=通胀预期升温→黄金支撑。

### B 债券-中国 (3 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| B5 | CN 30Y | ifind | ttfund | — | 1 | fallback |
| B6 | CN 10Y | ttfund | ifind | — | 1 | fallback |
| B7 | CN 2Y | ifind | — | — | 1 | fallback |

### B 债券-信用利差 (1 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| B10 | HY OAS (美银美林美国高收益利差) | ifind | — | — | 1 | fallback |

> B10 与 A2(AAA 33bp) + IG OAS(R3 ~73bp) 形成信用利差梯度：A2 < IG < HY。B10 >500bp = 信用压力，>800bp = 信用危机。

### M 中国货币市场 (5 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| M1 | SHIBOR 3M | ifind | — | — | 1 | fallback |
| M2 | DR007 | ifind | wind | websearch | 1 | fallback |
| M2a | OMO 7D | ifind | — | — | 30 | acceptable |
| M3 | 货基7日年化 | ttfund | websearch | — | 3 | fallback |
| M4 | R007 | wind | ifind | — | 1 | fallback |
| M5 | 货基AUM | websearch | — | — | 45 | acceptable |

### N 美国货币市场 (7 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| N1 | US 3M T-Bill | ifind | — | — | 1 | fallback |
| N2 | SOFR | wind | — | — | 1 | fallback |
| N3 | Crane 100 MMF | websearch | — | — | 7 | staleGap |
| N4 | IORB | ifind | — | — | 30 | acceptable |
| N5 | MMF AUM | websearch | — | — | 14 | staleGap |
| N6 | FRA-OIS利差 | ifind | — | — | 1 | fallback |
| N7 | SOFR-IORB利差 | derived | N2, N4 | — | 1 | fallback |

> N6 与 N7(SOFR−IORB) 互补：N6 测银行间远期融资压力。N7 测隔夜担保融资压力(N2−N4)，派生无需独立采集。N7>0bp=资金压力信号, >25bp=资金紧张。

### F 美联储政策 (3 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| F1 | 联邦基金利率上限 | wind | — | — | 30 | acceptable |
| F2 | 核心PCE YoY | wind | — | — | 90 | acceptable |
| F3 | 下次FOMC | websearch | — | — | 7 | staleGap |

### E 股市指数 (3 项点位 + 3 项 20MA派生)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| E1 | Nasdaq 100 | wind | ifind | websearch | 1 | fallback |
| E2 | 沪深300 | ttfund | ifind | — | 1 | fallback |
| E3 | 创业板指 | ifind | ttfund | websearch | 1 | fallback |
| E4-E6 | 20日涨跌幅(派生) | — | — | — | — | — |

> E1/E2/E3 kline 通过 iFinD 双月 NL query 获取（`指数名 2026年5月 2026年6月 收盘价`），取最近 20 条计算 20MA 和涨跌幅。iFinD 返回降序（最新在前），取 first 20 = 最新 20。

### O 原油 (2 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| O1 | Brent | ifind | websearch | — | 1 | fallback |
| O2 | WTI | ifind | websearch | — | 1 | fallback |

### G 黄金 (11 项 + 3 派生)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| G1 | SGE基准价 | ttfund | — | — | 1 | staleGap |
| G2 | Au99.99 | ttfund | ifind | wind | 1 | fallback |
| G3 | Au(T+D) | ttfund | — | — | 1 | staleGap |
| G4 | COMEX黄金 | ifind | websearch | — | 1 | fallback |
| G5 | 期货主力 | ttfund | — | — | 1 | staleGap |
| G6 | 央行黄金储备 | ttfund | — | — | 45 | acceptable |
| G7 | SPDR持仓 | ifind | — | — | 3 | fallback |
| G8 | CFTC多头/空头 | ifind | — | — | 10 | acceptable |
| G9 | 金油比(派生) | compute | — | — | — | — |
| G10 | 金银比(派生) | compute | — | — | — | — |
| G11 | 国内溢价(派生) | compute | — | — | — | — |

### X 汇率 (4 项 + 1 派生)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| X1 | DXY | ttfund | — | — | 1 | staleGap |
| X2 | PBOC中间价 | wind | ifind | websearch | 1 | fallback |
| X3 | USD/CNY即期 | ttfund | — | — | 1 | staleGap |
| X4 | USD/CNH离岸 | ifind | websearch | — | 1 | fallback |
| X5 | CNH−CNY价差(派生) | compute | — | — | — | — |

### S 情绪 (3 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| S1 | VIX | ttfund | — | — | 1 | staleGap |
| S2 | CNN F&G | websearch | — | — | 3 | staleGap |
| S3 | AAII sentiment | ifind | — | — | 7 | staleGap |

> S3 与 S2 互补：CNN F&G 为综合情绪，AAII 为散户调查。AAII <20=极度悲观(反向看多)，>50=极度乐观(反向看空)。

### R 候选 (2 项)

| 编号 | 名称 | 主源 | 备选1 | 备选2 | maxAgeDays | staleAction |
|:--:|------|------|------|------|:--:|------|
| R3 | IG OAS (投资级信用利差) | websearch | — | — | 7 | staleGap |
| R4 | CBOE put/call ratio | websearch | — | — | 3 | staleGap |

> R1/R2 已升级为正式指标 (B10)。R3: iFinD 无数据，WebSearch 周频可获取 ~73bp。R4: iFinD 无数据，WebSearch 可获取 total P/C 0.92。连续 2 轮稳定 → 纳入正式组。

## Invariants

- 不含探测状态
- 不含公式
- 不写死具体值
- 修改优先级需人工确认
- adapter 的 commandKey/fieldPath 定义在各 `adapters/*.md` 中，source-map 只做优先级映射
- freshness SLA 由 source-map 定义，adapter 不定义 freshness
