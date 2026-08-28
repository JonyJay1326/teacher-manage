import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AppException, ErrorCodes, nowIso } from '../../common/api';
import { DatabaseService } from '../../database/database.service';
import { IncidentsRepository } from './incidents.repository';

/** 上传文件形态 */
export interface UploadedAttachmentFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** 附件视图 */
export interface AttachmentView {
  id: number;
  incidentId: number;
  mime: string | null;
  size: number | null;
  createdAt: string | null;
  hasThumb: boolean;
}

/** 事件附件服务 */
@Injectable()
export class AttachmentsService {
  private readonly allowedMime = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly incidentsRepository: IncidentsRepository,
  ) {}

  /** 列出事件附件 */
  listByIncident(incidentId: number): AttachmentView[] {
    this.requireIncident(incidentId);
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT id, incident_id, mime, size, created_at, thumb_path
         FROM attachments
         WHERE incident_id = ? AND deleted_at IS NULL
         ORDER BY id ASC`,
      )
      .all(incidentId) as Array<{
      id: number;
      incident_id: number;
      mime: string | null;
      size: number | null;
      created_at: string | null;
      thumb_path: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      incidentId: r.incident_id,
      mime: r.mime,
      size: r.size,
      createdAt: r.created_at,
      hasThumb: Boolean(r.thumb_path),
    }));
  }

  /** 上传附件（每事件最多 3 张） */
  async upload(
    incidentId: number,
    file: UploadedAttachmentFile,
  ): Promise<AttachmentView> {
    this.requireIncident(incidentId);
    if (!this.allowedMime.has(file.mimetype)) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '仅支持 JPEG/PNG/WebP 图片或 PDF',
        400,
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AppException(ErrorCodes.VALIDATION, '单文件不超过 10MB', 400);
    }
    const count = (
      this.databaseService
        .getDb()
        .prepare(
          `SELECT COUNT(*) AS c FROM attachments
           WHERE incident_id = ? AND deleted_at IS NULL`,
        )
        .get(incidentId) as { c: number }
    ).c;
    if (count >= 3) {
      throw new AppException(ErrorCodes.VALIDATION, '每条事件最多 3 个附件', 400);
    }

    const sha1 = createHash('sha1').update(file.buffer).digest('hex');
    const ext = this.extFromMime(file.mimetype);
    const dir = path.resolve(process.cwd(), 'data', 'uploads', 'attachments');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${incidentId}_${Date.now()}_${sha1.slice(0, 8)}${ext}`;
    const absPath = path.join(dir, filename);
    fs.writeFileSync(absPath, file.buffer);
    const relPath = path
      .join('data', 'uploads', 'attachments', filename)
      .replace(/\\/g, '/');

    let thumbRel: string | null = null;
    if (file.mimetype.startsWith('image/')) {
      const thumbName = `thumb_${filename.replace(ext, '.jpg')}`;
      const thumbAbs = path.join(dir, thumbName);
      await sharp(file.buffer)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(thumbAbs);
      thumbRel = path
        .join('data', 'uploads', 'attachments', thumbName)
        .replace(/\\/g, '/');
    }

    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO attachments
           (incident_id, file_path, thumb_path, mime, size, sha1, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        incidentId,
        relPath,
        thumbRel,
        file.mimetype,
        file.size,
        sha1,
        nowIso(),
      );

    return {
      id: Number(result.lastInsertRowid),
      incidentId,
      mime: file.mimetype,
      size: file.size,
      createdAt: nowIso(),
      hasThumb: Boolean(thumbRel),
    };
  }

  /** 读取文件流信息 */
  getFile(
    id: number,
    thumb: boolean,
  ): { absPath: string; mime: string; filename: string } {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT id, file_path, thumb_path, mime
         FROM attachments WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as
      | {
          id: number;
          file_path: string;
          thumb_path: string | null;
          mime: string | null;
        }
      | undefined;
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '附件不存在', 404);
    }
    const rel =
      thumb && row.thumb_path ? row.thumb_path : row.file_path;
    const absPath = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(absPath)) {
      throw new AppException(ErrorCodes.NOT_FOUND, '附件文件缺失', 404);
    }
    const mime =
      thumb && row.thumb_path
        ? 'image/jpeg'
        : (row.mime ?? 'application/octet-stream');
    return {
      absPath,
      mime,
      filename: path.basename(absPath),
    };
  }

  /** 软删除附件 */
  remove(id: number): { ok: boolean } {
    const result = this.databaseService
      .getDb()
      .prepare(
        `UPDATE attachments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(nowIso(), id);
    if (result.changes === 0) {
      throw new AppException(ErrorCodes.NOT_FOUND, '附件不存在', 404);
    }
    return { ok: true };
  }

  /** 校验事件存在 */
  private requireIncident(incidentId: number): void {
    const row = this.incidentsRepository.findById(incidentId);
    if (!row || row.deleted_at) {
      throw new AppException(ErrorCodes.NOT_FOUND, '事件不存在', 404);
    }
  }

  /** MIME → 扩展名 */
  private extFromMime(mime: string): string {
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'application/pdf') return '.pdf';
    return '.bin';
  }
}
