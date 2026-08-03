# Section 0.6: 数据质量简报

## Purpose

在指标详情之前提供数据质量全貌：源健康度、新鲜度分布、陈旧告警、重试记录。用一张表+一段定性小结呈现。

## Input

- `raw.json` — 所有指标的 value/date/source/unit
- `provenance.json` — 采集元数据（调用统计、重试、耗时）
- `config/indicators.json` — indicator 元信息（critical 标记、unit）

## Template

```markdown
## 0.6 数据质量简报

### 源健康度

| 数据源 | 调用 | 成功 | 失败 | 重试 | 贡献指标 | 状态 |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|
| ttfund | {n} | {n} | {n} | {n} | {n} | {ok/degraded} |
| iFinD | {n} | {n} | {n} | {n} | {n} | {ok/degraded} |
| Wind | {n} | {n} | {n} | {n} | {n} | {ok/degraded} |
| WebSearch | {n} | {n} | {n} | — | {n} | {ok/degraded} |

**源可靠性判定**:
- 全源可用 → ok
- 任一源失败但非关键 → degraded（标注影响范围）
- 关键指标源失败 → **fatal**（不应进入报告阶段）

### 新鲜度分布

按数据日期距报告日的天数分级：

| 分级 | 标准 | 数量 | 占比 |
|------|------|:--:|:--:|
| 🟢 **即时** | ≤1天 | {n} | {pct} |
| 🟡 **可用** | 2-7天 | {n} | {pct} |
| 🟠 **滞后** | 8-30天 | {n} | {pct} |
| 🔴 **陈旧** | >30天 | {n} | {pct} |
| — **无日期** | null | {n} | — |

### 陈旧告警

按指标逐个列出超过 maxAgeDays 的项，附 staleAction 判定：

| ID | 指标 | 数据日期 | 滞后天数 | maxAge | staleAction | 状态 |
|:--:|------|------|:--:|:--:|------|:--:|
| ... | ... | ... | {n} | {n} | {acceptable/staleGap} | {freshSuccess/staleSuccess/staleGap} |

**staleAction 规则**:
- `acceptable`: 数据发布周期长于 maxAge（如 G6 月度/55天, F1 事件驱动/195天）→ 计入 staleSuccess
- `staleGap/freshSuccess`: 主源返回最新数据且在 maxAge 内 → 计入 freshSuccess
- `staleGap`: 非 acceptable 的超期数据 → 如需纳入决策需标不确定性

**陈旧告警小结**: 共 {n} 项超出 maxAge — staleSuccess(acceptable) {n} 项 + staleGap(需关注) {n} 项

### 源多样性

| 数据源 | 指标数 | 占比 | 关键指标 |
|--------|:--:|:--:|:--:|
| ttfund | {n} | {pct} | {n} |
| iFinD | {n} | {pct} | {n} |
| Wind | {n} | {pct} | {n} |
| WebSearch | {n} | {pct} | {n} |

**源集中度风险评估**: {单一源占比 >50% 时标注; WebSearch 占比 >30% 时提醒自动化空间}

### 质量总评

**综合评级**: {A/B/C/D} 
- A: 全源健康, 即时+可用 ≥90%, 无 staleGap
- B: 全源健康, 即时+可用 ≥80%, staleGap ≤2 (非关键)
- C: 单个源 degraded 或 staleGap 3-5 或关键指标 staleGap 1-2
- D: 多源 failed 或 staleGap >5 或关键指标缺失

**本轮**: 评级 {X}, {一句话解释}。
```

## Source

- 源统计: 从 `provenance.json` 的 `sources.{source}.calls` / `totalCalls` / `success` 等字段提取
- 新鲜度: 遍历 `raw.json` 的 results, 计算每个指标的 `reportDate - dataDate`（天数差），按阈值分桶
- staleAction: 从 `config/indicators.json` 的 `freshness` 段读取每个指标的 `maxAgeDays` 和 `staleAction`。该段为机器可读的真相源，与 `collect/source-map.md` 保持同步。
- 评级: 按上述 A/B/C/D 规则自动判定
