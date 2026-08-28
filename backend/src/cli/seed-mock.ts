import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { nowIso } from '../common/api';

/** CLI 种子模块 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
  ],
})
class SeedCliModule {}

/** 常见姓 */
const SURNAMES = [
  '王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高',
];

/** 常见名（单字/双字混用） */
const GIVEN_NAMES = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳',
  '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '华', '慧',
  '鹏', '飞', '鑫', '宇', '欣', '浩然', '子涵', '梓轩', '雨萱', '思远',
  '一诺', '诗涵', '俊杰', '嘉怡', '浩宇', '子墨', '欣怡', '博文', '梦琪', '宇航',
];

/** 班干部轮换角色 */
const CADRE_ROLES = [
  '班长', '团支书', '学习委员', '纪律委员', '体育委员', '文艺委员', '生活委员', '英语课代表',
];

/** 5 场考试定义 */
const EXAM_DEFS = [
  { name: '开学摸底考', examType: '摸底', examDate: '2025-09-15', termId: 1 },
  { name: '十月月考', examType: '月考', examDate: '2025-10-20', termId: 1 },
  { name: '期中考试', examType: '期中', examDate: '2025-11-15', termId: 1 },
  { name: '十二月月考', examType: '月考', examDate: '2025-12-18', termId: 1 },
  { name: '期末考试', examType: '期末', examDate: '2026-01-10', termId: 1 },
];

/** 生成确定性伪随机（可复现） */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 竞赛式排名 */
function assignCompetitionRanks(
  items: Array<{ id: number; score: number }>,
): Map<number, number> {
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
  const ranks = new Map<number, number>();
  let index = 0;
  while (index < sorted.length) {
    const rank = index + 1;
    const score = sorted[index].score;
    let end = index;
    while (end < sorted.length && sorted[end].score === score) {
      ranks.set(sorted[end].id, rank);
      end += 1;
    }
    index = end;
  }
  return ranks;
}

/** 写入 40 名学生 + 5 场考试成绩（可重复用 --force 覆盖） */
async function main(): Promise<void> {
  const force =
    process.argv.includes('--reset')
    || process.argv.includes('--force')
    || process.env.SEED_FORCE === '1';

  const app = await NestFactory.createApplicationContext(SeedCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  const databaseService = app.get(DatabaseService);
  const db = databaseService.getDb();
  const now = nowIso();
  const rand = mulberry32(20260828);

  const studentCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL')
      .get() as { c: number }
  ).c;

  if (studentCount >= 40 && !force) {
    console.log(
      `已有 ${studentCount} 名在册学生。若要重建 mock，请执行：npm run cli:seed-mock -- --reset`,
    );
    await app.close();
    return;
  }

  const run = db.transaction(() => {
    if (force) {
      db.prepare('DELETE FROM scores').run();
      db.prepare('DELETE FROM incident_students').run();
      db.prepare('DELETE FROM student_tags').run();
      db.prepare('DELETE FROM guardians').run();
      db.prepare('DELETE FROM student_sensitive').run();
      db.prepare('DELETE FROM comments').run();
      db.prepare('DELETE FROM incidents').run();
      db.prepare('DELETE FROM exams').run();
      db.prepare('DELETE FROM students').run();
      console.log('已清空学生/考试/成绩等业务表（仅用于本地 mock 重建）');
    }

    const subjects = db
      .prepare(
        `SELECT id, name, full_score FROM subjects
         WHERE deleted_at IS NULL AND enabled = 1
         ORDER BY sort ASC, id ASC`,
      )
      .all() as Array<{ id: number; name: string; full_score: number }>;

    if (subjects.length === 0) {
      throw new Error('无可用科目，请先执行迁移种子');
    }

    const subjectIdsJson = JSON.stringify(subjects.map((s) => s.id));
    const tagRows = db
      .prepare(
        `SELECT id FROM tags WHERE deleted_at IS NULL AND sensitive_level = 0`,
      )
      .all() as Array<{ id: number }>;

    const insertStudent = db.prepare(
      `INSERT INTO students (
         student_no, name, gender, birth_date, status, board_type, cadre_role,
         focus_level, remark, created_at, updated_at
       ) VALUES (?, ?, ?, ?, '在读', ?, ?, ?, ?, ?, ?)`,
    );
    const insertTag = db.prepare(
      `INSERT OR IGNORE INTO student_tags (student_id, tag_id) VALUES (?, ?)`,
    );

    const studentIds: number[] = [];
    /** 学生能力基线 0.35~0.95，后续考试围绕基线波动 */
    const baselines = new Map<number, number>();

    for (let i = 1; i <= 40; i += 1) {
      const studentNo = `2026${String(i).padStart(2, '0')}`;
      const surname = SURNAMES[i % SURNAMES.length];
      const given = GIVEN_NAMES[(i * 3) % GIVEN_NAMES.length];
      const name = `${surname}${given}`;
      const gender = i % 2;
      const birthDate = `2012-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
      const boardType = i % 5 === 0 ? '住校' : '走读';
      const cadreRole = i <= CADRE_ROLES.length ? CADRE_ROLES[i - 1] : null;
      const focusLevel = i <= 3 ? 3 : i <= 8 ? 2 : i <= 15 ? 1 : 0;
      const remark = focusLevel >= 2 ? '重点关注生（mock）' : null;

      const result = insertStudent.run(
        studentNo,
        name,
        gender,
        birthDate,
        boardType,
        cadreRole,
        focusLevel,
        remark,
        now,
        now,
      );
      const studentId = Number(result.lastInsertRowid);
      studentIds.push(studentId);

      const ability = 0.42 + rand() * 0.48;
      baselines.set(studentId, ability);

      if (tagRows.length > 0 && rand() < 0.45) {
        const tag = tagRows[Math.floor(rand() * tagRows.length)];
        insertTag.run(studentId, tag.id);
      }
      if (tagRows.length > 1 && rand() < 0.2) {
        const tag = tagRows[Math.floor(rand() * tagRows.length)];
        insertTag.run(studentId, tag.id);
      }
    }

    const insertExam = db.prepare(
      `INSERT INTO exams (name, exam_type, term_id, exam_date, subject_ids, grade_ref, status)
       VALUES (?, ?, ?, ?, ?, ?, '已发布')`,
    );
    const upsertScore = db.prepare(
      `INSERT INTO scores (exam_id, student_id, subject_id, score, status, class_rank)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(exam_id, student_id, subject_id) DO UPDATE SET
         score = excluded.score,
         status = excluded.status,
         class_rank = NULL`,
    );
    const updateRank = db.prepare(
      `UPDATE scores SET class_rank = ?
       WHERE exam_id = ? AND student_id = ? AND subject_id = ?`,
    );

    for (let examIndex = 0; examIndex < EXAM_DEFS.length; examIndex += 1) {
      const def = EXAM_DEFS[examIndex];
      /** 班级整体随考试略有起伏 */
      const classShift = (examIndex - 2) * 0.02;
      const gradeAvg =
        Math.round(
          subjects.reduce((sum, s) => sum + s.full_score * 0.72, 0) * 10,
        ) / 10;
      const gradeRef = JSON.stringify({ totalAvg: gradeAvg + examIndex * 1.5 });

      const examResult = insertExam.run(
        def.name,
        def.examType,
        def.termId,
        def.examDate,
        subjectIdsJson,
        gradeRef,
      );
      const examId = Number(examResult.lastInsertRowid);

      for (const studentId of studentIds) {
        const base = baselines.get(studentId) ?? 0.7;
        for (const subject of subjects) {
          /** 约 2% 缺考、1% 免考 */
          const dice = rand();
          if (dice < 0.02) {
            upsertScore.run(examId, studentId, subject.id, null, '缺考');
            continue;
          }
          if (dice < 0.03) {
            upsertScore.run(examId, studentId, subject.id, null, '免考');
            continue;
          }

          const subjectBias = (rand() - 0.5) * 0.12;
          const examNoise = (rand() - 0.5) * 0.08;
          let ratio = base + classShift + subjectBias + examNoise;
          ratio = Math.min(0.98, Math.max(0.28, ratio));
          let score = Math.round(subject.full_score * ratio * 2) / 2;
          if (score > subject.full_score) score = subject.full_score;
          if (score < 0) score = 0;
          upsertScore.run(examId, studentId, subject.id, score, '正常');
        }
      }

      for (const subject of subjects) {
        const rows = db
          .prepare(
            `SELECT student_id, score FROM scores
             WHERE exam_id = ? AND subject_id = ? AND status = '正常' AND score IS NOT NULL`,
          )
          .all(examId, subject.id) as Array<{ student_id: number; score: number }>;
        const rankMap = assignCompetitionRanks(
          rows.map((r) => ({ id: r.student_id, score: r.score })),
        );
        for (const row of rows) {
          updateRank.run(rankMap.get(row.student_id) ?? null, examId, row.student_id, subject.id);
        }
      }

      console.log(`考试已写入: ${def.name} (id=${examId})`);
    }

    return studentIds.length;
  });

  const created = run();
  console.log(`Mock 完成：${created} 名学生 × ${EXAM_DEFS.length} 场考试（含各科成绩与班排）`);
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
