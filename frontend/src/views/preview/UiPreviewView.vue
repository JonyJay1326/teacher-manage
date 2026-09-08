<script setup lang="ts">
import { ref } from 'vue';
import AppSidebar from '@/components/AppSidebar.vue';
import AppTopbar from '@/components/AppTopbar.vue';
import WeeklyScheduleCard from '@/components/WeeklyScheduleCard.vue';
import VChart from '@/components/VChart.vue';
import { buildBarOption } from '@/constants/chartStyles';

const collapsed = ref(false);
const tab = ref('overview');
const dialogOpen = ref(false);
const drawerOpen = ref(false);
const selectedTags = ref<string[]>([]);
const name = ref('');
const dates = ref<[string, string] | null>(null);
const subjects = ['语文', '数学', '英语', '道德与法治', '历史', '地理', '生物'];
const examples = [
  { no: '001', name: '示例学生甲', subject: '语文', score: '92', status: '已录' },
  { no: '002', name: '用于检查长姓名换行的示例学生', subject: '数学', score: '—', status: '缺考' },
  { no: '003', name: '示例学生丙', subject: '英语', score: '—', status: '免考' },
];
</script>

<template>
  <div class="ui-preview">
    <AppSidebar :collapsed="collapsed" />
    <div class="ui-preview__main">
      <AppTopbar :collapsed="collapsed" page-title="设计规范预览" @toggle-sidebar="collapsed = !collapsed" @open-quick-note="dialogOpen = true" />
      <main class="ui-preview__content">
        <div class="cp-page-header">
          <div>
            <h1 class="cp-page-header__title">界面规范与状态预览</h1>
            <p class="cp-page-header__desc">示例数据 · 用于检查公共组件与桌面布局，不写入业务数据</p>
          </div>
          <el-button @click="drawerOpen = true">查看验收说明</el-button>
        </div>
        <el-tabs v-model="tab">
          <el-tab-pane label="首页与课表" name="overview">
            <div class="ui-preview__overview">
              <WeeklyScheduleCard compact />
              <section class="cp-card cp-content-card">
                <h2 class="cp-section-title">待办跟进</h2>
                <p class="ui-preview__hint">只突出需要行动的信息，类别与状态分别表达。</p>
                <div class="ui-preview__todo">
                  <span class="cp-domain-tag cp-domain-tag--contact">家校沟通</span>
                  <p>示例：确认本周沟通安排</p>
                  <span class="ui-preview__hint">今日 · 待跟进</span>
                </div>
                <el-empty description="其余事项已处理" :image-size="72" />
              </section>
            </div>
          </el-tab-pane>
          <el-tab-pane label="表格与表单" name="forms">
            <div class="cp-card cp-filter-bar">
              <el-input v-model="name" placeholder="输入示例姓名" clearable class="ui-preview__search" />
              <el-select v-model="selectedTags" multiple placeholder="多选科目，检查自动增高" class="ui-preview__select">
                <el-option v-for="subject in subjects" :key="subject" :label="subject" :value="subject" />
              </el-select>
              <el-date-picker v-model="dates" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
              <el-button @click="dialogOpen = true">打开表单弹窗</el-button>
            </div>
            <div class="cp-card cp-content-card">
              <el-table :data="examples">
                <el-table-column prop="no" label="学号" width="100" />
                <el-table-column prop="name" label="姓名" min-width="200" show-overflow-tooltip />
                <el-table-column prop="subject" label="科目" width="140" />
                <el-table-column prop="score" label="成绩" width="120" align="right" />
                <el-table-column prop="status" label="状态" width="140" />
                <el-table-column label="操作" width="100" align="center">
                  <template #default><el-button link @click="drawerOpen = true">查看</el-button></template>
                </el-table-column>
              </el-table>
              <div class="ui-preview__tags">
                <span v-for="(label, domain) in { score: '学业', incident: '事件', contact: '沟通', comment: '评语', praise: '表扬' }" :key="domain" class="cp-domain-tag" :class="'cp-domain-tag--' + domain">{{ label }}</span>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="图表与状态" name="charts">
            <div class="ui-preview__overview">
              <section class="cp-card cp-content-card">
                <h2 class="cp-section-title">各科班均 · 示例分数</h2>
                <VChart :option="buildBarOption()" height="280px" />
              </section>
              <section class="cp-card cp-content-card">
                <h2 class="cp-section-title">首屏加载骨架</h2>
                <el-skeleton :rows="4" animated class="ui-preview__skeleton" />
                <el-alert title="示例错误提示：加载失败后保留操作入口" type="error" :closable="false" show-icon />
              </section>
            </div>
          </el-tab-pane>
        </el-tabs>
      </main>
    </div>
    <el-dialog v-model="dialogOpen" title="表单样式预览" width="480px" append-to-body align-center>
      <el-form label-width="88px">
        <el-form-item label="姓名"><el-input v-model="name" placeholder="请输入示例姓名" /></el-form-item>
        <el-form-item label="科目">
          <el-select v-model="selectedTags" multiple placeholder="请选择科目">
            <el-option v-for="subject in subjects" :key="subject" :label="subject" :value="subject" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="dialogOpen = false">完成预览</el-button>
      </template>
    </el-dialog>
    <el-drawer v-model="drawerOpen" title="验收说明" size="480px" append-to-body>
      <p>本页使用正式导航、顶栏、课表、图表封装和全局设计令牌。</p>
      <p>可检查折叠导航、多选增高、日期选择、隐藏图表 Tab、弹窗与抽屉。表单仅改变本页示例状态。</p>
      <p>业务数据写入、登录认证与 AI 调用需要单独在测试环境回归。</p>
    </el-drawer>
  </div>
</template>

<style scoped>
.ui-preview { height: 100%; display: flex; overflow: hidden; }
.ui-preview__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ui-preview__content { flex: 1; min-height: 0; overflow: auto; padding: var(--cp-gap-5); background: var(--cp-page-atmosphere); }
.ui-preview__overview { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: var(--cp-gap-5); }
.ui-preview__hint { color: var(--cp-text-2); font-size: var(--cp-font-sm); }
.ui-preview__todo { padding: var(--cp-gap-4) 0; border-bottom: 1px solid var(--cp-divider); }
.ui-preview__search { width: 180px; }
.ui-preview__select { width: 260px; }
.ui-preview__tags { display: flex; gap: var(--cp-gap-2); margin-top: var(--cp-gap-4); }
.ui-preview__skeleton { margin: var(--cp-gap-5) 0; }
</style>
