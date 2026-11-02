<template>
  <div>
    <el-form inline class="filters" @submit.prevent="onSearch">
      <el-form-item label="订单号">
        <el-input
          v-model.trim="filters.orderNo"
          placeholder="精确订单号"
          clearable
          style="width: 200px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
      </el-form-item>
      <el-form-item label="买家手机号">
        <el-input
          v-model.trim="filters.buyerPhone"
          placeholder="买家手机号"
          clearable
          maxlength="11"
          style="width: 180px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" style="width: 130px" @change="onSearch">
          <el-option
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="goodsTitle" label="商品" min-width="200" show-overflow-tooltip />
      <el-table-column prop="buyerPhone" label="买家手机号" width="130" />
      <el-table-column prop="num" label="数量" width="70" align="center" />
      <el-table-column label="成交价" width="100" align="right">
        <template #default="{ row }">￥{{ money(row.dealPrice) }}</template>
      </el-table-column>
      <el-table-column label="运费" width="90" align="right">
        <template #default="{ row }">{{ freightText(row.freightAmount) }}</template>
      </el-table-column>
      <el-table-column label="合计" width="110" align="right">
        <template #default="{ row }">￥{{ money(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="170">
        <template #default="{ row }">{{ row.keyTimes?.createTime || '—' }}</template>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { listAdminOrders } from '../api'

// 后端状态为中文枚举（Order.STATUS_NAMES），“全部”不传 status
const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待支付', value: '待支付' },
  { label: '已支付', value: '已支付' },
  { label: '已完成', value: '已完成' },
  { label: '已取消', value: '已取消' }
]

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const filters = reactive({ orderNo: '', buyerPhone: '', status: '' })

onMounted(load)

function money(v) {
  return Number(v ?? 0).toFixed(2)
}

function freightText(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n === 0 ? '包邮' : `￥${n.toFixed(2)}`
}

function statusTagType(status) {
  return { 待支付: 'warning', 已支付: 'primary', 已完成: 'success', 已取消: 'info' }[status] || 'info'
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filters.orderNo) params.orderNo = filters.orderNo
    if (filters.buyerPhone) params.buyerPhone = filters.buyerPhone
    if (filters.status) params.status = filters.status
    const data = await listAdminOrders(params)
    list.value = data && data.list ? data.list : []
    total.value = data && data.total ? Number(data.total) : 0
  } catch {
    // 拦截器已弹出错误提示
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}

function onReset() {
  filters.orderNo = ''
  filters.buyerPhone = ''
  filters.status = ''
  onSearch()
}
</script>

<style scoped>
.filters { margin-bottom: 4px; }
.filters .el-form-item { margin-bottom: 12px; }
.pager { margin-top: 14px; justify-content: flex-end; }
</style>
