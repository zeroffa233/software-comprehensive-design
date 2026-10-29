<template>
  <div>
    <el-form inline class="search-bar" @submit.prevent>
      <el-form-item label="动作">
        <el-select v-model="query.action" placeholder="全部动作" clearable style="width: 140px" @change="search">
          <el-option v-for="a in actions" :key="a.value" :label="a.label" :value="a.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标类型">
        <el-select v-model="query.targetType" placeholder="全部类型" clearable style="width: 120px" @change="search">
          <el-option label="用户 user" value="user" />
          <el-option label="商品 goods" value="goods" />
        </el-select>
      </el-form-item>
      <el-form-item label="操作人ID">
        <el-input v-model.trim="query.adminId" placeholder="操作人ID" clearable style="width: 120px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="createTime" label="时间" width="170" />
      <el-table-column prop="adminName" label="操作人" width="130" />
      <el-table-column label="动作" width="120">
        <template #default="{ row }">{{ actionText(row.action) }}</template>
      </el-table-column>
      <el-table-column prop="targetType" label="目标类型" width="100" />
      <el-table-column prop="targetId" label="目标ID" width="100" />
      <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
    </el-table>

    <el-pagination
      class="pager"
      background
      layout="total, prev, pager, next, sizes"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      @current-change="(p) => { page = p; load() }"
      @size-change="(s) => { pageSize = s; page = 1; load() }"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { listOpLogs } from '../api'

// 后端动作存英文码，界面显示中文
const actions = [
  { label: '封禁用户', value: 'BAN_USER' },
  { label: '解封用户', value: 'UNBAN_USER' },
  { label: '下架商品', value: 'OFF_SHELF_GOODS' },
  { label: '审核通过', value: 'AUDIT_PASS' },
  { label: '审核驳回', value: 'AUDIT_REJECT' }
]
function actionText(code) {
  const hit = actions.find((a) => a.value === code)
  return hit ? hit.label : code
}
const query = reactive({ action: '', targetType: '', adminId: '' })
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (query.action) params.action = query.action
    if (query.targetType) params.targetType = query.targetType
    if (query.adminId) params.adminId = query.adminId
    const data = await listOpLogs(params)
    list.value = data && data.list ? data.list : []
    total.value = data && data.total ? Number(data.total) : 0
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function reset() {
  query.action = ''
  query.targetType = ''
  query.adminId = ''
  search()
}
</script>

<style scoped>
.search-bar { margin-bottom: 12px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
