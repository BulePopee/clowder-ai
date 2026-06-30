# Module: Pipeline
# Role: Stage Orchestrator

## RunMode Resolution

- 用户说"验证/测试/验收/全覆盖" → `validation`
- 其他监测报告请求 → `report`（默认）
- 不主动询问 runMode

## 5 阶段管道

```
Stage 1  Round
Stage 2  Collect & Snapshot
Stage 3  Compute
Stage 4  Reason
Stage 5  Report
```

## Stage Contracts

### Stage 1: Round Selection
- Input: 用户选择
- Output: `roundType ∈ {routine, event}`
- Module: `modules/round.md`
- Fail: 等待用户输入，不自动进入

### Stage 2: Collect & Snapshot
- Input: `roundType`, `runMode`
- Output: `{runtimeRoot}/runs/{runId}/raw-snapshot.md` + `provenance.md` + `portfolio-snapshot.md`（可选，由 `portfolio/collect.cjs` 独立采集）
- Module: `collect/index.md`
- Portfolio: 与 macro collector 并行独立运行，失败不阻塞 macro 管道。缺失时 Stage 4 第 5 章降级为 degraded
- **runMode 含义**：
  - `validation`: 全量尝试 + 全部直接指标不齐 STOP
  - `report`: **全量尝试** + 尝试后仍缺可带缺口继续报告
  - 两种模式都必须完成 source-map 覆盖范围内的**全部采集尝试**。`report` 只降低输出阻断条件，不降低采集努力。
  - 禁止以"数据已够分析"为由提前结束采集。全量尝试是硬约束。
- Fail:
  - `fatal` — runId 创建失败 / raw-snapshot 不可写 / 全指标空值 / ttfund+iFinD+Wind 全不可用 / **Pre-Compute Gate G1-G4 未通过** → **STOP**
  - `degraded` — 单指标全源失败 / 某备选源失败 → 继续，snapshot 标缺口
  - `warning` — source-health 更新失败 / 非关键 WebSearch 无结果 / A3 mx-data 失败 → 继续

### Stage 3: Compute
- Input: `raw-snapshot.md`
- Output: `{runtimeRoot}/runs/{runId}/derived-snapshot.md`
- Module: `compute/index.md`
- Fail:
  - `fatal` — raw-snapshot 文件不存在 / 格式损坏不可解析 → **STOP**
  - `degraded` — 某分量 null 导致衍生指标无法计算 → derived 标缺口，继续

### Stage 4: Reason
- Input: `raw-snapshot.md` + `derived-snapshot.md` + `portfolio-snapshot.md` + `provenance.md` + `gaps.json`
- Output: `{runtimeRoot}/runs/{runId}/evidence-packet.json` + `reasoning-snapshot.json` + `reasoning-snapshot.md`
- Module: `reasoning/README.md`
- A-layer: 运行 `reasoning/build-evidence-packet.cjs`（确定性脚本）
- B-layer: LLM 按 blueprint 模板执行推理（不访问外部数据源）
- Fail:
  - `fatal` — raw-snapshot 缺失 / build-evidence-packet 脚本错误 → **STOP**
  - `degraded` — 某蓝图因数据不足无法完成 → 对应蓝图输出标 degraded，继续

### Stage 5: Report
- Input: `raw-snapshot.md` + `derived-snapshot.md` + `evidence-packet.json` + `reasoning-snapshot.json`
- Output: `{runtimeRoot}/runs/{runId}/report.md`
- Module: `report/index.md`
- 成功时: 更新 `{runtimeRoot}/current.md`
- 第 5-6 章引用 Reason 输出，不自由发挥
- Fail:
  - `fatal` — 两份 snapshot 均不可读 / runId 丢失 → **STOP**
  - `degraded` — 部分章节数据不足 → 对应章节标缺口，0.5 章更新置信度

## Cross-Stage Invariants

1. 阶段间只通过 snapshot 文件传递数据，不通过上下文记忆
2. 每阶段只读本阶段 index 声明的依赖，不跨阶段偷读
3. 前一阶段 `fatal` → 管道停止
4. 前一阶段 `degraded` → 后续阶段可继续但必须标"上游缺口"

## Data Gap & Confidence

报告允许非全量输出，但必须前置缺口与置信度板块（第 0.5 章）：

- 逐板块列：应采 / fresh / stale / missing / 关键缺口 / 置信度 / 影响
- **覆盖率不再只报 X/Y**。必须展示 `fresh/stale/missing` 三段拆分。`stale` 不能混入 `success`。
- 关键指标缺口 → 第 6 章操作建议降级，禁止强买卖
- 多核心板块缺口 → 全局置信度"低"，仅观察不决策

关键指标组：`B1 B2 B3 B6 F1 F2 O1 G2 G4 X1 X3 X4 E1 E2 E3`
