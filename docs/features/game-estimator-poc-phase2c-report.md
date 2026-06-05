---
feature_ids: [F-GameEstimator]
topics: [regime-router, tier-template, feature-engineering, validation-result]
doc_kind: research-note
created: 2026-06-05
authored_by: "@ragdoll-vzes"
reviewed_by: "@cat-g7k98t5f"
status: completed-v1
---

# Phase 2-C: Tier × Regime 路由器 第一版可上线模板

## What

基于 211 局真实历史对局数据，建立了按 tier 分档的三类（cold/normal/hot）路由器，并完成了 tier 250 cold 的特征搜证与验收。

### 第一版可上线规则表

```js
const ROUTING_RULES = {
  100: {
    cold: { maxItemCount: 24, minRevealedStaticRatio: 0.10, maxPurpleUpRatio: 0.0, score: 3 },
    normal: { minItemCount: 21, maxItemCount: 27, minRevealedStaticRatio: 0.03, maxRevealedStaticRatio: 0.10, maxPurpleUpRatio: 0.0, score: 4 },
    hot: { minItemCount: 28, maxRevealedStaticRatio: 0.08, score: 2 },
  },
  200: {
    cold: { maxItemCount: 29, maxItemDelta: -0.12, maxTopRatio: 0.0, maxAvgRatio: 0.20, score: 3 },
    normal: { minItemCount: 30, maxItemCount: 35, minRevealedStaticRatio: 0.01, maxRevealedStaticRatio: 0.10, maxPurpleUpRatio: 0.25, maxTopRatio: 0.0, score: 4 },
    hot: { minItemCount: 36, minPurpleUpRatio: 0.25, maxRevealedStaticRatio: 0.08, score: 2 },
  },
  250: {
    cold: { maxItemCount: 36, maxItemDelta: -0.05, maxRevealedStaticRatio: 0.05, zeroRevealBoost: true, score: 2 },
    normal: { minItemCount: 34, maxItemCount: 42, minRevealedStaticRatio: 0.01, maxRevealedStaticRatio: 0.10, maxPurpleUpRatio: 0.25, maxTopRatio: 0.20, score: 4 },
    hot: { minItemCount: 38, minPurpleUpRatio: 0.25, minTopRatio: 0.25, score: 2 },
  },
};
```

### 各 tier 的最终命中率

| Tier | Cold | Normal | Hot |
|------|------|--------|-----|
| 100 | 38.5% | 71.4% | 46.2% |
| 200 | 81.8% | 76.7% | 36.4% |
| 250 | **41.7%** | 60.0% | 58.3% |

## Why

### tier 250 cold 的特殊性

Tier 250 的 cold 样本在 `itemCount / revealedStaticRatio / avgRatio / purpleUpRatio / topRatio` 五个标准特征上与 normal 样本高度重叠，单纯调阈值无法分离。经过样本级剖面发现：

- **被误判的 8 个 cold**：62.5% R1 零披露（revealedCount=0）
- **正确识别的 normal**：40.0% R1 零披露
- 差异 22.5 个百分点，构成有意义的判别信号

引入 `zeroRevealBoost: true` 后：
- Tier 250 cold 召回从 16.7% 提升到 **41.7%**（+25.0%）
- Tier 250 normal precision 从 71.4% 降到 60.0%（-11.4%，可接受）

### 为什么这是有意义的特征

`zeroRevealBoost` 不是"零披露=冷局"的简单等式，而是有限语义：

> **在 tier 250、浅仓/偏浅仓背景下，R1 零披露是 cold 的增强证据**

逻辑解释：
- Tier 250 是 `itemCount` 偏中等的档位
- 真正的浅仓 cold 通常物品少 → R1 系统随机披露概率低 → 零披露
- 而 normal 局物品多 → R1 至少披露 1-2 件的概率高

## Tradeoff

| 决策 | 利 | 弊 |
|------|-----|-----|
| 加入 `zeroRevealBoost` 到 tier 250 cold | cold 召回 16.7% → 41.7% | normal precision 71.4% → 60.0% |
| 保留 tier 100/200 现有规则 | 已经在合理区间 | 100 的 cold 仍偏低（38.5%） |
| 不引入新特征到 tier 100/200 | 避免过拟合到 tier 250 模式 | 错过潜在增益 |

## Open Questions

1. **Tier 100 cold 的 38.5% 召回**：可能也存在类似 tier 250 的特征不可分问题，但本轮未深挖。
2. **Tier 200 hot 的 36.4% 召回**：上一轮已经放宽过阈值，仍然偏低，可能也需要新特征。
3. **`zeroRevealBoost` 是否能跨 tier 推广**：理论上 tier 100/200 也可能受益，但本轮未测试。
4. **tier 150 样本不足**：长期看需要补数据或合并到相邻 tier。

## Next

1. **当前规则已收口，可作为第一版可上线模板**
2. 如需进一步优化，按优先级：
   - Tier 100 cold 样本剖面（参考 tier 250 的方法）
   - Tier 200 hot 新特征搜证
   - `zeroRevealBoost` 跨 tier 验证
3. 实际接入估值器时，需在线验证：
   - R1 披露数据采集链路（小捷的 collector）
   - 特征计算延迟（应 < 100ms）

## 验收

- ✅ 完成 211 局历史数据的特征空间映射
- ✅ 建立了按 tier 分档的三类路由器
- ✅ 通过样本级剖面找到 tier 250 cold 的新有效特征（`revealedCount === 0`）
- ✅ Trade-off 明确，第一版可上线模板已固定
- ✅ 砚砚审查放行（评价："不是又一个阈值巧合，而是完成了我之前要求的那条验收线"）

---

[宪宪/Opus-4.7🐾] · [砚砚/gpt-5.4 reviewer 🐾]
