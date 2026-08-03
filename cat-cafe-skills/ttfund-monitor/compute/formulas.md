# Module: Formula Engine
# Role: Derived Calculation Specifications

## Input

raw-snapshot.md 中的分量值

## Output

derived-snapshot.md 中的计算值

## Formulas

| Derived | Formula | Components | Missing Action |
|---------|---------|------------|----------------|
| US 10Y-2Y | B2 − B3 | raw B2, B3 | 任一 null → 缺口 |
| US 30Y-10Y | B1 − B2 | raw B1, B2 | 同上 |
| US 30Y-2Y | B1 − B3 | raw B1, B3 | 同上 |
| CN-US 10Y | B6 − B2 | raw B6, B2 | 同上 |
| CN 10Y-2Y | B6 − B7 | raw B6, B7 | 同上 |
| CN 30Y-10Y | B5 − B6 | raw B5, B6 | 同上 |
| CN 30Y-2Y | B5 − B7 | raw B5, B7 | 同上 |
| DR007−OMO | M2 − M2a | raw M2, M2a | 同上 |
| R007−DR007 | M4 − M2 | raw M4, M2 | 同上 |
| SOFR−IORB | N2 − N4 | raw N2, N4 | 同上 |
| G9 金油比 | COMEX ÷ Brent | raw G4, O1 | 任一 null → G9/G10/G11 全标缺口 |
| G10 金银比 | COMEX gold ÷ COMEX silver | raw G4, AG | 任一 null → G9/G10/G11 全标缺口 |
| G11 国内溢价 | (G2×31.1035÷X3)÷G4 − 1 | raw G2, X3, G4 | 任一 null → G9/G10/G11 全标缺口 |
| CNH−CNY | X4 − X3 | raw X4, X3 | 任一 null → 缺口 |
| 20MA + 涨跌幅 | SMA(最近20条收盘价), (最新−20日前)÷20日前 | raw E1/E2/E3 kline | <20 条 → 缺口 |

## Fallback Rules

- G4 / COMEX白银 任一不可用 → G9/G10/G11 三项全标缺口
- A2 信用利差分量不可用 → 标缺口，严禁用新闻摘要代替精确 bp
- G8 CFTC 天然滞后 ~3 个交易日，标注数据截止日
- kline 不足 20 条 → 20MA 标缺口
- SOFR−IORB / R007−DR007 任一分量不可用 → 对应利差标缺口

## Unit Conventions

- 利差单位: bp (basis points)，1bp = 0.01%
- 汇率 (X3/X4): 直接标价法，X5 单位 bp
- G11 单位换算: G2 (元/克) × 31.1035 (克/盎司) ÷ X3 (CNY/USD) = USD/oz，再与 G4 COMEX (USD/oz) 比较

## Precision Notes

- G9 油价必须用 raw-snapshot 中的 O1 值 (非重新查询 iFinD)
- G10 金和银必须同一交易日，避免跨日偏差
- kline 双月 NL query 返回 ~31-33 行，取最近 20 条；提取路径 `parse(r).datas[0].data.data` (与单值 `datas[i].data.data` 不同)
