/** 命中段落 */
export interface RetrievedSegment {
  segmentId: number;
  documentId: number;
  documentTitle: string;
  seq: number;
  text: string;
  rank: number;
}

/**
 * 检索策略接口：本期 FTS+jieba，预留 embedding 替换实现。
 */
export interface KnowledgeRetrievalStrategy {
  /** 取 topK 相关段落 */
  search(query: string, topK: number): RetrievedSegment[];
}
