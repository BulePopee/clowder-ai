# Module: Source Labeling

## Format

报告中所有精确值必须标注来源：

```
{adapter} {commandKey}
```

Examples:
- `ttfund GOLD_INFO`
- `iFinD ED_COMEX`
- `Wind analytics_data`
- `WebSearch: CNN Fear & Greed Index`
- `EastMoney API`

## Derived Values

```
计算: {formula} (分量 from {sources})
```

Example:
- `计算: B6−B2 (CN 10Y ttfund GOLD_INFO, US 10Y ttfund GOLD_INFO)`

## Fallback Values

值后加注释:
```
{VALUE} (via {adapter} fallback, 主源 {reason})
```
