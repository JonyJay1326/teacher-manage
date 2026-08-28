/**
 * 生成可导入的成绩 Excel（基于当前库名单与第一场考试科目）
 */
import Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = path.join(__dirname, '../../data/classpilot.db');
const outDir = path.join(__dirname, '../../../');
const db = new Database(dbPath);

const exam = db
  .prepare(
    `SELECT id, name, subject_ids FROM exams WHERE deleted_at IS NULL ORDER BY id LIMIT 1`,
  )
  .get() as { id: number; name: string; subject_ids: string } | undefined;

if (!exam) {
  console.error('库中没有考试，请先创建考试或运行 seed');
  process.exit(1);
}

const subjectIds = JSON.parse(exam.subject_ids) as number[];
const subjects = db
  .prepare(
    `SELECT id, name, full_score FROM subjects WHERE id IN (${subjectIds.map(() => '?').join(',')}) ORDER BY sort ASC`,
  )
  .all(...subjectIds) as Array<{ id: number; name: string; full_score: number }>;

const students = db
  .prepare(
    `SELECT student_no, name FROM students WHERE deleted_at IS NULL AND status = '在读' ORDER BY CAST(student_no AS INTEGER) ASC`,
  )
  .all() as Array<{ student_no: string; name: string }>;

/** 生成略有差异的演示分数 */
function demoScore(fullScore: number, studentIndex: number, subjectIndex: number): number | string {
  // 偶发缺考/免考，方便验证特殊值
  if (studentIndex === 2 && subjectIndex === 0) return '缺';
  if (studentIndex === 5 && subjectIndex === 1) return '免';
  const base = fullScore * (0.55 + ((studentIndex * 7 + subjectIndex * 3) % 40) / 100);
  return Math.round(base * 10) / 10;
}

const header = ['学号', '姓名', ...subjects.map((s) => s.name)];
const rows = students.map((stu, i) => [
  stu.student_no,
  stu.name,
  ...subjects.map((s, j) => demoScore(s.full_score, i, j)),
]);

const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, '成绩导入');

const safeName = exam.name.replace(/[\\/:*?"<>|]/g, '_');
const filename = `成绩导入示例_${safeName}.xlsx`;
const outPath = path.join(outDir, filename);
XLSX.writeFile(book, outPath);

console.log(
  JSON.stringify(
    {
      outPath,
      examId: exam.id,
      examName: exam.name,
      studentCount: students.length,
      subjects: subjects.map((s) => s.name),
    },
    null,
    2,
  ),
);
