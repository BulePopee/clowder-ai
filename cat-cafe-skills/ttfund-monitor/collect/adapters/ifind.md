# Module: iFinD Adapter
# Role: L2 Data Source — EDB Interface

## Entry

- Path: `D:/clowder-ai/packages/api/skills/ifind-finance-data-1.1.0/`
- API: `require('./call-node.js').call('edb', 'get_edb_data', { query })`
- CWD: must execute from `D:/clowder-ai/packages/api` (module uses relative path `./skills/`)

## Response Structure

```javascript
function parse(r) {
  if (!r?.ok || !r?.data?.result?.content?.[0]?.text) return null;
  const inner = JSON.parse(r.data.result.content[0].text);
  return inner?.data || null;
}
```

- Single-value: `parse(r).datas[i].data.data` → take **first** row (iFinD returns newest-first, descending date order)
- Kline (time series): `parse(r).datas[0].data.data` → array of `[date, value]`, newest-first
- **CRITICAL**: iFinD returns data sorted newest-first (descending date). "last row" = oldest value. Always take first row for latest value.

## Batch Table (6 batches, 26 calls, delay ≥2s)

| Batch | Items | NL Query |
|-------|-------|----------|
| 批1 商品 | G4 COMEX | `COMEX黄金期货 收盘价 2026年6月` |
| | G4 LBMA | `伦敦金现货 下午定盘价 2026年6月` |
| | COMEX银 | `COMEX白银期货 收盘价 2026年6月` |
| | O1 Brent | `Brent原油期货 收盘价 2026年6月` |
| | O2 WTI | `WTI原油期货 收盘价 2026年6月` |
| 批2 资金 | G7 SPDR | `SPDR黄金ETF持仓量 2026年6月` |
| | G8 CFTC多 | `COMEX黄金 资产管理机构多头持仓 2026` |
| | G8 CFTC空 | `COMEX黄金 资产管理机构空头持仓 2026` |
| 批3 债券 | A2 AAA | `中债企业债到期收益率(AAA):3Y` |
| | A2 国债 | `中债国债到期收益率:3Y` |
| | N4 IORB | `美国 准备金余额利率 IORB 最新` |
| | X4 CNH | `美元兑人民币离岸 2026年6月` |
| | B8 TIPS | `美国通胀保值国债收益率 10年期 2026年6月` |
| | B9 breakeven | `美国10年期盈亏平衡通胀率 2026年6月` |
| 批3b 货币 | M1 SHIBOR | `SHIBOR 3个月 2026年6月` |
| | M2 DR007 | `DR007 存款类机构质押式回购 2026年6月` |
| | M2a OMO | `央行7天逆回购操作利率 OMO 2026` |
| | N1 US 3M | `美国国债收益率 3个月 2026年6月` |
| | B5 CN 30Y | `中债国债收益率 30年 2026年6月` |
| | B7 CN 2Y | `中债国债收益率 2年 2026年6月` |
| | M4 R007 备选 | `银行间7天质押式回购加权利率 2026年6月` |
| 批4 kline | E1 kline | `纳斯达克100指数 2026年5月 2026年6月 收盘价` |
| | E2 kline | `沪深300指数 2026年5月 2026年6月 收盘价` |
| | E3 kline | `创业板指 2026年5月 2026年6月 收盘价` |
| 批5 P1扩展 | B10 HY OAS | `美银美林美国高收益利差 2026年6月` |
| | N6 FRA-OIS | `FRA-OIS利差 2026年6月` |
| | N7 (derived) | `N7=SOFR-IORB利差 (N2−N4派生)` |
| | S3 AAII | `AAII投资者情绪 2026年6月` |

## Known Issues

- 频控 429 → 不可并行，间隔 ≥2s
- `index_id` 经常返回空 `datas:[]` → 优先 NL query
- Fed 政策利率 (F1/F2) iFinD 数据为空 → 走 Wind
- COMEX 可用 `index_id: S024772000` 但 NL query 更稳定
- kline 提取路径与单值不同：`datas[0].data.data` vs `datas[i].data.data`
- kline 双月范围返回 ~31-33 行，取最近 20 条计算 20MA（first 20 = 最新 20）
- **2026-06-18 发现**: iFinD 返回数据为降序（最新在前）。原 "take last row" 规则导致所有数据取到最旧值，造成 iFinD 全线 stale 假象。已修正为 "take first row"。

## Design Note

本 adapter 只描述调用/批次/提取/坑。批次和命令是执行参考，指标→命令的正式映射在 `source-map.md`。
