# Analyze Blueprint — 6 问深度分析框架

> Stage: 4 (after filter-llm) | Type: LLM manual | Output: `analysis.json`

## Input

- `filtered.json` — ≤3 KEEP candidates with filter decisions
- `raw.json` — full OHLCV data for detailed price analysis
- WebSearch — industry news, policy events, external market moves (ONLY for Top 3)

## The 6 Questions

For each candidate, answer all 6 questions. Each answer must cite evidence — a data point, a news source, or a verifiable correlation. No hand-waving.

### Q1: 为什么动？— What is the primary driver?

Identify the DOMINANT driver (pick ONE primary, mention secondary):

| Driver | Evidence Sources |
|--------|-----------------|
| **宏观 Macro** | Dollar index direction, CNH moves, bond yields, commodity index (文华商品), FOMC/PBOC policy |
| **产业 Industry** | Supply disruption (weather/accident/policy), seasonal demand, inventory data, maintenance schedule |
| **政策 Policy** | Export controls, environmental restrictions, reserve releases, trade tariffs |
| **外盘 External** | Overnight LME/CBOT/ICE/NYMEX moves, correlation breakdown |
| **资金 Fund flow** | OI change direction + vol multiplier, position concentration |

**Rules:**
- If the driver is "macro" but the contract moved opposite to its sector → driver is NOT macro, look deeper.
- If you can't find ANY driver after searching → output `driver: "unknown"` and set confidence to `"low"`.
- Never say "技术面驱动" — technicals are price description, not causation.

### Q2: 趋势还是脉冲？— Trend or impulse?

Examine 3 dimensions of conviction:

```
量 (Volume):      volMultiplier ≥ 1.5 → volume confirms
                  volMultiplier < 0.8 → move is fading

仓 (Open Interest): OI trend (last 5d vs 20d avg):
                    OI ↑ + price ↑ → long building (bullish conviction)
                    OI ↑ + price ↓ → short building (bearish conviction)
                    OI ↓ + price → → liquidation (no conviction, fading)

价 (Price):        vsMA20 direction matches 5d return → trend aligned
                  vsMA20 opposite to 5d return → mean reversion candidate
                  vsMA60 as structural trend filter
```

Output: `"trend"`, `"impulse"`, or `"mixed"` with the reasoning.

### Q3: 多空哪边更有赔率？— Which side has better odds?

Evidence table — list what supports long vs short. Do NOT just say "涨了所以看多":

| Evidence | Long Case | Short Case |
|----------|-----------|------------|
| Price position vs MA | Above 20/60 MA → trend supports long | Below 20/60 MA → trend supports short |
| Volume structure | Vol expanding on up days → accumulation | Vol expanding on down days → distribution |
| OI structure | OI rising with price → new longs | OI rising against price → new shorts |
| Macro tailwind | Dollar weakening, risk-on | Dollar strengthening, risk-off |
| Industry catalyst | Supply cut, demand surge | Demand drop, inventory build |
| Seasonality | Historical bullish window | Historical bearish window |

Output: `"bias": "bullish|bearish|neutral"` with a SHORT paragraph explaining which side's evidence is stronger and WHY.

### Q4: 关键确认信号？— What confirms the trade?

2-3 specific, measurable triggers. Each must be falsifiable:

```
Example (good):  "SC0 跌破 560 且成交量 ≥ 20万手 → 确认空头方向"
Example (bad):   "如果继续下跌就做空"  (too vague, no level, no volume)
Example (good):  "RB0 持仓量突破 200万手 + 价格站上 3300 → 多头确认"
```

### Q5: 失效条件？— What invalidates the trade?

1-2 specific conditions that would make the opportunity "wrong":

```
Example: "SC0 若3日内回到 580 以上 → 空头逻辑失效，止损"
Example: "若OPEC+宣布额外减产 → 供给端驱动反转，退出"
```

Each failure condition must be: (a) specific and measurable, (b) not just "price goes the other way", (c) tied to the driver identified in Q1.

### Q6: 交易风险？— What are the trade-specific risks?

| Risk Category | Check |
|---------------|-------|
| **涨跌停距离** | `limitDown% = (close - limitDown) / close × 100`. If < 3% → 跌停风险 |
| **夜盘跳空** | Is this contract traded overnight? (SHFE/INE/DCE night session 21:00-02:30) → gap risk |
| **保证金** | ~5-15% of contract value. Higher = more leverage risk |
| **移仓** | Days to next contract roll (approximate from expiry cycle) |
| **事件风险** | Upcoming data releases, policy announcements, OPEC+ meetings |

## Anti-Patterns (砚砚's Gates)

These are HARD FAIL conditions — if you catch yourself doing any of these, stop and redo:

1. **循环解释**: "因为涨了所以看多" / "因为跌了所以看空" — price movement is the subject of analysis, not the cause.
2. **无证伪条件**: Every direction call MUST have at least one falsifiable failure condition (Q5).
3. **过度拟合**: Don't explain a -0.5% move with 3 macro factors. Small moves are noise.
4. **忽略反面证据**: If you can't list at least ONE argument for the opposing side (Q3), you're not thinking hard enough.
5. **编造驱动**: If WebSearch finds nothing, write "无明确驱动" — don't invent a narrative.

## Output Format (`analysis.json`)

```json
{
  "meta": {
    "runId": "<runId>",
    "analyzedAt": "<ISO timestamp>",
    "candidateCount": <N>
  },
  "analyses": [
    {
      "symbol": "SC0",
      "name": "原油",
      "direction": "bearish",
      "confidence": "medium",
      "q1_driver": {
        "primary": "宏观-FOMC",
        "secondary": "外盘-美原油库存超预期",
        "evidence": "FOMC维持利率不变但暗示9月加息可能；EIA库存意外增加320万桶",
        "source": "WebSearch: Reuters 2026-07-30"
      },
      "q2_trendOrImpulse": {
        "judgment": "impulse",
        "volumeConviction": "low — volMult 2.04 but OI down 3%, suggesting liquidation not new shorts",
        "oiStructure": "OI declining against price drop → longs exiting, not shorts building",
        "priceAlignment": "mixed — below MA20 but MA60 flat, no structural downtrend"
      },
      "q3_odds": {
        "bias": "bearish",
        "longCase": ["价格已从高点回落12%，技术面超卖可能反弹", "FOMC若超预期鸽派则美元走弱利好原油"],
        "shortCase": ["EIA库存持续积累3周，供需基本面偏空", "全球经济放缓预期压制需求端", "2倍放量下跌说明大资金在出逃"],
        "summary": "短期空头证据更强，但OI下降说明是获利了结而非新空建仓，趋势持续性存疑。"
      },
      "q4_confirmation": {
        "signals": [
          "SC0跌破560且成交量≥20万手确认",
          "OI停止下降并开始积累（说明新空头进场替代获利了结）"
        ]
      },
      "q5_invalidation": {
        "conditions": [
          "SC0 3日内回到580以上 → 空头逻辑失效",
          "OPEC+宣布紧急会议或减产 → 供给侧驱动反转"
        ]
      },
      "q6_risks": {
        "limitDistance": "跌停板距离约8%，风险可控",
        "overnightGap": "INE夜盘(21:00-02:30)，外盘波动可能造成跳空",
        "margin": "合约价值约57万/手，保证金约5.7-8.5万/手",
        "eventRisk": "明日发布的美国PCE数据可能引发美元/原油剧烈波动"
      },
      "enhancedData": {
        "webSearchSources": ["https://...", "https://..."],
        "correlationCheck": "SC0与WTI近5日相关性0.92，外盘联动确认"
      }
    }
  ]
}
```

## Post-Analysis Sanity Check

Before outputting, verify:
- [ ] Each analysis answers all 6 questions
- [ ] Q1 has a cited driver source (not speculation)
- [ ] Q2 checks volume, OI, AND price structure (all 3)
- [ ] Q3 lists at least ONE argument for the opposing side
- [ ] Q4/Q5 are specific and falsifiable
- [ ] No "因为涨所以多" circular reasoning
