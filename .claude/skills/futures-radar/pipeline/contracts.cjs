// pipeline/contracts.cjs — futures-radar v0.1.0
// Single source of truth for artifact and stage declarations.
// Shared by pipeline/run.cjs (orchestrator).
//
// Pipeline: source-probe → collect → scan → filter-hard → filter-llm → analyze → probability → report
// auto stages: source-probe, collect, scan, filter-hard, probability
// manual (LLM) stages: filter-llm, analyze, report

const artifacts = [
  {
    id: 'source-probe',
    path: '{runDir}/source-probe.json',
    stage: 'source-probe',
    required: true,
    producedBy: 'collector/probe-sources.cjs',
    consumedBy: ['consistency']
  },
  {
    id: 'raw-json',
    path: '{runDir}/raw.json',
    stage: 'collect',
    required: true,
    producedBy: 'collector/akshare-futures.cjs',
    consumedBy: ['scan', 'report']
  },
  {
    id: 'raw-snapshot',
    path: '{runDir}/raw-snapshot.md',
    stage: 'collect',
    required: true,
    producedBy: 'collector/akshare-futures.cjs',
    consumedBy: ['report']
  },
  {
    id: 'provenance-json',
    path: '{runDir}/provenance.json',
    stage: 'collect',
    required: true,
    producedBy: 'collector/akshare-futures.cjs',
    consumedBy: ['consistency']
  },
  {
    id: 'candidates-json',
    path: '{runDir}/candidates.json',
    stage: 'scan',
    required: true,
    producedBy: 'scanner/index.cjs',
    consumedBy: ['filter-hard', 'filter-llm', 'report']
  },
  {
    id: 'filtered-hard-json',
    path: '{runDir}/filtered-hard.json',
    stage: 'filter-hard',
    required: true,
    producedBy: 'filter/hard-filter.cjs',
    consumedBy: ['filter-llm'],
    note: 'Hard-filtered candidates — LLM must NOT resurrect items filtered out here'
  },
  {
    id: 'filtered-json',
    path: '{runDir}/filtered.json',
    stage: 'filter-llm',
    required: true,
    producedBy: 'manual (LLM follows filter/blueprint.md)',
    consumedBy: ['analyze', 'report'],
    note: '≤3 candidates after soft filter. LLM cannot resurrect items removed by filter-hard.'
  },
  {
    id: 'analysis-json',
    path: '{runDir}/analysis.json',
    stage: 'analyze',
    required: true,
    producedBy: 'manual (LLM follows analyze/blueprint.md)',
    consumedBy: ['probability']
  },
  {
    id: 'probability-json',
    path: '{runDir}/probability.json',
    stage: 'probability',
    required: true,
    producedBy: 'probability/stage-4-5.cjs',
    consumedBy: ['report'],
    note: 'HV probability cones + ATR comparison for KEEP candidates'
  },
  {
    id: 'report',
    path: '{runDir}/report.md',
    stage: 'report',
    required: true,
    producedBy: 'manual (LLM follows report/template.md)',
    consumedBy: ['consistency', 'current']
  },
  {
    id: 'current',
    path: '{runtimeRoot}/current.md',
    stage: 'publish-current',
    required: false,
    producedBy: 'manual (LLM updates after report)',
    consumedBy: []
  }
];

// Pipeline stages in topological order.
// auto=true: deterministic script; auto=false: LLM/manual work.
const stages = [
  // ── Stage 0: Source Probe ──
  {
    id: 'source-probe',
    label: '数据源探测',
    auto: true,
    dependsOn: [],
    inputs: [],
    outputs: ['source-probe'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node collector/probe-sources.cjs --runId {runId}',
    script: 'collector/probe-sources.cjs',
    args: (runId) => ['--runId', runId]
  },

  // ── Stage 1: Collect ──
  {
    id: 'collect',
    label: '采集 (akshare 期货行情)',
    auto: true,
    dependsOn: ['source-probe'],
    inputs: ['source-probe'],
    outputs: ['raw-json', 'raw-snapshot', 'provenance-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node collector/akshare-futures.cjs --runId {runId}',
    script: 'collector/akshare-futures.cjs',
    args: (runId) => ['--runId', runId],
    note: 'Phase 3 implementation — currently placeholder'
  },

  // ── Stage 2: Scan ──
  {
    id: 'scan',
    label: '波动率扫描与排名',
    auto: true,
    dependsOn: ['collect'],
    inputs: ['raw-json'],
    outputs: ['candidates-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node scanner/index.cjs --runId {runId}',
    script: 'scanner/index.cjs',
    args: (runId) => ['--runId', runId],
    note: 'Phase 4 implementation — currently placeholder'
  },

  // ── Stage 3a: Filter-Hard ──
  {
    id: 'filter-hard',
    label: '确定性硬过滤',
    auto: true,
    dependsOn: ['scan'],
    inputs: ['candidates-json'],
    outputs: ['filtered-hard-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node filter/hard-filter.cjs --runId {runId}',
    script: 'filter/hard-filter.cjs',
    args: (runId) => ['--runId', runId],
    note: 'Phase 5 implementation (auto/deterministic stage, not LLM). Applies filter/rules.json.'
  },

  // ── Stage 3b: Filter-LLM (Manual) ──
  {
    id: 'filter-llm',
    label: '软过滤 (LLM)',
    auto: false,
    dependsOn: ['filter-hard'],
    inputs: ['filtered-hard-json', 'candidates-json'],
    outputs: ['filtered-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    manualInstruction: 'LLM: read filter/blueprint.md. From filtered-hard.json, evaluate each candidate against 5 soft criteria. Downgrade/keep/mark观望. ≤3 candidates. ABSOLUTELY FORBIDDEN: resurrecting items removed by filter-hard. Output: filtered.json.',
    note: 'LLM: read filter/blueprint.md. Evaluate each candidate from filtered-hard.json. Downgrade/keep/mark观望. ≤3. Do NOT resurrect hard-filtered items.'
  },

  // ── Stage 4: Analyze (Manual) ──
  {
    id: 'analyze',
    label: '6问深度分析 (LLM)',
    auto: false,
    dependsOn: ['filter-llm'],
    inputs: ['filtered-json', 'raw-json'],
    outputs: ['analysis-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    manualInstruction: 'LLM: read analyze/blueprint.md. For each candidate in filtered.json, execute the 6-question framework. Use WebSearch for industry news/policy events. Do NOT fabricate drivers. Output: analysis.json.',
    note: 'LLM: read analyze/blueprint.md. Execute 6Q framework per candidate. WebSearch for enhancement data. No driver fabrication.'
  },

  // ── Stage 4.5: Probability (Auto) ──
  {
    id: 'probability',
    label: 'HV 概率锥估算',
    auto: true,
    dependsOn: ['analyze'],
    inputs: ['filtered-json', 'candidates-json', 'raw-json'],
    outputs: ['probability-json'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node probability/stage-4-5.cjs --runId {runId}',
    script: 'probability/stage-4-5.cjs',
    args: (runId) => ['--runId', runId],
    note: 'Auto stage: Calculate HV-based probability cones and ATR comparison for KEEP candidates'
  },

  // ── Stage 5: Report (Manual) ──
  {
    id: 'report',
    label: '报告生成 (LLM)',
    auto: false,
    dependsOn: ['probability'],
    inputs: ['analysis-json', 'probability-json', 'candidates-json', 'filtered-json', 'raw-snapshot'],
    outputs: ['report'],
    validators: [],
    failurePolicy: 'hard_fail',
    manualInstruction: 'LLM: Read report/docs/report-architecture.md. Follow 5A/5B/5C pipeline: (1) Build report-facts.json from 5 artifacts, (2) Build report-model.json by integrating analysis.json, (3) Render report.md from report-model.json. Ensure structure completeness (4 chapters + appendix), data quality warnings, and judgment change annotations.',
    note: 'Phase 8 architecture: Three-stage pipeline (facts → model → markdown). Structure-driven, not line-count-driven. Gold standard report (20260730-1701-auto/report.md) serves as visual reference only.'
  },

  // ── Publish ──
  {
    id: 'publish-current',
    label: '发布 current.md (LLM)',
    auto: false,
    dependsOn: ['report'],
    inputs: ['report'],
    outputs: ['current'],
    validators: [],
    failurePolicy: 'warn',
    manualInstruction: 'LLM: update current.md with runId, report summary, and key candidates from report.md.',
    note: 'LLM: update current.md with runId, report summary, and key candidates.'
  }
];

module.exports = { artifacts, stages };
