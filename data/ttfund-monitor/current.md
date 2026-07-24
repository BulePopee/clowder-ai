# ttfund-monitor 最新报告

- 最新 runId: 20260724-1520-auto
- 报告时间: 2026-07-24 07:35 UTC (15:35 CST)
- 轮次: 常规轮 (routine)
- 框架: v2.7.0
- 覆盖: 56 total / 50 fresh / 4 staleGap / 0 missing
- WebSearch: 7/7 filled / 0 pending / 2 blocked (F1/F2 by Wind contract)
- Portfolio: S1=ok S2=empty S3=unavailable S4=empty
- Reason: A-layer ✅ (0 blockers, 2 warnings) + B-layer 3 blueprints ✅
- Guard: 0 blockers / 2 warnings (G008: 4 staleGap / G009: portfolio data partial) → action_advice_allowed=true
- 置信度: **Medium** — 数据覆盖率极高(50 fresh/0 missing)但市场极端事件(oil shock+FOMC 5天后)使宏观判断不确定
- 操作建议: **HOLD 维持不动** — 防御触发2/7(TIPS>2.0%+Brent>$100)，组合事实防御(MMF 33.3%+债券14.9%=48.2%低风险)，FOMC 7/28-29仅5天→等待决议
- 宏观判定: **Tightening Late-Cycle with Oil Shock** — TIPS 2.43%(+8bp)限制性强化 + Brent $101(+20.3% from Jul 17 $84)突破$100心理关口 + 伊朗/霍尔木兹地缘风险 + FOMC 5天后
- 防御信号: 2/7触发 (TIPS>2.0% + Brent>$100[新增]) + TIPS接近2.5%触发线
- 黄金判定: Moderately Bearish — 加权评分 **-0.72**(恶化 from -0.665), CFTC **8.49:1**(极端拥挤), COMEX $4048(+0.8%), 结构性+地缘买盘战胜利率压制
- 🔴 油价冲击: Brent $84→$101(+20.3%) — 本轮核心变化，伊朗/霍尔木兹地缘升级驱动，改变通胀+利率路径预期
- 🟡 VIX悖论: VIX 16.64(-2.13) — 油价$101情况下反直觉下降，市场可能underpricing伊朗尾部风险
- 利率: US 2Y 4.37%(+16bp) / US 10Y 4.71%(+11bp) / TIPS 2.43%(+8bp) — 短期利率大幅上行反映市场重定价Fed加息概率
- FOMC: 7/28-29(仅5天), F1=3.75%/F2=3.412% June(Wind权威源), B4 FedWatch 34.7% Jul / 82% Sep
- 组合状态: 8只基金 ¥4,510.94(+13.4% vs 7/21 ¥3,979.31 — 主要为市场估值变动), MMF 33.3%/黄金 15.2%/固收 14.9%/美股 5.5%/A股 15.1%/混合 8.7%/其他 7.3%/HQB 0%
- 组合偏离: HQB 0%严重不足(但MMF 33.3%提供流动性), 黄金微超防御上限0.2pp(15.2%)
- 资产变化: Nasdaq 28455(-0.5%), 沪深300 4649(-0.6%), 创业板3481, 中美利差-2.97bp进一步扩大
- 下一检查点: 2026-07-30 (FOMC 7/28-29会后), 失效条件: TIPS>2.5%/Brent>$105+FOMC加息/VIX>25/FOMC意外加息50bp
- 前置检查: ttfund=available iFinD=available Wind=available
- Source contracts: validate-source-contract-post PASS — 0 errors, 1 warning (A1 ifind null → WebSearch fallback OK)
- P5-C: Wind F1/F2恢复✅, WebSearch 7/7 filled首次实现0 pending
- 完整报告: runs/20260724-1520-auto/report.md

---
## P5 系列验收

| 修复项 | 状态 | 效果 |
|--------|:--:|------|
| P4-A unit normalization | ✅ | G7 SPDR oz→吨 auto-normalized |
| P4-B run contract | ✅ | 17-stage topology + verify.cjs |
| P4-C source adapter contract | ✅ | source-contracts.json + probe gate + validate-source-contract |
| P5-B indicator onboarding contract | ✅ | indicator-contracts.json + validate-indicator-contract 7-dimension gate |
| P5-C depth probe hardening | ✅ | ttfund/iFinD/Wind real-data endpoint probes |
| P5-C data gap root cause fix | ✅ | 4 root causes fixed |
| P5-C Wind recovery | ✅ | Wind depth probe pass — F1=3.75%/F2=3.412% June |
| P5-D WebSearch reflow pipeline | ✅ | 7/7 filled + 2 blocked, dual-gate validated, 0 pending (首次) |
