# Section 3: Spot Gold Analysis

## Purpose

9 子节黄金专项分析。

## Template

### 3.1 Current Price (table)
```markdown
| 指标 | 值 | 日期 |
|------|------|------|
| G2 Au99.99 | {value} | {date} |
| G3 Au(T+D) | {value} | {date} |
| G4 COMEX | {value} | {date} |
| G5 期货主力 | {value} | {date} |
```

### 3.2 Price Trend (table)
```markdown
| 时段 | COMEX 范围 | 关键事件 |
|------|------|------|
```

### 3.3 Fund/Supply-Demand Signals (table)
```markdown
| 指标 | 当前值 | 变动/趋势 | 信号 |
|------|------|------|:--:|
| G6 央行黄金储备 | {value} | {trend} | 🟢/🟡 |
| G7 SPDR持仓 | {value} | {trend} | 🟢/🟡 |
| G8 CFTC多头/空头 | {value} | {trend} | 🟢/🟡 |
```

### 3.4 Support Factors (table)
```markdown
| # | 因素 | 当前状态 | 强度 |
|:--:|------|------|:--:|
```

### 3.5 Pressure Factors (table)
```markdown
| # | 因素 | 当前状态 | 强度 |
|:--:|------|------|:--:|
```

### 3.6 Derived Signals (table)
```markdown
| 指标 | 当前值 | 评价 |
|------|------|------|
| G9 金油比 | {value} | {assessment} |
| G10 金银比 | {value} | {assessment} |
| G11 国内溢价 | {value} | {assessment} |
```

### 3.7 Position Impact (table)
```markdown
| 项目 | 内容 |
|------|------|
| 当前持仓 | {from user_investment.md memory} |
| 关键判断 | {assessment} |
| 操作建议 | {advice} |
```

### 3.8 Gold Warning (table)
```markdown
| 级别 | 条件 | 状态 |
|:--:|------|:--:|
| 🟢 | {condition} | ✅/❌ |
| 🟡 | {condition} | ✅/❌ |
| 🔴 | {condition} | ✅/❌ |
```

### 3.9 Sell Conditions Check (table)
```markdown
| # | 条件 | 状态 |
|:--:|------|:--:|
| 1 | 30Y>5.0%持续3日 | ✅/❌/⚠️ |
| 2 | COMEX < critical | ✅/❌/⚠️ |
| 3 | FOMC明确加息 | ✅/❌/⚠️ |
| 4 | 铲屎官主动触发 | ✅/❌ |
```

## Source

- Values: `raw-snapshot.md` + `derived-snapshot.md`
- Gold warning conditions: `report/decision-engine.md`
- Sell conditions: `report/decision-engine.md`
- Position data: `user_investment.md` memory
