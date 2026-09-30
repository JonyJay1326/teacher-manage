/**
 * Q5 验收脚本：批量成绩单 PDF → zip → 逐份解析 → 断言无他人数据。
 * 用法：npx ts-node src/cli/smoke-q5-reports.ts
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import archiver = require('archiver');
import { PDFParse } from 'pdf-parse';
import { DatabaseModule } from '../database/database.module';
import { AuditLogsRepository } from '../audit/audit-logs.repository';
import { ReportsRepository } from '../modules/reports/reports.repository';
import { ReportsService } from '../modules/reports/reports.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
  ],
  providers: [AuditLogsRepository, ReportsRepository, ReportsService],
})
class SmokeQ5Module {}

/** 用 archiver 生成 zip（验证 48 份能打包） */
function zipOf(entries: Array<{ name: string; buffer: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const e of entries) archive.append(e.buffer, { name: e.name });
    void archive.finalize();
  });
}

async function pdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    return (r.text ?? '').replace(/\s+/g, '');
  } finally {
    await parser.destroy();
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SmokeQ5Module, {
    logger: ['error', 'warn'],
  });
  const svc = app.get(ReportsService);
  const repo = app.get(ReportsRepository);

  console.log('== Q5 成绩单 PDF 验收 ==');
  const students = repo.listActiveStudents();
  const exam = repo.findLatestScoredExam();
  console.log(`在读学生 ${students.length} 名，参考考试：${exam?.name}`);
  if (!exam) throw new Error('无已录成绩考试');

  // 逐份渲染
  const entries: Array<{ name: string; buffer: Buffer; studentId: number }> = [];
  for (const s of students) {
    const one = await svc.buildSingle(s.id);
    entries.push({ name: one.filename, buffer: one.buffer, studentId: s.id });
  }
  console.log(`[1] 逐份渲染 ${entries.length} 份，样例大小 ${entries[0]?.buffer.length} 字节`);

  // 打包 zip
  const zbuf = await zipOf(entries.map((e) => ({ name: e.name, buffer: e.buffer })));
  const tmp = path.join(os.tmpdir(), 'q5-reports.zip');
  fs.writeFileSync(tmp, zbuf);
  console.log(`[2] 打包 zip 成功：${zbuf.length} 字节 -> ${tmp}`);

  // 每份都解析，断言只含本人
  let leak = 0;
  const sampled: number[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const text = await pdfText(entries[i]!.buffer);
    const self = students.find((s) => s.id === entries[i]!.studentId)!;
    // 本人姓名/学号必须出现
    if (!text.includes(self.name) || !text.includes(self.student_no)) {
      console.error(`✗ ${entries[i]!.name} 缺少本人标识`);
      leak += 1;
    }
    // 他人姓名/学号绝不能出现
    for (const other of students) {
      if (other.id === self.id) continue;
      if (text.includes(other.name) || text.includes(other.student_no)) {
        console.error(`✗ ${entries[i]!.name} 泄漏了 ${other.name}/${other.student_no}`);
        leak += 1;
        break;
      }
    }
    // 抽样记录
    if (i % Math.ceil(entries.length / 5) === 0) sampled.push(i);
  }
  console.log(`[3] 泄漏检测：${leak === 0 ? '全部通过' : leak + ' 处泄漏'}`);
  console.log(`    抽样索引（5 份）：${sampled.join(', ')}`);

  const ok = leak === 0 && entries.length > 0 && zbuf.length > 0;
  console.log(ok ? '== Q5 验收通过 ==' : '== Q5 验收失败 ==');
  await app.close();
  if (!ok) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
