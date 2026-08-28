import type { Tag, Student, Subject, Exam, Incident, TodoItem, SubjectBriefStat, TimelineItem, ScoreEntryRow, ScoreCellStatus, SubjectScoreCell, ExamScoreRow } from '@/types';

/** 内置标签（附录 B） */
export const mockTags: Tag[] = [
  { id: 1, domain: '学业', name: '偏科', sensitiveLevel: 0 },
  { id: 2, domain: '学业', name: '作业拖拉', sensitiveLevel: 0 },
  { id: 3, domain: '学业', name: '进步快', sensitiveLevel: 0 },
  { id: 4, domain: '行为情绪', name: '情绪易波动', sensitiveLevel: 1 },
  { id: 5, domain: '行为情绪', name: '易冲突', sensitiveLevel: 1 },
  { id: 6, domain: '行为情绪', name: '注意力难集中', sensitiveLevel: 1 },
  { id: 7, domain: '家庭', name: '父母离异', sensitiveLevel: 1 },
  { id: 8, domain: '家庭', name: '留守儿童', sensitiveLevel: 1 },
  { id: 9, domain: '家庭', name: '经济困难', sensitiveLevel: 1 },
  { id: 10, domain: '健康', name: '视力问题', sensitiveLevel: 0 },
  { id: 11, domain: '特长', name: '体育', sensitiveLevel: 0 },
  { id: 12, domain: '特长', name: '文艺', sensitiveLevel: 0 },
];

const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高'];
const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '华', '慧', '鹏', '飞', '鑫', '宇', '欣', '浩然', '子涵', '梓轩', '雨萱', '思远'];

/** 根据索引生成事件摘要 */
function getIncidentSummary(index: number): string {
  const summaries = [
    '第三节课后走廊与同学发生争执',
    '近期作业完成质量明显下降',
    '情绪波动较大，需持续关注',
    '与同桌发生推搡，已约家长面谈',
    '上课注意力不集中，多次提醒无效',
    '体育课上与同学冲突，已做批评教育',
  ];
  return summaries[index % summaries.length];
}

/** 生成 mock 学生列表 */
function generateStudents(): Student[] {
  const students: Student[] = [];
  const focusLevels: Array<0 | 1 | 2 | 3> = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3,
  ];
  const cadreRoles = ['班长', '副班长', '学习委员', '体育委员', '文艺委员', ''];

  for (let i = 0; i < 45; i++) {
    const surname = surnames[i % surnames.length];
    const given = givenNames[i % givenNames.length];
    const name = surname + given;
    const tagIds: number[] = [];
    if (i % 7 === 0) tagIds.push(2);
    if (i % 11 === 0) tagIds.push(4);
    if (i % 13 === 0) tagIds.push(7);
    if (i % 17 === 0) tagIds.push(11);
    if (focusLevels[i] >= 2) tagIds.push(5);

    students.push({
      id: i + 1,
      studentNo: `2026${String(i + 1).padStart(3, '0')}`,
      name,
      gender: i % 2 === 0 ? 1 : 0,
      focusLevel: focusLevels[i],
      status: '在读',
      cadreRole: cadreRoles[i % cadreRoles.length] || undefined,
      boardType: '走读',
      tagIds,
      lastIncidentSummary: focusLevels[i] >= 2 ? getIncidentSummary(i) : undefined,
      daysSinceLastContact: focusLevels[i] >= 2 ? (i % 5 === 0 ? 28 : i % 4 === 0 ? 14 : 7) : undefined,
    });
  }
  return students;
}

export const mockStudents = generateStudents();

export const mockSubjects: Subject[] = [
  { id: 1, code: 'yu', name: '语文', fullScore: 120 },
  { id: 2, code: 'shu', name: '数学', fullScore: 120 },
  { id: 3, code: 'wai', name: '英语', fullScore: 120 },
  { id: 4, code: 'dao', name: '道法', fullScore: 100 },
  { id: 5, code: 'li', name: '历史', fullScore: 100 },
  { id: 6, code: 'di', name: '地理', fullScore: 100 },
  { id: 7, code: 'sheng', name: '生物', fullScore: 100 },
];

export const mockExams: Exam[] = [
  {
    id: 1,
    name: '第一次月考',
    examType: '月考',
    examDate: '2026-10-15',
    subjectIds: [1, 2, 3, 4, 5, 6, 7],
    status: '已发布',
  },
  {
    id: 2,
    name: '期中考试',
    examType: '期中',
    examDate: '2026-11-20',
    subjectIds: [1, 2, 3, 4, 5, 6, 7],
    status: '录入中',
  },
];

export const mockIncidents: Incident[] = [
  {
    id: 1,
    occurredAt: '2026-10-28T06:30:00Z',
    category: '纪律违纪',
    severity: 2,
    title: '走廊推搡事件',
    content: '第三节课后小张与小李在走廊发生推搡，小李哭泣，张先动手。',
    studentIds: [1, 2],
    studentNames: [mockStudents[0].name, mockStudents[1].name],
    followUpNeeded: true,
    followUpDone: false,
    followUpDeadline: '2026-08-28',
    status: 'confirmed',
  },
  {
    id: 2,
    occurredAt: '2026-10-27T08:00:00Z',
    category: '家校沟通',
    severity: 1,
    title: '电话沟通作业情况',
    studentIds: [5],
    studentNames: [mockStudents[4].name],
    followUpNeeded: false,
    followUpDone: true,
    status: 'confirmed',
  },
  {
    id: 3,
    occurredAt: '2026-10-26T07:15:00Z',
    category: '表扬奖励',
    severity: 1,
    title: '运动会接力赛第一名',
    studentIds: [10],
    studentNames: [mockStudents[9].name],
    followUpNeeded: false,
    followUpDone: true,
    status: 'confirmed',
  },
  {
    id: 4,
    occurredAt: '2026-10-25T09:30:00Z',
    category: '情绪行为',
    severity: 3,
    title: '课堂情绪失控',
    studentIds: [40],
    studentNames: [mockStudents[39].name],
    followUpNeeded: true,
    followUpDone: false,
    followUpDeadline: '2026-08-27',
    status: 'confirmed',
  },
  {
    id: 5,
    occurredAt: '2026-10-24T02:00:00Z',
    category: '学习问题',
    severity: 1,
    title: '数学作业未交',
    studentIds: [15],
    studentNames: [mockStudents[14].name],
    followUpNeeded: false,
    followUpDone: true,
    status: 'confirmed',
  },
  {
    id: 6,
    occurredAt: '2026-10-28T01:00:00Z',
    category: '其他',
    severity: 1,
    title: '速记草稿：小王今天状态不好',
    studentIds: [20],
    studentNames: [mockStudents[19].name],
    followUpNeeded: false,
    followUpDone: false,
    status: 'draft',
  },
];

export const mockTodos: TodoItem[] = [
  {
    id: 1,
    title: '跟进走廊推搡事件 — 约双方家长周五面谈',
    deadline: '2026-08-28',
    studentNames: [mockStudents[0].name, mockStudents[1].name],
    type: 'follow_up',
  },
  {
    id: 2,
    title: '跟进课堂情绪失控 — 联系心理老师评估',
    deadline: '2026-08-27',
    studentNames: [mockStudents[39].name],
    type: 'follow_up',
  },
  {
    id: 3,
    title: '待整理速记草稿',
    deadline: '',
    studentNames: [],
    type: 'draft',
  },
];

export const mockSubjectBriefStats: SubjectBriefStat[] = [
  { subjectName: '语文', avgScore: 72.5, lowRate: 28 },
  { subjectName: '数学', avgScore: 58.3, lowRate: 45 },
  { subjectName: '英语', avgScore: 65.8, lowRate: 38 },
  { subjectName: '道法', avgScore: 68.2, lowRate: 32 },
  { subjectName: '历史', avgScore: 70.1, lowRate: 25 },
  { subjectName: '地理', avgScore: 63.4, lowRate: 40 },
  { subjectName: '生物', avgScore: 66.7, lowRate: 35 },
];

export const mockScoreTrend = [
  { exam: '开学测', score: 285 },
  { exam: '单元测1', score: 298 },
  { exam: '月考', score: 312 },
  { exam: '期中', score: 305 },
];

export const mockDraftCount: number = 3;

/** 根据 ID 获取学生 */
export function getStudentById(id: number): Student | undefined {
  return mockStudents.find((s) => s.id === id);
}

/** 根据标签 ID 列表获取可见标签（聚合视图仅 L0） */
export function getVisibleTags(tagIds: number[]): Tag[] {
  return tagIds
    .map((id) => mockTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined && t.sensitiveLevel === 0);
}

/** 获取重点关注学生（focus_level >= 2） */
export function getFocusStudents(): Student[] {
  return mockStudents.filter((s) => s.focusLevel >= 2);
}

/** 获取学生时间线 mock */
export function getStudentTimeline(studentId: number): TimelineItem[] {
  if (!getStudentById(studentId)) return [];

  return [
    {
      id: 1,
      type: 'incident',
      occurredAt: '2026-10-28T06:30:00Z',
      title: '走廊推搡事件',
      summary: '第三节课后与同学发生争执，已做批评教育。',
    },
    {
      id: 2,
      type: 'contact',
      occurredAt: '2026-10-20T08:00:00Z',
      title: '电话沟通',
      summary: '与家长沟通近期学习状态，家长表示会加强督促。',
    },
    {
      id: 3,
      type: 'score',
      occurredAt: '2026-10-15T00:00:00Z',
      title: '第一次月考 — 数学 58 分（班排 38）',
      summary: '较上次下降 5 分，需关注数学基础。',
    },
    {
      id: 4,
      type: 'praise',
      occurredAt: '2026-09-28T07:00:00Z',
      title: '课堂积极发言获表扬',
      summary: '语文课上主动回答难题，思路清晰。',
    },
    {
      id: 5,
      type: 'comment',
      occurredAt: '2026-07-05T00:00:00Z',
      title: '初一下学期期末评语',
      summary: '该生本学期进步明显，尤其在团队协作方面表现突出…',
    },
  ];
}

/** 成绩录入 mock 行数据 */
export function getScoreEntryRows(): ScoreEntryRow[] {
  return mockStudents.map((s, i) => {
    let status: ScoreCellStatus = 'empty';
    let currentScore: number | null = null;
    if (i < 32) {
      status = 'normal';
      currentScore = 50 + (i * 7) % 50;
    } else if (i === 32) {
      status = 'absent';
    } else if (i === 33) {
      status = 'exempt';
    }
    return {
      studentId: s.id,
      studentNo: s.studentNo,
      name: s.name,
      lastScore: i < 40 ? 45 + (i * 5) % 40 : null,
      currentScore,
      status,
    };
  });
}

/** 生成单科 mock 分数 */
function mockSubjectScore(studentIndex: number, subjectIndex: number): SubjectScoreCell {
  const seed = studentIndex * 11 + subjectIndex * 7;
  if (studentIndex === 32 && subjectIndex === 1) {
    return { score: null, status: 'absent', classRank: null };
  }
  if (studentIndex === 33 && subjectIndex === 2) {
    return { score: null, status: 'exempt', classRank: null };
  }
  if (studentIndex >= 40) {
    return { score: null, status: 'empty', classRank: null };
  }
  const score = 45 + (seed % 55);
  const classRank = 1 + (seed % 45);
  return { score, status: 'normal', classRank };
}

/** 获取考试全科成绩矩阵（同一页查看各科） */
export function getExamScoreMatrix(examId: number): ExamScoreRow[] {
  const exam = mockExams.find((e) => e.id === examId) ?? mockExams[0];
  const subjectIds = exam.subjectIds;

  const rows = mockStudents.map((student, studentIndex) => {
    const subjectScores: Record<number, SubjectScoreCell> = {};
    let totalScore = 0;
    let hasScore = false;

    subjectIds.forEach((subjectId, subjectIndex) => {
      const cell = mockSubjectScore(studentIndex, subjectIndex);
      subjectScores[subjectId] = cell;
      if (cell.status === 'normal' && cell.score !== null) {
        totalScore += cell.score;
        hasScore = true;
      }
    });

    return {
      studentId: student.id,
      studentNo: student.studentNo,
      name: student.name,
      subjectScores,
      totalScore: hasScore ? totalScore : null,
      totalRank: hasScore ? 1 + (studentIndex % 45) : null,
    };
  });

  // 按总分降序重算总排名
  const ranked = [...rows]
    .filter((r) => r.totalScore !== null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));

  ranked.forEach((row, index) => {
    const target = rows.find((r) => r.studentId === row.studentId);
    if (target) target.totalRank = index + 1;
  });

  return rows;
}

/** 获取学生最近一次大考各科成绩 */
export function getStudentLatestExamScores(studentId: number): {
  exam: Exam;
  subjects: Subject[];
  scores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
} | null {
  const exam = mockExams.find((e) => e.status === '已发布') ?? mockExams[0];
  const row = getExamScoreMatrix(exam.id).find((r) => r.studentId === studentId);
  if (!row) return null;
  const subjects = mockSubjects.filter((s) => exam.subjectIds.includes(s.id));
  return {
    exam,
    subjects,
    scores: row.subjectScores,
    totalScore: row.totalScore,
    totalRank: row.totalRank,
  };
}

/** 类别对应域色 class 后缀 */
export function getCategoryDomainClass(category: string): string {
  const map: Record<string, string> = {
    纪律违纪: 'incident',
    情绪行为: 'incident',
    伤病健康: 'incident',
    家校沟通: 'contact',
    表扬奖励: 'praise',
    学习问题: 'score',
    其他: 'default',
  };
  return map[category] ?? 'default';
}

/** 时间线类型对应域色 class 后缀 */
export function getTimelineDomainClass(type: TimelineItem['type']): string {
  const map: Record<TimelineItem['type'], string> = {
    score: 'score',
    incident: 'incident',
    contact: 'contact',
    comment: 'comment',
    praise: 'praise',
  };
  return map[type];
}
