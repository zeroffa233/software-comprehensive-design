<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">校园二手交易平台<br /><span class="sub">平台管理端</span></div>
      <el-menu :default-active="activeMenu" router background-color="#1d2935" text-color="#c2ccd6" active-text-color="#ffffff">
        <el-menu-item index="/goods-audit">
          <el-icon><Box /></el-icon><span>商品审核</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Tickets /></el-icon><span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/user-manage">
          <el-icon><User /></el-icon><span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/oplog">
          <el-icon><Document /></el-icon><span>操作日志</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="page-title">{{ title }}</span>
        <div class="header-right">
          <span class="admin-name">{{ auth.name || '管理员' }}</span>
          <el-button type="danger" plain size="small" @click="onLogout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Box, User, Document, Tickets } from '@element-plus/icons-vue'
import { useAuthStore } from '../store/auth'
import { logout } from '../api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const activeMenu = computed(() => route.path)
const title = computed(() => route.meta.title || '')

async function onLogout() {
  try {
    await ElMessageBox.confirm('确定退出管理端登录吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await logout()
  } catch {
    // 会话已失效也继续本地登出
  }
  auth.clearCredentials()
  router.replace('/login')
}
</script>

<style scoped>
.layout { height: 100%; }
.aside { background: #1d2935; }
.brand {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  padding: 20px 16px;
  line-height: 1.6;
}
.brand .sub { font-size: 12px; color: #8fa0af; font-weight: 400; }
.aside :deep(.el-menu) { border-right: none; }
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}
.page-title { font-size: 16px; font-weight: 600; color: #1f2d3d; }
.header-right { display: flex; align-items: center; gap: 12px; }
.admin-name { font-size: 14px; color: #606266; }
.main { padding: 16px; }
</style>
