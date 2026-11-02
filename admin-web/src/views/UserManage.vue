<template>
  <div>
    <el-form inline class="search-bar" @submit.prevent>
      <el-form-item label="手机号">
        <el-input v-model.trim="query.phone" placeholder="按手机号搜索" clearable style="width: 180px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="昵称">
        <el-input v-model.trim="query.nickname" placeholder="按昵称搜索" clearable style="width: 160px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="正常" value="ACTIVE" />
          <el-option label="封禁" value="BANNED" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">搜索</el-button>
        <el-button @click="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="userId" label="用户ID" width="90" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="nickname" label="昵称" min-width="140" />
      <el-table-column label="角色" width="110">
        <template #default="{ row }">{{ roleText(row.role) }}</template>
      </el-table-column>
      <el-table-column prop="createTime" label="注册时间" width="170" />
      <el-table-column label="最近登录" width="170">
        <template #default="{ row }">{{ row.lastLoginTime || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="isBanned(row) ? 'danger' : 'success'">{{ statusText(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!isBanned(row)" type="danger" size="small" @click="openBan(row)">封禁</el-button>
          <el-button v-else type="success" size="small" @click="onUnban(row)">解封</el-button>
        </template>
      </el-table-column>
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

    <reason-dialog
      v-model="banVisible"
      :title="`封禁用户：${banRow && (banRow.nickname || banRow.phone) || ''}（JWT 立即失效，在售商品自动下架）`"
      label="封禁原因（1-100 字，写入操作日志）"
      placeholder="例：发布违规代抢信息，经核实封禁"
      confirm-text="确认封禁"
      :min-length="1"
      :max-length="100"
      @confirm="onBanConfirm"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listUsers, banUser, unbanUser } from '../api'
import ReasonDialog from '../components/ReasonDialog.vue'

const query = reactive({ phone: '', nickname: '', status: '' })
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)

const banVisible = ref(false)
const banRow = ref(null)

onMounted(load)

function roleText(role) {
  return { ADMIN: '管理员', USER: '普通用户', AGENT_SVC: '服务账号' }[role] || role
}

// 后端状态可能是 ACTIVE/BANNED 或中文 正常/封禁
function isBanned(row) {
  return ['BANNED', '封禁'].includes(row.status)
}
function statusText(row) {
  return { ACTIVE: '正常', BANNED: '封禁' }[row.status] || row.status
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (query.phone) params.phone = query.phone
    if (query.nickname) params.nickname = query.nickname
    if (query.status) params.status = query.status
    const data = await listUsers(params)
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
  query.phone = ''
  query.nickname = ''
  query.status = ''
  search()
}

function openBan(row) {
  banRow.value = row
  banVisible.value = true
}

function onBanConfirm(reason, done) {
  const row = banRow.value
  banUser(row.userId, reason)
    .then(() => {
      ElMessage.success(`用户 ${row.userId} 已封禁，其会话与在售商品已处理`)
      done()
      banVisible.value = false
      load()
    })
    .catch(() => done())
}

async function onUnban(row) {
  try {
    await ElMessageBox.confirm(
      `确认解封用户「${row.nickname || row.phone}」？解封后恢复其角色权限，被下架商品需卖家手动重新上架。`,
      '解封用户',
      { confirmButtonText: '确认解封', cancelButtonText: '取消', type: 'success' }
    )
  } catch {
    return
  }
  await unbanUser(row.userId)
  ElMessage.success(`用户 ${row.userId} 已解封`)
  load()
}
</script>

<style scoped>
.search-bar { margin-bottom: 12px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
