/**
 * Q1 全量导出演练（本地 mock 库专用）：
 * 生成 Excel → 读回校验四个 sheet 的行数与表头，并确认无 L2 高敏明文泄漏。
 * 用法：npx ts-node src/cli/smoke-q1-export.ts
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as XLSX from 'xlsx';
import { DatabaseModule } from '../database/database.module';
import { AuditLogsRepository } from '../audit/audit-logs.repository';
import { ExportService } from '../modules/export/export.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
  ],
  providers: [AuditLogsRepository, ExportService, require('../modules/export/export.repository').ExportRepository],
})
class SmokeQ1ExportModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SmokeQ1ExportModule, {
    logger: ['error', 'warn'],
  });
  const exportService = app.get(ExportService);
  const db = app.get(require('../database/database.service').DatabaseService);

  // 塞一条 L2 高敏与一条监护人/印象，确认导出不含高敏
  db.getDb()
    .prepare(
      `INSERT INTO student_sensitive (student_id, category, content_encrypted, iv, updated_at)
       VALUES (1, '健康', X'00112233', X'00112233445566778899AABB', datetime('now'))`,
    )
    .run();
  db.getDb()
    .prepare(
      `INSERT INTO student_impressions (student_id, content, created_at, updated_at)
       VALUES (2, '导入印象验证文本', datetime('now'), datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET content = excluded.content`,
    )
    .run();
  db.getDb()
    .prepare(
      `INSERT INTO incidents (occurred_at, category, severity, title, content, status, created_at)
       VALUES (datetime('now'), '表扬奖励', 1, '导出验证事件', '用于验证事件 sheet', 'confirmed', datetime('now'))`,
    )
    .run();
  db.getDb()
    .prepare(
      `INSERT INTO incident_students (incident_id, student_id, is_primary, role_note)
       VALUES (last_insert_rowid(), 3, 1, NULL)`,
    )
    .run();
  db.getDb()
    .prepare(
      `INSERT INTO comments (student_id, term_id, comment_type, final_text, created_at)
       VALUES (4, 1, '期末评语', '导入评语验证文本', datetime('now'))`,
    )
    .run();

  const res = exportService.buildFullExport();
  console.log('== Q1 全量导出演练 ==');
  console.log(`文件: ${res.filename}`);
  console.log(`计数: ${JSON.stringify(res.counts)}`);

  const book = XLSX.read(Buffer.from(res.base64, 'base64'), { type: 'buffer' });
  console.log(`sheet 列表: ${book.SheetNames.join(', ')}`);

  let ok = book.SheetNames.length === 4;
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      book.Sheets[name]!,
      { header: 1, defval: '', raw: false },
    );
    const header = (rows[0] ?? []).join('|');
    console.log(`  [${name}] 行数(含表头)=${rows.length}, 表头=${header}`);
    // 事件/评语为本次演练塞入，各 1 条；学生/成绩为 mock 主数据
    if (name === '学生' && rows.length !== 41) ok = false;
    if (name === '成绩' && rows.length !== 1601) ok = false;
    if (name === '事件' && rows.length !== 2) ok = false;
    if (name === '评语' && rows.length !== 2) ok = false;
  }

  const students = XLSX.utils.sheet_to_json<(string | number)[]>(
    book.Sheets['学生']!,
    { header: 1, defval: '', raw: false },
  );
  const hasImpression = students.some((r) => String(r[16] ?? '').includes('导入印象验证文本'));
  console.log(`学生 sheet 含印象文本: ${hasImpression}（期望 true）`);

  // 高敏表不在导出范围内
  const sheetNames = book.SheetNames.join(',');
  const noSensitive = !sheetNames.includes('高敏') && !sheetNames.includes('sensitive');
  console.log(`导出不含高敏 sheet: ${noSensitive}（期望 true）`);

  ok = ok && hasImpression && noSensitive && res.counts.students === 40;
  console.log(ok ? '== Q1 导出演练通过 ==' : '== Q1 导出演练失败 ==');
  await app.close();
  if (!ok) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
