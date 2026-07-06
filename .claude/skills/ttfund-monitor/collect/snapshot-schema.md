# Module: Snapshot Schema
# Role: Raw Snapshot Format Specification

## File

`{runtimeRoot}/runs/{runId}/raw-snapshot.md`

## Format

```markdown
# 数据快照 · YYYY-MM-DD HH:MM

## 元信息
- 轮次：{roundType}
- 采集时间：{startTime}-{endTime} CST
- 覆盖：{attempted}/{total} attempted | fresh:{n} stale:{n} missing:{n}
- 缺口：{gapSummary}
- 覆盖率不再只报 X/Y。stale 不能混入 success。必须拆分为 fresh/stale/missing 三段。

## 原始数据

### {Section}
| 编号 | 名称 | 值 | 数据日期 | 来源 |
|:--:|------|------|------|------|
| ... | ... | ... | ... | {adapter} {commandKey} |
```

## Rules

- 值 = 原始 API 返回值，不做加工
- 来源格式: `{adapter} {commandKey}` (e.g. `ttfund GOLD_INFO`, `ifind ED_KL_NASDAQ`)
- 缺口行: 值列标 `🔴 缺口`，来源列标失败原因
- 派生计算不写入 raw-snapshot
- 附 provenance.md：时间戳、工具版本、调用次数、重试记录

## Provenance Schema

### Meta
```markdown
- runId
- startTime / endTime
```

### Tool Versions
```markdown
| 工具 | 版本 | 调用次数 |
|------|------|:--:|
```

### Adapter Execution Matrix

对照各 adapter 批次表填写执行矩阵（collector 自动模式产出的 `provenance.md` 为简化版，如需完整矩阵见 `collect/index.md` G2）。

```markdown
| Adapter | 批次数 | 已执行 | 跳过 | skippedReason |
|---------|--------|--------|------|---------------|
| ttfund | 1 | | | |
| iFinD | 6 | | | |
| Wind | 1 | | | |
| mx-data | 1 | | | |
| WebSearch | 1 | | | |
```

- `跳过` > 0 时必须填 `skippedReason`，否则 G2 不通过
- `freshSuccess` = 本轮执行且值在 maxAgeDays 内
- `staleSuccess` = 有值但超过 maxAgeDays，且 staleAction=acceptable
- `failed` = 无值或所有源均失败
- **stale + staleAction=fallback_not_implemented → staleGap**（当前不自动触发备选源）

### Retry Log
```markdown
## 重试记录
- adapter: {name} | item: {id} | retries: {n} | final: ok/failed | failReason
```

### Gap Classification
```markdown
## 缺口分类
| 编号 | 原因类别 | 详情 |
|------|------|------|
```
原因类别：`source_failed`（源执行了但返回空/错误）、`source_blocked`（防火墙/权限阻）、`stale`（有值但过期）、`collector_incomplete`（未执行——出现此项 = G1 未通过，禁止进入 Compute）、`partialMissing`（指标含多个分量，仅部分获取）、`reused`（本轮未执行，值沿用上轮——必须注明 sourceRunId + 原采集时间 + SLA 状态）。

## Self-Check (3 items)

1. `grep "^## 元信息"` — 有元信息段
2. `grep "^## 原始数据"` — 有原始数据段
3. 无 "派生利差" "计算值" 等加工内容
