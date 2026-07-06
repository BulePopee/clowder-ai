# Module: Collector
# Role: Stage 2 Orchestrator

> **入口**: 日常通过 `pipeline/run.cjs --mode report` 调用。直接运行 `collector/index.cjs` 仅用于 debug/补救。

## Purpose

编排全部直接指标采集并写入 raw-snapshot。自己只管顺序和完工标准，工具细节见 adapters/。

## Input

- `roundType` (from Stage 1)
- `runMode` (from pipeline resolution)
- `collect/source-map.md` — 指标→源优先级
- `{runtimeRoot}/source-health.md` — 最近源状态（可选，仅提示）

## Output

- `{runtimeRoot}/runs/{runId}/raw.json` — 采集器机器输出
- `{runtimeRoot}/runs/{runId}/raw-snapshot.md` — 格式化快照（下游阶段消费）
- `{runtimeRoot}/runs/{runId}/provenance.md` — 溯源报告
- `{runtimeRoot}/runs/{runId}/gaps.json` — 缺口清单
- `{runtimeRoot}/runs/{runId}/websearch-tasks.md` — WebSearch 待办
- `{runtimeRoot}/runs/{runId}/portfolio-snapshot.json` + `.md` — 账户持仓快照（硬步骤，由 `portfolio/collect.cjs` 独立产出。失败不阻塞 macro 管道但触发 G001 blocker）

## Protocol

### Automated (primary)

1. 生成 `runId = YYYYMMDD-HHmm-{catId}`（同猫同分钟加序号 01-99）
2. 运行采集器：
   ```bash
   node .claude/skills/ttfund-monitor/collector/index.cjs --round {roundType} --runId {runId}
   ```
   采集器自动执行 ttfund + iFinD + Wind，产出到 `{runtimeRoot}/runs/{runId}/`:
   - `raw.json` — 全部结构化指标值
   - `provenance.json` — 采集元数据（耗时、成功/失败、批次矩阵）
   - `gaps.json` — null/error 项清单
   - `websearch-tasks.md` — WebSearch 待办（10 项，需 Claude 手动执行）
3. 运行账户采集器（与 macro 并行独立）：
   ```bash
   node .claude/skills/ttfund-monitor/portfolio/collect.cjs --runId {runId}
   ```
   产出 `portfolio-snapshot.json` + `portfolio-snapshot.md`。失败不阻塞 macro 管道，缺失时触发 G001 blocker → Report 第5-6章只能输出"无法给出行动建议"。
4. 执行 websearch-tasks.md 中的 WebSearch 查询，结果补入 raw.json
5. WebSearch 补完后必须重跑 freshness check（WebSearch 结果不会自动纳入 freshness/snapshot）:
   ```bash
   node .claude/skills/ttfund-monitor/collector/index.cjs --freshness-only --runId {runId}
   ```
   这会重算 fresh/stale/invalidDate，更新 gaps.json/freshness，重写 raw-snapshot.md 和 provenance.md。
6. 读 `retry-policy.md` → 对 gaps.json 中的项执行重试/fallback

### Manual (fallback, collector unavailable)

1. 读 `source-map.md` → 了解每项指标用哪个 adapter 的哪个命令
2. 读 `source-health.md`（可选）→ 了解最近源波动，不得用于跳过主源（除非含 `humanDisabled: true`）
3. 按 adapter 分组执行：
   a. ttfund → 读 `adapters/ttfund.md` → GOLD_INFO + INDEX_INFO×2 + HUOQIBAO_LIST **(全部执行)**
   b. iFinD → 读 `adapters/ifind.md` → 按批次表执行，**6 批 28 calls 必须全部执行**（间隔 ≥2s）
   c. Wind → 读 `adapters/wind.md` → analytics_data 6 项 **(全部执行)**
   d. mx-data → 读 `adapters/mx-data.md` → A3 备用 **(必须执行)**
   e. WebSearch → 读 `adapters/websearch.md` → 兜底 10 项 **(全部执行)**
4. 遇到 null/empty → 读 `retry-policy.md` → 执行重试
5. 全采完 → 读 `snapshot-schema.md` → 写入 `raw-snapshot.md` + `provenance.md`
6. **（硬步骤）** 运行 `node .claude/skills/ttfund-monitor/portfolio/collect.cjs --runId {runId}` 采集账户持仓快照
7. 更新 `source-health.md`（追加本轮事件，不覆盖整表）

## Pre-Compute Gate (MANDATORY)

**进入 Stage 3 Compute 前必须通过以下 3 项检查。任一不满足 → 返回 Stage 2 补采，不得进入 Compute。**

### G1: 全指标尝试覆盖
对照 `source-map.md` 全部直接指标（数量以 `config/indicators.json` 为准）。每个指标必须满足以下之一：
- 主源已执行，或
- 主源失败 + 备选1 已执行，或
- 主源+备选1 均失败 + 备选2 已执行

**"待采集""未执行" 不是 gap，是 collector incomplete。** collector incomplete 项必须返回补采，不得携带进入 Compute。

### G2: Adapter 批次执行矩阵
对照各 adapter 的批次表，填写执行矩阵并写入 provenance.md：

| Adapter | 批次数 | 已执行 | 跳过 | skippedReason |
|---------|--------|--------|------|---------------|
| ttfund | 1 | | | |
| iFinD | 6 | | | |
| Wind | 1 | | | |
| mx-data | 1 | | | |
| WebSearch | 1 | | | |

所有批次必须为 "已执行" 或有明确 `skippedReason`。"未执行"无理由 → G2 不通过。

> **WebSearch 特殊规则**：自动模式下 WebSearch 由猫手动执行后补入 raw.json，再运行 `--freshness-only` 重算。G2 WebSearch 通过条件 = "手动补采完成 + freshness-only 已重跑"。（collector 的 provenance.json 不统计 WebSearch 调用，但此处仍需填写。）

### G3: 关键指标主源检查
关键指标列表以 `config/indicators.json` 的 `criticalIds` 为准 (17 项: B1 B2 B3 B6 B8 B9 F1 F2 O1 G2 G4 X1 X3 X4 E1 E2 E3)。每个关键指标至少尝试过主源。主源不可用时必须尝试备选。

### G4: Freshness Gate (MANDATORY)
**采集值通过 parse 后必须经过 freshness 检查。stale 不能算 success。**

对照 `source-map.md` 中每个指标的 `maxAgeDays`：
- 值在 `maxAgeDays` 内 → `freshSuccess`
- 值超过 `maxAgeDays` + `staleAction: fallback_not_implemented` → `staleGap`（当前未实现自动备选源切换，配置中统一标注）
- 值超过 `maxAgeDays` + `staleAction: staleGap` → `staleGap`（记录到 provenance，标记到 snapshot）
- `staleAction: acceptable` 的指标（如月度数据、央行储备）→ `staleSuccess`（计入 success，允许超龄）

**G4 不通过条件**：关键指标 `freshSuccess=false` 且 `staleAction!=acceptable` → 返回补采。

**G1-G4 全部通过后**，剩余确实无法获取的项 = legitimate gap，可带缺口进入 Compute。

## Completion Criteria

- `validation` 模式: 全部直接项齐全 → 合格；有缺口 → STOP
- `report` 模式: **全量尝试采集后**仍无法获取的项可带缺口进入报告。关键指标缺口 → 报告 0.5 章标记、第 6 章降级。**"待采集/未执行"不是缺口，是采集未完成，必须返回补采。**
- Portfolio: 硬步骤，独立于 macro 管道。S1-S4 全量尝试后缺失不阻塞 macro，但触发 G001 blocker。缺失时报告第5-6章只能输出"无法给出行动建议"，禁止 HOLD 或调仓建议。

## Invariants

- 不做派生计算（那是 compute 的事）
- 不写报告（那是 report 的事）
- 不修改 `source-map.md`
- `source-health.md` 只追加，不覆盖；只有含 `humanDisabled: true` 才允许跳过主源
- adapter 只描述工具能力和响应结构，source-map 负责指标到字段的映射

## Source-Health Format

```
## YYYY-MM-DDTHH:mm:ss+08:00 runId={runId}
- adapter: {name}
  commandKey: {key}
  status: ok | warning | error
  error: {message}
  action: {what was done}
  humanDisabled: false
```
