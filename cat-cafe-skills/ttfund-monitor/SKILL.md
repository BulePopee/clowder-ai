---
name: ttfund-monitor
description: 天天基金实盘宏观监测——50项指标4层数据源+5阶段管道(含Reason推理层)，输出9章标准化报告
version: 2.7.0
---

# ttfund-monitor

## 触发条件

- **监测报告**: "跑监测报告" / "/ttfund-monitor" / "出监测报告" → 启动监测管道
- **源探测**: "跑探测" / "probe sources" / "探测数据源" → 启动源探测管道
- **不包括**: "看下大盘" "今天要不要动" 等模糊表述 → 仅口头回答

## 前置

启动前必须:
1. 版本校验：
   - 当前加载的 SKILL.md version 必须等于 VERSION.md version
   - 若当前路径位于 deployTarget，须确认 deployTarget 与 sourceRoot 的 VERSION.md version 一致
   - 不一致 → STOP，提示先同步 skill，不得继续监测
2. 运行前置探针脚本（MANDATORY — 禁止手写判断）：
   ```bash
   node .claude/skills/ttfund-monitor/collector/probe-sources.cjs
   ```
   - 脚本自动探测 ttfund / iFinD / Wind 的安装路径、CLI 存在性、轻量 probe
   - 输出每工具精确状态（`available / path_missing / cli_missing / probe_failed / not_installed`）
   - 禁止跳过脚本手写工具状态，禁止把 `path_missing / cli_missing / probe_failed` 概括为”未安装”或”技能没安装”
   - 可用性分级规则（按 runMode）：
     - validation: 核心数据工具任一 unavailable 或 not_installed → fatal，终止
     - report: 核心数据工具全 3 不可用 → fatal，终止；部分不可用 → degraded 继续
     - 核心工具定义: `ttfund / iFinD / Wind`；`mx-data`、`WebSearch` 不纳入计数
   - 可追加 `--json` 获取机器可读输出，用于 provenance 写入

## 监测管道

**统一入口**: `pipeline/run.cjs` 编排全部自动化阶段，遇 LLM 边界自动停并提示下一步。

```bash
node .claude/skills/ttfund-monitor/pipeline/run.cjs --mode report --round routine
node .claude/skills/ttfund-monitor/pipeline/run.cjs --runId 20260701-1017-auto --from evidence
```

各阶段单脚本保留为 debug/补救入口，日常通过 `run.cjs` 调用。管道架构细节见 `modules/pipeline.md`。

### 阶段1: Round
读 `modules/round.md` → 选轮次 → 产出 `roundType`

### 阶段2: Collect & Snapshot
读 `collect/index.md` → 运行 `collector/index.cjs` 自动采集 → **运行 `portfolio/collect.cjs` 采集账户持仓**（硬步骤，不可跳过）→ 执行 WebSearch 补采 → 产出 `{runtimeRoot}/runs/{runId}/raw-snapshot.md` + `portfolio-snapshot.md` + `provenance.md`
- portfolio 采集失败不阻塞 macro 管道，但缺失时 Reason A-layer 触发 G001 blocker → Report 第5-6章只能输出"无法给出行动建议"
- **进入 Reason 前必须检查 `portfolio-snapshot.json/md` 是否存在**：缺失 → 记录 G001 blocker，禁止输出 HOLD/调仓建议

### 阶段3: Compute
读 `compute/index.md` → 派生计算（数量以 `compute/formulas.md` 为准）→ 产出 `{runtimeRoot}/runs/{runId}/derived-snapshot.md`

### 阶段4: Reason
读 `reasoning/README.md` → 运行 `reasoning/build-evidence-packet.cjs`（A-layer）→ 产出 `evidence-packet.json` → 按 `reasoning/blueprints/*.md` 执行 B-layer 推理 → 产出 `reasoning-snapshot.json` + `reasoning-snapshot.md`
- Reason stage 只消费上游快照，不访问任何外部数据源
- A-layer 运行 guard-rules.json 静态检查；blocker 存在时 Report 第6章必须输出 **"无法给出行动建议"**，严禁输出"HOLD"作为组合建议。"HOLD"是有持仓数据后判断"维持当前配置不动"的组合建议，blocker 状态下无持仓数据不能判断组合应不应该 hold

### 阶段5: Report
读 `report/index.md` → 组装0-8章报告（第5-6章引用 Reason 输出，不自由发挥）→ 产出 `{runtimeRoot}/runs/{runId}/report.md` → 更新 `current.md`

管道总览与失败策略: `modules/pipeline.md`

## 源探测管道

1. 运行 `node collector/probe-sources.cjs --json` → 获取所有核心工具精确状态
2. 读 `collect/source-map.md` → 了解所有指标的主源/备选
3. 逐个 adapter 执行轻量查询探测（验证指标获取，不采全量）
4. 更新 `{runtimeRoot}/source-health.md`（追加写入）

## 数据纪律

- 采集路径以 `collect/source-map.md` 为准
- 精确值必须标来源（格式见 `report/source-labeling.md`）
- 禁止: 新闻价格 / ETF代理原始指标 / 回测冒充真实 / ~约数
- 重试/Fallback/禁止源 → `collect/retry-policy.md` + `compute/formulas.md`
- 报告阶段不得调用数据源；所有值取自已完成的 snapshot
- 规则文件不写死数据值；一切当前值在 snapshot

## 文件索引

| 阶段 | 读哪些 |
|------|--------|
| 前置 | `VERSION.md` `modules/pipeline.md` → 运行 `collector/probe-sources.cjs`（产出 `source-probe.json`）→ `config/source-contracts.json` |
| 1-Round | `modules/round.md` |
| 2-Collect | `collect/index.md` → 运行 `collector/index.cjs`（含 P4-C contract enrichment）→ `portfolio/collect.cjs` → `config/indicators.json` + `config/sources.json` → `source-map.md` → `retry-policy.md` → `snapshot-schema.md` → `portfolio/spec.md` → `portfolio/snapshot-schema.md` |
| 2.5-Validate Source | 运行 `collector/validate-source-contract.cjs` → 校验 source whitelist / fallback chain / WebSearch constraints |
| 3-Compute | `compute/index.md` → `formulas.md` |
| 4-Reason | `reasoning/README.md` → 运行 `reasoning/build-evidence-packet.cjs` → `reasoning/schema.json` → `reasoning/blueprints/*.md` → `reasoning/guard-rules.json` |
| 5-Report | `report/index.md` → `sections/*.md` → `report/schema.json` → `decision-engine.md` → `data/indicator-catalog.md` → `feedback.json` |
