# Module: Portfolio Snapshot Schema
# Role: Portfolio Snapshot Output Format

## Overview

Portfolio 采集器产出两份 snapshot（与 macro snapshot 对称，但独立管理）：

| 文件 | 格式 | 消费者 |
|------|------|--------|
| `portfolio-snapshot.json` | 机器可读，四源原始值 | 下游计算 / 差分对比 |
| `portfolio-snapshot.md` | 人类可读，格式化表格 | `report/sections/5-holdings.md` |

存储路径: `{runtimeRoot}/runs/{runId}/portfolio-snapshot.json` + `.md`

## portfolio-snapshot.json Schema

```jsonc
{
  "meta": {
    "runId": "20260626-0948-ragdoll-vzes",
    "collectedAt": "2026-06-26T09:48:00+08:00",
    "version": "1.0.0"
  },
  "sources": {
    "S1_holding": {
      "status": "ok",          // ok | partial | empty | failed | unavailable
      "error": null,           // null or error message
      "collectedAt": "ISO8601",
      "data": {
        "total": {
          "total": 3633.59,     // 总资产 (元)
          "hqb": 0.00,          // 活期宝
          "fund": 3633.59,      // 基金（含货币基金）
          "tg": 0.00,           // 投顾
          "gdlc": 0.00,         // 高端理财
          "pension": 0.00,      // 养老
          "gold": 0.00          // 黄金
        },
        "list": [
          {
            "fundName": "长城收益宝货币C",
            "fundCode": "016778",
            "pType": "fund",           // hqb | fund | gdlc | tg
            "assetValue": 2030.80,     // 资产金额 (元)
            "dailyProfit": null,       // 日收益，null 表示不支持
            "toOrYesDayProfit": false, // false=昨日, true=今日
            "holdProfit": null,        // 持仓收益金额
            "holdProfitRate": null,    // 持仓收益率 (%)
            "constantProfit": null,    // 持有收益金额
            "constantProfitRate": null // 持有收益率 (%)
          }
          // ... more holdings
        ],
        "hqb": {
          "totalCount": 0,
          "holds": [
            {
              "fundCode": "004545",
              "fundName": "...",
              "assetValue": 0.00,
              "availableVol": 0.00,
              "currentRealBalance": 0.00,
              "unpaidProfit": 0.00,
              "annual7D": null,    // 七日年化 (%)
              "unitAccrual": null  // 万份收益
            }
          ]
        },
        "gold": {
          "amount": 0.00,
          "weight": 0.00,
          "holdCost": 0.00,
          "holdProfit": 0.00,
          "holdProfitRate": null,
          "positionCost": 0.00,
          "positionProfit": 0.00,
          "positionProfitRate": null,
          "todayProfit": 0.00,
          "totalProfit": 0.00,
          "totalProfitRate": null,
          "currentGoldPrice": 0.00
        },
        "pension": {
          "totalAssetValue": 0.00,
          "totalDailyProfit": 0.00,
          "details": []
        }
      }
    },
    "S2_profit": {
      "status": "ok",
      "error": null,
      "collectedAt": "ISO8601",
      "data": {
        "total": {
          "total_profit": null,          // 累计总收益 (元)
          "total_profit_rate": null,     // 累计总收益率 (%)
          "hold_profit": null,           // 持有收益
          "hold_profit_rate": null,      // 持有收益率
          "hqb_profit": null,            // 活期宝累计收益
          "fund_profit": null,           // 基金累计收益
          "today_profit": null,          // 今日收益
          "ytd_profit": null,            // YTD 收益
          "position_profit": null,       // 持仓收益
          "position_profit_rate": null   // 持仓收益率
        },
        "funds": [
          {
            "fundCode": "016778",
            "fundName": "长城收益宝货币C",
            "positionProfit": null,
            "positionProfitRate": null,
            "constantProfit": null,
            "constantProfitRate": null,
            "totalProfit": null,
            "totalProfitRate": null,
            "todayProfit": null
          }
        ]
      }
    },
    "S3_analysis": {
      "status": "ok",           // ok | partial | empty | failed | unavailable
      "error": null,
      "collectedAt": "ISO8601",
      "data": {
        "asset_type_pct": {
          "fetched": true,
          "data": [
            { "index": "权益", "平均占比(%)": 50.42 },
            { "index": "固收", "平均占比(%)": 24.16 }
          ]
        },
        "fund_type_pct": {
          "fetched": true,
          "data": [
            { "index": "QDII", "平均占比(%)": 16.67 },
            { "index": "商品", "平均占比(%)": 21.86 }
          ]
        },
        "hold_perform": {
          "fetched": true,
          "data": [
            {
              "pdate": "2026-06-25",
              "ret": 0.12,
              "nav": 1.0234,
              "benchmark_nav": 1.0100,
              "最大回撤%": -5.32,
              "胜率%": 55.0,
              "最大连续上涨日": 4,
              "最大连续下跌日": 3,
              "最大回撤区": "2026-03-01~2026-03-15"
            }
          ]
        },
        "bull_bear": {
          "fetched": true,
          "data": [
            {
              "start_dt": "2025-06-15",
              "end_dt": "2025-12-31",
              "situation_name": "牛市",
              "持仓收益%": 15.30,
              "基准收益%": 10.20,
              "超额收益%": 5.10,
              "最大回撤%": -3.20
            }
          ]
        },
        "capm": {
          "fetched": true,
          "data": {
            "alpha": 0.061,
            "beta": 1.313,
            "r_squared": 0.85,
            "p_value": 0.01,
            "n_obs": 120,
            "annualized_alpha": 0.073
          }
        },
        "irr": {
          "fetched": false,
          "error": "当前账户无 IRR 数据"
        }
      }
    },
    "S4_trade": {
      "status": "ok",
      "error": null,
      "collectedAt": "ISO8601",
      "data": {
        "list": [
          {
            "date": "2026-06-24",
            "type": "组合调仓",
            "fundName": "再平衡循环对冲",
            "fundCode": null,
            "amount": null,
            "status": "onWay",
            "tradeType": "组合",
            "comboName": "再平衡循环对冲"
          }
        ]
      }
    }
  }
}
```

## portfolio-snapshot.md Schema

遵循 `collect/snapshot-schema.md` 的格式约定，分章节输出四源数据。

```markdown
# 账户持仓快照 · YYYY-MM-DD HH:MM CST

## 元信息
- runId: {runId}
- 采集时间: {collectedAt}
- 数据源状态: S1=ok S2=ok S3=partial S4=ok
- 三栏隔离: 实盘 ✓ | 模拟(MP10447790) 未采集 | 回测("持仓优化0428") 未采集

## S1 持仓总览

### 资产汇总
| 类别 | 金额(元) |
|------|----------|
| 总资产 | {total} |
| 活期宝 | {hqb} |
| 基金 | {fund} |
| 黄金 | {gold} |
| 投顾 | {tg} |
| 养老 | {pension} |

### 持仓明细
| # | 基金名称 | 代码 | pType | 资产(元) | 持仓收益(元) | 持仓收益率 | 持有收益(元) | 持有收益率 | 日收益 |
|---|---------|------|-------|---------|------------|-----------|------------|-----------|--------|
| 1 | {name} | {code} | {pType} | {assetValue} | {holdProfit} | {holdProfitRate} | {constantProfit} | {constantProfitRate} | {dailyProfit} ({toOrYesDay}) |

### 活期宝明细
无活期宝持仓（或列表，含 fundCode/fundName/assetValue/annual7D）

### 黄金持仓
无黄金持仓（或金额+克重+持有/持仓收益率）

## S2 收益汇总

| 口径 | 金额(元) | 收益率 |
|------|---------|--------|
| YTD 收益 | {ytd_profit} | — |
| 累计总收益 | {total_profit} | {total_profit_rate} |
| 持有收益 | {hold_profit} | {hold_profit_rate} |
| 持仓收益 | {position_profit} | {position_profit_rate} |
| 今日收益 | {today_profit} | — |

### 逐只收益
| 基金 | 持仓收益 | 持仓收益率 | 持有收益 | 持有收益率 | 累计收益 | 今日收益 |
|------|---------|-----------|---------|-----------|---------|---------|
| {name} | {positionProfit} | {positionProfitRate} | {constantProfit} | {constantProfitRate} | {totalProfit} | {todayProfit} |

## S3 组合分析

### 大类资产占比（历史均值）
| 类型 | 平均占比(%) |
|------|------------|
| {index} | {平均占比(%)} |

### 基金类型占比（历史均值）
| 类型 | 平均占比(%) |
|------|------------|
| {index} | {平均占比(%)} |

### 近期表现（最近 5 日）
| 日期 | 日收益(%) | 净值 | 基准净值 | 最大回撤(%) |
|------|----------|------|---------|------------|
| {pdate} | {ret} | {nav} | {benchmark_nav} | {最大回撤%} |

### 牛熊阶段
| 区间 | 状态 | 持仓收益(%) | 基准收益(%) | 超额(%) |
|------|------|------------|------------|---------|
| {start_dt}~{end_dt} | {situation_name} | {持仓收益%} | {基准收益%} | {超额收益%} |

### CAPM 归因
- Alpha: {alpha}
- Beta: {beta}
- R²: {r_squared}
- P-value: {p_value}

### IRR
无数据（当前账户不支持 IRR 计算）

## S4 近期交易

| 日期 | 类型 | 基金/组合 | 代码 | 金额(元) | 状态 | 渠道 |
|------|------|----------|------|---------|------|------|
| {date} | {type} | {fundName} | {fundCode} | {amount} | {status} | {tradeType} |
```

## Rules

- S1-S4 各源独立采集，`status=failed` 的源在 .md 中输出 "🔴 采集失败" + error 信息，不阻塞其他源
- `portfolio-snapshot.json` 的字段名使用 camelCase（与 API 原始字段一致），.md 使用中文表头
- S3 `irr` 当前始终 `fetched=false`，写死但不阻塞（待 ttfund 支持后更新）
- .md 中的收益率统一保留 2 位小数，金额保留 2 位小数
- `holdProfit` / `constantProfit` 为 null 时（货币基金/活期宝不支持），显示 "--"
- 日收益口径标注: `toOrYesDay=false` → 标"昨"，`true` → 标"今"
- **三栏隔离在元信息中显式标注**: 实盘 ✓ | 模拟 未采集/已采集 | 回测 不纳入

## Self-Check

1. .json 中 4 个 source 键均存在（fail 时 status=failed, data=null）
2. .md 元信息包含三栏隔离标注
3. .md 中持仓收益率口径标注（持仓 vs 持有），不裸写"收益率"
4. 收益率 null 统一显示为 "--"，不显示 "0%" 或 "N/A"
