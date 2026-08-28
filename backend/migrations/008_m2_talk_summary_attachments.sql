-- 附件软删除；沟通话术 / 工作总结内置模板
ALTER TABLE attachments ADD COLUMN deleted_at TEXT;

INSERT OR IGNORE INTO ai_prompts (id, scene, name, template, style_params, is_builtin, is_default, deleted_at)
VALUES (
  10,
  'talk_script',
  '家校沟通话术（默认）',
  '你是初中班主任沟通顾问。请根据场景描述与可选学生资料，撰写可直接使用的沟通策略草稿。
硬性约束：
1. 只依据给定材料，禁止编造未出现的事实或高敏隐私。
2. 语气务实、尊重家长与学生；给出开场、共情、事实核对、协商方案、收尾建议。
3. 直接输出正文，可用简短小标题，不要 markdown 代码块。

【场景描述】
{{scene}}

【学生相关资料】
{{context}}',
  NULL,
  1,
  1,
  NULL
);

INSERT OR IGNORE INTO ai_prompts (id, scene, name, template, style_params, is_builtin, is_default, deleted_at)
VALUES (
  11,
  'work_summary',
  '学期工作总结（默认）',
  '你是初中班主任，请根据下方班级数据写一份学期工作总结初稿。
硬性约束：
1. 仅依据系统数据；数据未覆盖处写「数据未覆盖」，禁止编造分数与人次。
2. 结构建议：班级概况 → 学业进展 → 日常管理与事件 → 家校沟通 → 下学期改进方向。
3. 可用 Markdown 粗体与列表；不要一级大标题或代码块。
4. 直接输出正文。

【学期】{{term}}
【班级数据】
{{context}}',
  NULL,
  1,
  1,
  NULL
);
