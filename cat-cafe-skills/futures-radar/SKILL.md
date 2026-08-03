---
name: futures-radar
description: 期货投机机会雷达——每日扫描~60个国内期货主力合约，波动率排名→Top 3深挖→4章短报告
version: 0.1.0
---

# futures-radar

## 触发条件

- **跑雷达**: "跑期货雷达" / "/futures-radar" / "出期货报告" → 启动监测管道
- **源探测**: "跑探测" / "probe sources" / "探测数据源" → 仅运行源探测
- **不包括**: "看下螺纹钢" "今天期货怎么样" 等模糊表述 → 仅口头回答

## 前置

启动前必须:
1. 版本校验：当前加载的 SKILL.md version 必须等于 VERSION.md version
2. 运行前置探针脚本：
   ```bash
   node .claude/skills/futures-radar/collector/probe-sources.cjs
   ```
   - 自动探测 akshare / mx-data / WebSearch 可用性
   - 判定: `ok` (全部可用) / `degraded` (akshare 可用但增强源缺失) / `fatal` (akshare 不可用 → 终止)
   - 不可跳过脚本手写判断

## 管道

**统一入口**: `pipeline/run.cjs` 编排全部自动化阶段，遇 LLM 边界自动停并提示下一步。

```bash
node .claude/skills/futures-radar/pipeline/run.cjs
node .claude/skills/futures-radar/pipeline/run.cjs --runId 20260730-1637-auto --from scan
```

### 阶段0: Source Probe (auto)
运行 `collector/probe-sources.cjs` → 探测 akshare + mx-data + WebSearch → 产出 `source-probe.json`
- akshare 不可用 → fatal，终止管道

### 阶段1: Collect (auto)
运行 `collector/akshare-futures.cjs` → 逐一拉取 `config/symbols.json` 白名单品种日线 OHLCV → 产出 `raw.json` + `raw-snapshot.md` + `provenance.json`
- 首次全量 ~60s，后续增量 ~5s（仅最新一根日线）
- 采集失败标 gap，不阻塞管道

### 阶段2: Scan (auto)
运行 `scanner/index.cjs` → ATR/HV/分位数计算 + 加权排名 → 产出 `candidates.json`（Top 10）
- 自动排除：日均成交额 < 1亿 / 日均持仓 < 1万手 / 距交割 < 15天 / 涨跌停封板中

### 阶段3a: Filter-Hard (auto)
运行 `filter/hard-filter.cjs` → 确定性硬过滤 → 产出 `filtered-hard.json`
- 应用 `filter/rules.json` 规则
- 被剔除品种标记原因，**LLM 后续不得复活**

### 阶段3b: Filter-LLM (manual)
LLM 读 `filter/blueprint.md` → 从 filtered-hard.json 中降权/保留/标记观望 → 产出 `filtered.json`（≤3 个）
- **绝对禁止复活**已被 3a 剔除的品种
- 无明确驱动 → 降为"观望/不做"

### 阶段4: Analyze (manual)
LLM 读 `analyze/blueprint.md` → 对每个入选品种执行 6 问框架 → 产出 `analysis.json`
- 基差/库存/会员持仓仅此阶段通过 mx-data/WebSearch 获取
- 每个方向判断必须有可证伪的失效条件

### 阶段5: Report (manual)
LLM 读 `report/template.md` → 组装 4 章短报告 → 产出 `report.md` + 更新 `current.md`
- 报告 ≤ 150 行

## 数据纪律

- 扫描范围严格限定 `config/symbols.json` 白名单，运行时不可自动扩展
- akshare 为主力行情源（全市场扫描）；mx-data/WebSearch 仅用于 Top 3 增强
- 基差/库存/会员持仓不出现在全市场扫描中（只出现在 Top 3 深挖里）
- 每条数据标 source + fetchedAt（provenance 机制）
- 报告阶段不得调用数据源；所有值取自已完成的快照

## Iron Boundaries

| 维度 | 允许 | 禁止 |
|------|------|------|
| 品种范围 | 白名单驱动，仅扫描 symbols.json | 外盘/冷门/临近交割/成交断层；禁止运行时动态发现 |
| 数据源 | akshare 主力行情源 + mx-data/WebSearch 仅 Top 3 增强 | Wind/iFinD/ttfund |
| 频率 | 日频（收盘后跑一次） | 盘中实时/分钟线 |
| 候选上限 | Top 10 → 过滤后 ≤ 3 深挖 | 超 3 个丢入"今日不做什么" |
| 报告 | 4 章 ≤ 150 行 | 9 章全品类研究报告 |

## 文件索引

| 阶段 | 读哪些 |
|------|--------|
| 前置 | `VERSION.md` → 运行 `collector/probe-sources.cjs` |
| 0-Probe | `collector/probe-sources.cjs` → `config/sources.json` |
| 1-Collect | `collector/akshare-futures.cjs` → `config/symbols.json` |
| 2-Scan | `scanner/index.cjs` → `config/symbols.json` |
| 3a-FilterHard | `filter/hard-filter.cjs` → `filter/rules.json` |
| 3b-FilterLLM | `filter/blueprint.md` |
| 4-Analyze | `analyze/blueprint.md` |
| 5-Report | `report/template.md` → 产出 `report.md` → 更新 `current.md` |
