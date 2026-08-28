import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import { AppException, ErrorCodes } from '../../common/api';

/** 支持的上传扩展名 */
export const KB_ALLOWED_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.docx',
  '.pdf',
  '.xlsx',
  '.xls',
]);

/** 从文件缓冲抽取纯文本（失败时提示改用粘贴） */
@Injectable()
export class TextExtractService {
  /** 按扩展名抽取 */
  async extract(
    buffer: Buffer,
    originalName: string,
  ): Promise<{ text: string; source: string }> {
    const lower = originalName.toLowerCase();
    const ext = this.extensionOf(lower);
    if (!KB_ALLOWED_EXTS.has(ext)) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '仅支持 txt / md / docx / pdf / xlsx，或改用「粘贴文本」入口',
      );
    }

    try {
      if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
        return { text: buffer.toString('utf8'), source: 'file' };
      }
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value ?? '').trim();
        if (!text) {
          throw new Error('empty docx');
        }
        return { text, source: 'file' };
      }
      if (ext === '.xlsx' || ext === '.xls') {
        const text = this.extractExcelText(buffer);
        if (!text) {
          throw new Error('empty excel');
        }
        return { text, source: 'file' };
      }
      // pdf
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text ?? '').trim();
        if (!text) {
          throw new Error('empty pdf');
        }
        return { text, source: 'file' };
      } finally {
        await parser.destroy();
      }
    } catch (err: unknown) {
      if (err instanceof AppException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : '未知错误';
      throw new AppException(
        ErrorCodes.VALIDATION,
        `文档解析失败（${msg}），请改用「粘贴文本」入口`,
      );
    }
  }

  /**
   * 用 SheetJS 抽取各工作表为纯文本。
   * 表名作标题，便于后续按标题切段。
   */
  private extractExcelText(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        continue;
      }
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      if (!csv) {
        continue;
      }
      parts.push(`# ${sheetName}\n\n${csv}`);
    }
    return parts.join('\n\n').trim();
  }

  /** 取扩展名（含点） */
  private extensionOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    if (i < 0) {
      return '';
    }
    return filename.slice(i);
  }
}
