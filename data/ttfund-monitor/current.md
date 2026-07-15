# ttfund-monitor 最新报告

- 最新 runId: 20260714-1609-auto
- 报告时间: 2026-07-14 16:20 CST
- 轮次: 常规轮 (routine)
- 框架: v2.6.2 (P4-A unit normalization + P4-B pipeline replay & run contract)
- 覆盖: 55 attempted | fresh:39 staleSuccess:1 staleGap:4 noDate:4 missing:4
- Portfolio: S1=ok S2=empty S3=unavailable S4=empty
- iFinD: 33 indicators, 30 OK, 3 null (A1/N5/N7)
- Reason: A-layer ✅ (0 blockers, 2 warnings) + B-layer 3 blueprints ✅
- Guard: 0 blockers / 2 warnings (G008: 4 staleGap / G009: portfolio data partial) → action_advice_allowed=true
- 置信度: **中** — 核心指标 17/17 fresh，辅助指标有时效缺口但不影响主结论
- 操作建议: **维持** — 2/6 防御触发器(TIPS 2.36% + FedWatch 46%)，FOMC 7/28-29 前不宜操作
- 宏观判定: **Stagflation-Lite** — 紧货币(TIPS 2.36%↑·FedWatch 46% hike)·地缘推油价(Brent $83 +$9)·黄金崩$4,000·中国分化(CNH走强/A股走弱)
- 防御信号: 2/6 触发 (B8 TIPS > 2.0%, B4 FedWatch hike > 40%) — 不满足全面切换条件(需≥3/6)
- 黄金判定: 偏熊 — 加权评分 -0.56, 冲突已从"背离"转为"一致下行", TIPS 2.36% → COMEX $3,997(-$110)
- FedWatch: 7月加息概率 ~46% (WebSearch)
- FOMC: 7/28-29 下次会议
- 组合状态: 8只基金 ¥3,365.93, 货基 38.75%/黄金 14.95%/债券 15.20%/美股 6.88%/A股 24.23%/HQB 0%
- 组合偏离: HQB 0%严重不足(目标10-15%)，美股6.88%低于目标(15-20%)，黄金14.95%触及上限(10-15%)，A股24.23%略低于目标(25-30%)
- 近期交易: S4为空, 无近期交易记录
- 下一检查点: 7/29(FOMC决议日), 7/16-17(FOMC前最后一轮常规监测)
- 前置检查: ttfund=available iFinD=available Wind=available probe-sources=ok
- Temporal-diff: status=ok | baseline=20260708-1058-auto (validated, 6d prior) | 20 compared, 1 new, 0 lost | regime CHANGED: Policy Divergence → Stagflation-Lite | 3 significant changes (G2↓, G4↓, O1↑)
- Feedback: 4 cross_refs (3 add_invalidation_condition + 1 add_condition_to_act) | action_advice_allowed=true
- P3.2-B: Ch2.7跨资产一致性 ✅ + Ch6.6反馈信号参考 ✅ | validate-feedback 12/12 ✅
- 完整报告: runs/20260714-1609-auto/report.md

---
## P3.2-B 验收

| 修复项 | 状态 | 效果 |
|--------|:--:|------|
| feedback.json → Ch2.7 | ✅ | 4 cross_refs 全部展示，一致性评估"信号总体一致" |
| feedback.json → Ch6.6 | ✅ | 4 decision-relevant signals, 参考权重标注完成 |
| validate-feedback | ✅ | 12/12 checks passed |
| validate-report Check 5 | ✅ | feedback consumption 4 sub-checks passed |
| schema.json feedback段 | ✅ | requiredSubsections ch2.7 + ch6.6 |
| 全管道集成 | ✅ | Stage 4 B-layer → 4.5 temporal-diff → 4.6 feedback → 5 report 完整链路 |
| P3.2-B → 下一 P | ✅ | 反馈消费已落地，G7单位归一化修复完成 → 已进入 P4-A |
| P4-A unit normalization | ✅ | G7 contract + unit-normalizer.cjs + validate §6；3 新字段已同步 schema，4/4 validators pass |
| P4-B run contract | ✅ | 14-stage topology + verify.cjs + 3 acceptance tests pass |
