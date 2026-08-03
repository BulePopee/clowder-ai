---
feature_ids: [F-GameEstimator]
related_features: []
topics: [simulation, estimator, probability, game-theory]
doc_kind: spec
created: 2026-06-03
---

# F-GameEstimator: 模拟发牌机制与玩家视角估值器

> Status: proposal | Owner: @小捷 | Reviewer: TBD

## Why
我们需要构建一个“模拟游戏发牌机制 + 提供博弈依据的估值器”。所有的估计数据（决策的基底）都应该来源于发牌机制模拟器的前向模拟。通过大量模拟发牌结果，寻找与当前对局已知信息（仓库特征）接近或对应的结果，从而得出动态的估值指标。

## What (架构设计方案)

系统由以下三个核心模块构成：

### 1. 发牌模拟器 (Dealing Simulator)
基于正向模拟（Monte Carlo思想）大量生成对局，并通过特征匹配筛选潜在底牌。
- **获取参数**: 根据当前对局的地图信息，获取对应的官方参数。
- **模拟发牌**: 根据官方参数与官方发牌规则，进行有限次数的大规模模拟发牌。
- **匹配过滤**: 根据当前对局已知的信息（逐轮获取的仓库特征等新信息），判断出我们是否模拟到了接近或者与当局完全相同的仓库状态。

### 2. 信息提取器 (Information Extractor)
合法且安全地提取游戏日志与静态配置。
- **动态日志**: 获取当前对局的所有对局日志信息（通过合法读取日志文件实现，不进行内存注入/读取，参考原有赌神项目成功获取日志的经验）。
- **静态配置**: 获取官方参数、道具价格等配置信息，利用游戏明文存储的数据结构解析得出。

### 3. 博弈估值器 (Game-theoretic Estimator)
基于模拟器筛选出的匹配结果池，结合场上信息，提供宏观决策指标。
- **非绝对定价**: 博弈估值器不追求给出具体、绝对的价格数字，而是提供博弈参考面。
- **博弈指标**: 提供对应其他玩家出价的预测与博弈观测指标。
- **动态输出**: 根据游戏逐轮进行、以及玩家使用道具后获得的新信息，动态收敛并给出：
  - **仓深**：当前仓库大概有多大。
  - **底价**：绝对不亏的保底基准价格。
  - **出红概率**：根据发牌器筛选出的大量匹配结果中计算出的爆红率。
  - **品质分布**：金、红、紫、蓝、绿、白各品质道具的可能估算表。

## Acceptance Criteria
- [ ] AC-1: 信息提取器能成功解析对局日志（动态）与明文静态配置，并结构化输出。
- [ ] AC-2: 发牌模拟器能基于官方参数进行前向生成，并能根据输入的一组“仓库特征”完成发牌结果的相似度匹配与过滤。
- [ ] AC-3: 博弈估值器能根据匹配到的模拟样本池，计算并输出仓深、底价、出红概率和品质估算表。
- [ ] AC-4: 整个管线支持回合制的数据刷入：能响应逐轮游戏的信息更新（如玩家使用了道具、发现了新线索），并动态刷新匹配池和博弈指标。

## Technical Design Details

### 特征空间设计

#### 游戏信息披露机制
- **R0 轮（开局）**: 完全盲，仅知道地图ID、规则版本、道具价格表
- **R1/R3/R5 轮**: 系统随机披露部分特征（几何特征、品质分布、空间布局）
- **Rn 轮**: 玩家主动使用道具/技能探测，获取更多信息

#### 特征分类

**静态元信息（游戏外已知）**
- `mapId`: 地图ID
- `ruleVersion`: 规则版本号
- `priceTable`: 道具价格表（官方明文配置）

**几何特征（可能披露）**
- `warehouseLength`: 仓库长度 N（宽度固定为10）
- `totalItems`: 物品总件数
- `totalCells`: 物品总占格数
- `avgCells`: 物品平均占格数

**品质分布特征（可能披露，6个品质：红/金/紫/蓝/绿/白）**
对每个品质 q：
- `count[q]`: 该品质件数
- `cells[q]`: 该品质占格数
- `avgCells[q]`: 该品质平均占格数

**空间布局特征（可能披露）**
- `outline[pos]`: 某位置道具的轮廓
- `qualityOutline[pos]`: 某位置道具的品质+轮廓
- `revealed[pos]`: 某位置道具的完整信息

---

### 匹配策略设计

#### 自适应过滤算法

```
输入: simulations (模拟样本池), known_features (已知特征集)
输出: matched_pool (匹配样本池), confidence_level (置信度)

Phase 1: 硬约束过滤（已知特征必须精确匹配）
- 如果 warehouseLength 已知 → 过滤出 warehouseLength == known 的样本
- 如果 totalItems 已知 → 过滤出 totalItems == known 的样本
- 如果 count[q] 已知 → 过滤出 count[q] == known 的样本

Phase 2: 软约束过滤（已知特征在容差范围内）
- 如果 totalCells 已知 → 过滤出 |totalCells - known| < ε_cells 的样本
- 如果 avgCells 已知 → 过滤出 |avgCells - known| < ε_avg 的样本
- 如果 avgCells[q] 已知 → 过滤出 |avgCells[q] - known| < ε_avg_q 的样本

Phase 3: 空间确定性过滤（已披露轮廓/道具必须完全匹配）
- 对每个 outline[pos] → 过滤出形状匹配的样本
- 对每个 qualityOutline[pos] → 过滤出形状+品质匹配的样本
- 对每个 revealed[pos] → 过滤出完全一致的样本

Phase 4: 置信度计算
confidence_level = (
  0.2 × (已知几何特征数 / 4) +
  0.4 × (已知品质特征数 / 18) +
  0.4 × (已披露格子数 / 总格数)
)
```

#### 置信度分级输出

| 置信度区间 | 匹配池规模 | 输出标注 | 建议 |
|-----------|----------|---------|------|
| < 0.3 | 数十万样本 | 极低置信度，仅供参考 | 建议等待更多信息 |
| 0.3 - 0.6 | 数千到数万样本 | 中等置信度，谨慎出价 | 可以参考但需留安全边际 |
| > 0.6 | 数百到数千样本 | 高置信度 | 可作为主要决策依据 |

---

### 模块间数据协议

#### 信息提取器 → 发牌模拟器

**初始化消息（一次性）**
```json
{
  "type": "init",
  "mapId": "map_007",
  "ruleVersion": "v2.6",
  "priceTable": {
    "item_001": 5000,
    "item_002": 12000
  },
  "simulationCount": 1000000
}
```

**逐轮更新消息（流式）**
```json
{
  "type": "update",
  "round": 3,
  "newFeatures": {
    "warehouseLength": 25,
    "count": {"red": 5, "gold": 2},
    "outline": [
      {"pos": [2, 3], "shape": "L"}
    ],
    "revealed": [
      {"pos": [5, 7], "quality": "gold", "itemId": "item_042", "value": 12000}
    ]
  }
}
```

#### 发牌模拟器 → 博弈估值器

```json
{
  "round": 3,
  "matchedPool": {
    "sampleIds": [12453, 89012, 45678],
    "weights": [1.0, 0.8, 0.6]
  },
  "poolSize": 847,
  "confidenceLevel": 0.65,
  "confidenceLabel": "high"
}
```

#### 博弈估值器 → UI

```json
{
  "round": 3,
  "confidenceLevel": 0.65,
  "confidenceLabel": "high",
  "warehouseDepth": {
    "min": 20,
    "max": 28,
    "median": 24
  },
  "totalValueRange": {
    "min": 45000,
    "max": 120000,
    "median": 78000,
    "p25": 62000,
    "p75": 95000
  },
  "floorPrice": 45000,
  "redRate": 0.34,
  "qualityDistribution": {
    "gold": {"count": 2, "probability": 0.12},
    "red": {"count": 5, "probability": 0.34},
    "purple": {"count": 8, "probability": 0.28},
    "blue": {"count": 12, "probability": 0.18},
    "green": {"count": 6, "probability": 0.06},
    "white": {"count": 3, "probability": 0.02}
  }
}
```

---

### 收敛策略与降级机制

#### 正常收敛路径

```
R0 轮（完全盲）
  ↓ 匹配池 = 全部模拟结果（100万样本）
  ↓ 置信度 ≈ 0.1 - 0.2

R1 轮（首次披露，如 warehouseLength + totalItems）
  ↓ 匹配池缩小到 5万 - 10万样本
  ↓ 置信度 ≈ 0.3 - 0.4

R3 轮（第二次披露，如品质分布 count[red]=5, count[gold]=2）
  ↓ 匹配池缩小到 1千 - 5千样本
  ↓ 置信度 ≈ 0.5 - 0.7

R5 轮（第三次披露，如空间布局 outline/revealed）
  ↓ 匹配池缩小到 100 - 1千样本
  ↓ 置信度 ≈ 0.7 - 0.9

玩家探测（主动使用道具）
  ↓ 匹配池进一步收敛到 10 - 100 样本
  ↓ 置信度 ≈ 0.9+
```

#### 降级策略（受 BidKing Liquefaction 启发）

当匹配池过早归零或过小（< 50样本）时触发降级：

**策略1: 放宽软约束阈值**
```
ε_cells *= 1.5
ε_avg *= 1.2
ε_avg_q *= 1.3
```

**策略2: K近邻拼接（Relaxed Matching）**
```
取距离最近的 K=100 个样本
按距离倒数加权: weight = 1 / (1 + distance)
```

**策略3: 标注降级状态**
```json
{
  "degraded": true,
  "degradedReason": "匹配池过小，已放宽约束",
  "originalPoolSize": 23,
  "relaxedPoolSize": 156
}
```

#### 收敛检测

每轮更新后检查：
- **Pool Size 阈值**: `poolSize < 100` → 高置信度收敛完成
- **信息饱和度**: `已披露格子数 / 总格数 > 0.5` → 空间信息充足
- **出价阶段**: 进入最终出价轮次 → 触发更激进筛选

---

## Next Steps
确认该架构方向后，我们将进入具体模块的接口设计与技术验证（如验证日志解析是否畅通、敲定特征匹配的算法）。