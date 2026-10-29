<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1 class="title">校园二手交易平台 · 管理端</h1>
      <p class="subtitle">仅平台管理员可登录（RBAC）</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
        <el-form-item label="管理员手机号" prop="phone">
          <el-input v-model.trim="form.phone" maxlength="11" placeholder="请输入 11 位手机号" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-button class="submit-btn" type="primary" :loading="loading" @click="submit">
          登录管理端
        </el-button>
        <p class="hint">普通用户登录此入口将被拒绝（403）。</p>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '../api'
import { useAuthStore } from '../store/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ phone: '', password: '' })
const rules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '手机号须为 1 开头的 11 位数字', trigger: 'blur' }
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    const data = await login({ phone: form.phone, password: form.password, loginType: 'PASSWORD' })
    if (!data || !data.token) {
      ElMessage.error('登录响应缺少 token')
      return
    }
    if (data.role !== 'ADMIN') {
      ElMessage.error('无权限：该账号不是平台管理员')
      return
    }
    auth.setCredentials({ token: data.token, role: data.role, name: data.nickname || data.phone || '管理员' })
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/goods-audit')
  } catch {
    // 拦截器已弹出错误提示
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1d2935 0%, #2f4356 100%);
}
.login-card { width: 400px; padding: 8px 12px 4px; }
.title { font-size: 18px; margin: 0 0 4px; color: #1f2d3d; text-align: center; }
.subtitle { font-size: 13px; color: #909399; text-align: center; margin: 0 0 16px; }
.submit-btn { width: 100%; }
.hint { font-size: 12px; color: #a8abb2; text-align: center; margin: 12px 0 0; }
</style>
