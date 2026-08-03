# P4-A: Indicator Normalization Contract + Unit Drift Validator

**状态**: 已修正（循缅因猫审查意见） | **版本**: 1.1.0 | **日期**: 2026-07-14 | **作者**: 宪宪/砚砚

## 背景

本轮 G7/SPDR 单位漂移问题（基线 iFinD 返回"吨"但标注"oz"，当前返回"oz"标注"oz"）暴露了一个基础设施缺口：当前系统中指标单位是隐式的——它来自原始数据源的返回值，没有任何规范化层。`build-temporal-diff.cjs` 中 G7 写死为 `unit: '吨'`，当基线数据以不同单位存储时产生量纲级错误。

砚砚的止血修复（`normalizeG7()` in `build-temporal-diff.cjs`）在语义上正确，但它是 G7 专项逻辑——下次如果是 G6（央行储备）或 M5（货基AUM）发生口径漂移，同样的 bug 会再次出现。

## 目标

将单位归一化从"指标级专项 fallback"升级为"跨指标通用 contract"，让任何指标的跨轮口径漂移都能被自动检测、归一化、告警。

## 审查修正（v1.1.0 缅因猫 review）

| # | 原方案 | 修正 |
|---|--------|------|
| 1 | evidence-packet 也调 normalize() 覆盖 raw 值 | evidence-packet 不改值，只附加 unit_normalization_notes |
| 2 | validator 放 validate-report 或独立文件 | 放 validate-run-consistency.cjs §6 |
| 3 | 初始 config 含 G6/M5 | 第一版只配 G7（只配已出过事故的） |
| 4 | normalize 返回结构太薄 | 补 rawValue/rawUnit/detectedUnit/canonicalUnit/ruleId |

## 设计方案

### 三层架构

```
config/indicator-units.json     ← canonical unit definitions (真相源, 初始只含 G7)
lib/unit-normalizer.cjs         ← shared normalization engine
  ├── build-temporal-diff.cjs   ← 唯一强消费点：delta 用 canonical value 算
  ├── build-evidence-packet.cjs ← 只附加 unit_normalization_notes，不改 value/unit
  └── validate-run-consistency.cjs §6 ← 单位漂移检测
```

### Layer 1: `config/indicator-units.json`

第一版只含 G7（唯一出过事故的指标）。

```json
{
  "version": "1.0.0",
  "description": "Canonical unit definitions for indicators with known cross-run unit drift.",
  "indicators": {
    "G7": {
      "name": "SPDR持仓",
      "canonicalUnit": "吨",
      "ranges": [
        { "id": "tons", "min": 0, "max": 10000, "unit": "吨" },
        { "id": "oz", "min": 1000000, "max": 100000000, "unit": "oz" }
      ],
      "toCanonical": {
        "oz": { "operation": "divide", "factor": 32150.7467 }
      }
    }
  }
}
```

**字段说明**:
- `ranges[].id` — range 标识，用于 normalize 返回值中的 `ruleId`
- `toCanonical[].operation` — `"divide"` 或 `"multiply"`
- 不在 config 中的指标：不做归一化，行为不变

### Layer 2: `lib/unit-normalizer.cjs`

```js
// normalize(indicatorId, entry) → {
//   value: number,           // normalized value (or original if not configured/no match)
//   unit: string,            // canonical unit (or original)
//   rawValue: number,        // original value (for audit)
//   rawUnit: string,         // original source unit (for audit)
//   detectedUnit: string,    // detected unit from range matching (or null if no config)
//   canonicalUnit: string,   // target canonical unit (or null if no config)
//   normalized: boolean,     // true if conversion was applied
//   ruleId: string|null,     // which range rule matched (e.g. "oz")
//   warning: string|null     // human-readable warning for temporal-diff / validator
// }
```

### Layer 3: Validator

集成到 `validate-run-consistency.cjs §6 Unit Consistency`：

1. **Configured indicator raw value check**: config 中的指标，raw value 是否落在已知 range（未知 → warning）
2. **Temporal-diff normalization check**: temporal-diff 中 normalized indicators 是否有对应 warning 记录
3. **Cross-run unit consistency**: 如 temporal-diff 中同一指标 baseline vs current 的 detectedUnit 不同 → warning（已归一化则只记 info）

### 消费边界（关键修正）

| 消费点 | 行为 | 原因 |
|--------|------|------|
| `build-temporal-diff.cjs` | **强归一化** — delta 用 canonical value 计算 | 这是唯一需要归一化值的场景（跨期比较） |
| `build-evidence-packet.cjs` | **只加 notes** — 不改 evidence[].value/unit，附加 `unit_normalization_notes` 到 meta | 保留 raw→evidence 的可追溯性，B-layer 可看到"此指标跨期需注意口径" |
| `build-feedback.cjs` | 无变更 — 自动消费归一化后的 temporal-diff | — |
| report.md | 无代码变更 | — |

## 迁移路径

1. 创建 `config/indicator-units.json`（只含 G7）
2. 创建 `lib/unit-normalizer.cjs`
3. 修改 `build-temporal-diff.cjs`：移除 `normalizeG7()`，改为调 `normalize()`
4. 修改 `build-evidence-packet.cjs`：对 config 中的指标附加 `unit_normalization_notes`
5. 扩展 `validate-run-consistency.cjs §6`
6. 回归验证：用本轮 run 重建全链路，确认 G7 归一化行为不变

## 不做什么（P4-A 范围外）

- 不在 collector 层归一化（raw.json 保持原始数据）
- 不做自动单位推断（不靠启发式猜，必须显式配 range）
- 不配 G6/M5（未出过事故，不把未验证假设写进 contract）
- 不做报告结构检查（那是 validate-report 的职责）

## normalize() 返回结构（审计友好）

```js
// 正常情况（已归一化）
{ value: 1002.46, unit: "吨", rawValue: 32229732.15, rawUnit: "oz",
  detectedUnit: "oz", canonicalUnit: "吨", normalized: true,
  ruleId: "oz", warning: "G7: 单位归一化 oz→吨 — iFinD 跨轮口径漂移" }

// 正常情况（无需归一化）
{ value: 1002.51, unit: "吨", rawValue: 1002.508, rawUnit: "oz",
  detectedUnit: "吨", canonicalUnit: "吨", normalized: false,
  ruleId: "tons", warning: null }

// 未配置的指标
{ value: 4.62, unit: "%", rawValue: 4.62, rawUnit: "%",
  detectedUnit: null, canonicalUnit: null, normalized: false,
  ruleId: null, warning: null }
```
