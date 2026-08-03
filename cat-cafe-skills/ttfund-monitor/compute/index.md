# Module: Calculator
# Role: Stage 3 Orchestrator

## Purpose

从 raw-snapshot 读取分量值，执行派生计算，写入 derived-snapshot（派生项数量以 `compute/formulas.md` 为准）。

## Input

- `{runtimeRoot}/runs/{runId}/raw-snapshot.md`

## Output

- `{runtimeRoot}/runs/{runId}/derived-snapshot.md`

## Protocol

1. 验证 raw-snapshot 存在且可读（否则 fatal-stop）
2. 读 `compute/formulas.md` → 获取所有公式项
3. 逐项计算：
   - 分量齐全且全 fresh → 计算并标记 `freshDerived`
   - 分量齐全但含 stale → 计算并标记 `⚠️ staleDerived`（分量日期写入备注）
   - 分量 null → derived 标 "🔴 缺口: {missingComponent}" → 标记 `missingDerived`
4. 写入 derived-snapshot.md，末尾汇总：
   - 派生覆盖：freshDerived:{n} staleDerived:{n} missingDerived:{n}

## Invariants

- 不修改 raw-snapshot
- 不做判断（那是 decision-engine 的事）
- 不使用上下文记忆中的数值
