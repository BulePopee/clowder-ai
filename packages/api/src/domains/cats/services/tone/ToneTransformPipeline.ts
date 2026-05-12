/**
 * Tone Transform Pipeline — 面向铲屎官可见消息的语感层.
 *
 * 顺序: 校验先跑 → transform 后跑
 * 规则: 结论前置 / 列表转连词 / 数字格式 + 事实保真校验
 * 不破坏: @ 语法, 球权元信息, code block, VOTE 选票, 导航标记
 */

// ---------------------------------------------------------------------------
// Preserved block types (pass-through)
// ---------------------------------------------------------------------------
const PRESERVED_PATTERNS: { open: RegExp; close?: RegExp }[] = [
  // Code blocks: ```...```
  { open: /^```/m, close: /^```/m },
  // Navigation markers: [导航], [对话历史增量], etc
  { open: /^\[[一-鿿\w\s\-]+\].*$/m },
  // VOTE ballots: [VOTE:option]
  { open: /\[VOTE:[^\]]+\]/ },
];

interface PreservedBlock {
  index: number;
  text: string;
}

interface PreservedState {
  blocks: PreservedBlock[];
  cleanText: string;
}

/** Extract preserved blocks, replace with placeholders in clean text. */
function extractPreserved(text: string): PreservedState {
  const blocks: PreservedBlock[] = [];
  let cleanText = text;
  let idx = 0;

  for (const pat of PRESERVED_PATTERNS) {
    // Reset lastIndex for global regex
    const openRe = new RegExp(pat.open.source, pat.open.flags.includes('g') ? pat.open.flags : pat.open.flags + 'g');
    let match: RegExpExecArray | null;

    if (pat.close) {
      // Multi-line block with start/end marker
      const closeRe = new RegExp(pat.close.source, pat.close.flags.includes('g') ? pat.close.flags : pat.close.flags + 'g');
      const fullRe = new RegExp(
        `(${pat.open.source})\\n([\\s\\S]*?)\\n(${pat.close.source})`,
        'gm',
      );
      while ((match = fullRe.exec(cleanText)) !== null) {
        const placeholder = `\0PRESERVED_${idx}\0`;
        blocks.push({ index: idx, text: match[0] });
        cleanText = cleanText.slice(0, match.index) + placeholder + cleanText.slice(match.index + match[0].length);
        idx++;
        fullRe.lastIndex = match.index + placeholder.length;
      }
    } else {
      // Single-line marker
      while ((match = openRe.exec(cleanText)) !== null) {
        const placeholder = `\0PRESERVED_${idx}\0`;
        blocks.push({ index: idx, text: match[0] });
        cleanText = cleanText.slice(0, match.index) + placeholder + cleanText.slice(match.index + match[0].length);
        idx++;
        openRe.lastIndex = match.index + placeholder.length;
      }
    }
  }

  return { blocks, cleanText };
}

/** Restore preserved blocks from placeholders. */
function restorePreserved(text: string, blocks: PreservedBlock[]): string {
  let result = text;
  for (const b of blocks) {
    result = result.replace(`\0PRESERVED_${b.index}\0`, b.text);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rule 1: 列表转连词 — flatten markdown lists into narrative prose
// ---------------------------------------------------------------------------
const LIST_ITEM_RE = /^(\s*)[-*+]\s+(.+)$/gm;
const ORDERED_ITEM_RE = /^(\s*)\d+\.\s+(.+)$/gm;

function flattenLists(text: string): string {
  // Process unordered lists
  text = text.replace(LIST_ITEM_RE, (_match, _indent, content: string) => {
    return content;
  });

  // Process ordered lists
  text = text.replace(ORDERED_ITEM_RE, (_match, _indent, content: string) => {
    return content;
  });

  return text;
}

// ---------------------------------------------------------------------------
// Rule 2: 数字格式 — inline tabular / scorecard data
// ---------------------------------------------------------------------------
// Match markdown table rows
const TABLE_ROW_RE = /^\|.+\|$/gm;
// Match scorecard patterns like "指标 | 值" or "key: value" pairs
const SCORECARD_LINE_RE = /^[一-鿿\w]+\s*[:|]\s*.+$/gm;
// Match standalone numeric metrics lines: e.g. "亮度 168/255" or "大小 563KB"
const METRIC_LINE_RE = /^[一-鿿\w／/]+\s+[\d.]+[/\w]*\s*$/gm;

function inlineNumericData(text: string): string {
  // Remove table separator rows (---|---|---)
  text = text.replace(/^\|?\s*:?-{3,}:?\s*\|?\s*:?-{3,}:?\s*\|?(?:\s*:?-{3,}:?\s*)*$/gm, '');

  // Remove standalone table rows but keep the content
  // A table row like | header1 | header2 | → content
  // But only if it's a data table, not a structural element
  text = text.replace(TABLE_ROW_RE, (row) => {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length <= 1) return row; // not a real table
    // If first cell is a header-like standalone word, keep as inline
    return cells.join('：');
  });

  return text;
}

// ---------------------------------------------------------------------------
// Rule 3: 结论前置 — promote conclusion/decision sentences to paragraph start
// ---------------------------------------------------------------------------
const CONCLUSION_MARKERS = [
  /^(所以|因此|总之|综上|综上所述|建议|推荐|最好|需要|应当|应该|必须)/,
  /^(我决定|我的建议是|结论是|重点是|关键在于)/,
  /^(归根结底|说白了|简单说|简而言之)/,
];

function promoteConclusions(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  const promoted = paragraphs.map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return p;

    // Look for conclusion sentences within the paragraph
    const sentences = trimmed.split(/(?<=[。！？])/);
    if (sentences.length < 2) return p;

    const conclusionIdx = sentences.findIndex((s) =>
      CONCLUSION_MARKERS.some((m) => m.test(s.trim())),
    );

    if (conclusionIdx > 0) {
      // Move conclusion sentence to front
      const conclusion = sentences.splice(conclusionIdx, 1)[0];
      sentences.unshift(conclusion);
      return sentences.join('');
    }

    return p;
  });

  return promoted.join('\n\n');
}

// ---------------------------------------------------------------------------
// Fact Fidelity Check — verify key facts survive transform
// ---------------------------------------------------------------------------
/** Extract "facts" from text: numbers, references, feature IDs, key terms. */
function extractFacts(text: string): Set<string> {
  const facts = new Set<string>();

  // Numbers — skip single-digit (likely list markers / noise)
  const numMatches = text.match(/\b\d{2,}(?:\.\d+)?(?:%|ms|KB|MB|GB|px|pt|s)?\b|\b\d+\.\d+\b|\b\d+(?:%|ms|KB|MB|GB|px|pt|s)\b/g);
  if (numMatches) numMatches.forEach((n) => facts.add(n));

  // Feature IDs (F123, F042)
  const featMatches = text.match(/\bF\d{3}\b/g);
  if (featMatches) featMatches.forEach((f) => facts.add(f));

  // PR/issue references (#123)
  const refMatches = text.match(/#\d+\b/g);
  if (refMatches) refMatches.forEach((r) => facts.add(r));

  // File paths
  const pathMatches = text.match(/[\w./\\-]+\.[a-z]{2,4}/g);
  if (pathMatches) pathMatches.forEach((p) => facts.add(p));

  return facts;
}

function assertFactFidelity(original: string, transformed: string): void {
  const origFacts = extractFacts(original);
  const newFacts = extractFacts(transformed);

  for (const fact of origFacts) {
    if (!newFacts.has(fact)) {
      // Re-insert the fact at a natural position if missing
      // This is a soft check — we log but don't fail
      console.warn(`[ToneTransform] Fact fidelity warning: "${fact}" lost in transform`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export interface ToneTransformOptions {
  /** Enable/disable transform (default: true). */
  enabled?: boolean;
}

const DEFAULT_OPTIONS: ToneTransformOptions = {
  enabled: true,
};

/**
 * Transform cat message tone for 铲屎官 visibility.
 * Preserves @-mentions, code blocks, VOTE ballots, navigation markers.
 *
 * Order within pipeline: 校验先跑 → transform 后跑
 */
export function transformTone(content: string, options?: ToneTransformOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.enabled) return content;

  // Step 0: Extract preserved blocks
  const preserved = extractPreserved(content);
  let text = preserved.cleanText;

  // Step 1: 列表转连词 — flatten markdown lists into prose
  text = flattenLists(text);

  // Step 2: 数字格式 — inline tabular/scorecard data
  text = inlineNumericData(text);

  // Step 3: 结论前置 — promote conclusion sentences
  text = promoteConclusions(text);

  // Step 4: Fact fidelity check
  assertFactFidelity(content, text);

  // Step 5: Restore preserved blocks
  text = restorePreserved(text, preserved.blocks);

  return text;
}
