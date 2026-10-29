<template>
  <div>
    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="待审核队列" name="pending" />
      <el-tab-pane label="在售商品（违规下架）" name="onsale" />
    </el-tabs>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="id" label="商品ID" width="90" />
      <el-table-column label="主图" width="80">
        <template #default="{ row }">
          <el-image
            v-if="row.mainImage"
            :src="imgUrl(row.mainImage)"
            :preview-src-list="[imgUrl(row.mainImage)]"
            preview-teleported
            fit="cover"
            style="width: 48px; height: 48px"
          />
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="卖家" width="140">
        <template #default="{ row }">{{ row.sellerName || row.sellerNickname || row.seller || '—' }}</template>
      </el-table-column>
      <el-table-column label="价格" width="110">
        <template #default="{ row }">￥{{ Number(row.price).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90" />
      <el-table-column prop="createTime" label="创建时间" width="170" />
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === '待审核'">
            <el-button type="success" size="small" @click="onApprove(row)">通过</el-button>
            <el-button type="warning" size="small" @click="openReason('reject', row)">驳回</el-button>
          </template>
          <el-button
            v-if="row.status === '在售'"
            type="danger"
            size="small"
            @click="openReason('offShelf', row)"
          >违规下架</el-button>
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
      ref="reasonRef"
      v-model="reasonVisible"
      :title="reasonTitle"
      label="原因（对卖家可见，写入操作日志）"
      placeholder="请输入 10-200 字原因，例如：标题含违规信息，驳回后卖家可修改重新提交"
      :confirm-text="reasonAction === 'reject' ? '确认驳回' : '确认下架'"
      :min-length="10"
      :max-length="200"
      @confirm="onReasonConfirm"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAdminGoods, approveGoods, rejectGoods, forceOffShelfGoods } from '../api'
import ReasonDialog from '../components/ReasonDialog.vue'

const tab = ref('pending')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)

const reasonVisible = ref(false)
const reasonAction = ref('reject')
const reasonRow = ref(null)
const reasonRef = ref()
const reasonTitle = ref('')

onMounted(load)

// 后端返回相对 URL（如 /images/seed/g12.png），静态资源由 SpringBoot :8080 提供
const BACKEND_ORIGIN = 'http://127.0.0.1:8080'
function imgUrl(path) {
  if (!path) return ''
  return /^https?:\/\//.test(path) ? path : BACKEND_ORIGIN + path
}

function onTabChange() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const status = tab.value === 'pending' ? '待审核' : '在售'
    const data = await listAdminGoods({ status, page: page.value, pageSize: pageSize.value })
    list.value = data && data.list ? data.list : []
    total.value = data && data.total ? Number(data.total) : 0
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function onApprove(row) {
  try {
    await ElMessageBox.confirm(
      `确认审核通过商品「${row.title}」？通过后将进入在售状态。`,
      '审核通过',
      { confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'success' }
    )
  } catch {
    return
  }
  await approveGoods(row.id)
  ElMessage.success(`商品 ${row.id} 已审核通过，状态置为「在售」`)
  load()
}

function openReason(action, row) {
  reasonAction.value = action
  reasonRow.value = row
  reasonTitle.value = action === 'reject'
    ? `驳回商品：${row.title}（驳回后进入草稿）`
    : `违规下架：${row.title}（下架后进入已下架）`
  reasonVisible.value = true
}

function onReasonConfirm(reason, done) {
  const row = reasonRow.value
  const call = reasonAction.value === 'reject'
    ? rejectGoods(row.id, reason)
    : forceOffShelfGoods(row.id, reason)
  call
    .then(() => {
      ElMessage.success(
        reasonAction.value === 'reject'
          ? `商品 ${row.id} 已驳回，状态置为「草稿」`
          : `商品 ${row.id} 已违规下架，状态置为「已下架」`
      )
      done()
      reasonRef.value.close()
      load()
    })
    .catch(() => {
      // 拦截器已弹出原因；保持弹窗让管理员修改
      done()
    })
}
</script>

<style scoped>
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
