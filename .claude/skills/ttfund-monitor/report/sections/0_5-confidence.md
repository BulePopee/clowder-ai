# Section 0.5: Data Gaps & Confidence

## Purpose

前置宣告本轮数据完整度。必须在第 1 章之前。

## Template

> 应采 = 直接指标数（不含派生）。E 应采 3 (E1/E2/E3)，E4-E6 为派生在 compute 阶段独立追踪。
> G 应采 8 (G1-G8 直接采集)，G9-G11 为派生在 compute 阶段独立追踪。

```markdown
## 0.5 数据缺口与置信度

| 板块 | 应采 | fresh | stale | missing | 关键缺口 | 置信度 | 影响 |
|---|---:|---:|---:|---:|---|---:|---|
| A 预警 | 3 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| B 债券 | 7 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| M 中国货币 | 5 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| N 美国货币 | 5 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| F 美联储 | 3 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| E 股市 | 3 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| O 原油 | 2 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| G 黄金 | 8 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| X 汇率 | 4 | {n} | {n} | {n} | {items} | {pct} | {impact} |
| S 情绪 | 2 | {n} | {n} | {n} | {items} | {pct} | {impact} |

**全局覆盖**：fresh:{n} stale:{n} missing:{n} (attempted:{n}/{total})
**关键指标覆盖**：fresh:{n}/{criticalTotal} stale:{n} missing:{n}
**非关键 acceptable stale**：{items}（如 G6 monthly, F1 event-driven）
**关键缺口计数**：{n} (missing ×1 + stale(非acceptable) ×1)
**派生指标覆盖**：freshDerived:{n} staleDerived:{n} missingDerived:{n}
**全局置信度**：{高/中高/中/低}（派生 staleDerived ≥3 时降一级）
**操作建议等级**：{正常建议/谨慎建议/不给强操作建议}
```

> 关键指标列表以 `config/indicators.json` 的 `criticalIds` 为准: `B1 B2 B3 B6 B8 B9 F1 F2 O1 G2 G4 X1 X3 X4 E1 E2 E3`。
> G6 是 monthly 数据（maxAgeDays=45, staleAction=acceptable），F1 是 event-driven（maxAgeDays=30, staleAction=acceptable）。
> 它们计入 staleSuccess 但不计入关键缺口。

## Confidence Levels

- 高: 关键指标全齐(无缺无stale) + 非关键缺口 ≤2
- 中高: 关键指标全齐(无缺无stale) + 非关键缺口 >2
- 中: 1-2 个关键指标缺口或 stale
- 低: ≥3 个关键指标缺口或 stale

**stale 关键指标按关键缺口计。** 例如 G4 数据日期距今 >7 天 → 计 1 个关键缺口。

## Operation Advice Levels

- 正常建议: 置信度 高/中高 → 可给买卖建议
- 谨慎建议: 置信度 中 → 建议前标注"基于部分数据"
- 不给强操作建议: 置信度 低 → **第 6 章仅观察，不给任何操作建议**

## Critical Indicators

以 `config/indicators.json` 的 `criticalIds` 为准: `B1 B2 B3 B6 B8 B9 F1 F2 O1 G2 G4 X1 X3 X4 E1 E2 E3`

## Source

从 `raw-snapshot.md` 统计每板块缺口数，对照 critical indicators 列表判定。
统计关键缺口时：缺 = 1，stale(>7d) = 1，两者都算。
