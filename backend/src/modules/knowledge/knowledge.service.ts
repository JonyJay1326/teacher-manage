import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AppException, ErrorCodes } from '../../common/api';
import { tokenizeForFts } from './jieba.util';
import {
  KnowledgeRepository,
  type KbDocumentRow,
} from './knowledge.repository';
import { splitIntoSegments } from './segment.util';
import {
  KB_ALLOWED_EXTS,
  TextExtractService,
} from './text-extract.service';

/** 预设分类 */
export const KB_PRESET_CATEGORIES = [
  '政策法规',
  '特殊教育',
  '心理干预',
  '班会素材',
  '家校沟通话术',
  '其他',
] as const;

/** 文档视图 */
export interface KbDocumentView {
  id: number;
  title: string;
  categoryPath: string | null;
  source: string | null;
  filePath: string | null;
  segCount: number;
  tags: string[];
  createdAt: string | null;
  preview: string;
}

/** 上传文件形状 */
export interface UploadedKbFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

/** 知识库文档业务 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly textExtractService: TextExtractService,
  ) {}

  /** 分类：预设 ∪ 库内已有 */
  listCategories(): { presets: string[]; used: string[] } {
    return {
      presets: [...KB_PRESET_CATEGORIES],
      used: this.knowledgeRepository.listCategories(),
    };
  }

  /** 列表 */
  list(filter: {
    category?: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): { items: KbDocumentView[]; total: number; page: number; pageSize: number } {
    const { rows, total } = this.knowledgeRepository.findDocuments(filter);
    return {
      items: rows.map((r) => this.toView(r)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /** 详情（含段落） */
  getDetail(id: number): {
    document: KbDocumentView;
    segments: Array<{ id: number; seq: number; text: string }>;
  } {
    const doc = this.knowledgeRepository.findDocumentById(id);
    if (!doc) {
      throw new AppException(ErrorCodes.NOT_FOUND, '文档不存在');
    }
    const segments = this.knowledgeRepository
      .findSegmentsByDocument(id)
      .map((s) => ({ id: s.id, seq: s.seq, text: s.text }));
    return { document: this.toView(doc, true), segments };
  }

  /** 粘贴文本入库 */
  createFromPaste(input: {
    title: string;
    categoryPath?: string;
    tags?: string;
    content: string;
  }): KbDocumentView {
    const content = input.content.trim();
    if (!content) {
      throw new AppException(ErrorCodes.VALIDATION, '正文不能为空');
    }
    const id = this.persistDocument({
      title: input.title.trim(),
      categoryPath: input.categoryPath?.trim() || '其他',
      source: 'paste',
      filePath: null,
      contentText: content,
      tags: this.normalizeTags(input.tags),
    });
    const doc = this.knowledgeRepository.findDocumentById(id);
    if (!doc) {
      throw new AppException(ErrorCodes.SYSTEM, '写入后读取失败');
    }
    return this.toView(doc);
  }

  /** 上传文件入库 */
  async createFromUpload(
    file: UploadedKbFile,
    meta: { title?: string; categoryPath?: string; tags?: string },
  ): Promise<KbDocumentView> {
    if (!file?.buffer?.length) {
      throw new AppException(ErrorCodes.VALIDATION, '请上传文件');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new AppException(ErrorCodes.VALIDATION, '文件不能超过 15MB');
    }
    const { text, source } = await this.textExtractService.extract(
      file.buffer,
      file.originalname,
    );
    const title =
      meta.title?.trim() ||
      this.titleFromFilename(file.originalname) ||
      '未命名文档';
    const savedPath = this.saveUploadFile(file);
    const id = this.persistDocument({
      title,
      categoryPath: meta.categoryPath?.trim() || '其他',
      source,
      filePath: savedPath,
      contentText: text,
      tags: this.normalizeTags(meta.tags),
    });
    const doc = this.knowledgeRepository.findDocumentById(id);
    if (!doc) {
      throw new AppException(ErrorCodes.SYSTEM, '写入后读取失败');
    }
    return this.toView(doc);
  }

  /** 更新元数据 */
  update(
    id: number,
    patch: { title?: string; categoryPath?: string; tags?: string },
  ): KbDocumentView {
    const existing = this.knowledgeRepository.findDocumentById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, '文档不存在');
    }
    this.knowledgeRepository.updateDocument(id, {
      title: patch.title?.trim(),
      categoryPath: patch.categoryPath?.trim(),
      tags:
        patch.tags !== undefined ? this.normalizeTags(patch.tags) : undefined,
    });
    const doc = this.knowledgeRepository.findDocumentById(id);
    if (!doc) {
      throw new AppException(ErrorCodes.NOT_FOUND, '文档不存在');
    }
    return this.toView(doc);
  }

  /** 软删除 */
  remove(id: number): { ok: true } {
    const existing = this.knowledgeRepository.findDocumentById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, '文档不存在');
    }
    this.knowledgeRepository.softDeleteDocument(id);
    return { ok: true };
  }

  /** 切段 + 分词入库 */
  private persistDocument(input: {
    title: string;
    categoryPath: string;
    source: string;
    filePath: string | null;
    contentText: string;
    tags: string | null;
  }): number {
    const chunks = splitIntoSegments(input.contentText);
    if (chunks.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION, '未能切出有效段落');
    }
    if (chunks.length > 3000) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '切段过多（>3000），请拆分文档后上传',
      );
    }
    const segments = chunks.map((text, index) => ({
      seq: index + 1,
      text,
      tokenizedText: tokenizeForFts(text) || text.slice(0, 200),
    }));
    return this.knowledgeRepository.insertDocumentWithSegments({
      title: input.title,
      categoryPath: input.categoryPath,
      source: input.source,
      filePath: input.filePath,
      contentText: input.contentText,
      tags: input.tags,
      segments,
    });
  }

  /** 保存上传原文件到 data/uploads/kb */
  private saveUploadFile(file: UploadedKbFile): string {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!KB_ALLOWED_EXTS.has(ext)) {
      throw new AppException(ErrorCodes.VALIDATION, '不支持的文件类型');
    }
    const dir = path.resolve(process.cwd(), 'data', 'uploads', 'kb');
    fs.mkdirSync(dir, { recursive: true });
    const safeBase = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${safeBase}${ext}`;
    const abs = path.join(dir, filename);
    fs.writeFileSync(abs, file.buffer);
    return path.join('data', 'uploads', 'kb', filename).replace(/\\/g, '/');
  }

  /** 文件名作标题 */
  private titleFromFilename(name: string): string {
    const base = path.basename(name, path.extname(name));
    return base.slice(0, 200);
  }

  /** 标签规范化（逗号分隔） */
  private normalizeTags(raw?: string): string | null {
    if (!raw?.trim()) {
      return null;
    }
    const parts = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    return parts.length > 0 ? parts.join(',') : null;
  }

  /** 行转视图 */
  private toView(row: KbDocumentRow, fullPreview = false): KbDocumentView {
    const text = row.content_text ?? '';
    return {
      id: row.id,
      title: row.title,
      categoryPath: row.category_path,
      source: row.source,
      filePath: row.file_path,
      segCount: row.seg_count,
      tags: row.tags
        ? row.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      createdAt: row.created_at,
      preview: fullPreview
        ? text.slice(0, 2000)
        : text.slice(0, 160).replace(/\s+/g, ' '),
    };
  }
}
