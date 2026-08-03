# Module: mx-data Adapter
# Role: L4 Data Source — EastMoney Python Interface

## Entry

- Path: `D:/clowder-ai/packages/api/skills/mx-data/`
- Command: `cd <path> && python mx_data.py <command> <args>`

## Coverage

A3 北向资金备用。EastMoney API 为主源时，mx-data 作为备选。

## Known Issues

- 非硬依赖（缺失 → 继续执行，A3 标缺口）
- Python 依赖需确认（首次使用前检查）

## Design Note

本 adapter 只描述调用方式。指标映射见 `source-map.md`。
