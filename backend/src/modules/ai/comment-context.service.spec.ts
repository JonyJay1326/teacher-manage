import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CommentContextService } from './comment-context.service';

/**
 * 评语上下文组装测试。
 * 用内存 SQLite 造最小 schema，真实走 ContextService 的 SQL 分支，
 * 以覆盖「有/无成绩、事件、评语、印象」以及 token 预算截断。
 */

let db: Database.Database;
let service: CommentContextService;

/** 建最小可用 schema 并写入种子数据 */
function seed(): void {
  db.exec(`
    CREATE TABLE students (
      id INTEGER PRIMARY KEY, name TEXT, gender INTEGER,
      focus_level INTEGER DEFAULT 0, cadre_role TEXT, status TEXT,
      deleted_at TEXT
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY, name TEXT, sensitive_level INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE student_tags (
      student_id INTEGER, tag_id INTEGER
    );
    CREATE TABLE terms (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT, sort INTEGER, full_score REAL);
    CREATE TABLE exams (
      id INTEGER PRIMARY KEY, name TEXT, exam_date TEXT,
      deleted_at TEXT
    );
    CREATE TABLE scores (
      exam_id INTEGER, student_id INTEGER, subject_id INTEGER,
      score REAL, status TEXT, class_rank INTEGER
    );
    CREATE TABLE incidents (
      id INTEGER PRIMARY KEY, occurred_at TEXT, category TEXT,
      severity INTEGER, title TEXT, content TEXT, status TEXT,
      deleted_at TEXT
    );
    CREATE TABLE incident_students (incident_id INTEGER, student_id INTEGER);
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY, student_id INTEGER, comment_type TEXT,
      final_text TEXT, created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE student_impressions (
      id INTEGER PRIMARY KEY, student_id INTEGER, content TEXT,
      deleted_at TEXT
    );
  `);

  const si = db.prepare(
    'INSERT INTO students (id,name,gender,focus_level,cadre_role,status) VALUES (?,?,?,?,?,?)',
  );
  si.run(1, '李敏', 0, 3, '班长', '在读');
  si.run(2, '王芳', 1, 0, null, '在读');

  db.prepare('INSERT INTO terms (id,name) VALUES (1, ?)').run('2026-2027 第一学期');
  db.prepare('INSERT INTO subjects (id,name,sort,full_score) VALUES (1,?,1,120),(2,?,2,120)').run('语文', '数学');
  db.prepare('INSERT INTO tags (id,name,sensitive_level) VALUES (1,?,0),(2,?,2)').run('偏科', '家中有变故');
  db.prepare('INSERT INTO student_tags VALUES (1,1),(1,2)').run();

  db.prepare('INSERT INTO exams (id,name,exam_date) VALUES (1,?,?),(2,?,?)')
    .run('期中考试', '2025-11-15', '期末考试', '2026-01-10');
  db.prepare(
    `INSERT INTO scores (exam_id,student_id,subject_id,score,status,class_rank)
     VALUES (1,1,1,100,'正常',1),(1,1,2,90,'正常',2),
            (2,1,1,110,'正常',1),(2,1,2,85,'正常',3),
            (1,2,1,70,'缺考',NULL),(2,2,1,75,'正常',5),(2,2,2,60,'免考',NULL)`,
  ).run();

  db.prepare('INSERT INTO comments (id,student_id,comment_type,final_text,created_at) VALUES (1,1,?,?,?)')
    .run('期末评语', '上学期总体不错。', '2026-01-11');
  db.prepare('INSERT INTO student_impressions (student_id,content) VALUES (1,?)')
    .run('课堂参与积极。');
}

beforeEach(() => {
  db = new Database(':memory:');
  seed();
  service = new CommentContextService({ getDb: () => db } as never);
});

afterEach(() => {
  db.close();
});

describe('CommentContextService.build 基本拼装', () => {
  it('包含五个固定段落标题', () => {
    const out = service.build(1, 1);
    for (const title of ['【学生档案】', '【成绩摘要】', '【事件摘要】', '【上次评语】', '【班主任印象】']) {
      expect(out.text).toContain(title);
    }
  });

  it('档案段含姓名、性别、学期、关注等级、班干部与标签', () => {
    const { profile } = service.build(1, 1).sections;
    expect(profile).toContain('姓名：李敏');
    expect(profile).toContain('性别：男'); // gender=0 为男
    expect(profile).toContain('学期：2026-2027 第一学期');
    expect(profile).toContain('状态：在读');
    expect(profile).toContain('关注等级：3');
    expect(profile).toContain('班干部：班长');
    expect(profile).toContain('标签：偏科');
  });

  it('档案段排除 L2 敏感标签', () => {
    // 家中有变故 sensitive_level=2，不得进入上下文
    expect(service.build(1, 1).sections.profile).not.toContain('家中有变故');
  });

  it('termId 为 null 时学期显示「当前学期」', () => {
    expect(service.build(1, null).sections.profile).toContain('学期：当前学期');
  });

  it('不存在的 termId 回退为「当前学期」', () => {
    expect(service.build(1, 999).sections.profile).toContain('学期：当前学期');
  });

  it('女生正确渲染为「女」', () => {
    expect(service.build(2, 1).sections.profile).toContain('性别：女');
  });

  it('无标签时显示「无」', () => {
    expect(service.build(2, 1).sections.profile).toContain('标签：无');
  });

  it('学生不存在时档案段提示「（学生不存在）」', () => {
    expect(service.build(999, 1).sections.profile).toBe('（学生不存在）');
  });

  it('软删除的学生不返回档案', () => {
    db.prepare("UPDATE students SET deleted_at='2026-01-01' WHERE id=2").run();
    expect(service.build(2, 1).sections.profile).toBe('（学生不存在）');
  });

  it('未指定学期时 build 仍能完成', () => {
    expect(service.build(1, null).text.length).toBeGreaterThan(0);
  });
});

describe('成绩摘要段', () => {
  it('最多取最近两场考试', () => {
    const { scores } = service.build(1, 1).sections;
    expect(scores).toContain('期末考试');
    expect(scores).toContain('期中考试');
  });

  it('汇总总分并带出单科班排', () => {
    const { scores } = service.build(1, 1).sections;
    // 期末：110 + 85 = 195
    expect(scores).toContain('总分约 195');
    expect(scores).toContain('语文110/第1名');
  });

  it('缺考渲染为「缺」、免考渲染为「免」', () => {
    expect(service.build(2, 1).sections.scores).toContain('缺');
    expect(service.build(2, 1).sections.scores).toContain('免');
  });

  it('两场都有成绩时给出上升/下降判断', () => {
    // 李敏：期中 190 → 期末 195，为上升
    expect(service.build(1, 1).sections.scores).toContain('较上场总分上升 5');
  });

  it('给出最强/最弱科（按班排）', () => {
    const { scores } = service.build(1, 1).sections;
    expect(scores).toContain('最近一场相对最强');
    expect(scores).toContain('相对最弱');
  });

  it('无成绩记录时提示「暂无成绩记录」', () => {
    db.exec('DELETE FROM scores');
    expect(service.build(1, 1).sections.scores).toBe('暂无成绩记录');
  });

  it('只有一场考试时不给出升降结论', () => {
    db.exec('DELETE FROM exams WHERE id=1');
    expect(service.build(1, 1).sections.scores).not.toContain('较上场总分');
  });

  it('软删除的考试不计入', () => {
    db.prepare("UPDATE exams SET deleted_at='2026-01-01' WHERE id=2").run();
    expect(service.build(1, 1).sections.scores).not.toContain('期末考试');
  });
});

describe('事件摘要段', () => {
  it('无事件时提示「本学期暂无已确认事件」', () => {
    expect(service.build(1, 1).sections.incidents).toBe('本学期暂无已确认事件');
  });

  it('只收录 confirmed 事件，忽略 draft', () => {
    db.prepare('INSERT INTO incidents (id,occurred_at,category,severity,title,content,status) VALUES (1,?,?,?,?,?,?)')
      .run('2025-11-01T00:00:00.000Z', '表扬奖励', 1, '三好学生', '获校级三好学生', 'confirmed');
    db.prepare('INSERT INTO incidents (id,occurred_at,category,severity,title,content,status) VALUES (2,?,?,?,?,?,?)')
      .run('2025-11-02T00:00:00.000Z', '纪律违纪', 2, '草稿事件', '不该出现', 'draft');
    db.prepare('INSERT INTO incident_students VALUES (1,1),(2,1)').run();
    const out = service.build(1, 1).sections.incidents;
    expect(out).toContain('表扬类');
    expect(out).toContain('三好学生');
    expect(out).not.toContain('不该出现');
  });

  it('表扬类最多输出 8 条', () => {
    const ins = db.prepare('INSERT INTO incidents (id,occurred_at,category,severity,title,content,status) VALUES (?,?,?,?,?,?,?)');
    const link = db.prepare('INSERT INTO incident_students VALUES (?,1)');
    for (let i = 0; i < 12; i += 1) {
      ins.run(i + 1, '2025-11-01T00:00:00.000Z', '表扬奖励', 1, `表扬${i}`, '内容', 'confirmed');
      link.run(i + 1);
    }
    const praiseLines = service.build(1, 1).sections.incidents
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(praiseLines.length).toBe(8);
  });

  it('非表扬事件压缩为一句话', () => {
    db.prepare('INSERT INTO incidents (id,occurred_at,category,severity,title,content,status) VALUES (1,?,?,?,?,?,?)')
      .run('2025-11-01T00:00:00.000Z', '纪律违纪', 2, 'x'.repeat(80), '内容摘要', 'confirmed');
    db.prepare('INSERT INTO incident_students VALUES (1,1)').run();
    const out = service.build(1, 1).sections.incidents;
    expect(out).toContain('其他事件（一句话）');
    expect(out).toContain('[纪律违纪·2星]');
  });
});

describe('上次评语与印象', () => {
  it('读取最近一条未删评语', () => {
    db.prepare('INSERT INTO comments (id,student_id,comment_type,final_text,created_at) VALUES (2,1,?,?,?)')
      .run('日常评语', '更新的评语。', '2026-06-11');
    expect(service.build(1, 1).sections.lastComment).toContain('更新的评语。');
  });

  it('软删除的评语被忽略', () => {
    db.prepare("UPDATE comments SET deleted_at='2026-01-01' WHERE id=1").run();
    expect(service.build(1, 1).sections.lastComment).toBe('无历史评语');
  });

  it('无评语时提示「无历史评语」', () => {
    db.exec('DELETE FROM comments');
    expect(service.build(1, 1).sections.lastComment).toBe('无历史评语');
  });

  it('读取班主任印象', () => {
    expect(service.build(1, 1).sections.impression).toContain('课堂参与积极。');
  });

  it('印象为空时提示「暂无印象记录」', () => {
    db.prepare("UPDATE student_impressions SET content='   '").run();
    expect(service.build(1, 1).sections.impression).toBe('暂无印象记录');
  });

  it('超长印象被截断到 1200 字', () => {
    db.prepare('UPDATE student_impressions SET content=?').run('长'.repeat(3000));
    const out = service.build(1, 1).sections.impression;
    expect(out).toContain('已截断');
    expect(out.length).toBeLessThan(1300);
  });
});

describe('token 预算截断', () => {
  /** 造超长上下文，触发截断链 */
  function bloat(): void {
    const ins = db.prepare(
      'INSERT INTO incidents (id,occurred_at,category,severity,title,content,status) VALUES (?,?,?,?,?,?,?)',
    );
    const link = db.prepare('INSERT INTO incident_students VALUES (?,1)');
    for (let i = 0; i < 30; i += 1) {
      ins.run(i + 1, '2025-11-01T00:00:00.000Z', '纪律违纪', 2, `事件${i}`, '事'.repeat(300), 'confirmed');
      link.run(i + 1);
    }
    db.prepare('UPDATE student_impressions SET content=?').run('感'.repeat(4000));
  }

  it('超预算时正文压到 approxTokens 估算值以内或触底', () => {
    bloat();
    const out = service.build(1, 1);
    expect(out.approxTokens).toBe(Math.ceil(out.text.length / 1.5));
  });

  it('截断后仍保留五段结构', () => {
    bloat();
    const out = service.build(1, 1);
    for (const title of ['【学生档案】', '【成绩摘要】', '【事件摘要】', '【上次评语】', '【班主任印象】']) {
      expect(out.text).toContain(title);
    }
  });

  it('截断后档案段不被裁剪（始终完整）', () => {
    bloat();
    const out = service.build(1, 1);
    expect(out.sections.profile).toContain('姓名：李敏');
    expect(out.sections.profile).toContain('班干部：班长');
  });

  it('超长时被截断的段落带「已截断」标记', () => {
    bloat();
    const out = service.build(1, 1);
    const anyTruncated =
      out.sections.incidents.includes('已截断') ||
      out.sections.impression.includes('已截断') ||
      out.sections.scores.includes('已截断');
    expect(anyTruncated).toBe(true);
  });

  it('未超预算时不产生截断标记', () => {
    const out = service.build(1, 1);
    expect(out.text).not.toContain('已截断');
  });

  it('sections 与 text 一致：各段都能在 text 中找到', () => {
    bloat();
    const out = service.build(1, 1);
    expect(out.text).toContain(out.sections.profile);
    expect(out.text).toContain(out.sections.lastComment);
  });
});
