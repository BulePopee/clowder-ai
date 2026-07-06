# Module: WebSearch Adapter
# Role: L4 Last-Resort Data Source

## Principle

WebSearch 只做兜底。优先使用 ttfund/iFinD/Wind/EastMoney。
WebSearch 仅在以上全部失败时使用，不主动探测。

## Query Templates (5 items)

当前 WebSearch 项以 `config/sources.json` 的 `websearch.items` 为准。

| Item | Query | Extraction |
|------|-------|------------|
| A1 MOVE | `ICE BofA MOVE index June 2026 latest value` | 人工提取 |
| B4 CME FedWatch | `CME FedWatch July 2026 rate hike probability` | 人工提取 |
| F3 下次FOMC | `FOMC meeting schedule 2026 next meeting date` | 人工提取日期 |
| N3 Crane 100 MMF | `Crane 100 money fund yield index June 2026` | 人工提取 |
| A3 北向成交额 | `北向资金 今日成交额 2026年6月` | 人工提取 |


## Extraction Rules

- 数值精度低于专业数据源，使用后必须标注 "via WebSearch 兜底"
- 交叉核对 ≥2 来源，不一致时标注差异
- 搜索结果无数据 → 换关键词重试 1 次（如换 source: news ↔ web）

### Backup Queries (兜底，仅在专业工具全失败时使用)

| Item | Query |
|------|-------|
| X1 DXY | `DXY dollar index today` |
| X2 中间价 | `PBOC USDCNY central parity rate today` |
| O1 Brent | `Brent crude oil price today` |
| O2 WTI | `WTI crude oil price today` |
| E1 Nasdaq | `Nasdaq 100 index today` |
| F1 联邦基金利率 | `Fed funds target rate upper bound 2026` |
| F2 核心PCE | `core PCE price index YoY latest 2026` |
| N2 SOFR | `SOFR rate today 2026` |
| M2 DR007 | `DR007 rate China June 2026` |
| M3 货基 | `中国货币基金 7日年化收益率 均值 2026` |
| G4 COMEX | `COMEX gold futures price today` |
| G7 SPDR | `SPDR Gold Trust tonnage today` |
| S1 VIX | `VIX index today` |

## Known Issues

- A1 MOVE 数据天然滞后 ~8 天 (ICE 发布周期)
- iFinD 不覆盖 FedWatch → B4 只有 WebSearch 可用
- 兜底查询精度低于专业数据源，结果必须标注 "via WebSearch 兜底"
