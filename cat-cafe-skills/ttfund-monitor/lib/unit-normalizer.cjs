// lib/unit-normalizer.cjs — ttfund-monitor v2.6.1 (P4-A)
// Shared unit normalization engine. Reads config/indicator-units.json.
// Consumers: build-temporal-diff.cjs (strong — delta computed with canonical values),
//            build-evidence-packet.cjs (observation only — adds unit_normalization_notes),
//            validate-run-consistency.cjs §6 (drift detection).
//
// normalize(indicatorId, entry) → {
//   value, unit, rawValue, rawUnit, detectedUnit, canonicalUnit,
//   normalized, ruleId, warning
// }

const path = require('path');

let _unitConfig = null;

function loadUnitConfig() {
  if (_unitConfig) return _unitConfig;
  const configPath = path.join(__dirname, '..', 'config', 'indicator-units.json');
  try {
    _unitConfig = require(configPath);
  } catch (_) {
    _unitConfig = { indicators: {} };
  }
  return _unitConfig;
}

function detectUnit(indicatorId, value) {
  const cfg = loadUnitConfig();
  const indicator = cfg.indicators[indicatorId];
  if (!indicator || value == null || isNaN(value)) return null;

  for (const range of indicator.ranges) {
    if (value >= range.min && value <= range.max) {
      return { ruleId: range.id, unit: range.unit };
    }
  }
  return null; // value outside all known ranges
}

function normalize(indicatorId, entry) {
  const cfg = loadUnitConfig();
  const indicator = cfg.indicators[indicatorId];

  // Base return: no config, no normalization
  if (!indicator || !entry || entry.value == null || isNaN(entry.value)) {
    return {
      value: entry?.value ?? null,
      unit: entry?.unit ?? null,
      rawValue: entry?.value ?? null,
      rawUnit: entry?.unit ?? null,
      detectedUnit: null,
      canonicalUnit: null,
      normalized: false,
      ruleId: null,
      warning: null
    };
  }

  const detected = detectUnit(indicatorId, entry.value);
  const rawValue = entry.value;
  const rawUnit = entry.unit;

  if (!detected) {
    return {
      value: rawValue,
      unit: rawUnit,
      rawValue,
      rawUnit,
      detectedUnit: null,
      canonicalUnit: indicator.canonicalUnit,
      normalized: false,
      ruleId: null,
      warning: `${indicatorId}(${indicator.name}): value ${rawValue} outside all known range groups, unit drift cannot be detected`
    };
  }

  // Already in canonical unit
  if (detected.unit === indicator.canonicalUnit) {
    return {
      value: rawValue,
      unit: indicator.canonicalUnit,
      rawValue,
      rawUnit,
      detectedUnit: detected.unit,
      canonicalUnit: indicator.canonicalUnit,
      normalized: false,
      ruleId: detected.ruleId,
      warning: null
    };
  }

  // Need conversion
  const rule = indicator.toCanonical[detected.unit];
  if (!rule) {
    return {
      value: rawValue,
      unit: rawUnit,
      rawValue,
      rawUnit,
      detectedUnit: detected.unit,
      canonicalUnit: indicator.canonicalUnit,
      normalized: false,
      ruleId: detected.ruleId,
      warning: `${indicatorId}(${indicator.name}): detected as ${detected.unit} but no toCanonical rule for ${detected.unit}→${indicator.canonicalUnit}`
    };
  }

  const newValue = rule.operation === 'divide'
    ? rawValue / rule.factor
    : rawValue * rule.factor;

  return {
    value: newValue,
    unit: indicator.canonicalUnit,
    rawValue,
    rawUnit,
    detectedUnit: detected.unit,
    canonicalUnit: indicator.canonicalUnit,
    normalized: true,
    ruleId: detected.ruleId,
    warning: `${indicatorId}(${indicator.name}): 单位归一化 ${detected.unit}→${indicator.canonicalUnit} (rule: ${detected.ruleId}) — source adapter 跨轮口径漂移`
  };
}

module.exports = { normalize, detectUnit, loadUnitConfig };
