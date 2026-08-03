# Provenance — 20260721-1117-auto

## Meta
- runId: 20260721-1117-auto
- startTime: 2026-07-21T03:29:40.505Z
- endTime: 2026-07-21T03:32:11.112Z

## Tool Versions
| 工具 | 调用次数 | 成功 |
|------|:--:|:--:|
| ttfund | 3 | 3 |
| iFinD | 38 | 36 |
| Wind | 2 | 2 |
| mx-data | 0 | — (skipped) |
| WebSearch | 10 | — (pending) |

## Adapter Execution Matrix

| Adapter | 已执行 | status |
|---------|:--:|------|
| ttfund | 3 | ok |
| iFinD | 38 | partial |
| Wind | 2 | ok |
| mx-data | 0 | skipped (A3 via WebSearch) |
| WebSearch | 10 | pending |

## 缺口分类
| 编号 | 原因类别 | 详情 |
|------|------|------|
| A1 | null_value | null value |
| N7 | null_value | null value |
| S1 | staleGap | - |
| AG | staleGap | - |
| N2 | staleGap | - |
| B10 | staleGap | - |
| N6 | staleGap | - |
| R3 | staleGap | - |

## Source Contract (P4-C)
| 状态 | 数量 |
|------|:--:|
| ok (主源匹配) | 48 |
| fallback_ok (备选在白名单) | 0 |
| fallback_violation (越界) | 4 |
| missing (缺失) | 4 |
| no_contract (无契约) | 0 |

### Fallback Violations
| 指标 | 期望源 | 实际源 |
|------|--------|--------|
| E1 | wind | ifind |
| X2 | wind | ifind |
| N2 | wind | ifind |
| M4 | wind | ifind |
