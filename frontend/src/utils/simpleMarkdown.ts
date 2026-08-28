/**
 * 将 AI 常用 Markdown 子集转为安全 HTML（零依赖）。
 * 支持：转义、**粗体**、行首 - / * 列表、换行。
 * 不支持：链接、图片、代码块、HTML 原样注入。
 */
export function renderSimpleMarkdown(source: string): string {
  const escaped = escapeHtml(source.trim());
  if (!escaped) {
    return '';
  }

  const lines = escaped.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const listMatch = /^[-*]\s+(.+)$/.exec(line.trim());
    if (listMatch) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li>${applyInline(listMatch[1])}</li>`);
      continue;
    }
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
    if (line.trim() === '') {
      htmlParts.push('<br />');
      continue;
    }
    htmlParts.push(`<p>${applyInline(line)}</p>`);
  }
  if (inList) {
    htmlParts.push('</ul>');
  }
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
