import { describe, expect, it } from 'vitest';
import {
  ScoreImportMappingService,
  type ImportSubjectRef,
  type ScoreSheetMapping,
} from './score-import-mapping.service';

/**
 * 成绩表列映射容错测试。
 * DeepSeekService 置为「未配置」，强制走规则降级分支——
 * 这正是生产上 AI 不可用时的路径，也是 xlsx 表头最脏的地方。
 */

const SUBJECTS: ImportSubjectRef[] = [
  { id: 1, name: '语文', code: 'yu', fullScore: 120 },
  { id: 2, name: '数学', code: 'shu', fullScore: 120 },
  { id: 3, name: '英语', code: 'wai', fullScore: 120 },
  { id: 4, name: '道法', code: 'df', fullScore: 100 },
  { id: 5, name: '历史', code: 'ls', fullScore: 100 },
];

/** AI 未配置时的 service（规则降级） */
function rules(): ScoreImportMappingService {
  return new ScoreImportMappingService(
    { isConfigured: () => false } as never,
    { insertRecord: () => 1 } as never,
  );
}

async function map(sampleRows: string[][]): Promise<ScoreSheetMapping> {
  return rules().resolveMapping({ sampleRows, subjects: SUBJECTS });
}

/** 取映射到某科目的列下标，未映射返回 -1 */
function colOf(m: ScoreSheetMapping, subjectId: number): number {
  return m.subjects.find((s) => s.subjectId === subjectId)?.col ?? -1;
}

describe('规则匹配：标准表头', () => {
  it('识别学号/姓名/各科列', async () => {
    const m = await map([
      ['学号', '姓名', '语文', '数学', '英语'],
      ['202601', '李敏', '110', '95', '100'],
    ]);
    expect(m.studentNoCol).toBe(0);
    expect(m.nameCol).toBe(1);
    expect(colOf(m, 1)).toBe(2);
    expect(colOf(m, 2)).toBe(3);
    expect(colOf(m, 3)).toBe(4);
  });

  it('AI 未配置时 source 为 rules 并带提示', async () => {
    const m = await map([['学号', '姓名', '语文'], ['1', '甲', '90']]);
    expect(m.source).toBe('rules');
    expect(m.message).toContain('AI 未配置');
  });

  it('零分与满分均可识别（表头里的数字不影响匹配）', async () => {
    const m = await map([['学号', '姓名', '语文(120)'], ['1', '甲', '0']]);
    expect(colOf(m, 1)).toBe(2);
  });
});

describe('规则匹配：表头脏数据容错', () => {
  it('容忍表头前后空格', async () => {
    const m = await map([['  学号 ', ' 姓名 ', ' 语文 '], ['1', '甲', '90']]);
    expect(m.studentNoCol).toBe(0);
    expect(m.nameCol).toBe(1);
    expect(colOf(m, 1)).toBe(2);
  });

  it('容忍单元格内换行（\\s+ 归一）', async () => {
    const m = await map([['学\t号', '姓\n名', '语\n文'], ['1', '甲', '90']]);
    expect(m.studentNoCol).toBe(0);
    expect(m.nameCol).toBe(1);
    expect(colOf(m, 1)).toBe(2);
  });

  it('剥离括号注释：语文（120分）→ 语文', async () => {
    const m = await map([['学号', '姓名', '语文（120分）'], ['1', '甲', '90']]);
    expect(colOf(m, 1)).toBe(2);
  });

  it('剥离英文括号注释：Math(120) 形态不影响误匹配', async () => {
    const m = await map([['学号', '姓名', '数学(满分120)'], ['1', '甲', '90']]);
    expect(colOf(m, 2)).toBe(2);
  });

  it('识别「考号」为学号列', async () => {
    const m = await map([['考号', '姓名', '语文'], ['A01', '甲', '90']]);
    expect(m.studentNoCol).toBe(0);
  });

  it('识别「名字」为姓名列', async () => {
    const m = await map([['学号', '名字', '语文'], ['1', '甲', '90']]);
    expect(m.nameCol).toBe(1);
  });

  it('识别「学生」为姓名列', async () => {
    const m = await map([['学号', '学生', '语文'], ['1', '甲', '90']]);
    expect(m.nameCol).toBe(1);
  });

  it('支持单字科目别名（语/数/英）', async () => {
    const m = await map([['学号', '姓名', '语', '数', '英'], ['1', '甲', '90', '80', '70']]);
    expect(colOf(m, 1)).toBe(2);
    expect(colOf(m, 2)).toBe(3);
    expect(colOf(m, 3)).toBe(4);
  });

  it('支持科目英文 code 表头', async () => {
    const m = await map([['学号', '姓名', 'yu', 'shu'], ['1', '甲', '90', '80']]);
    expect(colOf(m, 1)).toBe(2);
    expect(colOf(m, 2)).toBe(3);
  });

  it('道法支持「道德与法治/政治/思品」别名', async () => {
    for (const alias of ['道德与法治', '政治', '思品']) {
      const m = await map([['学号', '姓名', alias], ['1', '甲', '90']]);
      expect(colOf(m, 4)).toBe(2);
    }
  });
});

describe('规则匹配：排除非科目列', () => {
  it('排除总分列', async () => {
    const m = await map([['学号', '姓名', '语文', '总分'], ['1', '甲', '90', '300']]);
    expect(m.subjects.map((s) => s.col)).toEqual([2]);
  });

  it('排除平均分列', async () => {
    const m = await map([['姓名', '语文', '平均分'], ['甲', '90', '92']]);
    expect(m.subjects.map((s) => s.col)).toEqual([1]);
  });

  it('排除排名/名次/班级列', async () => {
    const m = await map([
      ['学号', '姓名', '语文', '排名', '名次', '班级'],
      ['1', '甲', '90', '3', '3', '1班'],
    ]);
    expect(m.subjects.map((s) => s.col)).toEqual([2]);
  });

  it('排除「合计」列', async () => {
    const m = await map([['姓名', '语文', '合计'], ['甲', '90', '300']]);
    expect(m.subjects.map((s) => s.col)).toEqual([1]);
  });

  it('空表头单元格被跳过，不产生空映射', async () => {
    const m = await map([['学号', '', '语文'], ['1', '', '90']]);
    expect(m.subjects.map((s) => s.col)).toEqual([2]);
  });
});

describe('规则匹配：表头行定位', () => {
  it('首行即表头时 headerRowIndex=0', async () => {
    const m = await map([['学号', '姓名', '语文'], ['1', '甲', '90']]);
    expect(m.headerRowIndex).toBe(0);
  });

  it('跳过前导标题行，定位到真正的表头', async () => {
    const m = await map([
      ['XX中学2025学年第一学期期末成绩单'],
      [''],
      ['学号', '姓名', '语文'],
      ['1', '甲', '90'],
    ]);
    expect(m.headerRowIndex).toBe(2);
  });

  it('跳过合并单元格造成的空行', async () => {
    const m = await map([
      ['学号', '姓名', '语文'],
      ['', '', ''],
      ['1', '甲', '90'],
    ]);
    expect(m.headerRowIndex).toBe(0);
  });

  it('多行标题中取命中关键词最多的一行', async () => {
    const m = await map([
      ['成绩表'],
      ['学号', '姓名', '语文', '数学'],
      ['1', '甲', '90', '80'],
    ]);
    expect(m.headerRowIndex).toBe(1);
  });
});

describe('规则匹配：边界与退化', () => {
  it('无任何可识别表头时 headerRowIndex=0 且科目为空', async () => {
    const m = await map([['foo', 'bar'], ['1', '2']]);
    expect(m.headerRowIndex).toBe(0);
    expect(m.subjects).toEqual([]);
  });

  it('空样本行不抛异常', async () => {
    const m = await map([]);
    expect(m.subjects).toEqual([]);
    expect(m.studentNoCol).toBeNull();
    expect(m.nameCol).toBeNull();
  });

  it('只有姓名列没有学号列时 studentNoCol 为 null', async () => {
    const m = await map([['姓名', '语文'], ['甲', '90']]);
    expect(m.studentNoCol).toBeNull();
    expect(m.nameCol).toBe(0);
  });

  it('表头行超出扫描上限时回落到 0', async () => {
    const rows: string[][] = [];
    for (let i = 0; i < 20; i += 1) rows.push([`填充${i}`]);
    rows.push(['学号', '姓名', '语文']);
    const m = await map(rows);
    expect(m.headerRowIndex).toBe(0);
  });

  it('同一科目重复出现时只保留首次映射', async () => {
    const m = await map([['学号', '姓名', '语文', '语文'], ['1', '甲', '90', '80']]);
    expect(m.subjects.filter((s) => s.subjectId === 1)).toHaveLength(1);
  });

  it('科目清单为空时不产生任何映射', async () => {
    const m = await rules().resolveMapping({
      sampleRows: [['学号', '姓名', '语文']],
      subjects: [],
    });
    expect(m.subjects).toEqual([]);
  });
});
