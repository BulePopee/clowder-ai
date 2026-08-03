---
feature_ids: [F-GameEstimator]
topics: [regime-router, temporal-features, feature-engineering, model-limitation]
doc_kind: research-note
created: 2026-06-05
authored_by: "@ragdoll-vzes"
reviewed_by: "@cat-g7k98t5f"
status: exploration-concluded
---

# Phase 2-D: 时序特征探索与建模边界

## What

基于砚砚的建议，补充了 7 个时序特征到特征空间，完成了 tier 250 cold 的样本剖面分析。验证了时序特征的判别价值，但也确认了当前"手工阈值 + boost"建模范式已达承载上限。

### 新增时序特征

```js
// buildFeatures() 新增
firstRevealRound        // 首次披露轮次
noRevealUntilR2         // R1 零披露且 R2 开始披露
revealedCountDelta      // R2-R1 披露数量增量
revealedValueDelta      // R2-R1 披露价值增量
purpleUpDelta           // R2-R1 高品质披露增量
firstPurpleRound        // 首次紫及以上披露轮次
firstTopRound           // 首次顶级披露轮次
```

### Tier 250 Cold 三组样本对比

| 特征 | Cold **正确识别** | Cold **误判→Normal** | Normal **正确识别** |
|------|----------------|---------------------|------------------|
| R1 零披露率 | **60.0%** | 40.0% | 40.0% |
| firstRevealRound | **2.0** (延迟) | 0.0 (早期) | 0.0 (早期) |
| revealedValueDelta (R2-R1) | **8830** | 0 | 2972 |
| noRevealUntilR2 | **60.0%** | 40.0% | 40.0% |

## Why

**核心发现**：

1. **真正的 cold 呈现"延迟披露"模式**：
   - R1 零披露（60%）
   - R2 开始有显著披露（中位数 8830）
   - firstRevealRound = 2.0

2. **误判的 cold 呈现"超级安静"模式**：
   - R1 和 R2 都几乎没有披露（delta=0）
   - 这类样本更像 normal 的低活跃子集，不是典型 cold

3. **Normal 介于两者之间**：
   - R1 可能有披露（60% 有披露）
   - R2 增量中等（2972）

**时序特征确实有增量信息，但判别边界与现有静态特征存在强交互**。

## Tradeoff

尝试了两种新特征建模：

| 特征 | 实现方式 | Tier 250 Cold | Tier 250 Normal | 结论 |
|------|---------|--------------|----------------|------|
| **lowR2DeltaBoost** | `revealedValueDelta === 0, +1 分` | 41.7% → 41.7% | 60.0% → 48.6% | 无提升，误伤 normal |
| **delayedRevealBoost** | `noRevealUntilR2 && revealedValueDelta > 0, +2 分` | 41.7% → 58.3% ✅ | 60.0% → 31.4% ❌ | 提升 cold 但严重误伤 normal |

**根本问题**：
- `revealedValueDelta=0` 不是 cold 的主特征，而是 cold 内部的"超级安静子型"
- `delayedReveal` 是有效方向，但需要与 `itemCount / revealedStaticRatio / topRatio` 联合判断，不是单变量规则

## Open Questions

1. **为什么不能用更复杂的组合规则**：
   - 手工阈值已经有 3 层（cold/normal/hot 各 6-8 个条件），再叠加时序特征会导致规则爆炸
   - Normal 和 cold 的边界在时序维度上高度依赖 static 特征的取值（如 itemCount < 30 时 delta=0 是 cold，但 itemCount > 35 时 delta=0 可能是 normal）

2. **为什么时序特征有信息但无法稳定吸收**：
   - 当前建模范式是"加法器"：每个特征独立贡献分数，最后求和
   - 时序特征的判别力依赖于与静态特征的**交互项**（如 `(itemCount < 30) AND (delta=0)` vs `(itemCount > 35) AND (delta=0)`）
   - 加法器无法表达交互项

3. **下一步应该用什么建模方式**：
   - 最轻量：tier-specific decision tree（3-5 层，scikit-learn 10 行代码）
   - 次选：logistic regression with interaction terms
   - 不推荐：继续堆 boost 规则

## Next

**Phase 2-C 的 zeroRevealBoost 版本已收口，作为第一版可上线模板**：
- Tier 250 cold: 41.7% / normal: 60.0% / hot: 58.3%
- 总体准确率：cold 52.8% / normal 69.0% / hot 47.2%

**不建议继续做**：
- 不要再手工调更多 boost 规则
- 不要把时序特征强行塞进当前加法器框架

**建议下一步**（如需优化）：
1. 换建模范式：用 tier-specific decision tree 或 logistic regression
2. 或者直接接入真实估值器，验证当前版本的实际收益
3. 如果实际收益已够用，Phase 2 收口

## 验收

- ✅ 补充了 7 个时序特征到特征空间
- ✅ 完成了 tier 250 cold 的三组样本对比（正确/误判/normal）
- ✅ 验证了时序特征的判别价值（firstRevealRound / revealedValueDelta 有区分度）
- ✅ 确认了当前建模范式的承载上限（无法稳定吸收时序特征的交互效应）
- ✅ 给出明确的下一步建议（换建模范式 或 收口）
- ✅ 砚砚审查放行

**结论**：

> 新增时序特征已证明存在增量信息，但其判别边界与现有静态特征存在强交互，无法用单条阈值规则稳定吸收；继续优化应转向轻量监督模型，而非继续扩展模板路由规则。

---

[宪宪/Opus-4.7🐾] · [砚砚/gpt-5.4 reviewer 🐾]
