# 衍生指标 · 2026-07-24 01:46

## 元信息
- 计算时间：2026-07-24T01:46:55.664Z
- 数据基础：raw-snapshot.md (56 indicators)
- 公式来源：compute/formulas.md (v2.5.2)

## 美债利差

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D1 | US 10Y-2Y | B2 - B3 | 0.4 | bp | freshDerived |
| D2 | US 30Y-10Y | B1 - B2 | 0.5 | bp | freshDerived |
| D3 | US 30Y-2Y | B1 - B3 | 0.9 | bp | freshDerived |

## 中国债利差

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D4 | CN 10Y-2Y | B6 - B7 | 0.5 | bp | freshDerived |
| D5 | CN 30Y-10Y | B5 - B6 | 0.5 | bp | freshDerived |
| D6 | CN 30Y-2Y | B5 - B7 | 1.0 | bp | freshDerived |

## 中美利差

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D7 | CN-US 10Y | B6 - B2 | -2.9 | bp | freshDerived |

## 中国货币市场利差

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D8 | DR007-OMO | M2 - M2a | 0.03 | bp | freshDerived |
| D9 | R007-DR007 | M4 - M2 | 0.00 | bp | freshDerived |

## 美国货币市场利差

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D10 | SOFR-IORB | N2 - N4 | -6.00 | bp | staleDerived |
| N7 | SOFR-IORB利差 | N2 - N4 | -6.00 | bp | staleDerived |

## 黄金衍生

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D11 | Gold/Oil Ratio | G4 / O1 | 44.99 | ratio | freshDerived |
| D12 | Gold/Silver Ratio | G4 / AG | 72.96 | ratio | staleDerived |
| D13 | G11 CN Premium | (G2*31.1035/X3)/G4-1 | -0.44 | % | freshDerived |

## 汇率衍生

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D14 | CNH-CNY | X4 - X3 | -0.0220 | CNY/USD | freshDerived |

## K线衍生

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D15 | Nasdaq 100 20MA | SMA(kl, 20) | 29610.57 |  | missingDerived |
| D16 | Nasdaq 100 PctChg | (latest - 20d_ago) / 20d_ago | 0.55 | % | missingDerived |
| D17 | 沪深300 20MA | SMA(kl, 20) | 4879.24 |  | missingDerived |
| D18 | 沪深300 PctChg | (latest - 20d_ago) / 20d_ago | -1.64 | % | missingDerived |
| D19 | 创业板 20MA | SMA(kl, 20) | 4100.06 |  | missingDerived |
| D20 | 创业板 PctChg | (latest - 20d_ago) / 20d_ago | -2.56 | % | missingDerived |

## 补充计算

| 编号 | 名称 | 公式 | 值 | 单位 | 状态 |
|:--:|------|------|------|------|------|
| D21 | Credit Spread AAA-Govt 3Y | A2a - A2g | 0.3 | bp | freshDerived |
| D22 | TIPS+BE vs Nominal | B8+B9 vs B2 | 4.60 | % | freshDerived |
| D23 | Gold Futures-Spot Basis | G5 - G1_pm | 🔴 缺失 | 元/克 | missingDerived |
| D24 | MMF CN-US Spread | N3 - M3 | 1.9 | bp | freshDerived |

## 汇总

| 类别 | 数量 |
|------|------|
| freshDerived | 15 |
| staleDerived | 3 |
| missingDerived | 7 |

> 总公式数: 25 | freshDerived: 15 | staleDerived: 3 | missingDerived: 7
