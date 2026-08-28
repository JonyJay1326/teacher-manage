declare module 'nodejieba' {
  /** 分词（HMM） */
  export function cut(text: string, hmm?: boolean): string[];
  /** 关键词抽取 */
  export function extract(text: string, topN: number): Array<{ word: string; weight: number }>;
}
