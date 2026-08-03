---
feature_ids: [F-GameEstimator]
topics: [poc, data-extraction, game-logs, configuration]
doc_kind: research-note
created: 2026-06-03
status: completed
authored_by: "@cat-g7k98t5f"
---

# Phase 1 PoC: 信息提取器数据源验证

## What

对赌神项目（BidKingVIP 2.6, `D:\赌神4.0极速版\赌神4.0极速版`）的数据采集链路进行了完整逆向分析，验证了架构方案中"信息提取器"所需的两类数据源（动态日志 + 静态配置）的可行性。

### 数据采集链路

```
[游戏客户端网络流量]
       ↓ WinPcap/Raw Sockets
[bidking-protobuf-collector.exe]  ← 3250KB，本地嗅探 protobuf 包
       ↓ 写入日志文件
[logParserWorker-Da3LAN4v.js]    ← Web Worker，批量解析
       ↓ 提取关键协议消息
[IndexedDB / SQLite]             ← 持久化存储
```

### 已验证的数据源

| 数据源 | 位置 | 格式 | 状态 |
|--------|------|------|------|
| **静态配置（Drop Table）** | `external/Drop_base64_decoded.txt` | 明文 CSV 变体 | ✅ 可直接读取 |
| **S2C33GameStartNotify** | 网络日志（protobuf→JSON） | JSON + grid bitmap | ✅ 格式已分析 |
| **GameNextRoundNotify** | 同上 | JSON（推测） | ⚠️ 无样本，格式待实际对局验证 |
| **GameOverNotify** | 同上 | JSON（推测） | ⚠️ 同上 |
| **GameUseItem** | 同上 | JSON + ItemSkillLog | ⚠️ 同上 |
| **历史数据库** | `collector/history/bidking-history.sqlite` | SQLite（当前空） | ✅ Schema 已分析 |

### 关键发现

**1. 静态配置完整可用**

`Drop_base64_decoded.txt` 包含完整的物品掉落表，格式为每行一个"宝箱类型"：

```
<id> <code> <name> <displayName> <type> <items_json>
```

其中 `items_json` 格式为 `[[category, itemId, minCount, maxCount, weight], ...]`：
- **9大品类**（category 前缀）：101=家居, 102=医疗, 103=时尚, 104=兵装, 105=珠宝, 106=文物, 107=数码, 108=能源, 109=食饮
- **6个品质等级**（按 code 分组）：品质1~6 对应 白/绿/蓝/紫/橙/红
- **4种容器类型**：基础箱 / 快递盒 / 仓库 / 集装箱
- **weight = 物品价值**（游戏内货币单位），即 pricetable

共 79 行，覆盖全部物品品类和品质组合。

**2. 动态日志：GameStartNotify 可提取几何 + 空间特征**

`S2C33GameStartNotify` JSON payload 包含：
- `maxTopLeftPosition`：仓库网格总格数 → 可推导 `warehouseLength`
- `grid`：位图数组，每行 1 个整数表示 10 列的占用状态 → 可计算 `totalCells`、`freeCells`、`occupiedCells`
- 从 grid 派生的空间特征：`coverageRate`、`fragmentationRate`、`tightFreeRate`

**3. 品质分布：不是直接提取，而是从约束 + Drop Table 推断**

当前赌神项目**不直接从日志提取品质分布**，而是将 `GameStartNotify` 的约束（格数/物品数）输入到概率引擎（`*PosteriorWorker`），结合历史 Drop Table 先验，用贝叶斯推断各品质的出现概率。这与我们架构方案中的"发牌模拟器 + 特征匹配"思路一致——品质分布是**推断输出**，不是日志输入。

**4. 日志格式稳定**

logParser 使用协议消息名匹配（`S2C33GameStartNotify` / `GameNextRoundNotify` 等），不是字段级解析。这意味着即使游戏更新协议字段内容，只要消息名不变，日志采集就不会断。

### 信息提取器可行性矩阵

| 需求特征 | 来源 | 可行性 | 备注 |
|----------|------|--------|------|
| mapId / ruleVersion | 静态配置 + GameStartNotify | ✅ | 从 Drop Table 的容器名称推断 |
| priceTable | 静态配置 | ✅ | Drop_base64_decoded.txt 直接可读 |
| 发牌参数（物品池+权重） | 静态配置 | ✅ | 同上，79 条完整记录 |
| warehouseLength | GameStartNotify.maxTopLeftPosition | ✅ | 网格总格数 |
| totalItems | GameStartNotify（推测有字段） | ⚠️ | 赌神代码中有 itemCount，需实局验证 |
| totalCells / occupiedCells | GameStartNotify.grid 位图 | ✅ | 已确认可用 |
| avgCells | grid 位图 + itemCount | ⚠️ | 需 itemCount 字段 |
| qualityCount / qualityCells | 推断层（非直接提取） | ⚠️ | 需模拟器+贝叶斯推断 |
| revealedCells (逐轮) | GameNextRoundNotify | ⚠️ | 需实局验证格式 |

## Why

### 为什么这个 PoC 结果对架构决策至关重要

1. **数据基底牢靠**：静态配置（Drop Table）确实明文可读，79 条记录涵盖了所有 itemCategory × quality × containerType 组合。发牌模拟器可以直接用这些权重做 Monte Carlo。

2. **动态日志可行但需实局验证**：logParser 的架构验证了"合法读取日志文件"的可行性。但 `GameNextRoundNotify` 和 `GameUseItem` 的具体 payload 字段在无实局数据的情况下无法完全确认。

3. **品质分布是二级推断**：原以为可以从日志直接读到"金 2 个 / 红 5 个"，但实际赌神代码也是通过贝叶斯推断得到的。这意味着我们的发牌模拟器是整个系统的**唯一数据基底**——品质分布必须靠模拟匹配来推断，没有捷径。

### 为什么选择这个技术路径

赌神项目走的是"网络嗅探 → protobuf 解析 → 结构化日志"路线。对于我们的架构方案，信息提取器可以复用同样的采集思路，但不一定需要 protobuf collector——直接用赌神项目的 collector 输出即可，我们只需要写**日志解析器**（对标 logParserWorker）。

## Tradeoff

| 决策 | 利 | 弊 |
|------|-----|-----|
| **复用赌神的 protobuf collector** | 不重造轮子；已验证可工作 | 依赖第三方 exe；需确认协议版本兼容 |
| **自己实现网络嗅探** | 完全可控；可适配新版协议 | 开发成本高；需要 WinPcap 知识 |
| **品质分布算在模拟器而非提取器** | 架构解耦；提取器只负责"读" | 提取器输出不够"富"；模拟器要处理推断逻辑 |
| **用 Drop Table weight 作 price** | 直接可用；与游戏数据一致 | weight 是否为市价待验证（可能是官方指导价） |

**推荐路径**：T1 阶段先复用赌神的 collector（已验证），聚焦写日志解析器 + 静态配置解析器。T2 阶段如果协议版本不兼容，再考虑自研嗅探。

## Open Questions

1. **GameNextRoundNotify 的实际 payload 字段**：哪些特征（物品数、品质提示、空间信息）是在 R1/R3/R5 逐轮披露的？需要一次实局对战的日志样本才能确认。

2. **itemCount 是直接字段还是推断字段**：赌神代码中 `buildPotentialQualityCounts` 接收 `ranks` 数组输入——这个 ranks 是从 GameStartNotify 直接读到的，还是从 grid 反推的？

3. **Drop Table weight 是"官方指导价"还是"市场价"**：如果是官方价，实际玩家出价可能偏离。博弈估值器需要的是"当前市场博弈价"，可能需要引入其他玩家的出价历史数据。

4. **游戏版本更新频率**：BidKing 多久更新一次？protobuf 协议消息名会不会变？如果变，collector 和 logParser 都需要跟着变。

5. **logParser 的 "uuid" 模式**：logParser 中有 `(uuid:` 和 `触发技能：` 的匹配模式，这些对应什么游戏事件？对我们的特征提取有用吗？

## Next

Phase 1 PoC 验证结论：**数据源可行**。静态配置完整、动态日志路径清晰。下一步：

1. **T1.4 最终验证**：写最小 logParser（JavaScript/Node.js），能解析一个模拟的 S2C33GameStartNotify JSON 行并输出结构化数据。不需要实局数据，用格式推断即可。

2. **Phase 2 启动条件**：需要一次实局对战日志（即使 1-2 局也行），用于验证 GameNextRoundNotify 的逐轮披露格式。建议找有游戏账号的人跑一局，导出 collector 产生的日志文件。

3. **信息提取器接口冻结**：根据已确认的数据源，可以冻结 `信息提取器→模拟器` 的 `init` 协议（mapId / ruleVersion / priceTable / dropPool）。`update` 协议（逐轮特征）需等 GameNextRoundNotify 验证后再冻结。

---

[砚砚/缅因猫🐾]
