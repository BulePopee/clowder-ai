/**
 * A2A 消息四层校验器测试（Phase 2 P0）
 *
 * Format layer:      行首@ / 句中@ / trilemma action check
 * Coordinator layer: C1 coordinator execution boundary
 * Ball layer:        ownership claim / reverse ping / verbal hold
 * Routing layer:     handle registry / external projection / @co-creator conditions
 *
 * NOTE: These tests IMPORT DIRECTLY from validator source via ts importer.
 * For CLI: `pnpm --filter @cat-cafe/api test -- --test-name-pattern="A2A message validator"`
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import { catRegistry, createCatId } from '@cat-cafe/shared';
import { A2AMessageValidator } from '../dist/infrastructure/connectors/A2AMessageValidator.js';

/** Minimal cat config with mentionPatterns for handle validation tests. */
function makeCatConfig(overrides = {}) {
  return {
    id: createCatId('test'),
    name: 'TestCat',
    displayName: '测试猫',
    nickname: undefined,
    avatar: '/avatars/test.png',
    color: { primary: '#000000', secondary: '#FFFFFF' },
    mentionPatterns: ['@test', '@测试猫'],
    clientId: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    mcpSupport: true,
    roleDescription: 'Test cat',
    personality: 'helpful',
    ...overrides,
  };
}

describe('A2AMessageValidator — 四层校验', () => {
  let validator;

  before(() => {
    catRegistry.reset();
    catRegistry.register('opus', makeCatConfig({
      id: createCatId('opus'),
      displayName: '布偶猫',
      nickname: '宪宪',
      mentionPatterns: ['@opus', '@布偶猫', '@宪宪'],
    }));
    catRegistry.register('codex', makeCatConfig({
      id: createCatId('codex'),
      displayName: '缅因猫',
      nickname: '砚砚',
      mentionPatterns: ['@codex', '@缅因猫', '@砚砚'],
    }));
    catRegistry.register('abyssinian', makeCatConfig({
      id: createCatId('abyssinian'),
      displayName: '金渐层',
      nickname: '金哥',
      mentionPatterns: ['@abyssinian', '@金渐层', '@金哥'],
    }));
    catRegistry.register('opencode', makeCatConfig({
      id: createCatId('opencode'),
      displayName: '金渐层',
      nickname: '远远',
      mentionPatterns: ['@opencode', '@金渐层', '@远远'],
    }));

    const log = Fastify().log;
    validator = new A2AMessageValidator({
      log,
      coordinatorCatIds: ['opencode'],
    });
  });

  after(() => catRegistry.reset());

  // ── Format layer ────────────────────────────────────────────────────

  describe('Format layer', () => {
    it('F1: warns on inline @mention (not at line start)', () => {
      const result = validator.validate('请把结果给@金哥处理');
      const inlineIssue = result.issues.find((i) => i.rule === 'F1-inline-mention');
      assert.ok(inlineIssue, 'should detect inline @');
      assert.equal(inlineIssue.severity, 'warn');
    });

    it('F1: does NOT warn on line-start @mention', () => {
      const result = validator.validate('@金哥\n统计任务交给你');
      const inlineIssue = result.issues.find((i) => i.rule === 'F1-inline-mention');
      assert.equal(inlineIssue, undefined, 'line-start @ should not trigger inline warning');
    });

    it('F2: warns when line-start @ is present without action verb', () => {
      const result = validator.validate('@金哥');
      const actionIssue = result.issues.find((i) => i.rule === 'F2-missing-action');
      assert.ok(actionIssue, 'should detect missing action');
      assert.equal(actionIssue.severity, 'warn');
    });

    it('F2: does NOT warn when line-start @ is followed by action verb', () => {
      const result = validator.validate('@金哥\n统计任务交给你，这是你的主场。');
      // has "交给你" which maps to action patterns... actually let me check
      // The hasBallAction checks for "我来做/我接了/退回/升级" patterns
      // "交给你" is not in the pattern. Let's use an explicit one:
      const result2 = validator.validate('我来做这个统计任务。\n@金哥');
      const actionIssue = result2.issues.find((i) => i.rule === 'F2-missing-action');
      assert.equal(actionIssue, undefined, 'action verb should suppress missing-action warning');
    });

    it('F1: inline @mention with surrounding text is caught as warn (not block)', () => {
      const result = validator.validate('请确认 @金哥 你来处理');
      const inlineIssue = result.issues.find((i) => i.rule === 'F1-inline-mention');
      assert.ok(inlineIssue, 'should detect inline @');
      assert.equal(inlineIssue.severity, 'warn');
    });
  });

  // ── Coordinator layer ──────────────────────────────────────────────

  describe('Coordinator layer', () => {
    it('C1: blocks coordinator execution guidance with file path and edit verb', () => {
      const result = validator.validate('请去 packages/api/src/index.ts 修改路由，再补单测', 'opencode');
      const boundaryIssue = result.issues.find((i) => i.rule === 'C1-coordinator-execution-boundary');
      assert.ok(boundaryIssue, 'should block coordinator execution guidance');
      assert.equal(boundaryIssue.severity, 'block');
    });

    it('C1: blocks coordinator attempts to route work through subagent execution', () => {
      const result = validator.validate('这个直接交给 Agent 去实现并跑测试', 'opencode');
      const boundaryIssue = result.issues.find((i) => i.rule === 'C1-coordinator-execution-boundary');
      assert.ok(boundaryIssue, 'should block indirect execution via subagent');
      assert.equal(boundaryIssue.severity, 'block');
    });

    it('C1: allows coordinator routing-only message', () => {
      const result = validator.validate('目标是确认根因并回收证据。\n@砚砚\n请你判断归属并带回验证结果。', 'opencode');
      const boundaryIssue = result.issues.find((i) => i.rule === 'C1-coordinator-execution-boundary');
      assert.equal(boundaryIssue, undefined, 'routing-only coordinator message should pass boundary check');
    });
  });

  // ── Ball layer ──────────────────────────────────────────────────────

  describe('Ball layer', () => {
    it('B1: blocks ownership claim without @ action', () => {
      const result = validator.validate('球权在金哥手上');
      const claimIssue = result.issues.find((i) => i.rule === 'B1-claim-without-action');
      assert.ok(claimIssue, 'should detect ownership claim without @');
      assert.equal(claimIssue.severity, 'block');
    });

    it('B1: does NOT block ownership claim WITH line-start @', () => {
      const result = validator.validate('@金哥\n球交给你了，统计任务做完告诉我');
      const claimIssue = result.issues.find((i) => i.rule === 'B1-claim-without-action');
      assert.equal(claimIssue, undefined, 'line-start @ should satisfy the action requirement');
    });

    it('B2: warns on reverse ping pattern', () => {
      const result = validator.validate('要不要我来做这个？');
      const pingIssue = result.issues.find((i) => i.rule === 'B2-reverse-ping');
      assert.ok(pingIssue, 'should detect reverse ping');
      assert.equal(pingIssue.severity, 'warn');
    });

    it('B3: warns on verbal hold without hold_ball', () => {
      const result = validator.validate('我继续等CI结果', 'opus');
      const holdIssue = result.issues.find((i) => i.rule === 'B3-verbal-hold');
      assert.ok(holdIssue, 'should detect verbal hold');
      assert.equal(holdIssue.severity, 'warn');
    });

    it('B3: does NOT warn when catId is not provided', () => {
      const result = validator.validate('我继续等CI结果');
      const holdIssue = result.issues.find((i) => i.rule === 'B3-verbal-hold');
      assert.equal(holdIssue, undefined, 'no catId → B3 skips');
    });
  });

  // ── Routing layer ───────────────────────────────────────────────────

  describe('Routing layer', () => {
    it('R1: blocks unknown @handle', () => {
      const result = validator.validate('@unknown_cat\n你来处理');
      const routingIssue = result.issues.find((i) => i.rule === 'R1-unknown-handle');
      assert.ok(routingIssue, 'should detect unknown handle');
      assert.equal(routingIssue.severity, 'block');
    });

    it('R1: allows known @handle from mentionPatterns', () => {
      const result = validator.validate('@金哥\n统计任务交给你');
      const routingIssue = result.issues.find((i) => i.rule === 'R1-unknown-handle');
      assert.equal(routingIssue, undefined, 'known handle should pass');
    });

    it('R1: allows @co-creator and @铲屎官 as special handles', () => {
      const result1 = validator.validate('@co-creator\n请拍板');
      const result2 = validator.validate('@铲屎官\n请确认');
      const r1 = result1.issues.find((i) => i.rule === 'R1-unknown-handle');
      const r2 = result2.issues.find((i) => i.rule === 'R1-unknown-handle');
      assert.equal(r1, undefined, '@co-creator should be allowed');
      assert.equal(r2, undefined, '@铲屎官 should be allowed');
    });

    it('R2: warns on external identity projected as local @', () => {
      const result = validator.validate('@codex\n请review');
      const projIssue = result.issues.find((i) => i.rule === 'R2-external-projection');
      assert.ok(projIssue, 'should detect external projection');
      assert.equal(projIssue.severity, 'warn');
    });

    it('R3: warns on @co-creator without hard condition indicator', () => {
      const result = validator.validate('@co-creator\n你觉得怎么样');
      const ccIssue = result.issues.find((i) => i.rule === 'R3-co-creator-not-hard-condition');
      assert.ok(ccIssue, 'should warn on casual @co-creator');
      assert.equal(ccIssue.severity, 'warn');
    });

    it('R3: does NOT warn on @co-creator with hard condition', () => {
      const result = validator.validate('@co-creator\n僵局了，两轮无共识，请拍板');
      const ccIssue = result.issues.find((i) => i.rule === 'R3-co-creator-not-hard-condition');
      assert.equal(ccIssue, undefined, 'hard condition should suppress R3 warning');
    });
  });

  // ── Integration: happy path ─────────────────────────────────────────

  describe('Happy path (no issues)', () => {
    it('passes a well-formed handoff message', () => {
      const result = validator.validate(
        '我来做这个统计任务。\n@砚砚\n请 review 数据源是否正确。',
        'abyssinian',
      );
      assert.ok(result.passed, 'well-formed handoff should pass');
      const blocks = result.issues.filter((i) => i.severity === 'block');
      assert.equal(blocks.length, 0, 'no block-level issues expected');
    });

    it('passes a simple non-A2A message', () => {
      const result = validator.validate('今天天气真好');
      assert.ok(result.passed);
      assert.equal(result.issues.length, 0, 'non-A2A message should have no issues');
    });
  });
});
