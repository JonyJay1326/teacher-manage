/**
 * 业务域色映射工具
 * 与 styles/tokens.css 的五域色（--cp-domain-*）一一对应，
 * 页面标签统一走这里取色，避免各处硬编码或退回灰色 el-tag。
 */

/** 标签域 → 域色后缀 */
const TAG_DOMAIN_MAP: Record<string, string> = {
  学业: 'score', // 蓝
  行为情绪: 'incident', // 玫红
  家庭: 'comment', // 紫
  健康: 'contact', // 绿
  特长: 'praise', // 金
  其他: 'default',
};

/** 取标签域色类（返回 cp-domain-tag--* 后缀部分） */
export function tagDomainClass(domain: string): string {
  return TAG_DOMAIN_MAP[domain] ?? 'default';
}

/** 头像渐变档位数量（对应 .cp-avatar--1 ~ .cp-avatar--5） */
const AVATAR_VARIANTS = 5;

/**
 * 由姓名推导稳定头像档位（同一姓名始终同色）
 * 用 charCodeAt 累加，避免依赖 hash 库
 */
export function avatarVariant(name: string): number {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) {
    sum += name.charCodeAt(i) * (i + 1);
  }
  return (sum % AVATAR_VARIANTS) + 1;
}

/** 取头像渐变类 */
export function avatarClass(name: string): string {
  return `cp-avatar--${avatarVariant(name)}`;
}
