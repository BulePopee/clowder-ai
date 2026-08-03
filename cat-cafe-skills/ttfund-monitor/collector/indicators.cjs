// collector/indicators.cjs — ttfund-monitor v2.5.1
// Backward-compat wrapper for legacy consumers. Loads split configs and assembles
// the original monolithic shape so existing `require('./indicators.cjs')` calls still work.
// TRUTH SOURCE: config/indicators.json + config/sources.json + config/tools.template.json.
// This file is NOT the primary config — it's a glue layer. Modify the split configs, not this.
// tools.json is gitignored — missing on a fresh machine. loadToolConfig() returns null then,
// and tool paths come through as undefined (consumers already handle unavailable tools).

const path = require('path');
const { loadToolConfig } = require(path.join(__dirname, '..', 'lib', 'workspace.cjs'));

const tools = loadToolConfig() || {};
const sources = require(path.join(__dirname, '..', 'config', 'sources.json'));
const meta = require(path.join(__dirname, '..', 'config', 'indicators.json'));

module.exports = {
  version: meta.version,
  description: meta.description,
  sources: {
    ttfund: { cli: tools.ttfund?.cli, ...sources.ttfund },
    ifind: { entry: tools.ifind?.entry, cwd: tools.ifind?.cwd, ...sources.ifind },
    wind: { entry: tools.wind?.entry, cwd: tools.wind?.cwd, ...sources.wind },
    mxdata: { entry: tools.mxdata?.entry, ...sources.mxdata }
  },
  websearch: sources.websearch,
  criticalIds: meta.criticalIds,
  indicatorNames: meta.indicatorNames,
  freshness: meta.freshness
};
