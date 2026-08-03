# P3.2-B Feedback Consumption — 方案比较

**作者**: 布偶猫/宪宪 (@ragdoll-vzes)
**日期**: 2026-07-14
**状态**: 方案设计（待审查）
**审查**: 缅因猫/砚砚 (@cat-g7k98t5f)
**前置**: P3.2-A 已实现并通过审查

---

## 背景

P3.2-A 产出了 `feedback.json`——一个确定性跨 blueprint 反馈产物，包含 2 条 cross_refs（测试跑），12 项 validator 检查全部通过，pipeline 已集成。

**当前状态**: feedback.json 被产出、被验证、被 consistency checker 交叉校验——但**没有任何下游消费**。它是一份"存档文件"。

P3.2-B 要回答的问题是：**这份 feedback 应该被谁消费、以什么形式消费？**

---

## 两条路径

| | Path A: LLM Coherence Check | Path B: Report Visibility |
|---|---|---|
| **做什么** | LLM 读取 feedback.json + reasoning-snapshot.json，检测确定性规则遗漏的跨 blueprint 矛盾 | 将 feedback.json 的 cross_refs 写入 report.md，让用户看到跨 blueprint 一致性信号 |
| **消费方** | 机器（pipeline 内部） | 人（铲屎官 / report 读者） |
| **产物** | `coherence-check.md` 或 `coherence.json` | report.md 新增小节（Ch2.7 / Ch6.x）+ Ch5 引用 |
| **技术手段** | LLM prompt + structured output | 模板渲染（确定性，与现有 report 组装一致） |
| **验证方式** | 需要新的 validator（类似 validate-reasoning） | 现有 validate-report.cjs 扩展检查项 |

---

## 详细分析

### Path A: LLM Coherence Check

#### 做什么

在 build-feedback.cjs 产出 feedback.json 之后，用一个 LLM 调用读取：

1. `reasoning-snapshot.json` — 三个 blueprint 的完整输出
2. `feedback.json` — A-layer 已检测到的 cross_refs
3. `temporal-diff.json` — 时序变化

然后回答以下问题：

- **遗漏检测**: 有没有跨 blueprint 的矛盾 A-layer 规则没覆盖？
- **叙事一致性**: 不同 blueprint 的 narrative 是否互相矛盾？
- **边缘案例**: 有没有"数据说不矛盾但逻辑上说不通"的情况？

#### 可能的输出结构

```json
{
  "coherence": {
    "overall": "consistent | minor_tension | contradiction",
    "missed_signals": [
      {
        "from_blueprint": "macro-regime",
        "to_blueprint": "gold-rate-conflict",
        "finding": "...",
        "severity": "low | medium | high",
        "suggested_fb_rule": "可考虑加入 R4 的新触发条件"
      }
    ],
    "narrative_conflicts": [
      {
        "blueprints": ["macro-regime", "gold-rate-conflict"],
        "conflict": "...",
        "resolution": "..."
      }
    ],
    "rule_improvement_suggestions": ["R1.x: ...", "R4.x: ..."]
  }
}
```

#### 风险

| 风险 | 等级 | 说明 |
|------|:--:|------|
| **幻觉** | 高 | LLM 可能"发现"不存在的矛盾，尤其当两个 blueprint 用了不同措辞描述同一现象时 |
| **不可复现** | 高 | 同一输入两次调用可能输出不同结论，破坏管道的确定性保证 |
| **验证困难** | 高 | 怎么验证 LLM 的 coherence 判断是对的？需要人工审查，无法自动化 |
| **延迟** | 中 | 增加 5-15s LLM 调用，管道总时间增加 |
| **规则退化** | 中 | 如果 LLM 持续发现 A-layer 遗漏，开发者的自然反应是不断往 A-layer 加规则，最终 A-layer 变成 LLM 输出的硬编码版——LLM 从"检查者"变成了"实际规则制定者" |
| **依赖循环** | 低 | LLM coherence check 产出 rule suggestions → 开发者加了规则 → A-layer 变了 → LLM 再次检查 → 可能发现新的"矛盾" |

#### 收益

| 收益 | 等级 | 说明 |
|------|:--:|------|
| **发现未知未知** | 中 | 理论上可以抓到人没预定义的矛盾模式 |
| **规则迭代信号** | 中 | 如果 LLM 反复指出同一类遗漏，可以提炼为新规则 |
| **独立于 report** | 低 | 不与用户界面耦合，纯内部质量工具 |

#### 前置依赖

- 需要 reasoning-snapshot.json 的 narrative 字段足够丰富（当前 blueprints 输出主要是结构化数据，narrative 文本较短）
- 需要至少 5-10 次历史跑的 feedback.json 积累，才能判断 LLM 的"发现"是真实问题还是噪声

---

### Path B: Report Visibility

#### 做什么

在 Stage 5 Report 组装时，读取 `feedback.json`，将 cross_refs 渲染到报告的特定位置：

**Ch2.7 (新): 跨资产一致性**

```markdown
## 2.7 跨资产一致性

本轮跨 blueprint 反馈检测到 {n} 条一致性信号：

| # | 来源 | 信号 | 目标 | 调整 |
|---|------|------|------|------|
| FB-001 | macro-regime → gold | Policy Divergence → 黄金避险需求结构性升高 | scenario[FOMC hold].probability +10pp | 宏观政策分化强化黄金避险叙事 |
| FB-002 | temporal → portfolio | US 10Y 逼近 5.0%（9%距离）| add condition_to_act | 接近防御触发阈值，下轮重点关注 |

**一致性评估**: {一致 / 轻微张力 / 矛盾} — {一句话总结}
```

**Ch5 (现有): 持仓影响**

在 Ch5 的"组合风险映射"表中新增一列或一行，标注哪些 feedback 信号与当前持仓相关：

```markdown
| 反馈信号 | 影响基金 | 风险含义 |
|----------|---------|---------|
| FB-001: 黄金避险需求升高 | 华安黄金 | 利好黄金持仓，但注意 FOMC 前后波动 |
| FB-002: US 10Y 接近 5% | 纳斯达克 QDII | 利率上行压力 → 高久期资产承压 |
```

**Ch6.6 (新): 反馈信号参考**

```markdown
### 6.6 跨资产反馈信号

以下信号来自跨 blueprint 一致性检测，不直接产生操作建议，但标注为决策参考：

- FB-001: {信号描述} → 参考权重: {低/中/高}
- FB-002: {信号描述} → 参考权重: {低/中/高}
```

#### 新增 report schema 条目

```json
"2.7": {
  "prefix": "2.7",
  "required": true,
  "mustContain": ["跨资产一致性", "一致性评估"],
  "minTables": 1,
  "note": "P3.2-B: consume feedback.json cross_refs"
}
```

Ch2.7 仅在 feedback.json 存在且有 ≥1 条 cross_refs 时 required。无 feedback 或 0 cross_refs 时降级为 `required: false`。

#### 风险

| 风险 | 等级 | 说明 |
|------|:--:|------|
| **报告膨胀** | 中 | 多数跑的 cross_refs 可能只有 1-3 条，加 2-3 个小节可能导致报告"为了有内容而有内容" |
| **用户噪音** | 低 | 如果 feedback 信号质量不高（如总是同一类调整），用户会逐渐忽略 |
| **实现复杂度** | 低 | 纯模板渲染，不涉及新逻辑 |

#### 收益

| 收益 | 等级 | 说明 |
|------|:--:|------|
| **闭环** | 高 | feedback 从"存档文件"变成"用户可见信号"，P3.2 整条链路有终点 |
| **决策可追溯** | 高 | 用户看到 Ch6 建议时，能追溯到 Ch2.7 的跨资产一致性信号 |
| **低风险** | 高 | 确定性渲染，不引入 LLM，可机校验 |
| **渐进式** | 中 | 先让 report 消费 feedback，后续如果加 LLM coherence check，其产物可同样方式入 report |

#### 前置依赖

- `validate-feedback.cjs` 通过（已有）
- `report/schema.json` 扩展（小改动）
- `validate-report.cjs` 扩展检查 Ch2.7（小改动）
- report 组装 prompt 更新（在 report/index.md 或 SKILL.md 中加指令）

---

## 比较矩阵

| 维度 | Path A: LLM Coherence | Path B: Report Visibility |
|------|:--:|:--:|
| 实现工作量 | 中（新脚本 + 新 validator + prompt 工程） | 小（模板扩展 + schema 扩展） |
| 引入风险 | 高（LLM 幻觉 + 不可复现） | 低（确定性渲染） |
| 可验证性 | 低（需人工审查 LLM 输出） | 高（机校验） |
| 用户价值 | 间接（改善规则质量） | 直接（报告可读性 + 决策追溯） |
| 对管道延迟的影响 | +5-15s | 0（读文件渲染） |
| 依赖历史数据积累 | 是（需要多轮跑才能判断 LLM 质量） | 否（立即可用） |
| 是否产生新 artifact | 是（coherence.json） | 否（融入现有 report.md） |
| 回滚难度 | 低（删除脚本即可） | 低（去掉模板小节即可） |

---

## 建议

### 推荐: Path B 先做，Path A 观察后决定

**理由**:

1. **闭环优先** — P3.2-A 花了大量精力保证 feedback.json 的正确性和安全性，但它是"断头路"。先让 report 消费 feedback，P3.2 整条链路才有意义。

2. **低风险高回报** — Path B 是纯模板渲染，和现有 report 组装方式一致，不引入新失败模式。用户价值直接：看到跨资产一致性信号，决策更有依据。

3. **Path A 需要积累** — LLM coherence check 需要多轮历史跑的 feedback 积累，才能区分"真问题"和"LLM 噪声"。现在只有 1 次跑的 feedback.json（2 条 cross_refs），不够判断 LLM 质量。

4. **渐进式** — Path B 做完后，report 里已经有了 cross-blueprint 一致性的位置。如果将来 Path A 产出 coherence.json，它可以自然地融入同一个 report 小节，不需要再改 report schema。

### Path A 的触发条件（延后评估）

当以下条件满足时，重新评估 Path A：

- P3.2-A 至少跑了 10 轮，积累了 10+ 份 feedback.json
- 人工审查了这些 feedback 的 cross_refs 质量，确认 A-layer 规则覆盖了大部分常见矛盾
- 如果审查中发现 A-layer 反复遗漏某类矛盾 → 先加规则到 A-layer
- 如果加规则后仍有"难以规则化的边缘案例" → Path A 有价值

### 如果非要现在做 Path A

最小可行版本（MVP）：

- **不做通用 coherence check**，只做 **R4 补充检测**
- 具体：LLM 只检查"有没有跨 blueprint 的矛盾 R4 没覆盖"
- 输出限制为 3 条 finding，每条 ≤100 字
- 不做 rule suggestion（那是开发者的工作，不是 LLM 的）
- 人工审查 5 轮后再决定是否保留

---

## 实现计划 (Path B)

| # | 文件 | 内容 | 工作量 |
|---|------|------|--------|
| 1 | `report/sections/2.7-cross-blueprint.md` | 新建 Ch2.7 模板 — 跨资产一致性表 + 一致性评估 | 小 |
| 2 | `report/sections/6.6-feedback-signals.md` | 新建 Ch6.6 模板 — 反馈信号参考 | 小 |
| 3 | `report/schema.json` | 新增 2.7 + 6.6 section 定义 | 小 |
| 4 | `report/index.md` | 组装流程增加 feedback.json 读取 + Ch2.7/Ch6.6 渲染 | 小 |
| 5 | `validate-report.cjs` | 扩展检查 Ch2.7 存在性（有 feedback 时 required） | 小 |
| 6 | `SKILL.md` | Stage 5 文件索引增加 feedback.json | 小 |

**不含**: LLM coherence check（→ 延后评估）、Ch5 持仓反馈映射（→ 依赖 portfolio 数据可用时才有效，先做 Ch2.7 + Ch6.6 即可）

---

## 验收标准 (Path B)

| # | 标准 | 验证方式 |
|---|------|---------|
| AC1 | 有 feedback.json 时 report.md 包含 Ch2.7 | validate-report |
| AC2 | Ch2.7 的 cross_refs 数量与 feedback.json 一致 | 手动核对 |
| AC3 | 无 feedback.json 时 Ch2.7 不出现（不报错） | 老 run 回归 |
| AC4 | feedback.json 有 0 条 cross_refs 时 Ch2.7 输出"本轮无跨资产一致性信号" | 边界测试 |
| AC5 | Ch6.6 的 feedback 信号与 Ch6.2 的操作建议不矛盾 | 手动审查 |
| AC6 | validate-report 在 Ch2.7 缺失（但有 feedback）时报错 | 手动触发 |
| AC7 | consistency checker §5 仍然通过 | 端到端 |

---

## 待讨论

1. **Ch2.7 位置**: 放在 Ch2（市场风向）末尾还是 Ch6（决策）里？建议 Ch2.7——跨资产一致性是"观测"不是"建议"，放在市场风向章节更合适。

2. **Ch6.6 要不要**: 如果 Ch2.7 已经展示了所有 cross_refs，Ch6.6 是否冗余？建议保留但精简——Ch6.6 只列"对决策有直接影响的 feedback 信号"（如 add_condition_to_act），不重复列全部的。

3. **Ch5 持仓映射**: 延后到 portfolio 数据稳定后再做。当前 feedback 的 cross_refs 只到 blueprint 级别，不直接到基金级别。映射需要额外逻辑。
