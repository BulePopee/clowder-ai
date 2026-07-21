# Section 7: Data Gaps

## Template

```markdown
## 7. 本轮数据缺口

### 缺口分类（Fix 8: 5栏分类）

| 缺口 | 类别 | 优先级 | 说明 |
|------|------|:--:|------|
| {indicator} | missing / no_date / staleGap / insufficient_history / missingDerived | 高/中/低 | {root cause + next action} |
```

## Gap Categories (5 mandatory types)

| 类别 | 含义 | 判定 |
|------|------|------|
| `missing` | 真缺值，取数失败或无此数据 | raw.json value=null 且非日期问题 |
| `no_date` | 有值但无日期元数据 | date=null 且有 value |
| `staleGap` | 有值有日期但超过 freshness 阈值 | effectiveAge > maxAgeTradingDays 或 maxAgeDays |
| `insufficient_history` | K线记录不足 20 条 | _klineInsufficient=true |
| `missingDerived` | 派生指标因分量缺失无法计算 | components 中有 missing/no_date/staleGap |

## Priority

- 高: 关键指标缺口 (B1/B2/B3/B6/F1/F2/O1/G2/G4/X1/X3/X4/E1/E2/E3)
- 中: 非关键指标缺口，影响部分分析
- 低: 非关键指标缺口，不影响决策

## Reporting Rules

- 每种缺口类别至少列一个代表
- `missing` 与 `no_date` 必须分开说明，不可混称为"缺口"
- `staleGap` 不可与 `missing` 混称
- `insufficient_history` 必须说明当前记录数 vs 需要的 20 条
- `missingDerived` 必须追踪到根因分量
