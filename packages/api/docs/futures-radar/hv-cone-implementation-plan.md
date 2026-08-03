---
title: HV 概率锥实现方案 — Futures-Radar Phase 7
created: 2026-07-31
feature_ids: []
doc_kind: technical-plan
topics: [futures-radar, hv-cone, yang-zhang, probability-interval]
---

# HV 概率锥实现方案 — Futures-Radar Phase 7

> **目标**: 在 ATR 通道基础上增加 HV 概率锥，给出统计学严格的价格区间  
> **制定人**: 布偶猫 @ragdoll-vzes  
> **参考资料**: 阿比西尼亚猫搜集的 5 种成熟方案对比

---

## 一、方案选择

### 1.1 核心决策

**计算方法**: 闭式解析公式（方案 1）

**理由**:
- ✅ **极简实现**: 15 行代码，O(1) 计算
- ✅ **零外部依赖**: 仅需 numpy（futures-radar 已有）
- ✅ **结果可复现**: 无随机性，便于回测验证
- ✅ **与 Black-Scholes 框架一致**: 金融行业标准

**放弃的方案**:
- ❌ Monte Carlo GBM（方案 2）: 有随机性，计算开销大
- ❌ volest/ferro-ta 库（方案 3/4）: 依赖过重，API 不灵活
- ❌ TradingView Pine Script（方案 5）: 需要移植，不值得

---

### 1.2 波动率估算器

**主选**: Yang-Zhang  
**降级**: Garman-Klass（当 OHLC 数据不完整时）  
**备选**: ATR 作为波动率代理（当只有 close 数据时）

**Yang-Zhang 优势**:
- ✅ **处理隔夜跳空**: 中国期货有夜盘（21:00-02:30），隔夜跳空是常态
- ✅ **效率 14×**: 比 Close-to-Close 效率提升 14 倍
- ✅ **处理漂移**: Rogers-Satchell 组件处理方向性漂移

**公式**（来自 qf-lib 生产级实现）:
```
k = 0.34 / (1.34 + (n+1)/(n-1))
σ²_on = var(ln(O_t / C_{t-1}))      # 隔夜方差
σ²_oc = var(ln(C_t / O_t))          # 开盘-收盘方差
σ²_rs = mean(u·(u-c) + d·(d-c))    # Rogers-Satchell
  where: u=ln(H/O), d=ln(L/O), c=ln(C/O)
σ²_YZ = σ²_on + k·σ²_oc + (1-k)·σ²_rs
HV_annual = sqrt(σ²_YZ × 252)
```

**降级策略**（数据缺失时）:
1. 若缺 Open → 用 Garman-Klass（仅需 HLC）
2. 若缺 High/Low → 用 Close-to-Close（仅需 Close）
3. 若 Close 数据不足 20 日 → 用 ATR 作为波动率代理

---

## 二、实现设计

### 2.1 数据流

```
Input: candidates.json (含 OHLC 20 日历史)
  ↓
Stage 4.5: probability-estimate
  ├─ 计算 Yang-Zhang HV
  ├─ 计算概率锥（闭式解）
  ├─ 计算 HV 分位（当前 HV 在 90 日历史中的排名）
  └─ 输出 probability.json
  ↓
Stage 5: report (读取 probability.json)
  └─ 展示: ATR 通道 + HV 概率锥对比
```

### 2.2 核心函数

```python
def yang_zhang_volatility(df, window=20):
    """
    计算 Yang-Zhang 波动率
    Input: df (含 OHLC 列)
    Output: HV_annual (年化波动率)
    """
    # 对数收益率
    o = np.log(df['open'] / df['close'].shift(1))  # 隔夜
    c = np.log(df['close'] / df['open'])            # 日内
    u = np.log(df['high'] / df['open'])
    d = np.log(df['low'] / df['open'])
    
    # Rogers-Satchell
    rs = u * (u - c) + d * (d - c)
    
    # Yang-Zhang 权重
    n = window
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    
    # 三个方差组件
    sigma_on = o.rolling(window).var()
    sigma_oc = c.rolling(window).var()
    sigma_rs = rs.rolling(window).mean()
    
    # Yang-Zhang 总方差
    sigma_yz = sigma_on + k * sigma_oc + (1 - k) * sigma_rs
    
    # 年化
    hv_annual = np.sqrt(sigma_yz * 252)
    return hv_annual.iloc[-1]


def probability_cone(close, hv_annual, days_list=[3, 5], z_scores=[1.0, 1.96]):
    """
    闭式解概率锥
    Input: 当前价、年化HV、预测天数列表、z-score列表
    Output: { "3d": { "p68": [下, 上], "p95": [下, 上] }, "5d": {...} }
    """
    sigma_daily = hv_annual / np.sqrt(252)
    result = {}
    
    for d in days_list:
        result[f"{d}d"] = {}
        for z in z_scores:
            label = "p68" if z < 1.5 else "p95"
            upper = close * np.exp(z * sigma_daily * np.sqrt(d))
            lower = close * np.exp(-z * sigma_daily * np.sqrt(d))
            result[f"{d}d"][label] = [round(lower, 1), round(upper, 1)]
    
    return result


def hv_percentile(current_hv, historical_hv_90d):
    """
    计算当前 HV 在历史 90 日中的分位
    Input: 当前 HV, 90 日 HV 序列
    Output: 分位数 (0-100)
    """
    return (historical_hv_90d < current_hv).sum() / len(historical_hv_90d) * 100
```

### 2.3 输出格式 (`probability.json`)

```json
{
  "meta": {
    "runId": "20260730-1701-auto",
    "calculatedAt": "2026-07-30T09:30:00.000Z",
    "estimator": "yang_zhang",
    "fallback": {
      "SC0": "yang_zhang",
      "EG0": "yang_zhang",
      "M0": "garman_klass"
    }
  },
  "probabilities": [
    {
      "symbol": "SC0",
      "close": 568.2,
      "hv": {
        "annual": 0.338,
        "period_days": 20,
        "percentile_90d": 84.7,
        "estimator": "yang_zhang"
      },
      "cone": {
        "3d": {
          "p68": [541.2, 596.8],
          "p95": [515.6, 626.4]
        },
        "5d": {
          "p68": [533.5, 605.3],
          "p95": [501.3, 643.8]
        }
      },
      "atr_comparison": {
        "atr5": 32.8,
        "atr_2x_band": [502.6, 633.8],
        "hv_95_band": [515.6, 626.4],
        "divergence_pct": 2.4
      }
    }
  ]
}
```

---

## 三、报告呈现策略

### 3.1 双轨对比（ATR + HV）

**避免信息过载**: 不展示两套完整区间，而是**对比验证**

```markdown
### SC0：原油

**方向**: 空头 | **置信度**: 中

**价格区间对比**（3日）:
- **ATR 通道**: 502.6 - 633.8（经验波动带）
- **HV 概率锥**: 515.6 - 626.4（95% 统计区间，Yang-Zhang）
- **交叉验证**: 两种方法区间偏差 2.4%，波动率模型稳定 ✅

**当前 HV 环境**: 84.7 分位（近 90 日），属于高波动区间，区间可信度较高
```

### 3.2 展示逻辑

**三种情况**:

1. **ATR 与 HV 区间一致（偏差 <10%）**:
   ```
   两种方法区间偏差 2.4%，波动率模型稳定 ✅
   ```

2. **ATR 与 HV 区间差异较大（偏差 10-20%）**:
   ```
   两种方法区间偏差 15.3%，波动率结构可能变化 ⚠️
   建议参考 HV 概率锥（统计基础更严谨）
   ```

3. **ATR 与 HV 区间严重背离（偏差 >20%）**:
   ```
   两种方法区间偏差 28.7%，波动率模型不稳定 ❌
   当前处于极端波动环境（HV 分位 97%），历史波动率失去参考价值
   ```

### 3.3 HV 分位标注

**用途**: 判断概率锥的可信度

| HV 分位 | 标注 | 含义 |
|---------|------|------|
| 0-20% | 极低波动 | 市场过于平静，可能酝酿突破 |
| 20-80% | 正常波动 | 概率锥可信度高 |
| 80-95% | 高波动 | 概率锥仍可用，但区间会较宽 |
| >95% | 极端波动 | 历史模型可能失效，谨慎使用 |

---

## 四、实施步骤

### 4.1 Phase 7-A：增加 HV 计算（Week 1）

**工作量**: 1-2 天

1. **新增 `hv-estimators.js`**:
   - `yangZhangVolatility(ohlc, window=20)`
   - `garmanKlassVolatility(ohlc, window=20)`（降级）
   - `closeToCloseVolatility(close, window=20)`（最小降级）

2. **新增 `probability-cone.js`**:
   - `calculateCone(close, hv_annual, days=[3,5])`
   - `hvPercentile(current_hv, historical_90d)`

3. **测试**:
   - 用 SC0/EG0/M0 的真实数据验证公式
   - 对比 TradingView Probability Cone 的输出（手动验证）

---

### 4.2 Phase 7-B：管道集成（Week 1-2）

**工作量**: 1 天

1. **新增 Stage 4.5**: `probability-estimate/`
   - 输入: `candidates.json` (Top 3)
   - 输出: `probability.json`
   - 位置: `filter-llm` → `analyze` 之间插入 **[修正]**，应在 `analyze` → `report` 之间插入

2. **修改 `report/template.md`**:
   - 增加"价格区间对比"章节
   - 增加"HV 环境定位"一行

3. **修改 `report/generate.js`** (或 LLM 手动):
   - 读取 `probability.json`
   - 计算 ATR vs HV 的偏差
   - 根据偏差输出对应标注

---

### 4.3 Phase 7-C：验证与优化（Week 2）

**工作量**: 1-2 天

1. **用 20260730-1701-auto 数据跑一遍完整管道**
2. **检查三个品种的输出**:
   - SC0: ATR vs HV 偏差是否合理
   - EG0: HV 分位是否正确
   - M0: 降级策略（如果 OHLC 不完整）是否生效
3. **调整参数**:
   - Yang-Zhang 窗口（默认 20 日，可能需要调整为 15-30 日）
   - HV 分位的历史窗口（默认 90 日）

---

## 五、风险与降级

### 5.1 数据缺失降级

| 数据可用性 | 估算器 | 说明 |
|-----------|--------|------|
| OHLC 完整 | Yang-Zhang | 首选 |
| 缺 Open | Garman-Klass | 仅需 HLC |
| 缺 High/Low | Close-to-Close | 仅需 Close |
| Close < 20 日 | ATR 代理 | 用 `ATR / close` 作为波动率估算 |

### 5.2 极端情况处理

**情况 1: HV 分位 >95%（极端波动）**
- 标注: "当前处于极端波动环境，历史模型可能失效"
- 建议: 扩大区间（z_score 从 1.96 提升到 2.58）

**情况 2: ATR vs HV 偏差 >30%（模型失效）**
- 标注: "ATR 与 HV 严重背离，波动率结构剧变"
- 建议: 不展示具体区间，改为"当前无法给出可靠价格区间"

**情况 3: HV 计算失败（数据异常）**
- 降级: 仅展示 ATR 通道
- 标注: "HV 概率锥计算失败，仅展示 ATR 通道"

---

## 六、与 ATR 通道的分工

| 维度 | ATR 通道 | HV 概率锥 |
|------|---------|----------|
| **性质** | 经验波动带 | 统计置信区间 |
| **计算基础** | 真实波动幅度 | 对数收益率标准差 |
| **概率语义** | 无（经验类比） | 有（68%/95% 严格定义） |
| **适用场景** | 短线止损/突破参考 | 中线持仓/风险管理 |
| **报告地位** | 主展示（所有品种） | 对比验证（Top 3 品种） |

**互补关系**:
- ATR 通道: 给交易员直观的"突破带"
- HV 概率锥: 给风险管理者严谨的"置信区间"
- 两者一致 → 增强信心
- 两者背离 → 警示波动率结构变化

---

## 七、后续优化方向（Phase 8+）

### 7.1 多时间框架锥形

当前只做 3 日/5 日，未来可扩展：
- 1 日（日内）
- 10 日（短线持仓）
- 20 日（中线持仓）

### 7.2 隐含波动率对比

若有期权数据，可对比 HV vs IV：
- IV > HV → 期权"贵"，卖方机会
- IV < HV → 期权"便宜"，买方机会

### 7.3 GARCH 动态预测

替代静态 HV，用 GARCH(1,1) 预测未来波动率：
- 优点: 对波动率聚集建模更准确
- 缺点: 计算复杂，需要较长历史数据（>250 日）

---

## 八、执行决策

**@铲屎官**，我的建议：

**Phase 7 立即实施**，分三步：
1. **Week 1 前半**: 实现 Yang-Zhang HV 计算 + 闭式解概率锥（核心 30 行代码）
2. **Week 1 后半**: 管道集成（新增 Stage 4.5）+ 报告模板修改
3. **Week 2**: 用真实数据验证 + 参数调优

**预期成果**:
- 每个 Top 3 品种都有 ATR 通道 + HV 概率锥对比
- 铲屎官可以看到"两种方法区间偏差 X%"的验证信息
- HV 分位标注帮助判断当前是否处于极端波动环境

你希望我：
- **A**: 立即开始实现 Phase 7-A（HV 计算函数）
- **B**: 先写一个 demo（用 20260730-1701-auto 数据手动计算 SC0 的 HV 概率锥）
- **C**: 等你确认后再动手

---

**数据来源**:
- [Probability Cone — Motgench (TradingView)](https://ar.tradingview.com/script/uPhPuNle-Probability-Cone/)
- [qf-lib Yang-Zhang Implementation](https://qf-lib.readthedocs.io/en/v2.2.1/_modules/qf_lib/common/utils/volatility/drift_independent_volatility.html)
- [Yang-Zhang RV Python Implementation](https://github.com/hugogobato/Yang-Zhang-s-Realized-Volatility-Automated-Estimation-in-Python)
- [Expected Move with Python (闭式解)](https://dev.to/ayratmurtazin/visualizing-expected-stock-price-movement-with-python-and-volatility-multipliers-1o14)
- [OHLC-Vol Estimators](https://github.com/vivek-v-rao/OHLC-Vol)
