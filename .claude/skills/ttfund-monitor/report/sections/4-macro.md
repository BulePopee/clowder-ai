# Section 4: Macro Background

## Narrative Labels (P2 — 写前必读)

报告第 4 章分析宏观背景时，必须区分三种叙事标签，选 1 个为**主导叙事**（写在段首），其他 2 个为**背景叙事**（压缩到 1-2 句）。

禁止在同一段中混用不同叙事推导结论。

```
利率叙事（Interest Rate Narrative）:
  Signals: Fed 加息/降息概率、实际利率、收益率曲线陡峭化/扁平化、期限溢价
  推导方向: 利率↑ → 债券↓ / 黄金↓ / 成长股↓
  标志性表述: "加息预期升温推动..."

流动性叙事（Liquidity Narrative）:
  Signals: risk-off/risk-on、资金流入/流出、VIX、CNH-CNY 价差、MOVE、MMF AUM
  推导方向: 流动性收紧 → 风险资产↓ / 现金↑ / 避险资产↑
  标志性表述: "risk-off 资金流入美元..."

增长叙事（Growth Narrative）:
  Signals: PMI、就业、通胀预期、E5/E6 涨跌幅、企业盈利
  推导方向: 增长放缓 → 防御板块↑ / 周期↓ / 利率↓
  标志性表述: "经济韧性支撑..."
```

### Selection Rule

看 B4 (FedWatch) 和 S1 (VIX) 方向：
- B4 加息概率 > 40% 或 降息概率 > 40% → **利率叙事主导**（Fed 是市场主要矛盾）
- S1 VIX > 25 或 CNH−CNY 单日 ±200pips → **流动性叙事主导**（恐慌/贪婪是主要矛盾）
- E5/E6 20日涨跌幅 > ±5% 且 S1 < 20 → **增长叙事主导**（基本面是主要矛盾）
- 多个条件同时命中 → 取信号变化幅度最大的

## Template

```markdown
## 4. 宏观背景

**主导叙事**：{利率/流动性/增长}叙事 — {为什么选这个，引用具体信号}

### 美国端

{主导叙事下的美国端分析。利率叙事→重点Fed/收益率曲线；流动性叙事→重点VIX/DXY/资金流；增长叙事→重点PMI/就业/通胀}

### 中国端

{主导叙事下的中国端分析 + 背景叙事交叉引用。例如：利率叙事主导时，中国端主要看中美利差+资金面；流动性叙事主导时，看CNH−CNY+北向}

### 地缘端

{压缩到 1-2 句。背景叙事，不展开——除非当前 regime = A (地缘驱动)}
```

## Source

Values from `raw-snapshot.md`: F1 (fed rate), F2 (core PCE), F3 (next FOMC), B4 (FedWatch), B1-B7 (yields), M1-M4 (China money), N1-N5 (US money), S1 (VIX), S2 (CNN F&G), X1-X5 (FX), E1-E3 (equities), O1-O2 (oil).
