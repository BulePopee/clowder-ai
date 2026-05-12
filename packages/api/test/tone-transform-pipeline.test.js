/**
 * ToneTransformPipeline tests — F2: 语感层
 *
 * Validates: list flattening, numeric inlining, conclusion promotion,
 * fact fidelity, and preservation of @-mentions / code blocks / VOTE / nav.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transformTone } from '../dist/domains/cats/services/tone/ToneTransformPipeline.js';

describe('ToneTransformPipeline', () => {
  // -----------------------------------------------------------------------
  // 列表转连词
  // -----------------------------------------------------------------------
  it('flattens unordered markdown lists', () => {
    const input = '需要做的事：\n- 修复登录 bug\n- 更新 API 文档\n- 添加测试';
    const result = transformTone(input);
    assert.ok(!result.includes('\n- '), 'should remove - markers');
    assert.ok(result.includes('修复登录 bug'));
    assert.ok(result.includes('更新 API 文档'));
    assert.ok(result.includes('添加测试'));
  });

  it('flattens ordered markdown lists', () => {
    const input = '步骤：\n1. 安装依赖\n2. 启动服务\n3. 验证结果';
    const result = transformTone(input);
    assert.ok(!result.includes('\n1. '), 'should remove numbered markers');
    assert.ok(result.includes('安装依赖'));
  });

  // -----------------------------------------------------------------------
  // 数字格式
  // -----------------------------------------------------------------------
  it('removes table separator lines', () => {
    const input = '| 指标 | 值 |\n|---|---|\n| 亮度 | 168 |';
    const result = transformTone(input);
    assert.ok(!result.includes('---|---'), 'should remove separator');
  });

  it('inlines table row content', () => {
    const input = '| 指标 | 值 |';
    const result = transformTone(input);
    // Row content should be joined with ：
    assert.ok(result.includes('指标'));
    assert.ok(result.includes('值'));
    assert.ok(!result.includes('|'), 'should remove pipe chars');
  });

  // -----------------------------------------------------------------------
  // 结论前置
  // -----------------------------------------------------------------------
  it('promotes conclusion sentence starting with 建议', () => {
    const input = '系统延迟较高。建议增加缓存层来优化。';
    const result = transformTone(input);
    // Conclusion should now be at position 0 of its paragraph
    const idx = result.indexOf('建议增加缓存层');
    const firstSentenceEnd = result.indexOf('。');
    assert.ok(idx < firstSentenceEnd, 'conclusion should be within first sentence');
  });

  it('promotes conclusion with 所以', () => {
    const input = '测试全部通过。所以可以准备发布了。';
    const result = transformTone(input);
    const idx = result.indexOf('所以可以准备发布了');
    assert.ok(idx < result.indexOf('测试全部通过') || idx === 0, '所以 sentence should come first');
  });

  // -----------------------------------------------------------------------
  // Fact fidelity
  // -----------------------------------------------------------------------
  it('preserves PR references (#number)', () => {
    const input = '已修复 #673 的 Windows bug，以及 #619 的 trace 问题';
    const result = transformTone(input);
    assert.ok(result.includes('#673'), '#673 preserved');
    assert.ok(result.includes('#619'), '#619 preserved');
  });

  it('preserves Feature IDs (Fnnn)', () => {
    const input = 'F153 的 trace 传播已完成，F134 的 sender 解析也修好了';
    const result = transformTone(input);
    assert.ok(result.includes('F153'));
    assert.ok(result.includes('F134'));
  });

  it('preserves numbers with units', () => {
    const input = '图片优化后 563KB，对比 opus.png 的 521KB';
    const result = transformTone(input);
    assert.ok(result.includes('563KB'));
    assert.ok(result.includes('521KB'));
  });

  // -----------------------------------------------------------------------
  // Preservation rules
  // -----------------------------------------------------------------------
  it('preserves @-mentions at line start', () => {
    const input = '@cat-jd0m3ln6 这是给你的消息\n@ragdoll-vzes 还有你';
    const result = transformTone(input);
    assert.ok(result.includes('@cat-jd0m3ln6'));
    assert.ok(result.includes('@ragdoll-vzes'));
  });

  it('preserves code blocks', () => {
    const input = '代码如下：\n```\nconst x = 1;\n```\n完毕。';
    const result = transformTone(input);
    assert.ok(result.includes('```'));
    assert.ok(result.includes('const x = 1;'));
  });

  it('preserves VOTE ballots', () => {
    const input = '我投 [VOTE:方案二]';
    const result = transformTone(input);
    assert.ok(result.includes('[VOTE:方案二]'));
  });

  it('preserves navigation markers', () => {
    const input = '[导航]\n传球: 铲屎官 → 你\n[/导航]';
    const result = transformTone(input);
    assert.ok(result.includes('[导航]'));
    assert.ok(result.includes('[/导航]'));
  });

  it('preserves file paths', () => {
    const input = '见 FeishuAdapter.ts:42 行';
    const result = transformTone(input);
    assert.ok(result.includes('FeishuAdapter.ts'));
  });

  // -----------------------------------------------------------------------
  // Disabled mode
  // -----------------------------------------------------------------------
  it('passes through unchanged when disabled', () => {
    const input = '- item 1\n- item 2';
    const result = transformTone(input, { enabled: false });
    assert.equal(result, input);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('handles empty content', () => {
    assert.equal(transformTone(''), '');
  });

  it('handles content with only preserved blocks', () => {
    const input = '```\ncode here\n```';
    const result = transformTone(input);
    assert.equal(result, input);
  });
});
