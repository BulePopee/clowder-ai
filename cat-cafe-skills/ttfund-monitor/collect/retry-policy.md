# Module: Retry Policy
# Role: null/empty/error Recovery Protocol

## Protocol Flow

> **当前状态**：自动 fallback 未实现（`fallback_not_implemented`）。stale/失败直接进入 gap，由猫手动判断是否补采。下方为手动执行指引。

```
采集 → null/empty?
  YES → 重试原 adapter（不同参数/不同问法，最多 2 次）
    success → 用重试值
    still null → 🔴 标缺口（当前不自动走备选源），附重试日志
  NO → 正常记录
```

## Per-Adapter Retry Actions

| Adapter | First Fail | Retry Action |
|---------|-----------|--------------|
| ttfund | `au9999` null | 重跑 GOLD_INFO 1 次（间隔 3s） |
| ttfund | INDEX_INFO 无数据 | 换 `index_id` 参数重试 |
| iFinD | `index_id` 返回空 | 换 NL query 重试 |
| iFinD | NL 返回空 | 换 `index_id` 精确查询重试 |
| iFinD | 429 | 等 5s 再试 |
| Wind | `analytics_data` null | 换 `economic_data` / `bond_data` 不同 server_type |
| WebSearch | 无结果 | 换关键词 + 换 source (news/web) |
| EastMoney | API null | 换日期范围 / 仅取当日 |

## Fallback Source Chain (设计意图，当前未自动执行)

> **当前行为**：collector 将所有 `staleAction: fallback_not_implemented` 标为 `staleGap`，不自动切换备选源。下方为设计意图，未来实现多源 fallback 后生效。

| Indicator | Primary | Fallback 1 | Fallback 2 |
|:--:|---------|-----------|-----------|
| G2 | ttfund `au9999` | iFinD 上海现货金价 | Wind `economic_data` |
| E1 | Wind `index_data` | iFinD NL Nasdaq 100 | WebSearch |
| A2 components | iFinD NL | Wind `bond_data` | — |
| X2 | Wind `economic_data` | iFinD `M017661940` | WebSearch |
| A3 | EastMoney API | WebSearch | mx-data |
| B4 | WebSearch CME | — | iFinD 不覆盖 FedWatch |
| M2 | Wind `analytics_data` | iFinD NL DR007 | WebSearch |

## Invariants

- WebSearch 兜底仅在 L1-L3 全部失败时使用，使用后标注 "via WebSearch 兜底"
- 一次失败不跳过主源（除非 source-health 含 `humanDisabled: true`）
- 缺口写入 snapshot 时必须附重试日志
