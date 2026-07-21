# ttfund-monitor 最新报告

- 最新 runId: 20260721-1117-auto
- 报告时间: 2026-07-21 03:22 UTC (11:22 CST)
- 轮次: 常规轮 (routine)
- 框架: v2.7.0 (P5-C depth probe hardening + Wind recovery)
- 覆盖: 56 attempted | fresh:40 staleSuccess:3 staleGap:6 missing:4
- WebSearch补采: 10项待补采 (B4/F3/N3/A3/N5等, F1/F2已由Wind覆盖)
- Portfolio: S1=ok S2=empty S3=unavailable S4=empty
- iFinD: 38 calls, 36 OK, 2 null (A1/N7)
- Wind: 2 calls, 2 OK ✅ (F1=3.75%, F2=3.3654% June) — depth probe pass
- Reason: A-layer ✅ (0 blockers, 2 warnings) + B-layer 3 blueprints ✅
- Guard: 0 blockers / 2 warnings (G008: 6 staleGap / G009: portfolio data partial) → action_advice_allowed=true
- 置信度: **中等** — 0个关键指标缺口，Wind F1/F2恢复→Fed政策评估权威性提升。降级因素：S1 VIX staleGap 4d、B4 FedWatch未采集
- 操作建议: **HOLD 维持当前配置** — 防御触发仅1/5 (TIPS>2.0%)，组合事实防御(MMF 40.4%+债券15.5%=55.9%低风险)，FOMC 7/28-29仅7天→等待决议
- 宏观判定: **Transitional (紧缩后期+地缘风险升温)** — TIPS 2.35%高位 + 曲线正利差+0.39bp + **Brent $89(+5.9% in 4d)新增通胀风险** + VIX 18.77(+3.1pt)情绪恶化
- 防御信号: 1/5触发 (B8 TIPS>2.0%) + 曲线正利差削弱防御必要性 + 新增油价飙升但未触发新防御条件
- 黄金判定: Moderately Bearish — 加权评分 **-0.665**(较上次-0.588恶化), CFTC **8.49:1**(较上次7.19:1拥挤加剧), COMEX $4014(+1.0%), 国内溢价从+1.09%转折价-0.44%
- ⚠️ CFTC拥挤: 8.49:1创新高(上周7.19:1) — 投机多头在油价飙升时进一步加仓，回调风险加剧
- 🔴 油价飙升: Brent $84→$89(+5.9% in 4d) — 本轮最大变化，地缘风险溢价(伊朗/霍尔木兹)，若>$90持续可能改变通胀预期路径
- FOMC: 7/28-29(仅7天), F1=3.75%/F2=3.3654% June(Wind权威源), B4 FedWatch未采集
- Wind: ✅ 恢复 — F1/F2从WebSearch升级至Wind权威源，F2首次提供6月核心PCE 3.3654%
- 组合状态: 8只基金 ¥3,979.31(↓¥69.57/-1.7% vs 7/17), MMF 40.4%/黄金 15.1%/固收 15.5%/美股 5.8%/A股 14.6%/混合 8.6%/HQB 0%
- 组合偏离: HQB 0%严重不足(但MMF 40.4%提供充足流动性), A股14.6%低于正常目标, 黄金超防御上限0.1pp(15.1%), 总资产缩水主因混合型宝盈↓¥42.81+股债齐跌
- 资产变化: Nasdaq 28604(-3.4% vs 20MA, -5.9% from 6/18 high), 沪深300 4668(从4529反弹但-4.3% vs 20MA), 创业板3443(-16.0% vs 20MA, 自7/1暴跌19.2%)
- 下一检查点: 7/30(FOMC会后), 事件触发: US 10Y>5.0%(FB-002)/TIPS>2.5%/Brent>$95持续3d/VIX>25/COMEX<$3800
- 前置检查: ttfund=available iFinD=available Wind=available(✅ 恢复)
- Depth probes: ttfund✅(G2 proxy可用) iFinD✅ Wind✅(F1/F2 OK)
- Source contracts: validate-source-contract warn (4 fallback_violations: E1/X2/N2/M4 iFinD, 白名单需更新)
- Temporal-diff: status=degraded | baseline=20260717-1520-auto (4d prior, degraded) | 21 compared, 0 new, 0 lost, 2 divergent | regime direction consistent
- Feedback: 2 cross_refs (FB-001: E2 invalidate macro-regime, FB-002: B2>5.0% trigger portfolio) | action_advice_allowed=true
- P5-C: Wind恢复→Fed数据权威性提升, ttfund G2 proxy机制有效
- 完整报告: runs/20260721-1117-auto/report.md

---
## P5 系列验收

| 修复项 | 状态 | 效果 |
|--------|:--:|------|
| P4-A unit normalization | ✅ | G7 SPDR oz→吨 auto-normalized, unit-normalizer.cjs validated |
| P4-B run contract | ✅ | 17-stage topology + verify.cjs |
| P4-C source adapter contract | ✅ | source-contracts.json + probe gate + validate-source-contract |
| P5-B indicator onboarding contract | ✅ | indicator-contracts.json + validate-indicator-contract 7-dimension gate |
| P5-C depth probe hardening | ✅ | ttfund/iFinD/Wind real-data endpoint probes; exit 3=degraded continue |
| P5-C data gap root cause fix (7/17) | ✅ | 4 root causes fixed — ttfund datePath(5), iFinD kline query(1), Wind→iFinD migration(5), WebSearch patch(9) |
| P5-C Wind recovery (7/21) | ✅ | Wind depth probe pass — F1=3.75%/F2=3.3654% June from authoritative source |
