// scripts/check-fallback-layers.mjs — Quality Gate Step 2.6 (F177 Phase D)
// Scans ttfund-monitor source-contracts.json for fallback chain depth.
// ≥3 layers single-source or ≥5 total → coordinate-system self-check required.
// Usage: node scripts/check-fallback-layers.mjs

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_PATH = join(__dirname, '..', '.claude', 'skills', 'ttfund-monitor', 'config', 'source-contracts.json');

const BLOCK_SINGLE = 3;
const BLOCK_TOTAL = 5;

let contracts;
try {
  contracts = JSON.parse(readFileSync(CONTRACTS_PATH, 'utf8'));
} catch (e) {
  console.log('SKIP: source-contracts.json not found or invalid — nothing to check');
  process.exit(0);
}

const sources = contracts.sources || {};

// Transitive fallback depth
function maxDepth(sourceId, visited = new Set()) {
  if (visited.has(sourceId)) return 0;
  visited.add(sourceId);
  const src = sources[sourceId];
  if (!src) return 0;
  const targets = src.allowedFallbackTargets || [];
  if (targets.length === 0) return 0;
  let max = 0;
  for (const t of targets) {
    max = Math.max(max, maxDepth(t, new Set(visited)));
  }
  return 1 + max;
}

console.log('=== Fallback Layer Check (F177 Phase D) ===\n');

let totalLayers = 0;
let maxSingle = 0;

for (const [id, src] of Object.entries(sources)) {
  const d = maxDepth(id);
  const targets = src.allowedFallbackTargets || [];
  const chain = targets.length > 0 ? `${id} → ${targets.join(' → ')}` : `${id} (no fallback)`;
  console.log(`  ${chain}: ${d} layer(s)`);
  totalLayers += d;
  if (d > maxSingle) maxSingle = d;
}

console.log(`\nMax single-source depth: ${maxSingle} (threshold: ${BLOCK_SINGLE})`);
console.log(`Total layers: ${totalLayers} (threshold: ${BLOCK_TOTAL})`);

if (maxSingle >= BLOCK_SINGLE) {
  console.log(`\nBLOCKED: single-source fallback depth ${maxSingle} >= ${BLOCK_SINGLE}`);
  console.log('  Coordinate-system self-check:');
  console.log('  1. Fixing coordinate system or patching wrong one?');
  console.log('  2. Can coordinate transform eliminate layers?');
  console.log('  3. Why can\'t each layer be removed?');
  process.exit(1);
}

if (totalLayers >= BLOCK_TOTAL) {
  console.log(`\nBLOCKED: total fallback layers ${totalLayers} >= ${BLOCK_TOTAL}`);
  console.log('  Coordinate-system self-check required.');
  process.exit(1);
}

console.log('\nPASS: fallback layers within threshold\n');
process.exit(0);
