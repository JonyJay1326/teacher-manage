<script setup lang="ts">
	import { computed, onMounted, ref, watch } from 'vue'
	import { useRouter } from 'vue-router'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import { ApiError } from '@/api/http'
	import { createStudentApi, createTagApi, deleteStudentApi, importConfirmApi, importPreviewApi, listStudentsApi, listTagsApi, replaceStudentTagsApi, updateStudentApi } from '@/api/students'
	import type { Student, StudentStatus, Tag } from '@/types'

	/** 导入动作 */
	type ImportAction = 'create' | 'skip' | 'update'

	/** 导入预览行 */
	interface ImportPreviewRow {
		studentNo?: string
		name: string
		gender: number | null
		contact1?: string
		contact2?: string
		action: ImportAction
		matchedId?: number
		message?: string
	}

	/** 新建/编辑表单（标签选择可含新建中的字符串名） */
	interface StudentFormModel {
		studentNo: string
		name: string
		gender: 0 | 1
		cadreRole: string
		focusLevel: 0 | 1 | 2 | 3
		tagIds: Array<number | string>
	}

	const router = useRouter()

	const students = ref<Student[]>([])
	const total = ref(0)
	const tags = ref<Tag[]>([])
	const listLoading = ref(false)

	const searchText = ref('')
	const filterFocusLevel = ref<number | ''>('')
	const filterStatus = ref<StudentStatus | ''>('')
	/** 列表排序：默认学号升序（数值自然序） */
	const sortBy = ref<'studentNo' | 'focusLevel'>('studentNo')
	const sortOrder = ref<'asc' | 'desc'>('asc')

	const createVisible = ref(false)
	const editVisible = ref(false)
	const formSubmitting = ref(false)
	const editingId = ref<number | null>(null)

	const createForm = ref<StudentFormModel>(emptyStudentForm())
	const editForm = ref<StudentFormModel>(emptyStudentForm())

	const importVisible = ref(false)
	const importStep = ref<'paste' | 'preview'>('paste')
	const importText = ref('')
	const importRows = ref<ImportPreviewRow[]>([])
	const importLoading = ref(false)

	let searchTimer: ReturnType<typeof setTimeout> | null = null

	/** 创建空表单 */
	function emptyStudentForm(): StudentFormModel {
		return {
			studentNo: '',
			name: '',
			gender: 1,
			cadreRole: '',
			focusLevel: 0,
			tagIds: []
		}
	}

	/** 花名册可分配的标签（仅 L0 非敏感标签） */
	const selectableTags = computed(() => tags.value.filter((tag) => tag.sensitiveLevel === 0))

	/** 标签按业务域分组，供多选下拉使用 */
	const tagOptionGroups = computed(() => {
		const map = new Map<string, Tag[]>()
		for (const tag of selectableTags.value) {
			const list = map.get(tag.domain) ?? []
			list.push(tag)
			map.set(tag.domain, list)
		}
		return [...map.entries()].map(([domain, domainTags]) => ({
			domain,
			tags: domainTags
		}))
	})

	/**
	 * 解析标签选择：数字为已有标签；字符串为新建名（回车创建后归入「其他」域）。
	 */
	async function resolveTagSelection(values: Array<number | string>): Promise<number[]> {
		const nextIds: number[] = []
		for (const value of values) {
			if (typeof value === 'number') {
				nextIds.push(value)
				continue
			}
			const name = String(value).trim()
			if (!name) continue
			const existing = selectableTags.value.find((tag) => tag.name === name)
			if (existing) {
				nextIds.push(existing.id)
				continue
			}
			const created = await createTagApi({ name, domain: '其他' })
			tags.value.push(created)
			nextIds.push(created.id)
		}
		return [...new Set(nextIds)]
	}

	/** 新建表单标签变更（支持输入新标签） */
	async function onCreateTagChange(values: Array<number | string>): Promise<void> {
		try {
			createForm.value.tagIds = await resolveTagSelection(values)
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '创建标签失败')
		}
	}

	/** 编辑表单标签变更（支持输入新标签） */
	async function onEditTagChange(values: Array<number | string>): Promise<void> {
		try {
			editForm.value.tagIds = await resolveTagSelection(values)
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '创建标签失败')
		}
	}

	/** 关注等级文案 */
	function focusLevelLabel(level: number): string {
		return ['普通', '关注', '重点', '最高'][level] ?? '普通'
	}

	/** 关注等级标签类型 */
	function focusLevelType(level: number): 'info' | 'warning' | 'danger' | undefined {
		if (level >= 3) return 'danger'
		if (level >= 2) return 'warning'
		if (level >= 1) return 'info'
		return undefined
	}

	/** 性别文案 */
	function genderLabel(gender: number | null | undefined): string {
		if (gender === 1) return '男'
		if (gender === 0) return '女'
		return '—'
	}

	/** 导入动作文案 */
	function importActionLabel(action: ImportAction): string {
		if (action === 'create') return '新建'
		if (action === 'update') return '编辑'
		return '跳过'
	}

	/** 导入动作标签类型 */
	function importActionType(action: ImportAction): 'success' | 'info' | 'warning' {
		if (action === 'create') return 'success'
		if (action === 'update') return 'warning'
		return 'info'
	}

	/** 收窄导入动作为合法枚举 */
	function normalizeImportAction(value: string): ImportAction {
		if (value === 'create' || value === 'update' || value === 'skip') {
			return value
		}
		// 兼容旧预览值 match → 编辑
		if (value === 'match') return 'update'
		return 'skip'
	}

	/** 按敏感级别过滤可见标签（列表仅展示 L0） */
	function getVisibleTags(tagIds: number[]): Tag[] {
		const idSet = new Set(tagIds)
		return tags.value.filter((tag) => idSet.has(tag.id) && tag.sensitiveLevel === 0)
	}

	/** 加载标签字典 */
	async function loadTags(): Promise<void> {
		try {
			tags.value = await listTagsApi()
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '加载标签失败')
		}
	}

	/** 加载学生列表 */
	async function loadStudents(): Promise<void> {
		listLoading.value = true
		try {
			const query: {
				q?: string
				status?: string
				focusLevel?: number
				page: number
				pageSize: number
				sortBy: 'studentNo' | 'focusLevel'
				sortOrder: 'asc' | 'desc'
			} = {
				page: 1,
				pageSize: 200,
				sortBy: sortBy.value,
				sortOrder: sortOrder.value
			}
			const q = searchText.value.trim()
			if (q) query.q = q
			if (filterStatus.value) query.status = filterStatus.value
			if (filterFocusLevel.value !== '') {
				query.focusLevel = filterFocusLevel.value
			}
			const result = await listStudentsApi(query)
			students.value = result.items
			total.value = result.total
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '加载花名册失败')
		} finally {
			listLoading.value = false
		}
	}

	/** 表格列头排序变更 */
	function onSortChange(payload: {
		prop: string
		order: 'ascending' | 'descending' | null
	}): void {
		if (
			payload.order &&
			(payload.prop === 'studentNo' || payload.prop === 'focusLevel')
		) {
			sortBy.value = payload.prop
			sortOrder.value = payload.order === 'ascending' ? 'asc' : 'desc'
		} else {
			sortBy.value = 'studentNo'
			sortOrder.value = 'asc'
		}
		void loadStudents()
	}

	/** 跳转学生详情 */
	function goDetail(id: number): void {
		void router.push(`/students/${id}`)
	}

	/** 行点击跳转详情 */
	function handleRowClick(row: Student): void {
		goDetail(row.id)
	}

	/** 打开新建对话框 */
	function openCreateDialog(): void {
		createForm.value = emptyStudentForm()
		createVisible.value = true
	}

	/** 提交新建学生 */
	async function submitCreate(): Promise<void> {
		const form = createForm.value
		if (!form.studentNo.trim() || !form.name.trim()) {
			ElMessage.warning('请填写学号和姓名')
			return
		}
		formSubmitting.value = true
		try {
			const tagIds = await resolveTagSelection(form.tagIds)
			createForm.value.tagIds = tagIds
			const created = await createStudentApi({
				studentNo: form.studentNo.trim(),
				name: form.name.trim(),
				gender: form.gender,
				cadreRole: form.cadreRole.trim() || undefined,
				focusLevel: form.focusLevel
			})
			if (tagIds.length > 0) {
				await replaceStudentTagsApi(created.id, tagIds)
			}
			ElMessage.success('学生已创建')
			createVisible.value = false
			await loadStudents()
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '创建失败')
		} finally {
			formSubmitting.value = false
		}
	}

	/** 表格行打开编辑（收窄 el-table 行类型） */
	function openEditDialogFromTable(row: unknown): void {
		openEditDialog(row as Student)
	}

	/** 有高敏明细的行加背景标注 */
	function studentRowClassName({ row }: { row: Student }): string {
		return row.hasSensitive ? 'student-list__row--sensitive' : ''
	}

	/** 表格行删除（收窄 el-table 行类型） */
	function handleDeleteFromTable(row: unknown): void {
		void handleDelete(row as Student)
	}

	/** 打开编辑对话框 */
	function openEditDialog(row: Student): void {
		editingId.value = row.id
		editForm.value = {
			studentNo: row.studentNo,
			name: row.name,
			gender: row.gender,
			cadreRole: row.cadreRole ?? '',
			focusLevel: row.focusLevel,
			tagIds: getVisibleTags(row.tagIds).map((tag) => tag.id)
		}
		editVisible.value = true
	}

	/** 提交编辑学生 */
	async function submitEdit(): Promise<void> {
		const id = editingId.value
		if (id === null) return
		const form = editForm.value
		if (!form.studentNo.trim() || !form.name.trim()) {
			ElMessage.warning('请填写学号和姓名')
			return
		}
		formSubmitting.value = true
		try {
			const tagIds = await resolveTagSelection(form.tagIds)
			editForm.value.tagIds = tagIds
			await updateStudentApi(id, {
				studentNo: form.studentNo.trim(),
				name: form.name.trim(),
				gender: form.gender,
				cadreRole: form.cadreRole.trim() || null,
				focusLevel: form.focusLevel
			})
			await replaceStudentTagsApi(id, tagIds)
			ElMessage.success('学生已更新')
			editVisible.value = false
			await loadStudents()
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '更新失败')
		} finally {
			formSubmitting.value = false
		}
	}

	/** 删除学生（软删除） */
	async function handleDelete(row: Student): Promise<void> {
		try {
			await ElMessageBox.confirm(`确定删除学生「${row.name}」？删除后可在数据层保留记录，列表将不再显示。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
		} catch {
			return
		}
		try {
			await deleteStudentApi(row.id)
			ElMessage.success('已删除')
			await loadStudents()
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '删除失败')
		}
	}

	/** 打开粘贴导入对话框 */
	function openImportDialog(): void {
		importStep.value = 'paste'
		importText.value = ''
		importRows.value = []
		importVisible.value = true
	}

	/** 预览粘贴导入内容 */
	async function previewImport(): Promise<void> {
		const text = importText.value.trim()
		if (!text) {
			ElMessage.warning('请先粘贴花名册内容')
			return
		}
		importLoading.value = true
		try {
			const result = await importPreviewApi(text)
			importRows.value = result.rows.map((row) => ({
				studentNo: row.studentNo,
				name: row.name,
				gender: row.gender === 0 || row.gender === 1 ? row.gender : null,
				contact1: row.contact1,
				contact2: row.contact2,
				action: normalizeImportAction(row.action),
				matchedId: row.matchedId,
				message: row.message
			}))
			importStep.value = 'preview'
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '预览失败')
		} finally {
			importLoading.value = false
		}
	}

	/** 确认执行粘贴导入 */
	async function confirmImport(): Promise<void> {
		if (importRows.value.length === 0) {
			ElMessage.warning('没有可导入的行')
			return
		}
		importLoading.value = true
		try {
			const result = await importConfirmApi(
				importRows.value.map((row) => ({
					studentNo: row.studentNo,
					name: row.name,
					gender: row.gender,
					contact1: row.contact1 ?? null,
					contact2: row.contact2 ?? null,
					action: row.action,
					matchedId: row.matchedId
				}))
			)
			ElMessage.success(
				`导入完成：新建 ${result.created}，编辑 ${result.updated}，跳过 ${result.skipped}`
			)
			importVisible.value = false
			await loadStudents()
		} catch (err: unknown) {
			ElMessage.error(err instanceof ApiError ? err.message : '导入失败')
		} finally {
			importLoading.value = false
		}
	}

	/** 返回粘贴步骤 */
	function backToPasteStep(): void {
		importStep.value = 'paste'
	}

	/** 可新建行数（预览统计） */
	const importCreateCount = computed(() => importRows.value.filter((r) => r.action === 'create').length)

	onMounted(() => {
		void loadTags()
		void loadStudents()
	})

	watch([filterFocusLevel, filterStatus], () => {
		void loadStudents()
	})

	watch(searchText, () => {
		if (searchTimer) clearTimeout(searchTimer)
		searchTimer = setTimeout(() => {
			void loadStudents()
		}, 300)
	})
</script>

<template>
	<div class="student-list cp-animate-in">
		<div class="cp-page-header">
			<div>
				<h2 class="cp-page-header__title">花名册</h2>
				<p class="cp-page-header__desc">共 {{ total }} 名学生</p>
			</div>
			<el-space :size="12">
				<el-button @click="openImportDialog">粘贴导入</el-button>
				<el-button type="primary" @click="openCreateDialog">新增学生</el-button>
			</el-space>
		</div>

		<!-- 筛选条 -->
		<el-card shadow="never" class="student-list__filter">
			<el-space wrap :size="12">
				<el-input v-model="searchText" placeholder="搜索姓名或学号" clearable style="width: 220px" />
				<el-select v-model="filterFocusLevel" placeholder="关注等级" clearable style="width: 130px">
					<el-option label="普通" :value="0" />
					<el-option label="关注" :value="1" />
					<el-option label="重点" :value="2" />
					<el-option label="最高" :value="3" />
				</el-select>
				<el-select v-model="filterStatus" placeholder="状态" clearable style="width: 110px">
					<el-option label="在读" value="在读" />
					<el-option label="转出" value="转出" />
					<el-option label="休学" value="休学" />
					<el-option label="毕业" value="毕业" />
				</el-select>
			</el-space>
		</el-card>

		<!-- 表格 -->
		<el-card shadow="never" class="student-list__table-card" v-loading="listLoading">
			<el-table
				:data="students"
				:stripe="false"
				:row-class-name="studentRowClassName"
				:default-sort="{ prop: 'studentNo', order: 'ascending' }"
				@row-click="handleRowClick"
				@sort-change="onSortChange"
			>
				<el-table-column prop="studentNo" label="学号" width="110" fixed sortable="custom">
					<template #default="{ row }">
						<span class="cp-tabular-nums">{{ row.studentNo }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="name" label="姓名" width="100" fixed />
				<el-table-column label="性别" width="70" align="center">
					<template #default="{ row }">{{ genderLabel(row.gender) }}</template>
				</el-table-column>
				<el-table-column label="班干部" width="150">
					<template #default="{ row }">
						<el-tag v-if="row.cadreRole" type="primary" effect="plain" size="default">
							{{ row.cadreRole }}
						</el-tag>
						<span v-else class="student-list__empty-cell">—</span>
					</template>
				</el-table-column>
				<el-table-column prop="focusLevel" label="关注等级" width="120" align="center" sortable="custom">
					<template #default="{ row }">
						<el-tag :type="focusLevelType(row.focusLevel)" size="default">
							{{ focusLevelLabel(row.focusLevel) }}
						</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="标签" min-width="200">
					<template #default="{ row }">
						<el-space wrap :size="4">
							<el-tag v-for="tag in getVisibleTags(row.tagIds)" :key="tag.id" type="info" effect="plain" size="default">
								{{ tag.name }}
							</el-tag>
						</el-space>
					</template>
				</el-table-column>
				<el-table-column prop="status" label="状态" width="90" align="center">
					<template #default="{ row }">
						<el-tag :type="row.status === '在读' ? 'success' : 'info'" effect="plain" size="default">
							{{ row.status }}
						</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="200" fixed="right" align="center">
					<template #default="{ row }">
						<div class="cp-table-actions">
							<el-button text type="primary" @click.stop="goDetail(row.id)">详情</el-button>
							<el-button text type="primary" @click.stop="openEditDialogFromTable(row)">编辑</el-button>
							<el-button text type="danger" @click.stop="handleDeleteFromTable(row)">删除</el-button>
						</div>
					</template>
				</el-table-column>
			</el-table>
		</el-card>

		<!-- 新建学生 -->
		<el-dialog v-model="createVisible" title="新增学生" width="520px" append-to-body align-center destroy-on-close>
			<el-form label-width="88px">
				<el-form-item label="学号" required>
					<el-input v-model="createForm.studentNo" placeholder="学号" maxlength="64" />
				</el-form-item>
				<el-form-item label="姓名" required>
					<el-input v-model="createForm.name" placeholder="姓名" maxlength="64" />
				</el-form-item>
				<el-form-item label="性别">
					<el-radio-group v-model="createForm.gender">
						<el-radio :value="1">男</el-radio>
						<el-radio :value="0">女</el-radio>
					</el-radio-group>
				</el-form-item>
				<el-form-item label="班干部">
					<el-input v-model="createForm.cadreRole" placeholder="可选，如班长" maxlength="32" />
				</el-form-item>
				<el-form-item label="关注等级">
					<el-select v-model="createForm.focusLevel" style="width: 100%">
						<el-option label="普通" :value="0" />
						<el-option label="关注" :value="1" />
						<el-option label="重点" :value="2" />
						<el-option label="最高" :value="3" />
					</el-select>
				</el-form-item>
				<el-form-item label="标签">
					<el-select
						v-model="createForm.tagIds"
						multiple
						filterable
						allow-create
						default-first-option
						:reserve-keyword="false"
						collapse-tags
						collapse-tags-tooltip
						placeholder="选择或输入新标签后回车"
						style="width: 100%"
						@change="onCreateTagChange"
					>
						<el-option-group v-for="group in tagOptionGroups" :key="group.domain" :label="group.domain">
							<el-option v-for="tag in group.tags" :key="tag.id" :label="tag.name" :value="tag.id" />
						</el-option-group>
					</el-select>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="createVisible = false">取消</el-button>
				<el-button type="primary" :loading="formSubmitting" @click="submitCreate">创建</el-button>
			</template>
		</el-dialog>

		<!-- 编辑学生 -->
		<el-dialog v-model="editVisible" title="编辑学生" width="520px" append-to-body align-center destroy-on-close>
			<el-form label-width="88px">
				<el-form-item label="学号" required>
					<el-input v-model="editForm.studentNo" placeholder="学号" maxlength="64" />
				</el-form-item>
				<el-form-item label="姓名" required>
					<el-input v-model="editForm.name" placeholder="姓名" maxlength="64" />
				</el-form-item>
				<el-form-item label="性别">
					<el-radio-group v-model="editForm.gender">
						<el-radio :value="1">男</el-radio>
						<el-radio :value="0">女</el-radio>
					</el-radio-group>
				</el-form-item>
				<el-form-item label="班干部">
					<el-input v-model="editForm.cadreRole" placeholder="可选，如班长" maxlength="32" />
				</el-form-item>
				<el-form-item label="关注等级">
					<el-select v-model="editForm.focusLevel" style="width: 100%">
						<el-option label="普通" :value="0" />
						<el-option label="关注" :value="1" />
						<el-option label="重点" :value="2" />
						<el-option label="最高" :value="3" />
					</el-select>
				</el-form-item>
				<el-form-item label="标签">
					<el-select
						v-model="editForm.tagIds"
						multiple
						filterable
						allow-create
						default-first-option
						:reserve-keyword="false"
						collapse-tags
						collapse-tags-tooltip
						placeholder="选择或输入新标签后回车"
						style="width: 100%"
						@change="onEditTagChange"
					>
						<el-option-group v-for="group in tagOptionGroups" :key="group.domain" :label="group.domain">
							<el-option v-for="tag in group.tags" :key="tag.id" :label="tag.name" :value="tag.id" />
						</el-option-group>
					</el-select>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="editVisible = false">取消</el-button>
				<el-button type="primary" :loading="formSubmitting" @click="submitEdit">保存</el-button>
			</template>
		</el-dialog>

		<!-- 粘贴导入 -->
		<el-dialog v-model="importVisible" title="粘贴导入花名册" width="720px" append-to-body align-center destroy-on-close>
			<template v-if="importStep === 'paste'">
				<p class="student-list__import-hint">
					从 Excel 粘贴（Tab / 逗号分隔），每行一名学生。支持：姓名；学号+姓名；学号+姓名+性别+联系方式1+联系方式2。有联系方式时将自动生成监护人1/监护人2。
				</p>
				<el-input
					v-model="importText"
					type="textarea"
					:rows="8"
					placeholder="例如：&#10;20240101&#9;张三&#9;男&#9;13800000001&#9;13900000002&#10;20240102&#9;李四&#9;女&#9;13700000003&#10;或仅：&#10;张三&#10;李四"
				/>
			</template>
			<template v-else>
				<p class="student-list__import-hint">预览共 {{ importRows.length }} 行，其中将新建 {{ importCreateCount }} 人。</p>
				<el-table :data="importRows" max-height="360" size="default">
					<el-table-column label="学号" width="110">
						<template #default="{ row }">
							<span class="cp-tabular-nums">{{ row.studentNo || '—' }}</span>
						</template>
					</el-table-column>
					<el-table-column prop="name" label="姓名" min-width="80" />
					<el-table-column label="性别" width="64" align="center">
						<template #default="{ row }">
							{{ genderLabel(row.gender) }}
						</template>
					</el-table-column>
					<el-table-column label="联系方式1" min-width="120">
						<template #default="{ row }">
							<span class="cp-tabular-nums">{{ row.contact1 || '—' }}</span>
						</template>
					</el-table-column>
					<el-table-column label="联系方式2" min-width="120">
						<template #default="{ row }">
							<span class="cp-tabular-nums">{{ row.contact2 || '—' }}</span>
						</template>
					</el-table-column>
					<el-table-column label="动作" width="88" align="center">
						<template #default="{ row }">
							<el-tag :type="importActionType(row.action)" effect="plain" size="default">
								{{ importActionLabel(row.action) }}
							</el-tag>
						</template>
					</el-table-column>
				</el-table>
			</template>
			<template #footer>
				<template v-if="importStep === 'paste'">
					<el-button @click="importVisible = false">取消</el-button>
					<el-button type="primary" :loading="importLoading" @click="previewImport">预览</el-button>
				</template>
				<template v-else>
					<el-button @click="backToPasteStep">返回修改</el-button>
					<el-button type="primary" :loading="importLoading" @click="confirmImport">确认导入</el-button>
				</template>
			</template>
		</el-dialog>
	</div>
</template>

<style scoped>
	.student-list__filter {
		margin-bottom: var(--cp-gap-4);
		border: 1px solid var(--cp-border);
		border-radius: var(--cp-radius-card);
	}

	.student-list__table-card {
		border: 1px solid var(--cp-border);
		border-radius: var(--cp-radius-card);
	}

	.student-list__empty-cell {
		color: var(--cp-text-3);
	}

	.student-list__import-hint {
		margin: 0 0 var(--cp-gap-3);
		color: var(--cp-text-2);
		font-size: var(--cp-font-sm);
		line-height: 1.5;
	}

	.student-list :deep(.el-table__row) {
		cursor: pointer;
	}

	/* 有 L2 高敏明细的学生行：浅橙底（仅标记存在，不含内容） */
	.student-list :deep(.el-table__row.student-list__row--sensitive > td.el-table__cell) {
		background-color: var(--cp-warning-bg) !important;
	}

	.student-list :deep(.el-table__row.student-list__row--sensitive:hover > td.el-table__cell) {
		background-color: var(--cp-warning-bg) !important;
		filter: brightness(0.98);
	}
</style>
