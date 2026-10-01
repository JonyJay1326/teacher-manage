/**
 * Q1 演练脚本（本地 mock 库专用，不连生产库）：
 * 手动备份 → 完整性校验 → 恢复，并验证 14 份滚动保留。
 * 用法：npx ts-node src/cli/smoke-q1-backup.ts
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AuditLogsRepository } from '../audit/audit-logs.repository';
import { BackupService } from '../modules/backup/backup.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
  ],
  providers: [AuditLogsRepository, BackupService],
})
class SmokeQ1Module {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SmokeQ1Module, {
    logger: ['error', 'warn', 'log'],
  });
  const backup = app.get(BackupService);
  const db = app.get(require('../database/database.service').DatabaseService);

  const countStudents = (): number =>
    (
      db.getDb().prepare('SELECT COUNT(*) AS c FROM students').get() as { c: number }
    ).c;

  const before = countStudents();
  console.log('== Q1 备份演练 ==');
  console.log(`起始学生数: ${before}`);

  // 1) 手动备份
  const first = backup.runBackup('manual');
  console.log(`[1] 手动备份 -> ${first.filename}, quick_check=${first.ok}`);

  // 2) 完整性校验
  const verify = backup.verify(first.filename);
  console.log(
    `[2] 校验 -> integrity=${verify.integrityOk}, sha256=${String(verify.sha256Ok)}, ${verify.detail}`,
  );

  // 3) 篡改检测：往备份里写脏字节，校验应失败
  const fs = await import('node:fs');
  const tamperPath = `${first.backupPath}.tampered`;
  fs.copyFileSync(first.backupPath, tamperPath);
  const buf = fs.readFileSync(tamperPath);
  buf[Math.floor(buf.length / 2)] = (buf[Math.floor(buf.length / 2)]! + 1) % 256;
  fs.writeFileSync(tamperPath, buf);
  const tampered = backup.inspect(tamperPath);
  console.log(
    `[3] 篡改检测 -> integrity=${tampered.integrityOk}, sha256=${String(tampered.sha256Ok)}（预期 integrity=false）`,
  );
  fs.unlinkSync(tamperPath);

  // 4) 制造数据漂移后恢复
  db.getDb().prepare("UPDATE students SET name = '漂移测试' WHERE id = 1").run();
  console.log(`[4] 制造漂移后，学生1=${db.getDb().prepare('SELECT name FROM students WHERE id=1').get() && (db.getDb().prepare('SELECT name FROM students WHERE id=1').get() as { name: string }).name}`);

  // restore 自 Q7 审查起为 async（并发串行锁）
  const restored = await backup.restore(first.filename, true);
  console.log(`[5] 恢复 -> safetyBackup=${restored.safetyBackup}, restoredFrom=${restored.restoredFrom}`);
  const after = countStudents();
  const name1 = (db.getDb().prepare('SELECT name FROM students WHERE id=1').get() as { name: string }).name;
  console.log(`[6] 恢复后学生数=${after}, 学生1=${name1}`);

  // 5) 滚动保留：直接铺 20 份文件（绕过单次备份内的清理），再触发一次清理
  const dir = backup.getBackupDir();
  const template = fs.readdirSync(dir).find((f) => f.endsWith('.db') && f.startsWith('classpilot-'))!;
  for (let i = 0; i < 20; i += 1) {
    const fake = `classpilot-2020-01-01T00-00-${String(i).padStart(2, '0')}-000Z.db`;
    fs.copyFileSync(`${dir}/${template}`, `${dir}/${fake}`);
  }
  console.log(`[7] 铺入后共 ${backup.listBackups().length} 份`);
  const removed = backup.pruneOldBackups();
  const list = backup.listBackups();
  console.log(
    `[8] 滚动保留 -> 删除 ${removed.length} 份，当前 ${list.length} 份（期望 14），最旧=${list[list.length - 1]?.filename}`,
  );
  const orphans = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.meta.json'))
    .filter((f) => !fs.existsSync(`${dir}/${f.replace(/\.meta\.json$/, '')}`));
  console.log(
    `[9] 孤儿 meta 文件 = ${orphans.length}（期望 0），真实备份带 meta = ${list.filter((b) => fs.existsSync(`${dir}/${b.filename}.meta.json`)).length}`,
  );

  const ok =
    verify.integrityOk
    && after === before
    && list.length === 14
    && !tampered.integrityOk
    && orphans.length === 0;
  console.log(ok ? '== Q1 演练全部通过 ==' : '== Q1 演练存在失败项 ==');
  await app.close();
  if (!ok) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
