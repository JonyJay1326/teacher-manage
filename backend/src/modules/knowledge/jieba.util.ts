import jieba from 'nodejieba';

/** 将文本切成空格分隔词序列，供 FTS5 双写入库 */
export function tokenizeForFts(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  const words = jieba.cut(cleaned, true);
  return words
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !isPunctuationOnly(w))
    .join(' ');
}

/** 将用户问题切词并拼成 FTS5 MATCH 查询串（AND） */
export function buildMatchQuery(question: string): string {
  const tokens = tokenizeForFts(question)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    const fallback = question.replace(/["'^]/g, '').trim();
    return fallback ? `"${fallback}"` : '';
  }
  return tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' ');
}

/** 是否仅标点/空白 */
function isPunctuationOnly(word: string): boolean {
  return /^[\s\p{P}\p{S}]+$/u.test(word);
}
