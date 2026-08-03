# Section 0: Collection Status

## Template

首行输出四句话结论：

```markdown
## 0. 摘要

1. **本轮风向**：{市场风向描述}（例如：美元实际利率上行，风险资产承压 / 多方向拉锯，无明确主导 / 通胀预期升温 / 信用压力上升）
2. **根因链**：{2-3 步因果链，引用第 2 章资产方向 + 主导驱动力}
3. **操作倾向**：维持/准备加仓/准备减仓 + 等待条件
4. **排除项**：这不是/尚不能确认是 {被排除的风险类型}，因为 {具体数据证据}
```

然后输出采集状态表：

```markdown
## 0. 采集状态

- 本轮覆盖：{collected}/{total} 项
- 采集时间：{startTime}-{endTime} CST
- 数据源分布：ttfund {n} / iFinD {n} / Wind {n} / EastMoney {n} / WebSearch {n}
- 时效：1d（债券/汇率/商品/指数）、实时（SHIBOR/PBOC中间价）、~48d（央行储备）、~90d（PCE）
- 缺口：{gapSummary}
```

## Source

所有值从 `raw-snapshot.md` 元信息提取。数据源分布按 snapshot 中各指标来源列统计。
