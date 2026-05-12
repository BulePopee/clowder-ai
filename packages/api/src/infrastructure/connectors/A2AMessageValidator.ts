import { normalizeCatId, type CatId } from '@cat-cafe/shared';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Validation result from an A2A message check.
 * - `block` = hard error — message should not be delivered
 * - `warn` = soft issue — message is deliverable but caller should be aware
 */
export interface A2AValidationIssue {
  readonly severity: 'block' | 'warn';
  readonly layer: 'format' | 'ball' | 'routing';
  readonly rule: string;
  readonly message: string;
}

export interface A2AMessageValidationResult {
  readonly passed: boolean;
  readonly issues: readonly A2AValidationIssue[];
}

export interface A2AMessageValidatorOptions {
  readonly log: FastifyBaseLogger;
  /** Known external identities that should never be projected as local @handles. */
  readonly externalIdentityPatterns?: readonly RegExp[];
  /** Cat IDs treated as pure coordinators — allowed to route and collect evidence, but not to design or execute. */
  readonly coordinatorCatIds?: readonly string[];
}

/**
 * A2A message validator with four layers:
 *   format layer      — line-start @, inline @, trilemma action check
 *   coordinator layer — coordinator execution boundary (C1)
 *   ball layer        — hold-ball consistency, ball-ownership claims
 *   routing layer     — handle validity, external identity projection
 *
 * Designed to be called before OutboundDeliveryHook.deliver().
 */
export class A2AMessageValidator {
  private readonly externalPatterns: readonly RegExp[];
  private readonly coordinatorCatIds: ReadonlySet<string>;

  constructor(private readonly opts: A2AMessageValidatorOptions) {
    // Default external identities that are NOT local cats
    this.externalPatterns = opts.externalIdentityPatterns ?? [
      /codex/i,
      /github[- ]?bot/i,
      /chatgpt-codex-connector/i,
      /ci[- ]?bot/i,
      /cloud/i,
    ];
    this.coordinatorCatIds = new Set((opts.coordinatorCatIds ?? []).map((id) => id.toLowerCase()));
  }

  /**
   * Run all three validation layers against a message.
   * Collects ALL issues (does not short-circuit on first failure).
   */
  validate(
    content: string,
    catId?: CatId,
    _threadId?: string,
  ): A2AMessageValidationResult {
    const issues: A2AValidationIssue[] = [];
    const normalizedCatId = catId?.toLowerCase();
    const isCoordinator = normalizedCatId ? this.coordinatorCatIds.has(normalizedCatId) : false;

    // ── Layer 1: Format ──────────────────────────────────────────────────
    this.validateFormatLayer(content, issues);

    // ── Layer 1b: Coordinator ─────────────────────────────────────────────
    if (isCoordinator) {
      this.validateCoordinatorLayer(content, issues);
    }

    // ── Layer 2: Ball ────────────────────────────────────────────────────
    this.validateBallLayer(content, catId, issues);

    // ── Layer 3: Routing ────────────────────────────────────────────────
    this.validateRoutingLayer(content, issues);

    return {
      passed: issues.length === 0 || issues.every((i) => i.severity === 'warn'),
      issues,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Layer 1 — Format
  // ────────────────────────────────────────────────────────────────────────

  private validateFormatLayer(content: string, issues: A2AValidationIssue[]): void {
    // Rule: line-start @ only; inline @ has no routing effect
    const inlineMentions = this.findInlineMentions(content);
    for (const mention of inlineMentions) {
      issues.push({
        severity: 'warn',
        layer: 'format',
        rule: 'F1-inline-mention',
        message: `句中 @"${mention.handle}" 没有路由效果。@须在行首才生效。`,
      });
    }

    // Rule: trilemma action check — if message has line-start @, expect an action verb
    const lineStartMentions = this.findLineStartMentions(content);
    if (lineStartMentions.length > 0 && !this.hasBallAction(content)) {
      issues.push({
        severity: 'warn',
        layer: 'format',
        rule: 'F2-missing-action',
        message: `消息包含行首 @ 但未检测到球权动作（接/退/升）。请确认三选一：接（我来做）、退（@xxx）、升（@co-creator）。`,
      });
    }

    // ── Layer 1b — Coordinator
    // Moved to validateCoordinatorLayer() — F3 renamed to C1
  }

  /**
   * Validate coordinator-layer constraints.
   * C1: coordinator cats must not write execution instructions.
   */
  private validateCoordinatorLayer(content: string, issues: A2AValidationIssue[]): void {
    if (this.hasCoordinatorExecutionIntent(content)) {
      issues.push({
        severity: 'block',
        layer: 'format',
        rule: 'C1-coordinator-execution-boundary',
        message:
          '协调猫只能做问题框架、归属判断、路由发球与证据回收。检测到实现设计/执行指令（文件路径+改动、代码形状、测试手段或子 agent 执行），消息被拦截。',
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Layer 2 — Ball
  // ────────────────────────────────────────────────────────────────────────

  private validateBallLayer(content: string, catId: string | undefined, issues: A2AValidationIssue[]): void {
    // Rule: "ball ownership claims" without @ or hold_ball action
    // Detect patterns like "球在你手上", "你继续", "球权在X"
    // NOTE: avoid \b with CJK characters — use explicit line/string boundaries
    const ownershipClaimPattern =
      /(?:^|[^\w])球(?:在|权|已|给)|(?:^|[^\w])你继续|(?:^|[^\w])(?:球|ball)\s*(?:is|at|with|to)/i;
    const hasLineStartMention = this.findLineStartMentions(content).length > 0;
    const hasOwnershipClaim = ownershipClaimPattern.test(content);

    if (hasOwnershipClaim && !hasLineStartMention) {
      issues.push({
        severity: 'block',
        layer: 'ball',
        rule: 'B1-claim-without-action',
        message:
          '声明球权归属（"球在X手上"/"你继续"等）但没有执行 @ 或 hold_ball 动作。' +
          '球权只有第一人称：只能声明自己持球，不能声明别人持球——没有 @ 或 hold_ball 动作，球权就没转移。',
      });
    }

    // Rule: reverse ping — asking "要不要?" / "同意吗?" instead of self-deciding
    const reversePing = /^(?:要不要|同意吗|可以吗|ok[?？]|okay[?？]|行不行)/im;
    if (reversePing.test(content.trim())) {
      issues.push({
        severity: 'warn',
        layer: 'ball',
        rule: 'B2-reverse-ping',
        message:
          '检测到反问式 ping（"要不要/同意吗？"）。有立场就自决去做（错了能回滚），' +
          '没立场根本不该 @。反问式 ping 非法——它把动作扳机塞回铲屎官。',
      });
    }

    // Rule: "我继续"/"我等" without hold_ball action
    if (catId && /(我继续|我等|我(先)?hold|I('ll)?\s+(wait|continue|hold))/i.test(content)) {
      issues.push({
        severity: 'warn',
        layer: 'ball',
        rule: 'B3-verbal-hold',
        message:
          '检测到口头"继续/等待"声明。需要等外部条件时，请调用 cat_cafe_hold_ball() 而非口头声明。',
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Layer 3 — Routing
  // ────────────────────────────────────────────────────────────────────────

  private validateRoutingLayer(content: string, issues: A2AValidationIssue[]): void {
    const allMentions = this.findAllMentions(content);

    for (const mention of allMentions) {
      const handle = mention.handle.replace(/^@/, '');

      // Rule: handle must match a known cat roster entry
      const normalized = normalizeCatId(handle);
      if (normalized.ok === false && handle !== 'co-creator' && handle !== '铲屎官' && handle !== 'all') {
        issues.push({
          severity: 'block',
          layer: 'routing',
          rule: 'R1-unknown-handle',
          message: `@"${handle}" 不在猫猫名册中。句柄必须与 cat-config.json 的 @mention 完全一致。不确定时查名册，不凭记忆猜。`,
        });
        continue;
      }

      // Rule: external identity projected as local @
      // Check both mentionPatterns and catId for external-like handles
      const isExternalProjection = this.externalPatterns.some((p) => p.test(handle));
      const resolvedToLocal = normalized.ok === true;
      if (isExternalProjection && resolvedToLocal) {
        // Only flag if the handle maps to a local cat but looks external
        issues.push({
          severity: 'warn',
          layer: 'routing',
          rule: 'R2-external-projection',
          message:
            `@"${handle}" 可能将外部 identity 投射为本地猫句柄。` +
            `外部实体（codex / GitHub bot / CI 等）不在 cat-cafe roster，永远走 hold_ball，严禁 @本地近似 proxy。`,
        });
      }
    }

    // Rule: @co-creator must pass hard-condition check (basic content heuristic)
    const hasCcMention = this.findExactMention(content, '@co-creator');
    if (hasCcMention && !this.hasHardConditionIndicator(content)) {
      issues.push({
        severity: 'warn',
        layer: 'routing',
        rule: 'R3-co-creator-not-hard-condition',
        message:
          '@co-creator 不是默认出口。只在硬条件下合法：不可逆操作 / 愿景级决策 / 跨猫僵局。' +
          '确认属于这三种之一再 @co-creator，否则应该自决或 @其他猫。',
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  /** Matches like `@金哥` in the middle of a sentence (not at line start). */
  private findInlineMentions(content: string): Array<{ handle: string }> {
    const results: Array<{ handle: string }> = [];
    // Match @ mentions NOT at line start
    const re = /(?:^|[^\n])@(\S+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      // If the char before @ is not a newline, it's inline
      const charBefore = content[m.index];
      if (charBefore !== undefined && charBefore !== '\n' && charBefore !== '@') {
        results.push({ handle: m[0].trim() });
      }
    }
    return results;
  }

  /** Matches like `@金哥` at the very start of a line. */
  private findLineStartMentions(content: string): Array<{ handle: string }> {
    const results: Array<{ handle: string }> = [];
    const re = /^@(\S+)|(?<=\n)@(\S+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const handle = m[1] ?? m[2];
      if (handle) results.push({ handle: `@${handle}` });
    }
    return results;
  }


  private hasCoordinatorExecutionIntent(content: string): boolean {
    const pathAndEditVerb = /(?:[\w./-]+\.(?:ts|tsx|js|jsx|json|md|yml|yaml))[^\n]{0,40}(?:改|加|删|新增|调整|修改|重构|实现)/i;
    const codeShape = /```|\b(?:function|const|interface|type|class)\b|diff\s+--git|@@\s+-\d+/i;
    const testOrAcceptanceCommand = /(?:pnpm|npm|yarn|bun|jest|vitest|mocha|ava)\b|(?:补|加|写).{0,8}(?:单测|测试)|验收手段/i;
    const agentExecution = /\b(?:Agent|subagent)\b|子\s*agent|并行代理|工作树代理/i;
    return [pathAndEditVerb, codeShape, testOrAcceptanceCommand, agentExecution].some((pattern) => pattern.test(content));
  }

  private hasBallAction(content: string): boolean {
    // Look for explicit self-claim patterns
    const actionPatterns = [
      /我(来|接|做|会|将)/,          // 我来做/我接了
      /我来负责/,                      // explicit responsibility
      /退(回|给)/,                     // 退回
      /(升级|上升).*(铲屎官|co-creator)/i, // 升级
      /三选一.*(接|退|升)/,            // explicit trilemma
      /(这(个|球).*(我|归|接)|球.*到我)/,    // ball claim
      /我(持球|接球)/,                 // 我持球/接球
    ];
    return actionPatterns.some((p) => p.test(content));
  }

  /** Check if content mentions hard-condition triggers for @co-creator. */
  private hasHardConditionIndicator(content: string): boolean {
    const hardConditionPatterns = [
      /不可逆|force push|删数据|close feat/i,
      /愿景|vision|砍.*feat|新.*family/i,
      /僵局|冲突.*无共识|分歧.*(2|两)轮/i,
    ];
    return hardConditionPatterns.some((p) => p.test(content));
  }

  /** Find all @mention handles in content (both line-start and inline). */
  private findAllMentions(content: string): Array<{ handle: string }> {
    const seen = new Set<string>();
    const results: Array<{ handle: string }> = [];
    const re = /@(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const handle = m[0];
      if (!seen.has(handle)) {
        seen.add(handle);
        results.push({ handle });
      }
    }
    return results;
  }

  /** Check if content contains an exact @mention. */
  private findExactMention(content: string, target: string): boolean {
    const re = new RegExp(`@${target.replace(/^@/, '')}\\b`);
    return re.test(content);
  }
}
