// pipeline/contracts.cjs — ttfund-monitor v2.8.0 (P5-B)
// Single source of truth for artifact and stage declarations.
// Shared by pipeline/run.cjs (orchestrator), pipeline/verify.cjs (contract verifier),
// and validate-run-consistency.cjs (validator).
// P4-B: stages now carry inputs, outputs, validators, failurePolicy, rebuildCommand/manualInstruction.
// P5-B: added validate-indicator-contract stage (config-level gate, pre-pipeline).
// Stage order IS the topological dependency graph — no separate verifyOrder needed.

const artifacts = [
  {
    id: 'source-probe',
    path: '{runDir}/source-probe.json',
    stage: 'source-probe',
    required: true,
    producedBy: 'collector/probe-sources.cjs',
    consumedBy: ['validate-source-contract', 'consistency']
  },
  {
    id: 'raw-json',
    path: '{runDir}/raw.json',
    stage: 'collect',
    required: true,
    producedBy: 'collector/index.cjs',
    consumedBy: ['evidence', 'freshness-only']
  },
  {
    id: 'raw-snapshot',
    path: '{runDir}/raw-snapshot.md',
    stage: 'collect',
    required: true,
    producedBy: 'collector/index.cjs',
    consumedBy: ['compute', 'evidence', 'report']
  },
  {
    id: 'provenance',
    path: '{runDir}/provenance.md',
    stage: 'collect',
    required: true,
    producedBy: 'collector/index.cjs',
    consumedBy: ['evidence', 'report']
  },
  {
    id: 'provenance-json',
    path: '{runDir}/provenance.json',
    stage: 'collect',
    required: true,
    producedBy: 'collector/index.cjs',
    consumedBy: ['validate-source-contract', 'consistency']
  },
  {
    id: 'gaps',
    path: '{runDir}/gaps.json',
    stage: 'collect',
    required: true,
    producedBy: 'collector/index.cjs',
    consumedBy: ['evidence', 'report']
  },
  {
    id: 'portfolio-json',
    path: '{runDir}/portfolio-snapshot.json',
    stage: 'portfolio',
    required: false,
    requiredForReport: true,
    failure: 'g001_blocker',
    failureNote: '缺失不阻塞 macro 管道，但 Reason A-layer 触发 G001 → Report 第5-6章只能输出"无法给出行动建议"',
    producedBy: 'portfolio/collect.cjs',
    consumedBy: ['evidence']
  },
  {
    id: 'portfolio-snapshot',
    path: '{runDir}/portfolio-snapshot.md',
    stage: 'portfolio',
    required: false,
    requiredForReport: true,
    failure: 'g001_blocker',
    failureNote: '缺失不阻塞 macro 管道，但 Reason A-layer 触发 G001 → Report 第5-6章只能输出"无法给出行动建议"',
    producedBy: 'portfolio/collect.cjs',
    consumedBy: ['report']
  },
  {
    id: 'derived-snapshot',
    path: '{runDir}/derived-snapshot.md',
    stage: 'compute',
    required: true,
    producedBy: 'compute/index.cjs',
    consumedBy: ['evidence', 'report']
  },
  {
    id: 'derived-json',
    path: '{runDir}/derived.json',
    stage: 'compute',
    required: true,
    producedBy: 'compute/index.cjs',
    consumedBy: ['evidence', 'report', 'consistency']
  },
  {
    id: 'evidence-packet',
    path: '{runDir}/evidence-packet.json',
    stage: 'evidence',
    required: true,
    producedBy: 'reasoning/build-evidence-packet.cjs',
    consumedBy: ['reasoning-validate', 'reason-b', 'report', 'consistency']
  },
  {
    id: 'reasoning-snapshot',
    path: '{runDir}/reasoning-snapshot.json',
    stage: 'reason-b',
    required: true,
    producedBy: 'manual (LLM follows reasoning/README.md blueprints)',
    consumedBy: ['reasoning-validate', 'report', 'consistency']
  },
  {
    id: 'reasoning-md',
    path: '{runDir}/reasoning-snapshot.md',
    stage: 'reason-b',
    required: false,
    producedBy: 'manual (LLM follows reasoning/README.md blueprints)',
    consumedBy: ['report']
  },
  {
    id: 'temporal-diff',
    path: '{runDir}/temporal-diff.json',
    stage: 'temporal-diff',
    required: false,
    requiredForConsistency: false,
    failure: 'degraded',
    failureNote: 'Missing when no prior run with complete reasoning exists (no_baseline). Does not block pipeline.',
    producedBy: 'reasoning/build-temporal-diff.cjs',
    consumedBy: ['feedback', 'validate-temporal-diff', 'consistency']
  },
  {
    id: 'feedback',
    path: '{runDir}/feedback.json',
    stage: 'feedback',
    required: false,
    requiredForReport: false,
    note: 'P3.2-A: deterministic cross-blueprint feedback. required=false for backward compat with pre-P3.2 runs.',
    producedBy: 'reasoning/build-feedback.cjs',
    consumedBy: ['feedback-validate', 'consistency']
  },
  {
    id: 'report',
    path: '{runDir}/report.md',
    stage: 'report',
    required: true,
    producedBy: 'manual (LLM follows report/index.md)',
    consumedBy: ['consistency', 'current']
  },
  {
    id: 'current',
    path: '{runtimeRoot}/current.md',
    stage: 'publish-current',
    required: false,
    producedBy: 'manual (LLM updates after report)',
    consumedBy: ['consistency']
  }
];

// Pipeline stages in topological order (P4-B: order IS the dependency graph).
// Each stage declares its inputs/outputs/validators/failurePolicy/rebuildCommand.
// auto=true: deterministic script; auto=false: LLM/manual work.
const stages = [
  // ── Stage 0: Config Gate (pre-pipeline) ──
  {
    id: 'validate-indicator-contract',
    label: '验证指标契约 (P5-B)',
    auto: true,
    dependsOn: [],
    inputs: [],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node validate-indicator-contract.cjs',
    script: 'validate-indicator-contract.cjs',
    args: () => []
  },
  // ── Stage 1: Source Probe ──
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
  // ── Stage 2: Data Collection ──
  {
    id: 'collect',
    label: '采集 (宏观数据)',
    auto: true,
    dependsOn: ['source-probe'],
    inputs: ['source-probe'],
    outputs: ['raw-json', 'raw-snapshot', 'provenance', 'provenance-json', 'gaps'],
    validators: ['validate-source-contract'],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node collector/index.cjs --round routine --runId {runId}',
    script: 'collector/index.cjs',
    args: (runId, mode) => ['--round', mode === 'validation' ? 'routine' : 'routine', '--runId', runId]
  },
  {
    id: 'validate-source-contract',
    label: '验证数据源契约',
    auto: true,
    dependsOn: ['source-probe', 'collect'],
    inputs: ['source-probe', 'raw-json', 'provenance-json'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node collector/validate-source-contract.cjs --runId {runId}',
    script: 'collector/validate-source-contract.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'portfolio',
    label: '采集 (组合持仓)',
    auto: true,
    dependsOn: [],
    inputs: [],
    outputs: ['portfolio-json', 'portfolio-snapshot'],
    validators: [],
    failurePolicy: 'warn',
    rebuildCommand: 'node portfolio/collect.cjs --runId {runId}',
    script: 'portfolio/collect.cjs',
    args: (runId) => ['--runId', runId]
  },
  // ── Stage 3: Compute ──
  {
    id: 'compute',
    label: '派生计算',
    auto: true,
    dependsOn: ['collect'],
    inputs: ['raw-json', 'raw-snapshot'],
    outputs: ['derived-json', 'derived-snapshot'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node compute/index.cjs --runId {runId}',
    script: 'compute/index.cjs',
    args: (runId) => ['--runId', runId]
  },
  // ── Stage 4: Reason ──
  {
    id: 'evidence',
    label: '证据包构建 (Reason A-layer)',
    auto: true,
    dependsOn: ['collect', 'portfolio', 'compute'],
    inputs: ['raw-json', 'derived-json', 'portfolio-json'],
    outputs: ['evidence-packet'],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node reasoning/build-evidence-packet.cjs --runId {runId}',
    script: 'reasoning/build-evidence-packet.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'reason-b',
    label: '推理 B-layer (LLM)',
    auto: false,
    dependsOn: ['evidence'],
    inputs: ['evidence-packet', 'raw-snapshot', 'derived-snapshot', 'portfolio-snapshot'],
    outputs: ['reasoning-snapshot', 'reasoning-md'],
    validators: ['validate-reasoning'],
    failurePolicy: 'hard_fail',
    manualInstruction: 'LLM: read reasoning/README.md, generate reasoning-snapshot.json + .md from evidence-packet + raw/derived/portfolio snapshots. Do NOT access external data sources.',
    note: 'LLM: read reasoning/README.md, generate reasoning-snapshot.json + reasoning-snapshot.md from evidence-packet + raw/derived/portfolio snapshots. Do NOT access external data sources.'
  },
  {
    id: 'validate-reasoning',
    label: '验证推理快照',
    auto: true,
    dependsOn: ['reason-b'],
    inputs: ['reasoning-snapshot'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node reasoning/validate-reasoning-snapshot.cjs --runId {runId}',
    script: 'reasoning/validate-reasoning-snapshot.cjs',
    args: (runId) => ['--runId', runId]
  },
  // ── Stage 4.5: Temporal Diff ──
  {
    id: 'temporal-diff',
    label: '时序对比',
    auto: true,
    dependsOn: ['reason-b'],
    inputs: ['raw-json', 'derived-json', 'reasoning-snapshot'],
    outputs: ['temporal-diff'],
    validators: ['validate-temporal-diff'],
    failurePolicy: 'degraded',
    rebuildCommand: 'node reasoning/build-temporal-diff.cjs --runId {runId}',
    script: 'reasoning/build-temporal-diff.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'validate-temporal-diff',
    label: '验证时序对比',
    auto: true,
    dependsOn: ['temporal-diff'],
    inputs: ['temporal-diff'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node reasoning/validate-temporal-diff.cjs --runId {runId}',
    script: 'reasoning/validate-temporal-diff.cjs',
    args: (runId) => ['--runId', runId]
  },
  // ── Stage 4.6: Feedback ──
  {
    id: 'feedback',
    label: '跨蓝图反馈 (P3.2-A)',
    auto: true,
    dependsOn: ['temporal-diff', 'evidence', 'reason-b'],
    inputs: ['temporal-diff', 'evidence-packet', 'reasoning-snapshot'],
    outputs: ['feedback'],
    validators: ['validate-feedback'],
    failurePolicy: 'warn',
    rebuildCommand: 'node reasoning/build-feedback.cjs --runId {runId}',
    script: 'reasoning/build-feedback.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'validate-feedback',
    label: '验证反馈',
    auto: true,
    dependsOn: ['feedback'],
    inputs: ['feedback'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node reasoning/validate-feedback.cjs --runId {runId}',
    script: 'reasoning/validate-feedback.cjs',
    args: (runId) => ['--runId', runId]
  },
  // ── Stage 5: Report ──
  {
    id: 'report',
    label: '报告生成 (LLM)',
    auto: false,
    dependsOn: ['reason-b', 'temporal-diff', 'feedback'],
    inputs: ['evidence-packet', 'reasoning-snapshot', 'temporal-diff', 'feedback', 'raw-snapshot', 'derived-snapshot'],
    outputs: ['report'],
    validators: ['validate-report'],
    failurePolicy: 'hard_fail',
    manualInstruction: 'LLM: read report/index.md, assemble report.md from raw/derived snapshots + evidence-packet + reasoning-snapshot + feedback. Then update current.md. Do NOT access external data sources.',
    note: 'LLM: read report/index.md, assemble report.md from raw-snapshot + derived-snapshot + evidence-packet + reasoning-snapshot. Then update current.md. Do NOT access external data sources.'
  },
  {
    id: 'validate-report',
    label: '验证报告结构',
    auto: true,
    dependsOn: ['report'],
    inputs: ['report'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node report/validate-report.cjs --runId {runId}',
    script: 'report/validate-report.cjs',
    args: (runId) => ['--runId', runId]
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
    manualInstruction: 'LLM: update current.md with runId, report summary, and key metrics from report.md.',
    note: 'LLM: update current.md with runId, report summary, and key metrics from report.md.'
  },
  // ── Final Gate ──
  {
    id: 'consistency',
    label: '全链路一致性校验',
    auto: true,
    dependsOn: ['validate-indicator-contract', 'validate-source-contract', 'validate-reasoning', 'validate-temporal-diff', 'validate-feedback', 'validate-report', 'publish-current'],
    inputs: ['source-probe', 'raw-json', 'derived-json', 'evidence-packet', 'reasoning-snapshot', 'temporal-diff', 'feedback', 'report', 'current'],
    outputs: [],
    validators: [],
    failurePolicy: 'hard_fail',
    rebuildCommand: 'node validate-run-consistency.cjs --runId {runId}',
    script: 'validate-run-consistency.cjs',
    args: (runId) => ['--runId', runId]
  }
];

module.exports = { artifacts, stages };
