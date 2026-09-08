import { createDemoSeed, type DemoDb } from './seed';

let db: DemoDb | null = null;

/** 获取演示内存库（首次懒加载种子；全程不写生产库） */
export function getDemoDb(): DemoDb {
  if (!db) {
    db = createDemoSeed();
  }
  return db;
}

/** 重置演示数据到初始种子 */
export function resetDemoDb(): void {
  db = createDemoSeed();
}

/** 分配自增 ID */
export function allocDemoId(
  kind: keyof DemoDb['nextIds'],
): number {
  const store = getDemoDb();
  const id = store.nextIds[kind];
  store.nextIds[kind] = id + 1;
  return id;
}
