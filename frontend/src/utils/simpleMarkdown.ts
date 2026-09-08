/**
 * 将 AI 常用 Markdown 子集转为安全 HTML（零依赖）。
 * 支持：转义、标题 #~######、**粗体**、行首 -/* 无序与 1. 有序列表、换行。
 * 不支持：链接、图片、代码块、HTML 原样注入。
 */
export function renderSimpleMarkdown(source: string): string {
  const escaped = escapeHtml(source.trim());
  if (!escaped) {
    return '';
  }

  const lines = escaped.split(/\r?\n/);
  const htmlParts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  /** 关闭当前列表 */
  function closeList(): void {
    if (listType === 'ul') htmlParts.push('</ul>');
    if (listType === 'ol') htmlParts.push('</ol>');
    listType = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1]!.length;
      htmlParts.push(
        `<h${level}>${applyInline(headingMatch[2]!)}</h${level}>`,
      );
      continue;
    }

    const ulMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        listType = 'ul';
      }
      htmlParts.push(`<li>${applyInline(ulMatch[1]!)}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        listType = 'ol';
      }
      htmlParts.push(`<li>${applyInline(olMatch[1]!)}</li>`);
      continue;
    }

    closeList();
    if (trimmed === '') {
      htmlParts.push('<br />');
      continue;
    }
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      htmlParts.push('<hr />');
      continue;
    }
    htmlParts.push(`<p>${applyInline(line)}</p>`);
  }
  closeList();
  return htmlParts.join('');
}

/** 转义 HTML 特殊字符 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内：粗体 **...**（转义后仍为星号） */
function applyInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
