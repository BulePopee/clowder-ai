# Reasoning Stage — ttfund-monitor v2.5.0

## 概述

Reason stage 是 Compute 和 Report 之间的独立推理层。它不访问任何外部数据源，只消费上游快照，产出可审计的结构化推理产物。

## 架构

```
                 ┌──────────────────────────┐
                 │  A-layer: deterministic   │
  snapshots ──▶  │  build-evidence-packet   │──▶ evidence-packet.json
                 │  + guard-rules 检查       │
                 └──────────────────────────┘
                            │
                            ▼
                 ┌──────────────────────────┐
                 │  B-layer: LLM renderer    │
                 │  per blueprint 推理       │──▶ reasoning-snapshot.json
                 │  (对猫/模型执行)          │
                 └──────────────────────────┘
                            │
                            ▼
                      Report stage
                   (第5章引用 Reason 输出)
```

**A-layer** 是确定性脚本 `build-evidence-packet.cjs`：
- 读取 raw / derived / portfolio / provenance / gaps 五份快照
- 为每条指标标注 source、freshness、asOf、criticality
- 运行 `guard-rules.json` 的静态规则，产出 blockers / warnings / infos 三级结果
- 输出 `evidence-packet.json` — B-layer LLM 的唯一输入

**B-layer** 是 LLM 渲染器，按 blueprint 模板执行结构化推理：
- 输入：`evidence-packet.json`
- 引导：对应 blueprint 的 Mermaid 流程图 + 分步模板
- 输出：`reasoning-snapshot.json`（结构化 JSON）+ `reasoning-snapshot.md`（人类可读）

## 蓝图

| 蓝图 | 文件 | 触发 | 输出 |
|------|------|------|------|
| 宏观象限 | `macro-regime.md` | 每次运行 | regime + confidence |
| 黄金/利率矛盾 | `gold-rate-conflict.md` | 每次运行 | gold assessment + scenarios |
| 组合行动门禁 | `portfolio-action-gate.md` | 每次运行 | action recommendation + veto |

## Guard Rules

`guard-rules.json` 定义三级规则：

- **blocker**: 禁止生成行动建议。触发时 Reason 只能输出"无法给出行动建议，需人工确认"。
  - G001: 持仓数据缺失
  - G002: 核心指标 staleGap
  - G003: 货币基金当现金
  - G004: 回测收益当真实
  - G005: 单一指标触发交易
  - G006: memory 推断当前持仓
  - G007: 新闻代替指标源

- **warning**: 允许输出但降置信度。
  - G008: 辅助指标 staleGap
  - G009: 组合数据部分缺失
  - G010: 使用非主数据源

- **info**: 仅标注，不影响结论。
  - G011: 周末正常滞后
  - G012: 数据源口径差异

## 验收标准 (V1)

1. Reason stage 不访问任何外部数据源 — 只读 snapshot / provenance / gaps
2. `evidence-packet.json` 每条证据包含 source / freshness / asOf / criticality
3. blocker 存在时，Report 只能输出"无法给出行动建议/需人工确认"
4. 第 5 章组合动作只引用 `portfolio-snapshot`，不引用 memory

## 使用

```bash
# 运行 A-layer
node reasoning/build-evidence-packet.cjs --runId 20260630-1412-ragdoll-vzes

# B-layer 由 LLM 执行 — 加载 blueprint + evidence-packet.json → 输出 reasoning-snapshot.json
```
