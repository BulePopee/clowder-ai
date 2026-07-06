// pipeline/contracts.cjs — ttfund-monitor v2.5.1
// Single source of truth for artifact and stage declarations.
// Shared by pipeline/run.cjs (orchestrator) and validate-run-consistency.cjs (validator).
// P1 scope: artifact list + stage order. P2 may add hash schemas.

const artifacts = [
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
    producedBy: 'manual (LLM follows compute/index.md)',
    consumedBy: ['evidence', 'report']
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
    stage: 'report',
    required: false,
    producedBy: 'manual (LLM updates after report)',
    consumedBy: ['consistency']
  }
];

// Pipeline stages in execution order.
// auto=true stages have a deterministic script; auto=false require LLM/manual work.
const stages = [
  {
    id: 'collect',
    label: 'Stage 2: Collect',
    auto: true,
    script: 'collector/index.cjs',
    args: (runId, mode) => ['--round', mode === 'validation' ? 'routine' : 'routine', '--runId', runId]
  },
  {
    id: 'portfolio',
    label: 'Stage 2: Portfolio',
    auto: true,
    script: 'portfolio/collect.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'compute',
    label: 'Stage 3: Compute',
    auto: false,
    note: 'LLM: read compute/index.md + compute/formulas.md, compute derived indicators from raw-snapshot, write derived-snapshot.md'
  },
  {
    id: 'evidence',
    label: 'Stage 4: Reason A-layer (Evidence)',
    auto: true,
    script: 'reasoning/build-evidence-packet.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'validate-reasoning',
    label: 'Stage 4: Validate Reasoning Snapshot',
    auto: true,
    script: 'reasoning/validate-reasoning-snapshot.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'reason-b',
    label: 'Stage 4: Reason B-layer (LLM)',
    auto: false,
    note: 'LLM: read reasoning/README.md, generate reasoning-snapshot.json + reasoning-snapshot.md from evidence-packet + raw/derived/portfolio snapshots. Do NOT access external data sources.'
  },
  {
    id: 'report',
    label: 'Stage 5: Report (LLM)',
    auto: false,
    note: 'LLM: read report/index.md, assemble report.md from raw-snapshot + derived-snapshot + evidence-packet + reasoning-snapshot. Then update current.md. Do NOT access external data sources.'
  },
  {
    id: 'validate-report',
    label: 'Stage 5: Validate Report Structure',
    auto: true,
    script: 'report/validate-report.cjs',
    args: (runId) => ['--runId', runId]
  },
  {
    id: 'consistency',
    label: 'Stage 5: Consistency Validator',
    auto: true,
    script: 'validate-run-consistency.cjs',
    args: (runId) => ['--runId', runId]
  }
];

module.exports = { artifacts, stages };
