# Section 1: Indicator Summary

## Purpose

11 区指标汇总表，每区末尾出子结论。状态色从 `data/indicator-catalog.md` 阈值判定。

## Template

每区一个表格：

```markdown
### {Section} {Name}

| 编号 | 名称 | 值 | vs晨间 | 状态 |
|:--:|------|------|:--:|:--:|
| ... | ... | {value} | {delta} | 🟢/🟡/🔴 |

**子结论**：{one-sentence conclusion}
```

### Section Order

1. A 预警层 (A1-A3)
2. B 债券 (B1-B7, includes all derived spreads)
3. M 中国货币市场 (M1-M5, includes DR007−OMO, R007−DR007)
4. N 美国货币市场 (N1-N5, includes SOFR−IORB)
5. F 美联储政策 (F1-F3)
6. E 股市指数 (E1-E6, **must include 20MA column**)
7. O 原油 (O1-O2)
8. G 黄金 (G1-G11)
9. X 汇率 (X1-X5)
10. S 情绪 (S1-S2)

## Status Color Rules

| Color | Condition |
|:-----:|-----------|
| 🟢 | within normal range (see catalog) |
| 🟡 | warning range |
| 🔴 | alert range |

## Source

- Values: `raw-snapshot.md` + `derived-snapshot.md`
- Status thresholds: `data/indicator-catalog.md`
