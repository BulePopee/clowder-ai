# Module: Report Renderer
# Role: Stage 4 Orchestrator

## Purpose

从两份 snapshot 组装 0-8 章报告（含 0.5 置信度前置章）。所有数值从 snapshot 读取，不做任何数据采集。

## Input

- `{runtimeRoot}/runs/{runId}/raw-snapshot.md`
- `{runtimeRoot}/runs/{runId}/derived-snapshot.md`
- `{runtimeRoot}/runs/{runId}/portfolio-snapshot.md`（第 5 章，由 `portfolio/` 模块产出）
- `{runtimeRoot}/runs/{runId}/feedback.json`（P3.2-B: Ch2.7 + Ch6.6 消费，缺失则跳过）

## Output

- `{runtimeRoot}/runs/{runId}/report.md`

## Success Criteria

1. report.md 写入完成
2. raw-snapshot.md 可读
3. derived-snapshot.md 可读或明确标 degraded
4. provenance.md 存在
5. report.md 首行包含 runId

全部满足后 → 更新 `{runtimeRoot}/current.md`
更新方式：先写 `current.tmp.md`，再替换 `current.md`

## Protocol

0. (前置，可选) 运行 `node portfolio/collect.cjs --runId {runId}` 采集账户数据，如已有 `portfolio-snapshot.md` 且采集时间在报告窗口内则跳过
1. 验证 snapshot:
   - `raw-snapshot.md` + `derived-snapshot.md` 必须存在且可读（否则 fatal-stop）
   - `portfolio-snapshot.md` 存在 → 第 5 章正常输出；缺失 → 第 5 章降级为 degraded，当前持仓/收益/交易全部标 gap，memory 仅用于静态配置参考（基金分组、再平衡规则、投资习惯），标注 "⚠️ portfolio-snapshot 缺失，持仓/收益/交易数据不可用；以下仅基于 memory 静态配置 + macro snapshot 做影响推演"
2. 读 `data/indicator-catalog.md` → 获取单指标阈值
3. 读 `report/decision-engine.md` → 获取组合条件逻辑
4. 按章节顺序执行：
   - 读 `sections/0-status.md` + snapshot → 第 0 章
   - 计算缺口 → 读 `sections/0_5-confidence.md` → 第 0.5 章
   - 读 `sections/0_6-quality-brief.md` + snapshot + provenance → 第 0.6 章
   - 读 `sections/1-indicators.md` + catalog + snapshot → 第 1 章
   - 读 `decision-engine.md` + `sections/2-regime.md` + snapshot → 第 2 章
   - 读 `sections/2.7-cross-blueprint.md` + `feedback.json` → 第 2.7 章（feedback.json 缺失或 cross_refs 为空时按降级输出）
   - 读 `sections/3-gold.md` + `decision-engine.md` + snapshot → 第 3 章
   - 读 `sections/4-macro.md` + snapshot → 第 4 章
   - 读 `sections/5-holdings.md` + `portfolio-snapshot.md` + snapshot + memory(user_investment.md) → 第 5 章
   - 读 `sections/6-decision.md` + snapshot → 第 6 章
   - 读 `sections/6.6-feedback-signals.md` + `feedback.json` → 第 6.6 章（feedback.json 缺失或无决策相关信号时按降级输出）
   - 读 `sections/7-gaps.md` + snapshot → 第 7 章
   - 读 `sections/8-improvements.md` → 第 8 章 (可选)
5. 写入 report.md
6. 验证 success criteria → 更新 current.md

## Hard Constraints

- 报告阶段不得调用任何数据源
- 不得修改 snapshot
- 不得使用上下文记忆中的实时数值。第 5 章持仓/收益/交易数据优先从 `portfolio-snapshot.md` 读取，`user_investment.md` memory 仅做静态配置交叉参考；缺失则标 gap
- 所有数值必须标来源（格式见 `source-labeling.md`）
- 规则文件禁止写回运行结果（decision-engine.md 不写"当前判断"）
- **叙事可溯源**：报告中出现的宏观事件叙事（美联储换帅、地缘停战/冲突、油价历史走势、央行政策变动等）必须可追溯到 raw-snapshot 中的具体行或 provenance 中的 WebSearch event。若叙事来自临时搜索或上下文知识 → 必须在采集阶段将其写入 raw-snapshot 补充行，来源标 `WebSearch {query}`。禁止报告出现 snapshot 中无对应数据源的强叙事。

## Report Mode Behavior

以下仅适用于全量采集尝试后仍无法获取的 legitimate gap。"待采集/未执行"不是缺口，是 collector incomplete，不应进入报告阶段。

- 非关键缺口 → 报告正常输出，受影响章节标"数据缺口"
- 关键指标缺口 → 第 6 章降级为"数据不足，不给强操作建议"
- 多核心板块缺口 → 全局置信度降为"低"，仅观察不决策
