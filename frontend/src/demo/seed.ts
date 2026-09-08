import type {
  Exam,
  ExamScoreRow,
  IncidentCategory,
  Subject,
  SubjectScoreCell,
  Tag,
  TimelineItem,
} from '@/types';
import type { GuardianDto, StudentDetailDto } from '@/api/students';
import type { TermDto } from '@/api/scores';
import type { IncidentListItem } from '@/api/incidents';
import type { AiPromptDto, AiRecordDto } from '@/api/ai';
import type { CommentView } from '@/api/comments';
import type { KbDocumentDto } from '@/api/knowledge';

/** 演示用成绩单元格 */
export interface DemoScoreCell {
  examId: number;
  subjectId: number;
  studentId: number;
  score: number | null;
  status: 'normal' | 'absent' | 'exempt' | 'empty';
  classRank: number | null;
}

/** 演示内存库结构 */
export interface DemoDb {
  user: { id: number; username: string; displayName: string };
  tags: Tag[];
  students: StudentDetailDto[];
  guardians: GuardianDto[];
  impressions: Record<number, string>;
  sensitive: Record<string, string>;
  terms: TermDto[];
  subjects: Subject[];
  exams: Exam[];
  scores: DemoScoreCell[];
  incidents: IncidentListItem[];
  comments: CommentView[];
  prompts: AiPromptDto[];
  aiRecords: AiRecordDto[];
  kbDocuments: KbDocumentDto[];
  thresholds: {
    lowScoreRatio: number;
    passRatio: number;
    excellentRatio: number;
    rankJumpThreshold: number;
  };
  timelines: Record<number, TimelineItem[]>;
  nextIds: {
    student: number;
    guardian: number;
    tag: number;
    exam: number;
    incident: number;
    comment: number;
    prompt: number;
    aiRecord: number;
    kb: number;
  };
}

const SURNAMES = [
  '王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
];
const GIVEN_M = [
  '浩然', '子轩', '宇轩', '俊杰', '明轩', '博文', '嘉豪', '志远', '天佑', '思源',
  '晨阳', '浩宇', '一诺', '俊熙', '子墨', '昊然', '宇航', '嘉懿', '子睿', '景行',
];
const GIVEN_F = [
  '诗涵', '雨萱', '欣怡', '梓涵', '一诺', '思涵', '梦瑶', '语桐', '可欣', '若曦',
  '雅婷', '佳怡', '婉清', '清妍', '晓彤', '依诺', '心怡', '雨桐', '沐瑶', '予安',
];

const TAG_SEED: Array<Omit<Tag, 'id'>> = [
  { domain: '学业', name: '偏科明显', sensitiveLevel: 0 },
  { domain: '学业', name: '进步明显', sensitiveLevel: 0 },
  { domain: '行为情绪', name: '需关注情绪', sensitiveLevel: 1 },
  { domain: '行为情绪', name: '课堂活跃', sensitiveLevel: 0 },
  { domain: '健康', name: '近视中度', sensitiveLevel: 0 },
  { domain: '家庭', name: '单亲', sensitiveLevel: 1 },
  { domain: '特长', name: '篮球社', sensitiveLevel: 0 },
  { domain: '特长', name: '演讲社', sensitiveLevel: 0 },
  { domain: '其他', name: '班干部', sensitiveLevel: 0 },
];

const SUBJECTS: Subject[] = [
  { id: 1, code: 'CHN', name: '语文', fullScore: 150 },
  { id: 2, code: 'MATH', name: '数学', fullScore: 150 },
  { id: 3, code: 'ENG', name: '英语', fullScore: 150 },
  { id: 4, code: 'PHY', name: '物理', fullScore: 100 },
  { id: 5, code: 'CHEM', name: '化学', fullScore: 100 },
  { id: 6, code: 'BIO', name: '生物', fullScore: 100 },
];

/** 确定性伪随机（便于每次进入演示数据稳定） */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO 日期（本地日 → UTC 正午，避免时区偏移显示错乱） */
function isoDate(y: number, m: number, d: number, hh = 12, mm = 0): string {
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0)).toISOString();
}

/** 构建演示种子数据（高一某班，约 42 人） */
export function createDemoSeed(): DemoDb {
  const rand = mulberry32(20260308);
  const tags: Tag[] = TAG_SEED.map((t, i) => ({ ...t, id: i + 1 }));

  const students: StudentDetailDto[] = [];
  const guardians: GuardianDto[] = [];
  const impressions: Record<number, string> = {};
  const timelines: Record<number, TimelineItem[]> = {};
  let guardianId = 1;

  for (let i = 0; i < 42; i += 1) {
    const id = i + 1;
    const gender = (i % 5 === 0 || i % 5 === 1 ? 0 : 1) as 0 | 1;
    const given =
      gender === 1
        ? GIVEN_M[i % GIVEN_M.length]!
        : GIVEN_F[i % GIVEN_F.length]!;
    const name = `${SURNAMES[i % SURNAMES.length]!}${given}`;
    const studentNo = `202401${String(i + 1).padStart(2, '0')}`;

    let focusLevel: 0 | 1 | 2 | 3 = 0;
    if (i === 3 || i === 11 || i === 28) focusLevel = 3;
    else if (i === 7 || i === 15 || i === 22 || i === 35) focusLevel = 2;
    else if (i % 7 === 0) focusLevel = 1;

    const tagIds: number[] = [];
    if (focusLevel >= 2) tagIds.push(3);
    if (i % 9 === 0) tagIds.push(1);
    if (i % 11 === 0) tagIds.push(2);
    if (i % 13 === 0) tagIds.push(7);
    if ([5, 18].includes(i)) tagIds.push(9);

    const cadreRole =
      i === 0 ? '班长' : i === 1 ? '学习委员' : i === 2 ? '体育委员' : undefined;

    const daysSinceLastContact =
      focusLevel >= 2 ? Math.floor(rand() * 35) + 3 : Math.floor(rand() * 20) + 1;

    students.push({
      id,
      studentNo,
      name,
      gender,
      focusLevel,
      status: i === 40 ? '转出' : '在读',
      cadreRole,
      tagIds,
      daysSinceLastContact,
      lastIncidentSummary:
        focusLevel >= 2
          ? ['近期情绪波动，已约谈家长', '作业缺交增多，需跟进', '与同学冲突已调解'][
              i % 3
            ]
          : undefined,
      hasSensitive: i === 11 || i === 28,
      ethnicity: '汉族',
      address: `示例市示例区阳光路 ${100 + i} 号`,
      residence: '走读',
      enrolledAt: isoDate(2024, 9, 1),
      remark: focusLevel >= 3 ? '重点关注对象，家校联动中' : null,
      guardians: [],
    });

    const gId = guardianId;
    guardianId += 1;
    guardians.push({
      id: gId,
      studentId: id,
      relation: '母亲',
      name: `${SURNAMES[(i + 3) % SURNAMES.length]!}女士`,
      phone: `138${String(1000 + i).padStart(4, '0')}${String(1000 + (i * 7) % 9000).padStart(4, '0')}`.slice(0, 11),
      wechat: null,
      job: ['教师', '工程师', '个体经营', '医护', '公务员'][i % 5]!,
      contactPref: '电话',
      bestTime: '晚 19:00–21:00',
      isPrimary: true,
      remark: null,
    });

    if (i % 4 === 0) {
      const g2 = guardianId;
      guardianId += 1;
      guardians.push({
        id: g2,
        studentId: id,
        relation: '父亲',
        name: `${SURNAMES[(i + 5) % SURNAMES.length]!}先生`,
        phone: `139${String(2000 + i).padStart(4, '0')}${String(2000 + (i * 3) % 9000).padStart(4, '0')}`.slice(0, 11),
        wechat: null,
        job: null,
        contactPref: '微信',
        bestTime: '周末',
        isPrimary: false,
        remark: null,
      });
    }

    impressions[id] =
      focusLevel >= 2
        ? `${name}近期状态需要持续观察，课堂专注度起伏，建议小步目标与及时反馈。`
        : `${name}整体稳定，课堂参与积极，可适当增加挑战性任务。`;

    timelines[id] = [
      {
        id: id * 10 + 1,
        type: 'score',
        occurredAt: isoDate(2026, 11, 12),
        title: '期中考试',
        summary: '总分班级中游，数学较上次提升',
      },
      {
        id: id * 10 + 2,
        type: 'contact',
        occurredAt: isoDate(2026, 10, 20),
        title: '家校沟通',
        summary: '反馈近期作业与作息情况',
      },
    ];
  }

  // 挂载 guardians 到详情
  for (const s of students) {
    s.guardians = guardians.filter((g) => g.studentId === s.id);
  }

  const terms: TermDto[] = [
    {
      id: 1,
      name: '2025-2026 学年第一学期',
      startDate: '2025-09-01',
      endDate: '2026-01-20',
      grade: 10,
    },
    {
      id: 2,
      name: '2025-2026 学年第二学期',
      startDate: '2026-02-17',
      endDate: '2026-07-05',
      grade: 10,
    },
    {
      id: 3,
      name: '2026-2027 学年第一学期',
      startDate: '2026-09-01',
      endDate: '2027-01-18',
      grade: 11,
    },
  ];

  const subjectIds = SUBJECTS.map((s) => s.id);
  const exams: Exam[] = [
    {
      id: 1,
      name: '高一上学期期末',
      examType: '期末',
      examDate: isoDate(2026, 1, 10),
      subjectIds: [...subjectIds],
      status: '已发布',
    },
    {
      id: 2,
      name: '高一下学期期中',
      examType: '期中',
      examDate: isoDate(2026, 4, 18),
      subjectIds: [...subjectIds],
      status: '已发布',
    },
    {
      id: 3,
      name: '高一下学期期末',
      examType: '期末',
      examDate: isoDate(2026, 6, 28),
      subjectIds: [...subjectIds],
      status: '已发布',
    },
    {
      id: 4,
      name: '高二上学期期中',
      examType: '期中',
      examDate: isoDate(2026, 11, 12),
      subjectIds: [...subjectIds],
      status: '录入中',
    },
  ];

  // 学生能力基线，保证跨考试趋势合理
  const ability = students.map(() => 0.45 + rand() * 0.45);
  const scores: DemoScoreCell[] = [];

  for (const exam of exams) {
    const examBoost = exam.id * 0.01;
    for (const subject of SUBJECTS) {
      const cells: Array<{ studentId: number; score: number }> = [];
      for (let si = 0; si < students.length; si += 1) {
        const student = students[si]!;
        if (student.status !== '在读') continue;
        const ab = ability[si]!;
        const noise = (rand() - 0.5) * 0.18;
        const ratio = Math.min(0.98, Math.max(0.28, ab + examBoost + noise));
        let score = Math.round(subject.fullScore * ratio);
        // 少量缺考
        if (rand() < 0.02) {
          scores.push({
            examId: exam.id,
            subjectId: subject.id,
            studentId: student.id,
            score: null,
            status: 'absent',
            classRank: null,
          });
          continue;
        }
        cells.push({ studentId: student.id, score });
      }
      cells.sort((a, b) => b.score - a.score);
      cells.forEach((c, idx) => {
        scores.push({
          examId: exam.id,
          subjectId: subject.id,
          studentId: c.studentId,
          score: c.score,
          status: 'normal',
          classRank: idx + 1,
        });
      });
    }
  }

  const categories: IncidentCategory[] = [
    '纪律违纪',
    '情绪行为',
    '伤病健康',
    '家校沟通',
    '表扬奖励',
    '学习问题',
    '其他',
  ];

  const incidents: IncidentListItem[] = [];
  let incidentId = 1;

  const pushIncident = (
    partial: Omit<IncidentListItem, 'id' | 'studentNames'> & { id?: number },
  ): void => {
    const id = partial.id ?? incidentId;
    incidentId = Math.max(incidentId, id + 1);
    const names = partial.studentIds.map(
      (sid) => students.find((s) => s.id === sid)?.name ?? '未知',
    );
    incidents.push({
      ...partial,
      id,
      studentNames: names,
    });
  };

  // 待跟进（首页待办）
  pushIncident({
    occurredAt: isoDate(2026, 11, 10, 9, 30),
    category: '情绪行为',
    severity: 2,
    title: '课间情绪失控，已安抚',
    content:
      '第三节课后与同学发生争执，情绪激动，已带离教室安抚。约家长本周面谈。',
    studentIds: [4],
    followUpNeeded: true,
    followUpDone: false,
    followUpDeadline: isoDate(2026, 11, 20),
    status: 'confirmed',
  });
  pushIncident({
    occurredAt: isoDate(2026, 11, 8, 14, 0),
    category: '学习问题',
    severity: 2,
    title: '数学作业连续缺交',
    content: '近两周数学作业缺交 4 次，课堂走神增多。已与本人谈话，需跟进落实。',
    studentIds: [12],
    followUpNeeded: true,
    followUpDone: false,
    followUpDeadline: isoDate(2026, 11, 18),
    status: 'confirmed',
  });
  pushIncident({
    occurredAt: isoDate(2026, 11, 3, 16, 20),
    category: '家校沟通',
    severity: 1,
    title: '家长反馈睡眠不足',
    content: '母亲反映孩子近两周睡到凌晨，白天犯困。建议共同调整作息。',
    studentIds: [29],
    followUpNeeded: true,
    followUpDone: false,
    followUpDeadline: isoDate(2026, 11, 16),
    status: 'confirmed',
  });

  // 草稿
  pushIncident({
    occurredAt: isoDate(2026, 11, 16, 8, 10),
    category: '其他',
    severity: 1,
    title: '速记：走廊追逐',
    content: '早读前走廊追逐，已口头提醒，待整理入库。',
    draftContent: '早读前走廊追逐，已口头提醒，待整理入库。',
    studentIds: [8, 19],
    followUpNeeded: false,
    followUpDone: false,
    status: 'draft',
  });
  pushIncident({
    occurredAt: isoDate(2026, 11, 14, 17, 40),
    category: '表扬奖励',
    severity: 1,
    title: '速记：主动帮助同学',
    content: '值日时主动帮腿伤同学拿书包，值得表扬。',
    draftContent: '值日时主动帮腿伤同学拿书包，值得表扬。',
    studentIds: [6],
    followUpNeeded: false,
    followUpDone: false,
    status: 'draft',
  });

  // 已确认历史
  for (let i = 0; i < 12; i += 1) {
    const sid = (i * 3) % 40 + 1;
    const cat = categories[i % categories.length]!;
    pushIncident({
      occurredAt: isoDate(2026, 6 + (i % 5), 5 + i, 10, 0),
      category: cat,
      severity: ((i % 3) + 1) as 1 | 2 | 3,
      title: `${cat}记录 #${i + 1}`,
      content: `关于 ${students.find((s) => s.id === sid)?.name ?? ''} 的${cat}情况记录，已处理完毕。`,
      studentIds: [sid],
      followUpNeeded: i % 4 === 0,
      followUpDone: i % 4 === 0,
      followUpDeadline: i % 4 === 0 ? isoDate(2026, 11, 1) : undefined,
      followUpDoneAt: i % 4 === 0 ? isoDate(2026, 10, 28) : null,
      followUpResult: i % 4 === 0 ? '已与家长电话沟通，情况稳定。' : null,
      status: 'confirmed',
    });
  }

  const comments: CommentView[] = students.slice(0, 8).map((s, idx) => ({
    id: idx + 1,
    studentId: s.id,
    termId: 3,
    commentType: '期中评语',
    finalText: `${s.name}同学本期学习态度端正，课堂发言积极。建议继续保持复习节奏，薄弱科目可制定每周小目标。`,
    sourceAiRecordId: null,
    createdAt: isoDate(2026, 11, 15),
  }));

  const prompts: AiPromptDto[] = [
    // —— 评语 ——
    {
      id: 1,
      scene: 'comment',
      name: '温婉型评语',
      template: `你是一位经验丰富的班主任，正在为 {{student_name}} 撰写评语。
请基于真实资料写出真诚、具体的评语，避免空话套话；语气{{style_tone}}，长度{{style_length}}。

该生本学期情况：
【成绩】{{score_trend}}
【在校表现】{{incident_summary}}
【亮点与表扬】{{praise_summary}}
【班主任印象】{{impression}}
【上次评语】{{last_comment}}

要求：
1. 至少引用一处具体表现（来自上面的资料）
2. 先肯定进步，再给出改进方向（若 style_advice 为是）
3. 结尾一句个性化鼓励
4. 禁止编造未出现的事实；直接输出评语正文`,
      styleParams: { tone: '亲切', length: '中', includeAdvice: true },
      isBuiltin: true,
      isDefault: true,
    },
    {
      id: 2,
      scene: 'comment',
      name: '严谨型评语',
      template: `你是严谨务实的班主任，请为 {{student_name}} 撰写评语。
语气{{style_tone}}，篇幅{{style_length}}。只依据材料，禁止编造。

材料：
成绩：{{score_trend}}
在校表现：{{incident_summary}}
亮点：{{praise_summary}}
印象：{{impression}}
上次评语：{{last_comment}}

写作要求：
1. 客观陈述表现与进退
2. 指出 1-2 个可验证的改进点（若 style_advice 为是）
3. 语言克制、具体；直接输出评语正文`,
      styleParams: { tone: '严肃', length: '中', includeAdvice: true },
      isBuiltin: true,
      isDefault: false,
    },
    {
      id: 3,
      scene: 'comment',
      name: '简洁鼓励型',
      template: `为 {{student_name}} 写一段简洁评语（{{style_length}}），语气{{style_tone}}。
依据：成绩 {{score_trend}}；印象 {{impression}}；亮点 {{praise_summary}}。
要求：先肯定再建议（建议是否需要：{{style_advice}}），不编造，直接输出正文。`,
      styleParams: { tone: '朴实', length: '短', includeAdvice: true },
      isBuiltin: true,
      isDefault: false,
    },
    // —— 学情问答 ——
    {
      id: 4,
      scene: 'data_qa',
      name: '学情问答默认',
      template: `你是班主任学情助手，当前查询范围：{{scope}}。
硬性约束：
1. 仅依据下方系统数据回答；关键数字后标注出处。
2. 数据未覆盖时回答「系统数据中未找到相关记录」，禁止编造。
3. 不展开高敏隐私；涉及处置时提示结合本校规定判断。
4. 可用 Markdown 粗体与列表；直接输出回答正文。

【系统数据】
{{context}}`,
      styleParams: {},
      isBuiltin: true,
      isDefault: true,
    },
    {
      id: 5,
      scene: 'data_qa',
      name: '学情问答·行动清单',
      template: `你是班主任助手。范围：{{scope}}。
请用「结论 + 行动清单」回答，每条建议尽量可执行、可检查。
仅依据系统数据，禁止编造；未覆盖处明确说明。

【系统数据】
{{context}}`,
      styleParams: {},
      isBuiltin: true,
      isDefault: false,
    },
    // —— 沟通话术 ——
    {
      id: 6,
      scene: 'talk_script',
      name: '家校沟通话术（默认）',
      template: `你是班主任沟通顾问。请根据场景与可选学生资料，撰写可直接使用的沟通草稿。
约束：只依据材料，禁止编造；语气尊重务实；给出开场、共情、事实核对、协商方案、收尾。
直接输出正文。

【场景描述】
{{scene}}

【学生相关资料】
{{context}}`,
      styleParams: { tone: '朴实' },
      isBuiltin: true,
      isDefault: true,
    },
    {
      id: 7,
      scene: 'talk_script',
      name: '电话沟通简稿',
      template: `为与 {{student_name}} 家长的电话沟通写一版简短话术。
场景：{{scene}}
资料：{{context}}
结构：问候 → 说明来意 → 客观情况 → 希望协作的一点 → 约定回访。
语气亲切，禁止编造，直接输出。`,
      styleParams: { tone: '亲切' },
      isBuiltin: true,
      isDefault: false,
    },
    // —— 工作总结 ——
    {
      id: 8,
      scene: 'work_summary',
      name: '学期工作总结（默认）',
      template: `你是班主任，请根据班级数据写学期工作总结初稿。
约束：仅依据系统数据；未覆盖处写「数据未覆盖」，禁止编造。
结构建议：班级概况 → 学业进展 → 日常管理 → 家校沟通 → 下学期改进方向。
直接输出正文。

【学期】{{term}}
【班级数据】
{{context}}`,
      styleParams: {},
      isBuiltin: true,
      isDefault: true,
    },
    {
      id: 9,
      scene: 'work_summary',
      name: '期末述职精简版',
      template: `根据 {{term}} 的班级数据，写一份精简述职（约 600 字内）。
包含：成绩概览、班级氛围与日常管理、家校协同、下阶段重点。
仅依据数据，禁止编造。

【班级数据】
{{context}}`,
      styleParams: {},
      isBuiltin: true,
      isDefault: false,
    },
    // —— 综合素质报告 ——
    {
      id: 10,
      scene: 'report',
      name: '综合素质报告（默认）',
      template: `请为 {{student_name}} 撰写综合素质发展报告段落。
语气朴实，结合学习态度、合作交流、自我管理等方面概述，避免空话。
可参考：{{context}}
禁止编造具体分数与未提供的事实；直接输出正文。`,
      styleParams: { tone: '朴实', length: '中' },
      isBuiltin: true,
      isDefault: true,
    },
  ];

  const aiRecords: AiRecordDto[] = [
    {
      id: 1,
      scene: 'comment',
      promptId: 1,
      studentId: 1,
      studentName: students[0]!.name,
      contextSnapshot: '【演示】评语上下文快照',
      outputText: comments[0]!.finalText,
      model: 'demo-mock',
      tokensIn: 820,
      tokensOut: 260,
      status: 'success',
      createdAt: isoDate(2026, 11, 16),
    },
  ];

  const kbDocuments: KbDocumentDto[] = [
    {
      id: 1,
      title: '班级公约（2026）',
      categoryPath: '班级管理/公约',
      source: 'paste',
      filePath: null,
      segCount: 4,
      tags: ['公约', '日常'],
      createdAt: isoDate(2026, 9, 5),
      preview: '按时到校、尊重师长、课堂专注、互助友善……',
    },
    {
      id: 2,
      title: '家长会发言提纲',
      categoryPath: '家校沟通',
      source: 'paste',
      filePath: null,
      segCount: 6,
      tags: ['家长会'],
      createdAt: isoDate(2026, 10, 12),
      preview: '本期学情综述、重点关注学生沟通要点、寒假建议……',
    },
  ];

  return {
    user: { id: 9001, username: 'demo', displayName: '演示班主任' },
    tags,
    students,
    guardians,
    impressions,
    sensitive: {
      '11:家庭变故': '父母离异一年，目前与母亲同住，情绪偶有波动。（演示数据）',
      '28:心理关注': '曾出现短暂厌学情绪，已转介学校心理老师跟进。（演示数据）',
    },
    terms,
    subjects: SUBJECTS,
    exams,
    scores,
    incidents,
    comments,
    prompts,
    aiRecords,
    kbDocuments,
    thresholds: {
      lowScoreRatio: 0.6,
      passRatio: 0.6,
      excellentRatio: 0.85,
      rankJumpThreshold: 5,
    },
    timelines,
    nextIds: {
      student: 43,
      guardian: guardianId,
      tag: tags.length + 1,
      exam: 5,
      incident: incidentId,
      comment: comments.length + 1,
      prompt: 11,
      aiRecord: 2,
      kb: 3,
    },
  };
}

/** 计算考试总分排名行 */
export function buildExamMatrix(
  db: DemoDb,
  examId: number,
): { subjects: Subject[]; rows: ExamScoreRow[] } {
  const exam = db.exams.find((e) => e.id === examId);
  const subjects = db.subjects.filter((s) => exam?.subjectIds.includes(s.id));
  const active = db.students.filter((s) => s.status === '在读');

  const rows: ExamScoreRow[] = active.map((stu) => {
    const subjectScores: Record<number, SubjectScoreCell> = {};
    let total = 0;
    let hasAny = false;
    for (const sub of subjects) {
      const cell = db.scores.find(
        (c) =>
          c.examId === examId &&
          c.subjectId === sub.id &&
          c.studentId === stu.id,
      );
      const score = cell?.score ?? null;
      const status = cell?.status ?? 'empty';
      subjectScores[sub.id] = {
        score,
        status,
        classRank: cell?.classRank ?? null,
      };
      if (score != null && status === 'normal') {
        total += score;
        hasAny = true;
      }
    }
    return {
      studentId: stu.id,
      studentNo: stu.studentNo,
      name: stu.name,
      subjectScores,
      totalScore: hasAny ? total : null,
      totalRank: null,
    };
  });

  const ranked = [...rows]
    .filter((r) => r.totalScore != null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
  ranked.forEach((r, idx) => {
    const target = rows.find((x) => x.studentId === r.studentId);
    if (target) target.totalRank = idx + 1;
  });

  return { subjects, rows };
}
