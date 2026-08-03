---
title: 期货价格区间方法对比 — 成熟案例分析
created: 2026-07-31
feature_ids: []
doc_kind: technical-research
topics: [futures-radar, price-interval, ATR, volatility-cone, trading-strategy]
---

# 期货价格区间方法对比 — 成熟案例分析

> **调研目标**: 对比现成的成熟案例，为 futures-radar 选择最适合的价格区间计算方法  
> **调研日期**: 2026-07-31  
> **调研猫**: 布偶猫 @ragdoll-vzes

---

## 一、两大主流方法

### 1.1 ATR 通道法（基于真实波动幅度）

**核心逻辑**: 使用 Average True Range (ATR) 作为价格波动的度量单位，构建动态通道。

**公式**:
```
上轨 = close + k × ATR(n)
下轨 = close - k × ATR(n)
```

其中：
- `ATR(n)` = n 日平均真实波动幅度（Welles Wilder 1978）
- `k` = 倍数系数（通常 1.5-3）

**置信度映射**:
- **1×ATR**: 约 68% 置信区间（对应 1σ）
- **2×ATR**: 约 95% 置信区间（对应 2σ）
- **3×ATR**: 约 99.7% 置信区间（对应 3σ）

> ⚠️ **重要**: ATR 本身不假设分布，这些置信度是经验类比。真实市场有厚尾，实际覆盖率会偏离正态分布预期。

**优点**:
- ✅ 计算简单，数据需求低（仅需 OHLC）
- ✅ 自适应市场波动（波动大时通道自动变宽）
- ✅ 业界广泛使用，工具成熟（TradingView、NinjaTrader、文华财经均内置）

**缺点**:
- ⚠️ 对方向性趋势反应慢（ATR 仅衡量波动幅度，不区分上涨/下跌）
- ⚠️ 参数敏感（k 值和 n 值需要针对品种优化）

**成熟案例**:
1. **[商品期货 ATR 通道突破策略](https://www.cnblogs.com/bigquant/p/17869026.html)**  
   - 实现: `上轨 = SMA(20) + 2×ATR(14)`, `下轨 = SMA(20) - 2×ATR(14)`
   - 止损: 入场价 ± 2×ATR
   - 止盈: 风险回报比 1:2 或 1:3
   - 适用品种: 原油、金属等高波动期货

2. **[NinjaTrader ATR 风险管理](https://ninjatrader.com/futures/blogs/how-to-use-average-true-range-in-futures-trading-analysis)**  
   - 用途: 动态止损位设置
   - 不同市场优化倍数:
     - ES (E-mini S&P): 1.5-2×ATR
     - CL (原油): 2-3×ATR
   - 回测确定最优参数

3. **[Quant Strategy — ATR 止损完整指南](https://quantstrategy.io/blog/the-definitive-guide-to-implementing-atr-based-stop-loss/)**  
   - 核心原则: ATR 止损应设置在"市场噪音"之外
   - 2×ATR = 避免过早止损
   - 3×ATR = 更宽容，适合趋势持有

---

### 1.2 历史波动率锥（Volatility Cone / Probability Cone）

**核心逻辑**: 基于历史波动率（HV）和对数正态分布假设，计算未来 N 日的概率区间。

**公式**:
```
expectedMove = close × HV × sqrt(days / 252)
上轨 = close × exp(z × HV × sqrt(days / 252))
下轨 = close × exp(-z × HV × sqrt(days / 252))
```

其中：
- `HV` = 历史波动率（通常用 20 日标准差年化）
- `days` = 预测天数
- `252` = 年交易日数
- `z` = 标准差倍数（1σ=68%, 1.96σ=95%, 3σ=99.7%）

**置信度严格定义**:
- **68% 区间**: z = 1.0（1 标准差）
- **95% 区间**: z = 1.96（2 标准差）
- **99.7% 区间**: z = 3.0（3 标准差）

> ✅ **优势**: 这是统计学严格定义的置信区间，假设对数收益率服从正态分布。

**优点**:
- ✅ 理论基础扎实（Black-Scholes 期权定价模型同源）
- ✅ 置信度有明确统计含义
- ✅ 可与期权隐含波动率对比（判断市场预期是否过高/过低）

**缺点**:
- ⚠️ 假设对数正态分布，实际市场有厚尾和偏斜
- ⚠️ 对极端事件（黑天鹅）估计不足
- ⚠️ 计算稍复杂（需要对数收益率、标准差、年化换算）

**成熟案例**:
1. **[TradingView Probability Cone Indicator](https://www.tradingview.com/script/uPhPuNle-Probability-Cone/)**  
   - 可视化未来 1-30 日的价格概率锥
   - 用户输入: 历史窗口（默认 30 日）、预测天数
   - 输出: 68%/95%/99.7% 三层概率带

2. **[TitanFX Future Price Range Indicator](https://research.titanfx.com/indicators/probability-cone)**  
   - 实时计算未来 N 日的价格区间
   - 用途: 判断当前波动是否异常、设置期权策略的预期收益

3. **[Pineify Options Probability Cone Visualizer](https://pineify.app/free-tools/options-probability-cone)**  
   - 免费工具，输入当前价格和隐含波动率（IV）
   - 输出: 未来 7/14/30/60 日的价格概率锥
   - 对比 HV vs IV，判断期权是"贵"还是"便宜"

4. **[Quant Stack Exchange — 用波动率计算未来价格分布](https://quant.stackexchange.com/questions/47/how-to-calculate-future-distribution-of-price-using-volatility)**  
   - 学术讨论: 如何从波动率推导价格分布
   - 公式推导: `P(t+Δt) = P(t) × exp(μΔt + σ√Δt × Z)`
   - 其中 Z ~ N(0,1)

---

## 二、方法选择决策矩阵

| 维度 | ATR 通道 | HV 锥形 | 推荐场景 |
|------|---------|---------|----------|
| **计算复杂度** | 低 | 中 | ATR 更易实现 |
| **数据需求** | OHLC | 对数收益率 + 标准差 | ATR 数据已具备 |
| **置信度严谨性** | 经验类比 | 统计学严格定义 | HV 更学术 |
| **趋势敏感度** | 低（纯波动） | 低（纯波动） | 两者相同 |
| **极端事件** | 依赖历史 ATR | 假设正态分布（低估尾部） | 都有缺陷 |
| **业界认可度** | 极高（交易员常用） | 高（期权交易员常用） | ATR 更通用 |
| **与现有指标一致性** | ✅ 已有 ATR5 | ⚠️ 需新增 HV 计算 | ATR 无额外工作 |

---

## 三、Futures-Radar 实施建议

### 3.1 短期方案（Phase 6，立即可实施）

**选择 ATR 通道法**，理由：
1. ✅ **数据已具备**: `candidates.json` 中已有 `atrPct`（ATR/close 百分比）
2. ✅ **计算简单**: `上轨 = close + 2×ATR`, `下轨 = close - 2×ATR`
3. ✅ **业界标准**: 期货交易员普遍使用 2×ATR 作为止损/止盈参考

**具体实现**:

在 `report.md` 的第三章（重点机会分析）中，每个品种增加：

```markdown
### SC0：原油

**方向**: 空头 | **置信度**: 中

**3日价格区间**（基于 ATR5）:
- 2×ATR 通道: 552 - 574（约 95% 覆盖，当前 563，ATR5=5.5）
- 确认突破: 跌破 552 且成交量≥20万手 → 空头加速

**驱动 (Q1)**: ...
```

**数据来源标注**:
```
价格区间计算: ATR5 = {atrPct} × {close}，通道宽度 = 2×ATR5
⚠️ 置信度为经验类比（非统计学严格定义），实际覆盖率因品种而异
```

---

### 3.2 中期优化（Phase 7，可选）

**增加 HV 锥形作为对比**，输出双轨区间：

```markdown
**3日价格区间**:
- ATR 通道（95%）: 552 - 574（基于 ATR5=5.5）
- HV 锥形（95%）: 548 - 578（基于 HV5=3.8%, 1.96σ）
- 交叉验证: 两种方法区间基本一致，置信度较高
```

**实施条件**:
- 需新增 HV5 指标计算（20 日对数收益率标准差年化）
- 公式: `HV = stdev(ln(close[i]/close[i-1])) × sqrt(252)`

**优势**:
- ✅ 双重验证（ATR 和 HV 若一致，置信度更高）
- ✅ 若 ATR 和 HV 区间差异大，可标注"波动结构异常，谨慎操作"

---

### 3.3 长期改进（Phase 8，研究方向）

**问题**: ATR 和 HV 都假设历史波动能代表未来，对突发事件（如地缘政治、政策变化）反应滞后。

**可能方向**:
1. **动态调整倍数**: 根据 volPercentile 动态调整 k 值
   - volPercentile < 30%: k = 1.5（波动低，通道收窄）
   - volPercentile 50-80%: k = 2.0（正常波动）
   - volPercentile > 80%: k = 3.0（极端波动，通道放宽）

2. **GARCH 模型**: 用 GARCH(1,1) 预测未来波动率（而非假设历史波动不变）
   - 优点: 对波动率聚集（volatility clustering）建模更准确
   - 缺点: 计算复杂，需要较长历史数据

3. **隐含波动率融合**: 若有期权数据，可用 IV（隐含波动率）替代 HV
   - 优点: 市场前瞻性预期，比历史波动更及时
   - 缺点: 国内商品期货期权品种有限

---

## 四、与远远调研的对比

远远（阿比西尼亚猫）的调研结果与我基本一致：

**共识**:
1. ✅ **价格区间工具成熟**: ATR 通道和 HV 锥形都有现成实现
2. ✅ **胜率区间无现成工具**: 需要自建历史类比 + bootstrap 管道
3. ✅ **短期优先价格区间**: 立即可用，数据已具备

**我的补充**:
1. **具体参数建议**: 2×ATR 作为 95% 区间（远远未明确倍数）
2. **公式细节**: 补充了 HV 锥形的 `sqrt(days/252)` 时间缩放公式
3. **实施路径**: 明确了 Phase 6（ATR）→ Phase 7（ATR+HV）→ Phase 8（动态优化）的演进路线

---

## 五、执行建议

**@铲屎官**:

我建议立即实施 **ATR 通道法**（Phase 6），原因：
1. ✅ **零额外数据采集**: `atrPct` 已在 `candidates.json`
2. ✅ **计算一行代码**: `[close - 2×ATR, close + 2×ATR]`
3. ✅ **业界认可度最高**: 期货交易员的事实标准

**修改范围**:
- `report/template.md`: 在第三章品种分析中增加"3日价格区间"章节
- `report/generate.js` (或 LLM 手动生成): 从 `candidates.json` 读取 `atrPct` 和 `close`，计算通道

**时间估算**: 1-2 小时完成模板修改 + 测试

你希望我：
- **A**: 立即修改 `report/template.md`，增加 ATR 价格区间章节
- **B**: 等待你确认后再动手
- **C**: 先写一个 demo 输出（用 20260730-1701-auto 的数据演示）

---

**数据来源**:
- [商品期货ATR通道突破策略](https://www.cnblogs.com/bigquant/p/17869026.html)
- [NinjaTrader: How to Use ATR in Futures Trading](https://ninjatrader.com/futures/blogs/how-to-use-average-true-range-in-futures-trading-analysis)
- [Quant Strategy: ATR-Based Stop Loss Guide](https://quantstrategy.io/blog/the-definitive-guide-to-implementing-atr-based-stop-loss/)
- [Quant Strategy: Optimizing ATR Multipliers](https://quantstrategy.io/blog/optimizing-atr-multipliers-backtesting-strategies-for)
- [TradingView: Probability Cone Indicator](https://www.tradingview.com/script/uPhPuNle-Probability-Cone/)
- [TitanFX: Future Price Range Indicator](https://research.titanfx.com/indicators/probability-cone)
- [Pineify: Options Probability Cone Visualizer](https://pineify.app/free-tools/options-probability-cone)
- [Quant StackExchange: Calculate Future Distribution](https://quant.stackexchange.com/questions/47/how-to-calculate-future-distribution-of-price-using-volatility)
- [Tiingo: How to Calculate Volatility](https://www.tiingo.com/blog/how-to-calculate-volatility/)
- [Pineify: How to Create ATR on TradingView](https://pineify.app/how-to-create-atr-tradingview)
