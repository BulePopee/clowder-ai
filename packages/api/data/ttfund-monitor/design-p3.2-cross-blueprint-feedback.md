# P3.2-A Cross-Blueprint Feedback — 设计方案 (收窄版)

**作者**: 布偶猫/宪宪 (@ragdoll-vzes)
**日期**: 2026-07-14
**状态**: 已更新 (审查意见已纳入)
**审查**: 缅因猫/砚砚 (@cat-g7k98t5f)
**状态**: 设计通过，进入实现

---

## 审查意见纳入

| # | 砚砚的审查意见 | 处理 |
|---|-------------|------|
| 1 | Stage 编号冲突：P3.1 已占 Stage 4.5 | → P3.2-A 使用 **Stage 4.6** |
| 2 | 砍掉 B-layer LLM coherence check | → 移除，延后到 P3.2-B |
| 3 | feedback.json 必须是独立产物 | → 确认，不写回 reasoning-snapshot |
| 4 | 调整用数值字段，不用字符串 | → `delta`/`singleCap`/`cumulativeCap` 数值化 |
| 5 | Report 消费延后 | → 移除 Ch2.7 + Ch5 消费，只做 artifact |
| — | V11: blocker 语义继承 | → 已加入 validator 检查项 |
| — | V12: 禁止 action words | → 已加入 validator 检查项 |
| — | temporal degraded 检查用 meta.status | → R3 规则改读 `meta.status === "degraded"` |
| 6 | feedback artifact 不设 `required: true` | → `required: false`，老 run 兼容 |
| 7 | V12 不做 NLP 否定检测 | → 一律禁止 action words；用 `safety_note` 字段代替否定语义 |
| 8 | R3 不依赖 zScore（P3.1 无统计 σ）| → 改用 `magnitude` / `threshold_crossings.approaching` |

---

## 1. 问题定义

当前 Reason B-layer 的三个 blueprint 各自独立推理，产出独立的 reasoning-snapshot.json。虽然 portfolio-action-gate 会引用 macro-regime 和 gold-rate-conflict 的输出作为 supporting_evidence，但这是**单向消费**——被引用的 blueprint 不会收到反馈。

P3.1 引入了 temporal-diff 让每个指标有了方向和速度，这个时序信号天然是跨 blueprint 的。

**P3.2-A 范围（收窄后）**: 只做确定性 A-layer feedback 引擎 + validator，不涉及 LLM coherence check，不涉及 report 消费。先让 `feedback.json` 产物稳定、可验证、可回滚，后续 P3.2-B 再接 LLM 和 report。

---

## 2. 设计原则

| # | 原则 | 理由 |
|---|------|------|
| P1 | **建议不覆盖** | feedback 只产出 adjustment suggestions，原始 blueprint 输出永远不可变 |
| P2 | **上限保护** | 每次调整有硬上限，数值化可机校验，防止反馈链失控放大 |
| P3 | **可审计** | 每条调整必须追溯来源（哪个 blueprint 的哪个字段触发了调整） |
| P4 | **可回滚** | feedback.json 可独立删除/重跑，不影响 reasoning-snapshot |
| P5 | **Validator 先行** | 先定义 validate-feedback.cjs，再允许下游消费 |
| P6 | **纯确定性** | P3.2-A 只做 rule-based（A-layer），无 LLM 边界 |

---

## 3. 数据流 (P3.2-A)

```
                 ┌─────────────────────────────────────┐
                 │        Stage 4: Reason B-layer       │
                 │  macro-regime / gold-rate-conflict   │
                 │  / portfolio-action-gate             │
                 └────────────┬────────────────────────┘
                              │ reasoning-snapshot.json
                              ▼
                 ┌─────────────────────────────────────┐
                 │    Stage 4.5: Temporal Diff (P3.1)   │
                 └────────────┬────────────────────────┘
                              │ temporal-diff.json
                              ▼
                 ┌─────────────────────────────────────┐
                 │  Stage 4.6: Cross-Blueprint Feedback │
                 │  (P3.2-A — NEW, deterministic only)  │
                 │                                      │
                 │  build-feedback.cjs                  │
                 │  ├─ reads reasoning-snapshot.json    │
                 │  ├─ reads temporal-diff.json         │
                 │  ├─ applies feedback rules (R1-R4)   │
                 │  └─ outputs feedback.json            │
                 │                                      │
                 │  validate-feedback.cjs               │
                 │  ├─ schema validation                │
                 │  ├─ bound checks (numeric)           │
                 │  ├─ source traceability              │
                 │  ├─ blocker semantics (V11)          │
                 │  └─ action word prohibition (V12)    │
                 └────────────┬────────────────────────┘
                              │ feedback.json
                              ▼
                 ┌─────────────────────────────────────┐
                 │       Stage 5: Report (unchanged)    │
                 │  (Ch2.7/Ch5 consumption → P3.2-B)   │
                 └─────────────────────────────────────┘
```

---

## 4. 产物结构: feedback.json

### 4.1 完整示例

```json
{
  "meta": {
    "version": "1.0.0",
    "builtAt": "2026-07-14T10:00:00.000Z",
    "runId": "20260714-1000-auto",
    "inputs": {
      "reasoning_snapshot": "runs/20260714-1000-auto/reasoning-snapshot.json",
      "temporal_diff": "runs/20260708-1014-auto/temporal-diff.json"
    },
    "temporal_diff_status": "ok"
  },

  "cross_refs": [
    {
      "id": "FB-001",
      "from_blueprint": "macro-regime",
      "from_field": "macro_regime.regime_claim",
      "from_value": "Policy Divergence",
      "to_blueprint": "gold-rate-conflict",
      "to_field": "gold_rate_conflict.scenarios[China premium].probability",
      "signal": "Policy Divergence implies US-China macro decoupling — China-driven gold demand likely more durable",
      "adjustment": {
        "type": "scenario_probability_shift",
        "target": "gold_rate_conflict.scenarios[China premium].probability",
        "unit": "percentage_point",
        "delta": 10,
        "singleCap": 20,
        "cumulativeCap": 30,
        "reason": "Policy Divergence regime strengthens China premium scenario logic"
      }
    },
    {
      "id": "FB-002",
      "from_blueprint": "gold-rate-conflict",
      "from_field": "gold_rate_conflict.weighted_score.total",
      "from_value": -0.58,
      "to_blueprint": "macro-regime",
      "to_field": "macro_regime.confidence",
      "signal": "Gold weighted score -0.58 (moderately bearish) conflicts with current regime narrative — uncertainty increases",
      "adjustment": {
        "type": "confidence_shift",
        "target": "macro_regime.confidence",
        "unit": "level",
        "delta": -1,
        "min": "Low",
        "max": "High",
        "reason": "Gold signal contradicts rate-driven regime narrative — confidence should be tempered"
      }
    },
    {
      "id": "FB-003",
      "from_blueprint": "temporal-diff",
      "from_field": "directional_changes.B8.direction",
      "from_value": { "indicator": "B8", "direction": "rising", "magnitude": "+14bp", "days": 6, "zScore": 1.4 },
      "to_blueprint": "macro-regime",
      "to_field": "macro_regime.invalidate_if",
      "signal": "TIPS rising +14bp in 6d (z=1.4) — real rate tightening accelerating beyond normal noise",
      "adjustment": {
        "type": "add_invalidation_condition",
        "target": "macro_regime.invalidate_if",
        "unit": "text",
        "delta": 1,
        "singleCap": 3,
        "cumulativeCap": 3,
        "value": "If TIPS continues rising at >2bp/day for 5 more trading days — regime may shift to Risk-Off",
        "reason": "Temporal diff shows real rate tightening is accelerating, not plateauing"
      }
    },
    {
      "id": "FB-004",
      "from_blueprint": "temporal-diff",
      "from_field": "approaching_thresholds[0]",
      "from_value": { "indicator": "B2", "current": 4.55, "threshold": 5.0, "margin_pct": 9 },
      "to_blueprint": "portfolio-action-gate",
      "to_field": "portfolio_action_gate.action_gate.conditions_to_act",
      "signal": "US 10Y approaching 5.0% (9% margin) — defensive trigger may activate within 1-2 weeks",
      "adjustment": {
        "type": "add_condition_to_act",
        "target": "portfolio_action_gate.action_gate.conditions_to_act",
        "unit": "text",
        "delta": 1,
        "singleCap": 3,
        "cumulativeCap": 3,
        "value": "If US 10Y breaks above 5.0% — defensive trigger count increases to 3/6, re-evaluate",
        "reason": "Temporal diff shows US 10Y on approach trajectory to 5.0% threshold"
      }
    }
  ],

  "adjustment_summary": {
    "total": 4,
    "by_type": {
      "scenario_probability_shift": 1,
      "confidence_shift": 1,
      "add_invalidation_condition": 1,
      "add_condition_to_act": 1
    },
    "by_target_blueprint": {
      "macro-regime": 2,
      "gold-rate-conflict": 1,
      "portfolio-action-gate": 1
    },
    "cumulative_caps": {
      "gold_rate_conflict.scenarios[China premium].probability": { "total_delta": 10, "cap": 30, "ok": true },
      "macro_regime.confidence": { "total_delta": -1, "cap": "level shift ≤1", "ok": true },
      "macro_regime.invalidate_if": { "total_delta": 1, "cap": 3, "ok": true },
      "portfolio_action_gate.action_gate.conditions_to_act": { "total_delta": 1, "cap": 3, "ok": true }
    }
  }
}
```

### 4.2 adjustment 字段语义

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | enum | `scenario_probability_shift` / `confidence_shift` / `weight_adjustment` / `add_invalidation_condition` / `add_condition_to_act` |
| `target` | string | 精确的目标字段路径（点号分隔，数组用 `[key]` 语法） |
| `unit` | enum | `percentage_point` / `level` / `text` |
| `delta` | number | 调整量。percentage_point: 百分点(正=增,负=减); level: ±1; text: 新增条数(始终为正) |
| `singleCap` | number | 单条调整的硬上限 |
| `cumulativeCap` | number | 同字段所有调整累计的硬上限 |
| `min` | string | (仅 confidence_shift) 允许的最低等级 |
| `max` | string | (仅 confidence_shift) 允许的最高等级 |
| `value` | string | (仅 text 类型) 新增的文本内容 |
| `reason` | string | 因果链解释（≤200字符） |

### 4.3 调整类型硬上限

| type | unit | singleCap | cumulativeCap | 备注 |
|------|------|-----------|---------------|------|
| `scenario_probability_shift` | percentage_point | ±20 | ±30 (同 scenario) | 同一 scenario 的所有调整累加不超 ±30 |
| `confidence_shift` | level | ±1 | ±1 | min="Low", max="High" |
| `weight_adjustment` | percentage_point | ±15 | ±25 (同 factor) | 同一 factor 的所有调整累加不超 ±25 |
| `add_invalidation_condition` | text | 3 | 3 (同 blueprint) | 每个 blueprint ≤3 条新增 |
| `add_condition_to_act` | text | 3 | 3 (同 blueprint) | 每个 blueprint ≤3 条新增 |

---

## 5. 反馈规则集 (A-layer, build-feedback.cjs)

### 规则集 R1: 宏观象限 → 黄金

```javascript
// R1.1: Policy Divergence → boost China gold demand scenario
if (macro.regime_claim && macro.regime_claim.includes('Divergence')) {
  emitFeedback({
    from_blueprint: 'macro-regime',
    from_field: 'macro_regime.regime_claim',
    to_blueprint: 'gold-rate-conflict',
    to_field: 'gold_rate_conflict.scenarios[China premium].probability',
    type: 'scenario_probability_shift',
    unit: 'percentage_point',
    delta: 10,
    singleCap: 20,
    cumulativeCap: 30,
    reason: 'Policy Divergence → US-China decoupling → China-driven gold demand more durable'
  });
}

// R1.2: Risk-Off → boost positioning flush scenario
if (macro.regime === 'Risk-Off') {
  emitFeedback({
    from_blueprint: 'macro-regime',
    to_blueprint: 'gold-rate-conflict',
    to_field: 'gold_rate_conflict.scenarios[Positioning flush].probability',
    type: 'scenario_probability_shift',
    delta: 15,
    reason: 'Risk-Off → CFTC crowded positioning at risk of liquidation cascade'
  });
}

// R1.3: Stagflation-Lite → boost reflation scenario
if (macro.regime === 'Stagflation-Lite') {
  emitFeedback({
    from_blueprint: 'macro-regime',
    to_blueprint: 'gold-rate-conflict',
    to_field: 'gold_rate_conflict.scenarios[Reflation].probability',
    type: 'scenario_probability_shift',
    delta: 10,
    reason: 'Stagflation → gold as inflation hedge demand increases'
  });
}
```

### 规则集 R2: 黄金 → 宏观象限

```javascript
// R2.1: Gold weighted score ≤ -0.5 + DXY > 102 → regime confidence downgrade
if (goldWeightedScore <= -0.5 && dxy > 102) {
  emitFeedback({
    from_blueprint: 'gold-rate-conflict',
    to_blueprint: 'macro-regime',
    to_field: 'macro_regime.confidence',
    type: 'confidence_shift',
    unit: 'level',
    delta: -1,
    min: 'Low',
    max: 'High',
    reason: 'Gold + DXY both signaling tighter-than-regime-suggests conditions'
  });
}

// R2.2: Gold structural demand (CB + SPDR) both strong → oppose pure Risk-Off
if (cbTrend === 'accumulating' && spdrTrend === 'inflows' && macro.regime === 'Risk-Off') {
  emitFeedback({
    from_blueprint: 'gold-rate-conflict',
    to_blueprint: 'macro-regime',
    to_field: 'macro_regime.confidence',
    type: 'confidence_shift',
    unit: 'level',
    delta: -1,
    min: 'Low',
    max: 'High',
    reason: 'Gold structural flows inconsistent with pure Risk-Off classification'
  });
}
```

### 规则集 R3: 时序变化 → 所有 Blueprint

```javascript
// temporal-diff degraded → R3 所有 delta 乘 0.5
const temporalDegraded = temporalDiff.meta?.status === 'degraded';
const tScale = temporalDegraded ? 0.5 : 1.0;

// R3.1: Critical indicator moved >1σ → add invalidation condition
for (const [id, change] of Object.entries(temporalDiff.directional_changes || {})) {
  if (CRITICAL_IDS.has(id) && Math.abs(change.zScore || 0) > 1.0) {
    const count = Math.round(1 * tScale); // 0 when degraded and rounded down
    if (count > 0) {
      emitFeedback({
        from_blueprint: 'temporal-diff',
        to_blueprint: indicatorToBlueprint(id),
        to_field: `${blueprintKey(id)}.invalidate_if`,
        type: 'add_invalidation_condition',
        unit: 'text',
        delta: count,
        singleCap: 3,
        cumulativeCap: 3,
        value: formatInvalidation(id, change),
        reason: `${id} moved ${change.magnitude} (${change.direction} z=${change.zScore}) in ${change.days}d — regime may shift`
      });
    }
  }
}

// R3.2: Approaching threshold → add condition_to_act
const approaching = temporalDiff.approaching_thresholds || [];
if (approaching.length > 0) {
  const count = Math.round(Math.min(approaching.length, 2) * tScale);
  for (let i = 0; i < count; i++) {
    const near = approaching[i];
    emitFeedback({
      from_blueprint: 'temporal-diff',
      to_blueprint: 'portfolio-action-gate',
      to_field: 'portfolio_action_gate.action_gate.conditions_to_act',
      type: 'add_condition_to_act',
      unit: 'text',
      delta: 1,
      singleCap: 3,
      cumulativeCap: 3,
      value: `If ${near.indicator} breaks ${near.threshold} — defensive trigger +1, re-evaluate`,
      reason: `${near.indicator} is ${near.margin_pct}% from ${near.threshold}`
    });
  }
}
```

### 规则集 R4: 跨 Blueprint 矛盾检测

```javascript
// R4.1: Macro says real rates easing but gold says tightening
if (macro.real_rate_trend === 'falling' && goldWeightedScore <= -0.3) {
  emitFeedback({
    from_blueprint: 'macro-regime',
    to_blueprint: 'gold-rate-conflict',
    type: 'scenario_probability_shift',
    to_field: 'gold_rate_conflict.scenarios[Positioning flush].probability',
    delta: 5,
    reason: 'Easing-rate narrative not confirmed by gold market — add positioning caution'
  });
}

// R4.2: Portfolio says HOLD but temporal diff shows approaching thresholds
if (portfolioRec === 'hold' && (temporalDiff.approaching_thresholds || []).length > 0 && !temporalDegraded) {
  // Already handled by R3.2; R4.2 is a check, not a duplicate emit
  // If R3.2 didn't fire (e.g., threshold count was 0), R4.2 adds at least 1
  const existingConditions = feedbackForTarget('portfolio_action_gate.action_gate.conditions_to_act');
  if (existingConditions.length === 0) {
    emitFeedback({
      from_blueprint: 'temporal-diff',
      to_blueprint: 'portfolio-action-gate',
      type: 'add_condition_to_act',
      delta: 1,
      value: 'Monitor approaching thresholds for next run — HOLD may need re-evaluation',
      reason: 'Temporal diff shows movement toward defensive thresholds'
    });
  }
}
```

### 指标→Blueprint 映射 (helper)

```javascript
const INDICATOR_TO_BLUEPRINT = {
  B8: 'macro-regime', B9: 'macro-regime', B2: 'macro-regime',  // rates → macro
  F2: 'macro-regime', F1: 'macro-regime',                       // inflation → macro
  X1: 'macro-regime', N2: 'macro-regime',                       // USD/liquidity → macro
  G4: 'gold-rate-conflict', G7: 'gold-rate-conflict',           // gold → gold
  G8l: 'gold-rate-conflict', G8s: 'gold-rate-conflict',         // CFTC → gold
  E1: 'macro-regime', E2: 'macro-regime', E3: 'macro-regime',   // equity → macro
  S1: 'macro-regime',                                           // VIX → macro
  X3: 'macro-regime', X4: 'macro-regime',                       // CNY → macro
};
```

---

## 6. Validator: validate-feedback.cjs

### 6.1 检查项

| # | 类型 | 检查 |
|---|------|------|
| V1 | **error** | `meta.inputs.reasoning_snapshot` 和 `meta.inputs.temporal_diff` 文件存在且可读 |
| V2 | **error** | 所有 `cross_refs[].from_field` 路径可在源 blueprint JSON 中解析到值 |
| V3 | **error** | 所有 `cross_refs[].to_field` 路径格式合法（点号+数组语法） |
| V4 | **error** | 每条 adjustment 的 `Math.abs(delta) <= singleCap` |
| V5 | **error** | 同字段累计 `Math.abs(total_delta) <= cumulativeCap`（与 `adjustment_summary.cumulative_caps` 核对） |
| V6 | **error** | 无 `type` 为 `override` 或 `replace` 的 adjustment |
| V7 | **error** | 所有 `cross_refs[].id` 唯一，格式 `FB-` 前缀 |
| V8 | **error** | `confidence_shift` 的 `delta` 在 [-1, 1] 且 `min`/`max` 在合法枚举内 |
| V9 | **error** | `adjustment_summary.total` 与实际 `cross_refs` 数量一致，`by_type`/`by_target_blueprint` 计数正确 |
| V10 | **error** | 无循环引用：同一对 `(to_blueprint, to_field)` 不能同时被对方作为 `from` 指向自身 |
| V11 | **error** | **Blocker 语义继承**：若 `reasoning-snapshot` 中 `action_advice_allowed === false`，则 feedback 不能包含任何 `add_condition_to_act` 类型调整；`add_invalidation_condition` 允许但 `reason` 必须以 "blocked: " 开头 |
| V12 | **error** | **禁止交易动作词**：所有 adjustment 的 `value`/`reason`/`signal` 字段不包含 `buy/sell/add/reduce/加仓/减仓/买入/卖出/超配/低配/增持/减持`（除非以 "禁止"/"不"/"do not" 明确否定） |

### 6.2 运行方式

```bash
# P3.2-A 只需要这两步
node reasoning/build-feedback.cjs --runId 20260714-1000-auto
node reasoning/validate-feedback.cjs --runId 20260714-1000-auto
```

### 6.3 退出码

- `0` = pass (0 errors)
- `1` = blocked (≥1 error)
- warnings 不影响退出码

---

## 7. 管道集成

### 7.1 pipeline/contracts.cjs 新增

```javascript
// 新增 artifact
{
  id: 'feedback',
  path: '{runDir}/feedback.json',
  stage: 'feedback',
  required: true,
  producedBy: 'reasoning/build-feedback.cjs',
  consumedBy: ['feedback-validate', 'consistency']
}

// 新增 stages (插入到 validate-reasoning 之后, report 之前)
{
  id: 'feedback',
  label: 'Stage 4.6: Cross-Blueprint Feedback',
  auto: true,
  script: 'reasoning/build-feedback.cjs',
  args: (runId) => ['--runId', runId]
},
{
  id: 'validate-feedback',
  label: 'Stage 4.6: Validate Feedback',
  auto: true,
  script: 'reasoning/validate-feedback.cjs',
  args: (runId) => ['--runId', runId]
}
```

### 7.2 validate-run-consistency.cjs §5 新增

在现有 §5 temporal-diff→report 一致性检查之后，新增 feedback→reasoning 交叉校验：
- feedback 中每条 `cross_ref.from_field` 在 reasoning-snapshot 中能找到对应值
- feedback 的 `adjustment_summary.cumulative_caps` 与实际 cross_refs 的计算一致
- feedback 的 `meta.runId` 等于 reasoning-snapshot 的 `meta.runId`

### 7.3 pipeline/run.cjs 入口

```bash
# P3.2-A 接入后的完整管道入口示例
node pipeline/run.cjs --runId 20260714-1000-auto --from feedback   # 从 feedback 开始
node pipeline/run.cjs --runId 20260714-1000-auto --from reason-b   # 从 B-layer 重新跑
```

---

## 8. 实现计划

| # | 文件 | 内容 | 工作量 |
|---|------|------|--------|
| 1 | `reasoning/feedback-schema.json` | JSON Schema for feedback.json (供 validator 引用) | 小 |
| 2 | `reasoning/build-feedback.cjs` | A-layer 确定性规则引擎 (R1-R4) | 中 |
| 3 | `reasoning/validate-feedback.cjs` | 12 项校验 (V1-V12) | 中 |
| 4 | `pipeline/contracts.cjs` | 新增 artifact + 2 stages | 小 |
| 5 | `validate-run-consistency.cjs` | §5 追加 feedback consistency 检查 | 小 |

**不含**: LLM coherence check (→ P3.2-B)、report/schema.json 更新 (→ P3.2-B)、report/index.md 更新 (→ P3.2-B)

---

## 9. 已解决的 Open Questions

| 问题 | 结论 |
|------|------|
| 独立产物 vs reasoning 可选字段？ | **独立产物**。不写回 reasoning-snapshot.json。 |
| 权重调整上限？ | 单条 ±15%、累计 ±25%。数值化后用 `singleCap`/`cumulativeCap` 校验。 |
| B-layer coherence check？ | **P3.2-A 不做**。等 A-layer 稳定后 P3.2-B 评估。 |
| temporal baseline 过期处理？ | 读 `temporal_diff.meta.status === "degraded"`，R3 权重乘 0.5，不在 feedback 里重新判断日期。 |

---

## 10. 验收标准 (P3.2-A)

| # | 标准 | 验证方式 |
|---|------|---------|
| AC1 | feedback.json 不含 override/replace 类型调整 | V6 |
| AC2 | 所有调整不超 singleCap/cumulativeCap | V4/V5 |
| AC3 | 所有 cross_ref 可追溯到源 blueprint 字段 | V2 |
| AC4 | to_field 路径格式合法 | V3 |
| AC5 | 无循环引用 | V10 |
| AC6 | blocker 活跃时无 add_condition_to_act | V11 |
| AC7 | 调整文本不含交易动作词 | V12 |
| AC8 | 删除 feedback.json + 重跑 build-feedback 不报错 | 手动 |
| AC9 | `node reasoning/build-feedback.cjs --runId X` 可在无 LLM 环境下独立运行 | 手动 |
| AC10 | validate-feedback 通过后 consistency §5 也通过 | 端到端 |
