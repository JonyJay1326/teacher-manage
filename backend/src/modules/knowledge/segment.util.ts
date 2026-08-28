/** 切段目标长度（字） */
const MIN_CHARS = 300;
const MAX_CHARS = 500;

/**
 * 按标题/空行切成 300–500 字段。
 * 过短合并，过长按句号/换行硬切。
 */
export function splitIntoSegments(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const blocks = splitBlocks(normalized);
  const merged: string[] = [];
  let buffer = '';

  for (const block of blocks) {
    const piece = block.trim();
    if (!piece) {
      continue;
    }
    if (!buffer) {
      buffer = piece;
      continue;
    }
    if (buffer.length < MIN_CHARS) {
      buffer = `${buffer}\n\n${piece}`;
      continue;
    }
    if (buffer.length <= MAX_CHARS) {
      merged.push(buffer);
      buffer = piece;
      continue;
    }
    merged.push(...hardSplit(buffer));
    buffer = piece;
  }

  if (buffer) {
    if (buffer.length > MAX_CHARS) {
      merged.push(...hardSplit(buffer));
    } else {
      merged.push(buffer);
    }
  }

  return merged.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 按 markdown 标题或空行切块 */
function splitBlocks(text: string): string[] {
  const headingSplit = text.split(/(?=^#{1,6}\s+)/m);
  const blocks: string[] = [];
  for (const part of headingSplit) {
    const paras = part.split(/\n{2,}/);
    for (const p of paras) {
      const t = p.trim();
      if (t) {
        blocks.push(t);
      }
    }
  }
  return blocks.length > 0 ? blocks : [text];
}

/** 超长段落硬切 */
function hardSplit(text: string): string[] {
  const result: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf('。', MAX_CHARS);
    if (cut < MIN_CHARS) {
      cut = rest.lastIndexOf('\n', MAX_CHARS);
    }
    if (cut < MIN_CHARS) {
      cut = MAX_CHARS;
    }
    result.push(rest.slice(0, cut + (rest[cut] === '。' ? 1 : 0)).trim());
    rest = rest.slice(cut + (rest[cut] === '。' ? 1 : 0)).trim();
  }
  if (rest) {
    result.push(rest);
  }
  return result;
}
