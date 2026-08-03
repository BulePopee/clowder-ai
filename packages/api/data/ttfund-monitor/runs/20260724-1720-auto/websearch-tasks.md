# WebSearch Tasks — runId: 20260724-1720-auto
## Generated: 2026-07-24T09:23:07.415Z

## Fillable (7 items)

Execute these WebSearch queries. For each: record value, date, source URL.

| ID | Name | Query | Unit | Critical | Write Policy |
|:--:|------|-------|------|:--:|------|
| A1 | MOVE | `ICE BofA MOVE index latest value` |  | no | fallback_allowed |
| B4 | FedWatch | `CME FedWatch latest rate hike probability` | % | no | fillable_websearch |
| F3 | 下次FOMC | `FOMC meeting schedule 2026 next meeting date` |  | no | fillable_websearch |
| N3 | Crane 100 MMF | `Crane 100 money fund yield index latest` | % | no | fillable_websearch |
| A3 | 北向成交额 | `北向资金 今日成交额` | 亿元 | no | fallback_allowed |
| N5 | 美国MMF总规模 | `ICI US money market fund total assets latest` | T | no | fallback_allowed |
| R3 | IG OAS | `US investment grade corporate bond OAS spread latest` | bp | no | fallback_allowed |

## Blocked / Disclosure Only (2 items)

These indicators are BLOCKED by source contract — WebSearch values are advisory only, NEVER written to raw.json.

| ID | Name | Query | Unit | Reason |
|:--:|------|-------|------|------|
| F1 | 联邦基金利率上限 | `Federal funds rate target upper bound latest` | % | Wind contract explicitly forbids websearch fallback for critical indicators (source-contracts.json wind.fallbackRestrictions.websearch.forbiddenFor) |
| F2 | 核心PCE YoY | `US core PCE price index year-over-year latest` | % | Wind contract explicitly forbids websearch fallback for critical indicators (source-contracts.json wind.fallbackRestrictions.websearch.forbiddenFor) |

## Results (fill per item)

### A1 — MOVE
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### B4 — FedWatch
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### F3 — 下次FOMC
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### N3 — Crane 100 MMF
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### A3 — 北向成交额
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### N5 — 美国MMF总规模
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

### R3 — IG OAS
- **Value**: 
- **Date**: 
- **Source URL**: 
- **Source Title**: 
- **Notes**: 

## Disclosure Notes (advisory only, never in raw.json)

### F1 — 联邦基金利率上限 (BLOCKED)
- **Advisory value**: 
- **Date**: 
- **Source URL**: 
- **Notes**: Wind contract explicitly forbids websearch fallback for critical indicators (source-contracts.json wind.fallbackRestrictions.websearch.forbiddenFor)

### F2 — 核心PCE YoY (BLOCKED)
- **Advisory value**: 
- **Date**: 
- **Source URL**: 
- **Notes**: Wind contract explicitly forbids websearch fallback for critical indicators (source-contracts.json wind.fallbackRestrictions.websearch.forbiddenFor)

