import { ApiError } from '@/api/http';
import { allocDemoId, getDemoDb } from './db';
import { buildDemoCommentContext } from './commentContext';
import { buildDemoDataQaContext } from './dataQaContext';
import { runDemoDeepSeek } from './deepseek';
import { buildExamMatrix } from './seed';

type Body = Record<string, unknown>;

/** 与正式 DataQaService 一致的默认 system */
const DATA_QA_DEFAULT_SYSTEM = [
  '你是班主任学情助手。硬性约束：',
  '1. 仅依据给定「系统数据」回答；每个关键数字或结论后用括号标注出处，格式如（数据：考试名 · 指标）。',
  '2. 数据未覆盖时明确回答「系统数据中未找到相关记录」，禁止编造分数、名次、人次。',
  '3. 不得输出或猜测 L2 高敏内容（疾病诊断、家暴、家庭变故细节等）；若被问及，引导至学生详情「高敏」Tab（需 PIN），不展开具体内容。',
  '4. 涉及学生具体处置时附加：建议结合本校规定与学生实际情况判断。',
  '5. 可用 Markdown 粗体（**文字**）与 - 列表增强可读性；不要使用一级大标题或代码块。',
  '6. 可对成绩台账自行做连续进步、进退、低分等统计，但必须与台账数字一致。',
  '7. 直接输出回答正文。',
].join('\n');

/** 与正式 KbQaService 一致的 system */
const KB_QA_SYSTEM = `你是班主任知识库助手。硬性约束：
1. 仅依据给定资料回答；每个论点后用括号标注来源文档名，如（来源：《xxx》）。
2. 资料未覆盖时明确回答「知识库中未找到相关内容」，禁止编造。
3. 涉及学生具体处置时，附加提醒：建议结合本校规定与学生实际情况判断。
4. 直接输出回答正文，不要输出无关开场白。`;

/** 演示 AI 生成入口：Mock 数据 + 与正式一致的传参/拼装，经 DeepSeek 代理 */
export async function tryHandleDemoAi(
  method: string,
  pathname: string,
  body: unknown,
): Promise<unknown | undefined> {
  if (method !== 'POST') return undefined;
  const b = (body ?? {}) as Body;
  if (pathname === '/v1/comments/generate') return generateComment(b);
  if (pathname === '/v1/ai/data-ask') return dataAsk(b);
  if (pathname === '/v1/ai/talk-script') return talkScript(b);
  if (pathname === '/v1/ai/work-summary') return workSummary(b);
  if (pathname === '/v1/knowledge/ask') return knowledgeAsk(b);
  return undefined;
}

/** 填充 {{占位符}}（对齐正式 fillTemplate） */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key: string) => vars[key] ?? '',
  );
}

/** 从事件摘要抽表扬段（对齐 CommentGenerateService.extractPraise） */
function extractPraise(incidents: string): string {
  const lines = incidents.split('\n');
  const praiseLines = lines.filter(
    (l) => l.includes('表扬') || l.startsWith('- '),
  );
  if (incidents.includes('表扬类')) {
    const idx = lines.findIndex((l) => l.includes('表扬类'));
    return lines.slice(idx, idx + 12).join('\n');
  }
  return praiseLines.slice(0, 8).join('\n') || '无';
}

/** 评语生成（对齐 CommentGenerateService.generate） */
async function generateComment(b: Body): Promise<unknown> {
  const db = getDemoDb();
  const studentId = Number(b.studentId);
  const stu = db.students.find((s) => s.id === studentId);
  if (!stu) throw new ApiError(3001, '学生不存在');

  const termId =
    b.termId === undefined || b.termId === null ? null : Number(b.termId);
  const commentType = String(b.commentType ?? '评语');
  const prompt =
    (b.promptId != null
      ? db.prompts.find((p) => p.id === Number(b.promptId))
      : undefined) ??
    db.prompts.find((p) => p.scene === 'comment' && p.isDefault) ??
    db.prompts.find((p) => p.scene === 'comment');

  let tone = (b.tone as string) ?? '朴实';
  let length = (b.length as string) ?? '中';
  let includeAdvice = b.includeAdvice !== false;
  if (prompt?.styleParams) {
    if (b.tone === undefined && prompt.styleParams.tone) {
      tone = prompt.styleParams.tone;
    }
    if (b.length === undefined && prompt.styleParams.length) {
      length = prompt.styleParams.length;
    }
    if (
      b.includeAdvice === undefined &&
      prompt.styleParams.includeAdvice !== undefined
    ) {
      includeAdvice = prompt.styleParams.includeAdvice;
    }
  }

  const context = buildDemoCommentContext(studentId, termId);
  const lengthLabel =
    length === '短' ? '80-120字' : length === '长' ? '220-320字' : '150-220字';
  const nameMatch = /姓名：(.+)/.exec(context.sections.profile);
  const studentName = nameMatch?.[1]?.trim() || '该生';
  const termMatch = /学期：(.+)/.exec(context.sections.profile);
  const termName = termMatch?.[1]?.trim() || '';

  const vars: Record<string, string> = {
    student_name: studentName,
    term: termName,
    style_tone: tone,
    style_length: lengthLabel,
    style_advice: includeAdvice ? '是' : '否',
    score_trend: context.sections.scores,
    incident_summary: context.sections.incidents,
    praise_summary: extractPraise(context.sections.incidents),
    last_comment: context.sections.lastComment,
    impression: context.sections.impression,
  };

  const systemPrompt = prompt
    ? fillTemplate(prompt.template, vars)
    : `你是一位初中班主任，请根据给定材料撰写学生${commentType}。
要求：
1. 语气：${tone}；篇幅：${lengthLabel}
2. ${includeAdvice ? '结尾可含 1-2 条具体改进建议' : '不要写改进建议'}
3. 只依据材料，禁止编造未出现的事实；不要提及任何敏感隐私细节
4. 直接输出评语正文，不要标题、不要 markdown`;

  const userPrompt = `${context.text}\n\n请撰写${commentType}：`;
  const promptId = prompt?.id ?? null;
  const fallback = `${studentName}本学期总体表现稳定，学习态度端正，能遵守班级纪律。请结合成绩与具体事例补充后作为${commentType}使用。`;

  const ai = await runDemoDeepSeek({
    systemPrompt,
    userPrompt,
    scene: 'comment',
  });

  const draft = ai?.available && ai.content ? ai.content : fallback;
  const available = Boolean(ai?.available);
  const message = available
    ? undefined
    : (ai?.message ?? 'AI 未配置，已生成占位草稿，请手工改写后采纳');

  const recId = allocDemoId('aiRecord');
  db.aiRecords.unshift({
    id: recId,
    scene: 'comment',
    promptId,
    studentId,
    studentName: stu.name,
    contextSnapshot: context.text,
    outputText: draft,
    model: ai?.model ?? 'fallback',
    tokensIn: ai?.tokensIn ?? 0,
    tokensOut: ai?.tokensOut ?? 0,
    status: available ? 'generated' : 'generated',
    createdAt: new Date().toISOString(),
  });

  return {
    available,
    message,
    aiRecordId: recId,
    draftText: draft,
    contextText: context.text,
    contextSections: context.sections,
    approxTokens: context.approxTokens,
    promptId,
  };
}

/** 学情问答（对齐 DataQaService.ask） */
async function dataAsk(b: Body): Promise<unknown> {
  const db = getDemoDb();
  const question = String(b.question ?? '').trim();
  if (!question) throw new ApiError(1001, '请输入问题');

  const bundle = buildDemoDataQaContext(
    question,
    b.studentId != null ? Number(b.studentId) : null,
  );

  const promptRow =
    db.prompts.find((p) => p.scene === 'data_qa' && p.isDefault) ??
    db.prompts.find((p) => p.scene === 'data_qa');
  // 与 DataQaService 一致：默认 system；模板替换 scope/context；最终保证含【系统数据】
  let systemPrompt = DATA_QA_DEFAULT_SYSTEM;
  if (promptRow?.template) {
    systemPrompt = promptRow.template
      .replace(/\{\{scope\}\}/g, bundle.scopeLabel)
      .replace(/\{\{context\}\}/g, bundle.text);
    if (!systemPrompt.includes(bundle.text)) {
      systemPrompt = `${systemPrompt}\n\n【系统数据】\n${bundle.text}`;
    }
  }

  const finalSystem = systemPrompt.includes('【系统数据】')
    ? systemPrompt
    : `${systemPrompt}\n\n【系统数据】\n${bundle.text}`;

  // 正式：DeepSeek user 仅「问题：…」；落库快照用完整范围+数据
  const deepSeekUser = `问题：${question}`;
  const contextSnapshot = `范围：${bundle.scopeLabel}\n问题：${question}\n\n【系统数据】\n${bundle.text}`;

  const streakCite = bundle.citations.find((c) => c.kind === 'subject_streak');
  const fallback = streakCite
    ? `根据系统数据预计算：${streakCite.label} → ${streakCite.detail}`
    : bundle.citations.length
      ? `系统数据摘要（可核对引用）：\n${bundle.citations.map((c) => `- ${c.label}：${c.detail}`).join('\n')}`
      : '系统数据中未找到相关记录';

  const ai = await runDemoDeepSeek({
    systemPrompt: finalSystem,
    userPrompt: deepSeekUser,
    scene: 'data_qa',
  });

  const available = Boolean(ai?.available && ai.content);
  const answer = available ? ai!.content : fallback;
  const recId = allocDemoId('aiRecord');
  db.aiRecords.unshift({
    id: recId,
    scene: 'data_qa',
    promptId: promptRow?.id ?? null,
    studentId: bundle.studentId,
    studentName:
      bundle.studentId != null
        ? (db.students.find((s) => s.id === bundle.studentId)?.name ?? null)
        : null,
    contextSnapshot,
    outputText: answer,
    model: ai?.model ?? 'fallback',
    tokensIn: ai?.tokensIn ?? 0,
    tokensOut: ai?.tokensOut ?? 0,
    status: available ? 'generated' : 'generated',
    createdAt: new Date().toISOString(),
  });

  return {
    available,
    message: available
      ? undefined
      : (ai?.message ?? 'AI 暂不可用，已返回数据摘要（可核对引用）'),
    answer,
    citations: bundle.citations,
    aiRecordId: recId,
    contextText: bundle.text,
    scopeLabel: bundle.scopeLabel,
    studentId: bundle.studentId,
  };
}

/** 沟通话术（对齐 TalkScriptService.generate） */
async function talkScript(b: Body): Promise<unknown> {
  const db = getDemoDb();
  const scene = String(b.scene ?? '').trim();
  if (!scene) throw new ApiError(1001, '请填写场景描述');

  const studentId =
    b.studentId != null && b.studentId !== ''
      ? Number(b.studentId)
      : null;
  const includeContext = b.includeContext !== false;
  const prompt =
    (b.promptId != null
      ? db.prompts.find((p) => p.id === Number(b.promptId))
      : undefined) ??
    db.prompts.find((p) => p.scene === 'talk_script' && p.isDefault) ??
    db.prompts.find((p) => p.scene === 'talk_script');

  let contextText = '（未关联学生资料）';
  if (includeContext && studentId) {
    const bundle = buildDemoCommentContext(studentId, null);
    contextText = [
      bundle.sections.profile,
      '',
      '【近期事件】',
      bundle.sections.incidents,
      '',
      '【班主任印象】',
      bundle.sections.impression,
    ].join('\n');
  } else if (studentId) {
    const name = db.students.find((s) => s.id === studentId)?.name;
    contextText = name
      ? `关联学生：${name}（未注入详细档案）`
      : '（学生不存在）';
  }

  const studentName = studentId
    ? (db.students.find((s) => s.id === studentId)?.name ?? '')
    : '';
  const vars: Record<string, string> = {
    scene,
    context: contextText,
    student_name: studentName,
  };
  const systemPrompt = prompt
    ? fillTemplate(prompt.template, vars)
    : `你是班主任沟通顾问。场景：${scene}\n资料：${contextText}\n请输出沟通策略草稿。`;
  const userPrompt = `请针对以下场景撰写沟通话术：\n${scene}`;
  const promptId = prompt?.id ?? null;
  const fallback = `【开场】您好，我是班主任。\n【说明】关于「${scene}」，想和您同步一下近期情况。\n【协商】建议我们约定一个可检查的小目标。\n【收尾】方便的话本周末我再向您反馈。（占位草稿）`;

  const ai = await runDemoDeepSeek({
    systemPrompt,
    userPrompt,
    scene: 'talk_script',
  });
  const available = Boolean(ai?.available && ai.content);
  const draftText = available ? ai!.content : fallback;
  const recId = allocDemoId('aiRecord');
  db.aiRecords.unshift({
    id: recId,
    scene: 'talk_script',
    promptId,
    studentId,
    studentName: studentName || null,
    contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
    outputText: draftText,
    model: ai?.model ?? 'fallback',
    tokensIn: ai?.tokensIn ?? 0,
    tokensOut: ai?.tokensOut ?? 0,
    status: available ? 'generated' : 'generated',
    createdAt: new Date().toISOString(),
  });

  return {
    available,
    message: available
      ? undefined
      : (ai?.message ?? 'AI 未配置，已生成占位草稿，请手工改写'),
    aiRecordId: recId,
    draftText,
    contextText,
    promptId,
  };
}

/** 工作总结（对齐 WorkSummaryService.generate） */
async function workSummary(b: Body): Promise<unknown> {
  const db = getDemoDb();
  const term =
    (b.termId != null ? db.terms.find((t) => t.id === Number(b.termId)) : null) ??
    db.terms[db.terms.length - 1] ??
    null;
  const contextText = buildWorkSummaryContext(term?.id ?? null);
  const prompt =
    (b.promptId != null
      ? db.prompts.find((p) => p.id === Number(b.promptId))
      : undefined) ??
    db.prompts.find((p) => p.scene === 'work_summary' && p.isDefault) ??
    db.prompts.find((p) => p.scene === 'work_summary');

  const vars: Record<string, string> = {
    term: term?.name ?? '本学期',
    context: contextText,
  };
  const systemPrompt = prompt
    ? fillTemplate(prompt.template, vars)
    : `请根据数据写学期工作总结。学期：${vars.term}\n${contextText}`;
  const userPrompt = `请撰写「${vars.term}」班主任工作总结初稿。`;
  const promptId = prompt?.id ?? null;
  const fallback = `## ${vars.term} 工作总结（占位）\n\n以下为系统数据摘要，请手工扩写：\n\n${contextText}\n\n（AI 未可用）`;

  const ai = await runDemoDeepSeek({
    systemPrompt,
    userPrompt,
    scene: 'work_summary',
  });
  const available = Boolean(ai?.available && ai.content);
  const draftText = available ? ai!.content : fallback;
  const recId = allocDemoId('aiRecord');
  db.aiRecords.unshift({
    id: recId,
    scene: 'work_summary',
    promptId,
    studentId: null,
    studentName: null,
    contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
    outputText: draftText,
    model: ai?.model ?? 'fallback',
    tokensIn: ai?.tokensIn ?? 0,
    tokensOut: ai?.tokensOut ?? 0,
    status: available ? 'generated' : 'generated',
    createdAt: new Date().toISOString(),
  });

  return {
    available,
    message: available
      ? undefined
      : (ai?.message ?? 'AI 未配置，已返回数据摘要占位稿'),
    aiRecordId: recId,
    draftText,
    contextText,
    termName: vars.term,
    promptId,
  };
}

/** 工作总结班级上下文（对齐 WorkSummaryService.buildClassContext 结构） */
function buildWorkSummaryContext(termId: number | null): string {
  const db = getDemoDb();
  const term =
    (termId != null ? db.terms.find((t) => t.id === termId) : null) ??
    db.terms[db.terms.length - 1];
  const active = db.students.filter((s) => s.status === '在读');
  const focusDist = [0, 1, 2, 3]
    .map((lv) => `L${lv}=${active.filter((s) => s.focusLevel === lv).length}`)
    .join('，');

  const lines: string[] = [];
  lines.push(`学期：${term?.name ?? '未指定'}`);
  lines.push(`在读人数：${active.length}`);
  lines.push(`关注等级分布：${focusDist}`);
  lines.push('【考试班均总分趋势】');
  for (const exam of [...db.exams].sort((a, b) => a.id - b.id).slice(-8)) {
    const matrix = buildExamMatrix(db, exam.id);
    const totals = matrix.rows
      .map((r) => r.totalScore)
      .filter((x): x is number => x != null);
    const classAvg =
      totals.length > 0
        ? Math.round(
            (totals.reduce((a, b) => a + b, 0) / totals.length) * 10,
          ) / 10
        : null;
    lines.push(
      `- ${exam.name}（${exam.examDate.slice(0, 10)}）：班均 ${classAvg ?? '—'}，样本 ${totals.length}`,
    );
  }

  const catMap = new Map<string, number>();
  for (const i of db.incidents.filter((x) => x.status === 'confirmed')) {
    catMap.set(i.category, (catMap.get(i.category) ?? 0) + 1);
  }
  lines.push('【本学期事件类别】');
  if (catMap.size === 0) lines.push('- 暂无');
  else {
    for (const [category, count] of catMap) {
      lines.push(`- ${category}：${count}`);
    }
  }
  lines.push(
    `家校沟通次数（本学期口径）：${catMap.get('家校沟通') ?? 0}`,
  );
  lines.push(`表扬奖励条数：${catMap.get('表扬奖励') ?? 0}`);

  // 最近两场进退步（简化）
  const exams = [...db.exams].sort((a, b) => a.id - b.id);
  if (exams.length >= 2) {
    const prev = exams[exams.length - 2]!;
    const curr = exams[exams.length - 1]!;
    const prevM = buildExamMatrix(db, prev.id);
    const currM = buildExamMatrix(db, curr.id);
    const improve: string[] = [];
    const decline: string[] = [];
    for (const row of currM.rows) {
      const p = prevM.rows.find((r) => r.studentId === row.studentId);
      if (!p?.totalRank || !row.totalRank) continue;
      const delta = p.totalRank - row.totalRank;
      if (delta >= db.thresholds.rankJumpThreshold) {
        improve.push(`${row.name}(+${delta})`);
      }
      if (delta <= -db.thresholds.rankJumpThreshold) {
        decline.push(`${row.name}(${delta})`);
      }
    }
    lines.push('【进退步（最近两场）】');
    lines.push(`进步：${improve.slice(0, 8).join('、') || '无'}`);
    lines.push(`退步：${decline.slice(0, 8).join('、') || '无'}`);
  }

  return lines.join('\n');
}

/** 知识库问答（对齐 KbQaService.ask 传参形态） */
async function knowledgeAsk(b: Body): Promise<unknown> {
  const db = getDemoDb();
  const q = String(b.question ?? '').trim();
  if (!q) throw new ApiError(1001, '请输入问题');

  // 简易检索：标题/预览命中优先（对齐 TOP_K=8 / 无命中直接返回）
  const hits = db.kbDocuments
    .map((d) => {
      const hay = `${d.title}\n${d.preview}`;
      let score = 0;
      if (d.title.includes(q)) score += 5;
      if (d.preview.includes(q)) score += 2;
      // 关键词：按空白或常见标点切分
      for (const token of q.split(/[\s，。？！、；：]+/).filter((t) => t.length >= 2)) {
        if (hay.includes(token)) score += 1;
      }
      return { doc: d, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (hits.length === 0) {
    const recId = allocDemoId('aiRecord');
    db.aiRecords.unshift({
      id: recId,
      scene: 'kb_qa',
      promptId: null,
      studentId: null,
      studentName: null,
      contextSnapshot: `Q: ${q}\n\n(无命中段落)`,
      outputText: '知识库中未找到相关内容',
      model: 'none',
      tokensIn: 0,
      tokensOut: 0,
      status: 'generated',
      createdAt: new Date().toISOString(),
    });
    return {
      available: true,
      answer: '知识库中未找到相关内容',
      sources: [],
      aiRecordId: recId,
      contextText: '',
    };
  }

  const used = hits;

  const chunks: string[] = [];
  let chars = 0;
  const sources: Array<{
    segmentId: number;
    documentId: number;
    documentTitle: string;
    seq: number;
    text: string;
  }> = [];
  for (const [idx, hit] of used.entries()) {
    const piece = `《${hit.doc.title}》\n${hit.doc.preview}`;
    if (chars + piece.length > 3000) break;
    chunks.push(piece);
    chars += piece.length;
    sources.push({
      segmentId: idx + 1,
      documentId: hit.doc.id,
      documentTitle: hit.doc.title,
      seq: 1,
      text: hit.doc.preview,
    });
  }
  const contextText = chunks.join('\n\n---\n\n');
  const userPrompt = `问题：${q}\n\n参考资料：\n${contextText}`;
  const fallback = sources.length
    ? `以下为检索到的原文摘要：\n${sources.map((s) => `- （来源：《${s.documentTitle}》）${s.text}`).join('\n')}`
    : '知识库中未找到相关内容';

  const ai = await runDemoDeepSeek({
    systemPrompt: KB_QA_SYSTEM,
    userPrompt,
    scene: 'kb_qa',
  });
  const available = Boolean(ai?.available && ai.content);
  const answer = available ? ai!.content : fallback;
  const recId = allocDemoId('aiRecord');
  db.aiRecords.unshift({
    id: recId,
    scene: 'kb_qa',
    promptId: null,
    studentId: null,
    studentName: null,
    contextSnapshot: userPrompt,
    outputText: answer,
    model: ai?.model ?? 'fallback',
    tokensIn: ai?.tokensIn ?? 0,
    tokensOut: ai?.tokensOut ?? 0,
    status: available ? 'generated' : 'generated',
    createdAt: new Date().toISOString(),
  });

  return {
    available,
    message: available
      ? undefined
      : (ai?.message ?? 'AI 暂不可用，已返回检索到的原文摘要（可逐段核对）'),
    answer,
    sources,
    aiRecordId: recId,
    contextText,
  };
}
