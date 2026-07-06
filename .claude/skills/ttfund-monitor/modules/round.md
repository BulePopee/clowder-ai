# Module: Round Selector
# Role: Stage 1 Implementation

## Show Options

```
| # | 轮次 | 含义 |
|---|------|------|
| 1 | 常规轮 | 周频例行监测，全部直接指标采集 + 标准9章报告 |
| 2 | 事件轮 | FOMC/非农/CPI/地缘重大事件，全量采集 + 事件冲击分析 + 因果链更新 |

选哪个？（输入数字 1 或 2）
```

## Output

`roundType: "routine" | "event"`

采集范围不变（全部直接指标必采，数量以 `config/indicators.json` 为准）。
