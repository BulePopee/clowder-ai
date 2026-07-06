# Module: Report Renderer
# Role: Stage 5 Orchestrator

> **入口**: 日常通过 `pipeline/run.cjs --from report` 运行一致性校验。Report 内容由 LLM 按本文件组装。

## Purpose

从 snapshot + Reason 产物组装 0-8 章报告（含 0.5 置信度前置章）。所有数值从 snapshot 读取，所有判断从 Reason 阶段引用，不做任何数据采集或独立判断。

## Input

- `{runtimeRoot}/runs/{runId}/raw-snapshot.md`
- `{runtimeRoot}/runs/{runId}/derived-snapshot.md`
- `{runtimeRoot}/runs/{runId}/portfolio-snapshot.md`（第 5 章，由 `portfolio/` 模块产出）
- `{runtimeRoot}/runs/{runId}/evidence-packet.json`（Guard 结果 + 证据标注，由 Stage 4 Reason A-layer 产出）
- `{runtimeRoot}/runs/{runId}/reasoning-snapshot.json`（宏观/黄金/组合推理，由 Stage 4 Reason B-layer 产出）

## Output

- `{runtimeRoot}/runs/{runId}/report.md`
- Contract: `report/schema.json` (structural contract — section presence, content markers, blocker semantics, source labeling)

## Success Criteria

1. report.md 写入完成
2. raw-snapshot.md 可读
3. derived-snapshot.md 可读或明确标 degraded
4. provenance.md 存在
5. report.md 首行包含 runId

全部满足后 → 更新 `{runtimeRoot}/current.md`
更新方式：先写 `current.tmp.md`，再替换 `current.md`

## Protocol

0. (前置，硬步骤) 如 `portfolio-snapshot.md` 不存在或过期，必须运行 `portfolio/collect.cjs`。缺失进入 Report → G001 blocker → 第5-6章只能输出"无法给出行动建议"
1. 验证输入:
   - `raw-snapshot.md` + `derived-snapshot.md` 必须存在且可读（否则 fatal-stop）
   - `evidence-packet.json` + `reasoning-snapshot.json` 必须存在（否则 fatal-stop — Reason 未完成）
   - `portfolio-snapshot.md` 存在 → 第 5 章正常输出；缺失 → G001 blocker → 第5-6章只能输出"无法给出行动建议"，禁止 HOLD 或调仓建议
2. 读 `data/indicator-catalog.md` → 获取单指标阈值
3. 读 `report/decision-engine.md` → 获取组合条件逻辑
4. 按章节顺序执行：
   - 读 `sections/0-status.md` + evidence-packet → 第 0 章（Guard 结果从 evidence-packet 取，不独立判断）
   - 计算缺口 → 读 `sections/0_5-confidence.md` → 第 0.5 章
   - 读 `sections/0_6-quality-brief.md` + snapshot + provenance → 第 0.6 章
   - 读 `sections/1-indicators.md` + catalog + snapshot → 第 1 章
   - 读 `decision-engine.md` + `sections/2-regime.md` + snapshot + reasoning(macro_regime) → 第 2 章
   - 读 `sections/3-gold.md` + `decision-engine.md` + snapshot + reasoning(gold_rate_conflict) → 第 3 章
   - 读 `sections/4-macro.md` + snapshot → 第 4 章
   - 读 `sections/5-holdings.md` + `portfolio-snapshot.md` + snapshot + reasoning(portfolio_action_gate) + memory(user_investment.md 仅静态配置) → 第 5 章
   - 读 `sections/6-decision.md` + reasoning(全部 3 blueprints) + evidence-packet(guard) → 第 6 章
   - 读 `sections/7-gaps.md` + evidence-packet(gaps) → 第 7 章
   - 读 `sections/8-improvements.md` → 第 8 章 (可选)
5. 写入 report.md
6. 运行 `node report/validate-report.cjs --runId {runId}` 验证报告结构完整性
7. 运行 `node validate-run-consistency.cjs --runId {runId}` 验证产物链一致性
8. 验证 success criteria → 更新 current.md

## Hard Constraints

- 报告阶段不得调用任何数据源
- 不得修改任何 snapshot 或 Reason 产物
- 第5-6章判断必须从 `evidence-packet.json`(guard) + `reasoning-snapshot.json`(macro/gold/portfolio) 引用，不得自由发挥新判断
- 所有数值必须标来源（格式见 `source-labeling.md`）
- 规则文件禁止写回运行结果（decision-engine.md 不写"当前判断"）
- **blocker 语义**：存在 guard blocker 时第6章必须输出"无法给出行动建议"，严禁输出 HOLD 作为组合建议
- **叙事可溯源**：报告中出现的宏观事件叙事必须可追溯到 raw-snapshot 中的具体行或 provenance 中的 WebSearch event

## Report Mode Behavior

以下仅适用于全量采集尝试后仍无法获取的 legitimate gap。"待采集/未执行"不是缺口，是 collector incomplete，不应进入报告阶段。

- 非关键缺口 → 报告正常输出，受影响章节标"数据缺口"
- 关键指标缺口/blocker → 第 6 章输出"无法给出行动建议"（非"数据不足"弱化表述）
- 多核心板块缺口 → 全局置信度降为"低"，仅观察不决策
