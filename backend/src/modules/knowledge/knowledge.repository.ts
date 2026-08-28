import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';
import { buildMatchQuery } from './jieba.util';
import type {
  KnowledgeRetrievalStrategy,
  RetrievedSegment,
} from './retrieval.strategy';

/** 文档行 */
export interface KbDocumentRow {
  id: number;
  title: string;
  category_path: string | null;
  source: string | null;
  file_path: string | null;
  content_text: string | null;
  seg_count: number;
  tags: string | null;
  created_at: string | null;
  deleted_at: string | null;
}

/** 段落行 */
export interface KbSegmentRow {
  id: number;
  document_id: number;
  seq: number;
  text: string;
  tokenized_text: string;
}

/** 知识库仓储（含 FTS 检索策略实现） */
@Injectable()
export class KnowledgeRepository implements KnowledgeRetrievalStrategy {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 分页列表 */
  findDocuments(filter: {
    category?: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): { rows: KbDocumentRow[]; total: number } {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.category) {
      where.push('category_path = ?');
      params.push(filter.category);
    }
    if (filter.keyword) {
      where.push('(title LIKE ? OR content_text LIKE ? OR tags LIKE ?)');
      const like = `%${filter.keyword}%`;
      params.push(like, like, like);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRow = this.databaseService
      .getDb()
      .prepare(`SELECT COUNT(*) AS c FROM kb_documents ${whereSql}`)
      .get(...params) as { c: number };
    const offset = (filter.page - 1) * filter.pageSize;
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM kb_documents ${whereSql}
         ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, filter.pageSize, offset) as KbDocumentRow[];
    return { rows, total: totalRow.c };
  }

  /** 按 ID */
  findDocumentById(id: number): KbDocumentRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM kb_documents WHERE id = ? AND deleted_at IS NULL')
      .get(id) as KbDocumentRow | undefined;
  }

  /** 文档段落 */
  findSegmentsByDocument(documentId: number): KbSegmentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM kb_segments WHERE document_id = ? ORDER BY seq ASC`,
      )
      .all(documentId) as KbSegmentRow[];
  }

  /** 已有分类去重 */
  listCategories(): string[] {
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT DISTINCT category_path AS c FROM kb_documents
         WHERE deleted_at IS NULL AND category_path IS NOT NULL AND category_path != ''
         ORDER BY c`,
      )
      .all() as Array<{ c: string }>;
    return rows.map((r) => r.c);
  }

  /**
   * 事务写入文档 + 段落 + FTS 索引。
   */
  insertDocumentWithSegments(input: {
    title: string;
    categoryPath: string | null;
    source: string;
    filePath: string | null;
    contentText: string;
    tags: string | null;
    segments: Array<{ seq: number; text: string; tokenizedText: string }>;
  }): number {
    const db = this.databaseService.getDb();
    const insertDoc = db.prepare(
      `INSERT INTO kb_documents (
         title, category_path, source, file_path, content_text,
         seg_count, tags, created_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    );
    const insertSeg = db.prepare(
      `INSERT INTO kb_segments (document_id, seq, text, tokenized_text, embedding)
       VALUES (?, ?, ?, ?, NULL)`,
    );
    const insertFts = db.prepare(
      `INSERT INTO kb_segments_fts (tokenized_text, text, segment_id)
       VALUES (?, ?, ?)`,
    );

    const run = db.transaction(() => {
      const result = insertDoc.run(
        input.title,
        input.categoryPath,
        input.source,
        input.filePath,
        input.contentText,
        input.segments.length,
        input.tags,
        nowIso(),
      );
      const docId = Number(result.lastInsertRowid);
      for (const seg of input.segments) {
        const segResult = insertSeg.run(
          docId,
          seg.seq,
          seg.text,
          seg.tokenizedText,
        );
        const segId = Number(segResult.lastInsertRowid);
        insertFts.run(seg.tokenizedText, seg.text, segId);
      }
      return docId;
    });

    return run();
  }

  /** 更新元数据 */
  updateDocument(
    id: number,
    patch: {
      title?: string;
      categoryPath?: string | null;
      tags?: string | null;
    },
  ): void {
    const row = this.findDocumentById(id);
    if (!row) {
      return;
    }
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE kb_documents SET
           title = ?,
           category_path = ?,
           tags = ?
         WHERE id = ?`,
      )
      .run(
        patch.title ?? row.title,
        patch.categoryPath !== undefined ? patch.categoryPath : row.category_path,
        patch.tags !== undefined ? patch.tags : row.tags,
        id,
      );
  }

  /** 软删除文档并清理 FTS（段落行保留） */
  softDeleteDocument(id: number): void {
    const db = this.databaseService.getDb();
    const run = db.transaction(() => {
      const segs = db
        .prepare(`SELECT id FROM kb_segments WHERE document_id = ?`)
        .all(id) as Array<{ id: number }>;
      const delFts = db.prepare(
        `DELETE FROM kb_segments_fts WHERE segment_id = ?`,
      );
      for (const s of segs) {
        delFts.run(s.id);
      }
      db.prepare(
        `UPDATE kb_documents SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      ).run(nowIso(), id);
    });
    run();
  }

  /** FTS5 + BM25 检索 topK（过滤已删文档） */
  search(query: string, topK: number): RetrievedSegment[] {
    const match = buildMatchQuery(query);
    if (!match) {
      return [];
    }
    try {
      const rows = this.databaseService
        .getDb()
        .prepare(
          `SELECT
             s.id AS segment_id,
             s.document_id AS document_id,
             d.title AS document_title,
             s.seq AS seq,
             s.text AS text,
             bm25(kb_segments_fts) AS rank
           FROM kb_segments_fts
           JOIN kb_segments s ON s.id = kb_segments_fts.segment_id
           JOIN kb_documents d ON d.id = s.document_id
           WHERE kb_segments_fts MATCH ?
             AND d.deleted_at IS NULL
           ORDER BY rank
           LIMIT ?`,
        )
        .all(match, topK) as Array<{
        segment_id: number;
        document_id: number;
        document_title: string;
        seq: number;
        text: string;
        rank: number;
      }>;
      return rows.map((r) => ({
        segmentId: r.segment_id,
        documentId: r.document_id,
        documentTitle: r.document_title,
        seq: r.seq,
        text: r.text,
        rank: r.rank,
      }));
    } catch {
      // MATCH 语法异常时返回空（避免拖垮问答）
      return [];
    }
  }
}
