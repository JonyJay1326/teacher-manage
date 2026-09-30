import { describe, expect, it } from 'vitest';
import { ScoresService } from './scores.service';

/**
 * 排名重算的纯逻辑测试。
 * ScoresService 依赖 ScoresRepository，这里用最小 stub 隔离数据库。
 */
function makeService(): ScoresService {
  const repo = {
    listScoresByExamSubject: () => [],
    updateClassRank: () => undefined,
  };
  // 仅用到排名相关方法，故以 unknown 断言满足构造签名
  return new ScoresService(repo as never);
}

describe('assignCompetitionRanks（竞赛式排名）', () => {
  it('按分数降序分配名次', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 90 },
      { id: 2, score: 80 },
      { id: 3, score: 70 },
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
    expect(ranks.get(3)).toBe(3);
  });

  it('同分同名次，下一名跳过空位', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 90 },
      { id: 2, score: 80 },
      { id: 3, score: 80 },
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
    expect(ranks.get(3)).toBe(2);
  });

  it('三人并列第 3 时下一名为第 6（并列者占位 3/4/5）', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 100 },
      { id: 2, score: 90 },
      { id: 3, score: 80 },
      { id: 4, score: 80 },
      { id: 5, score: 80 },
      { id: 6, score: 70 },
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
    expect(ranks.get(3)).toBe(3);
    expect(ranks.get(4)).toBe(3);
    expect(ranks.get(5)).toBe(3);
    expect(ranks.get(6)).toBe(6);
  });

  it('两人并列第 3 时下一名为第 5（并列者占位 3/4）', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 100 },
      { id: 2, score: 90 },
      { id: 3, score: 80 },
      { id: 4, score: 80 },
      { id: 5, score: 70 },
    ]);
    expect(ranks.get(3)).toBe(3);
    expect(ranks.get(4)).toBe(3);
    expect(ranks.get(5)).toBe(5);
  });

  it('全员同分时都是第 1 名', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 60 },
      { id: 2, score: 60 },
      { id: 3, score: 60 },
    ]);
    expect([...ranks.values()]).toEqual([1, 1, 1]);
  });

  it('空输入返回空 Map', () => {
    expect(makeService().assignCompetitionRanks([]).size).toBe(0);
  });

  it('同分时按 id 升序稳定排序（不依赖入参顺序）', () => {
    const a = makeService().assignCompetitionRanks([
      { id: 30, score: 70 },
      { id: 10, score: 70 },
      { id: 20, score: 70 },
    ]);
    const b = makeService().assignCompetitionRanks([
      { id: 10, score: 70 },
      { id: 20, score: 70 },
      { id: 30, score: 70 },
    ]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('不改写入参顺序', () => {
    const input = [
      { id: 1, score: 50 },
      { id: 2, score: 99 },
    ];
    const snapshot = JSON.stringify(input);
    makeService().assignCompetitionRanks(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('负分与零分同样参与排名', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 0 },
      { id: 2, score: -10 },
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });

  it('小数分数按数值比较而非字符串', () => {
    const ranks = makeService().assignCompetitionRanks([
      { id: 1, score: 77.5 },
      { id: 2, score: 77.5 },
      { id: 3, score: 77.6 },
    ]);
    expect(ranks.get(3)).toBe(1);
    expect(ranks.get(1)).toBe(2);
    expect(ranks.get(2)).toBe(2);
  });
});

describe('recalcSubjectRank（单科班排落库）', () => {
  /** 构造带成绩行的 service，并记录 updateClassRank 调用 */
  function makeWithRows(
    rows: Array<{
      student_id: number;
      score: number | null;
      status: string;
      class_rank?: number | null;
    }>,
  ): { service: ScoresService; writes: Array<[number, number]> } {
    const writes: Array<[number, number]> = [];
    const repo = {
      listScoresByExamSubject: () => rows,
      updateClassRank: (
        _examId: number,
        studentId: number,
        _subjectId: number,
        classRank: number | null,
      ) => {
        writes.push([studentId, classRank as number]);
      },
    };
    return {
      service: new ScoresService(repo as never),
      writes,
    };
  }

  it('正常分按竞赛排名写入', () => {
    const { service, writes } = makeWithRows([
      { student_id: 1, score: 90, status: '正常' },
      { student_id: 2, score: 70, status: '正常' },
    ]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('缺考不参与排名且班排写 null', () => {
    const { service, writes } = makeWithRows([
      { student_id: 1, score: 90, status: '正常' },
      { student_id: 2, score: null, status: '缺考' },
      { student_id: 3, score: 70, status: '正常' },
    ]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([
      [1, 1],
      [2, null],
      [3, 2],
    ]);
  });

  it('免考不参与排名且班排写 null', () => {
    const { service, writes } = makeWithRows([
      { student_id: 1, score: null, status: '免考' },
      { student_id: 2, score: 70, status: '正常' },
    ]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([
      [1, null],
      [2, 1],
    ]);
  });

  it('状态正常但分数为 null 时不排名', () => {
    const { service, writes } = makeWithRows([
      { student_id: 1, score: null, status: '正常' },
      { student_id: 2, score: 70, status: '正常' },
    ]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([
      [1, null],
      [2, 1],
    ]);
  });

  it('同分并列，下一名跳过空位', () => {
    const { service, writes } = makeWithRows([
      { student_id: 1, score: 100, status: '正常' },
      { student_id: 2, score: 90, status: '正常' },
      { student_id: 3, score: 90, status: '正常' },
    ]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
  });

  it('空成绩集不产生任何写入', () => {
    const { service, writes } = makeWithRows([]);
    service.recalcSubjectRank(1, 1);
    expect(writes).toEqual([]);
  });
});

describe('recalcTotalRanks（矩阵内总分总排，仅内存）', () => {
  it('只为有总分的学生分配名次', () => {
    const rows = [
      {
        studentId: 1,
        studentNo: 'S1',
        name: '甲',
        subjectScores: {},
        totalScore: 300,
        totalRank: null,
      },
      {
        studentId: 2,
        studentNo: 'S2',
        name: '乙',
        subjectScores: {},
        totalScore: null,
        totalRank: null,
      },
      {
        studentId: 3,
        studentNo: 'S3',
        name: '丙',
        subjectScores: {},
        totalScore: 280,
        totalRank: null,
      },
    ];
    makeService().recalcTotalRanks(rows);
    expect(rows[0]!.totalRank).toBe(1);
    expect(rows[1]!.totalRank).toBeNull();
    expect(rows[2]!.totalRank).toBe(2);
  });

  it('总分相同者同名次', () => {
    const rows = [
      {
        studentId: 1,
        studentNo: 'S1',
        name: '甲',
        subjectScores: {},
        totalScore: 300,
        totalRank: null,
      },
      {
        studentId: 2,
        studentNo: 'S2',
        name: '乙',
        subjectScores: {},
        totalScore: 300,
        totalRank: null,
      },
    ];
    makeService().recalcTotalRanks(rows);
    expect(rows[0]!.totalRank).toBe(1);
    expect(rows[1]!.totalRank).toBe(1);
  });

  it('全部无总分时不写入任何名次', () => {
    const rows = [
      {
        studentId: 1,
        studentNo: 'S1',
        name: '甲',
        subjectScores: {},
        totalScore: null,
        totalRank: null,
      },
    ];
    makeService().recalcTotalRanks(rows);
    expect(rows[0]!.totalRank).toBeNull();
  });
});
