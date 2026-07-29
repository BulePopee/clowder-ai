# Provenance — 20260729-0948-auto

## Meta
- runId: 20260729-0948-auto
- startTime: 2026-07-29T02:03:35.135Z
- endTime: 2026-07-29T02:06:33.382Z

## Tool Versions
| 工具 | 调用次数 | 成功 |
|------|:--:|:--:|
| ttfund | 3 | 3 |
| iFinD | 37 | 36 |
| Wind | 2 | 2 |
| mx-data | 0 | — (skipped) |
| WebSearch | 7 fillable + 2 blocked | — (pending) |

## Adapter Execution Matrix

| Adapter | 已执行 | status |
|---------|:--:|------|
| ttfund | 3 | ok |
| iFinD | 37 | partial |
| Wind | 2 | ok |
| mx-data | 0 | skipped (A3 via WebSearch) |
| WebSearch | 7 fillable | pending |
| WebSearch (blocked) | 2 | blocked_by_contract (F1, F2) |

## 缺口分类
| 编号 | 原因类别 | 详情 |
|------|------|------|
| A1 | null_value | null value |
| B1 | no_date | - |
| B2 | no_date | - |
| B3 | no_date | - |
| B6 | no_date | - |
| S1 | staleGap | - |
| G1_am | no_date | - |
| G1_pm | no_date | - |
| G5 | no_date | - |
| CPI | no_date | - |
| AG | staleGap | - |
| N2 | staleGap | - |
| B10 | staleGap | - |
| N6 | staleGap | - |
| R3 | staleGap | - |

## Source Contract (P4-C)
| 状态 | 数量 |
|------|:--:|
| ok (主源匹配) | 50 |
| fallback_ok (备选在白名单) | 4 |
| fallback_violation (越界) | 0 |
| missing (缺失) | 2 |
| no_contract (无契约) | 0 |
