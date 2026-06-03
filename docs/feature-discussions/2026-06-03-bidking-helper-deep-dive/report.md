---
doc_kind: research-note
topics: [bidking-helper, open-source-teardown, game-hacking, bayesian-inference]
created: 2026-06-03
status: completed
source_repo: D:\赌神4.0极速版\赌神4.0极速版
source_commit: N/A (Compiled Electron App)
authored_by: @cat-xdjtxih7
covers: [architecture, star-features, algorithms, comparison]
---

# 赌神4.0极速版 (BidKing VIP) Deep Dive

## 0. Scope

- **User question:** 赌神项目分析 (Gambler project analysis)
- **Project:** 赌神4.0极速版 (BidKing VIP 2.6)
- **Source repo:** Closed-source, extracted from `D:\赌神4.0极速版\赌神4.0极速版`
- **Claims to verify:** Real-time puzzle solving and expected value estimation for blind-box/collectible bidding in an extraction shooter (Lost Light / Arena Breakout style).

## 1. Claim Ledger

| Claim | Source wording | Evidence paths | Verdict | Caveat |
|-------|----------------|----------------|---------|--------|
| **Real-time Game Hook** | "GameStartNotify" logs | `collector/bidking-protobuf-collector.exe` / `logParserWorker` | ✅ Verified | Sniffs protobuf traffic locally. |
| **Accurate Probability Estimation** | "价值分布", "单局出现概率", "期望" | `countAreaValuePosteriorWorker-CEIdHX1a.js`, `closedContourPosteriorWorker` | ✅ Verified | Uses real Bayesian updating (Prior * Likelihood). |
| **Handles Complex Grid Packing** | "unknown_area_core.wasm" | `unknownAreaWorker-DDZcophS.js`, `WASM_SEARCH_STEP_CHUNK` | ✅ Verified | Implements exact Polyomino packing solver in WASM. |
| **Never Freezes on Hard Problems** | "计算失败，转化为液态估算" | `liquefactionEstimateWorker-tDuUF_ZB.js` | ✅ Verified | Brilliant fallback strategy ("Liquefaction") for intractable shape-packing. |

## 2. Architecture Map

```text
[Game Client Network] 
       | (WinPcap/Raw Sockets)
       v
[bidking-protobuf-collector.exe] ---> (Writes Logs: TIMESTAMP_XXX [Network] S2C33GameStartNotify)
                                             |
                                             v
[Electron Renderer (index-Cfjv5Mgc.js)] <-- logParserWorker-Da3LAN4v.js (Extracts constraints: count, area, average value)
       |
       |--> [IndexedDB/SQLite] (Fetches MAP_DROP_COUNT_PRIOR from History)
       |
       |--> [unknownAreaWorker + unknown_area_core.wasm] (Exact Polyomino shape packing)
       |      |
       |      |--> Timeout / State explosion?
       |             |
       |             v
       |--> [liquefactionEstimateWorker] (Area/Count DP relaxation - "Liquid packing")
       |
       v
[Posterior Probability Workers] (Calculates Expected Value, Expected Value Share)
       |
       v
[Electron Vue/Pinia UI] (Renders heatmaps and bid recommendations)
```

- **Entrypoints:** `out/main/index.js` (Protected by V8 Bytecode via `bytecode-loader.cjs`), `bidking-protobuf-collector.exe`.
- **State stores:** `bidking-helper-history-db` (IndexedDB), `bidking-history.sqlite`.
- **Extension points:** Worker architecture allows scaling heavy DP/WASM computations across cores.

## 3. Star Feature Deep Dives

### "液态估算" (Liquefaction Estimation Fallback)

- **Public API / command:** Triggered implicitly when WASM packing times out (`LIQUEFACTION_FIT_TIME_BUDGET_MS = 350`) or when combination count exceeds `MAX_RENDERER_POTENTIAL_COMBINATIONS = 30`.
- **Core modules:** `liquefactionEstimateWorker-tDuUF_ZB.js`
- **State mutation:** Relaxes the hard 2D geometry constraints. Instead of tracking exact grid placements of Polyominoes, it treats items as "liquid" area blocks. It runs a 2D Knapsack DP (`LIQUEFACTION_AGGREGATE_DP_MAX_AREA = 260`, `LIQUEFACTION_AGGREGATE_DP_MAX_COUNT = 30`) to find all possible valid multisets of items that sum to the target area and value.
- **Future behavior:** To correct for the fact that "liquid" packing is strictly easier than rigid packing (meaning it overestimates combinations), it applies a `LIQUEFACTION_BASE_FRAGMENTATION_PENALTY` (0.06 - 0.28).
- **Verdict:** Highly sophisticated algorithmic fallback. Instead of just throwing a "Timeout" error, it trades exact spatial accuracy for statistical robustness.

### Bayesian History Prior (历史数据后验)

- **Public API / command:** Used when computing the final EV (Expected Value) of a bid.
- **Core modules:** `historyStatsWorker-CSA7P_R4.js`, `countAreaValuePosteriorWorker-CEIdHX1a.js`.
- **State mutation:** Continuously aggregates `GameStartNotify` and end-of-game results into a Prior distribution. When a new puzzle is presented (e.g., "3 items, 12 cells, 5000 average value"), it uses Bayes' Theorem: `P(Item | Constraints) ∝ P(Constraints | Item) * P(Item)`.
- **Future behavior:** This means if a "Gold" item theoretically fits the constraints, but history says it only drops 0.1% of the time on this specific map, the tool will heavily down-weight its probability, saving the player from overbidding.

## 4. Algorithm Peel Table

| Mechanism | Input | Output | Type | Code path | Mutates future behavior? |
|-----------|-------|--------|------|-----------|---------------------------|
| **Log Parser** | `S2C33GameStartNotify` string | Structured Constraints (Count, Total Area, Avg Value) | Rule-based regex | `logParserWorker-*.js` | No |
| **Grid Solver** | Grid bounds, Item shapes | Valid packing configurations | Exact Backtracking / Monte Carlo (WASM) | `unknown_area_core.wasm` | No |
| **Liquefaction DP** | Total Area, Item areas | Valid multiset configurations | 2D Knapsack DP (Area x Count) | `liquefactionEstimateWorker-*.js` | No |
| **Probability Engine** | Prior History + Valid configs | Posterior EV & Item % | Bayesian Inference | `*PosteriorWorker*.js` | Yes, as history grows |

## 5. Feedback Loops

| Claimed loop | signal | decision | state mutation | future behavior | verdict |
|--------------|--------|----------|----------------|-----------------|---------|
| **Dynamic Prior Updating** | Game result logs | Update map-specific drop rate | Writes to IndexedDB/SQLite | Changes prior for next game | ✅ Verified |

## 6. Cat Café Comparison

| Dimension | Project | Cat Café | Learn / Gap / Do Not Follow | Agent User Fit (L1/L2/L3) | Reason |
|-----------|---------|----------|-----------------------------|---------------------------|--------|
| **Timeout Fallback** | "Liquefaction" Algorithm | Fallback to cheaper model / generic prompt | **Learn**: Algorithmic relaxation | ✅ L3 | We should learn how to relax constraints systematically when exact solving times out, instead of just failing or retrying blindly. |
| **Off-thread computation**| Massive use of Web Workers | Main thread / Agent loop | **Learn**: Worker pools | ✅ L1 | Cat Cafe UI should offload heavy DOM/State diffing to Workers to keep UI 60fps. |
| **Memory Protection** | V8 bytenode `.jsc` | Source available | **Do Not Follow** | ❌ | Anti-tamper goes against open collaboration. |

## 7. Lessons / Next Steps

- **Candidate lessons:** 
  - **The "Liquefaction" Principle:** When exact constraint solving fails due to state explosion, always have a relaxed mathematical model (DP/Heuristic) ready, and apply an empirical penalty to correct the bias.
- **Next Steps:**
  - Forward this teardown to the team. The worker-based Bayesian architecture is a great reference for handling probabilistic real-time streams without blocking the UI.
