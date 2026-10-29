import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../store/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '管理端登录' }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/goods-audit',
    meta: { requireAdmin: true },
    children: [
      {
        path: 'goods-audit',
        name: 'GoodsAudit',
        component: () => import('../views/GoodsAudit.vue'),
        meta: { requireAdmin: true, title: '商品审核' }
      },
      {
        path: 'user-manage',
        name: 'UserManage',
        component: () => import('../views/UserManage.vue'),
        meta: { requireAdmin: true, title: '用户管理' }
      },
      {
        path: 'oplog',
        name: 'Oplog',
        component: () => import('../views/Oplog.vue'),
        meta: { requireAdmin: true, title: '操作日志' }
      }
    ]
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('../views/Forbidden.vue'),
    meta: { title: '无权限' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path === '/login') {
    // 已登录管理员访问登录页直接进入工作台
    if (auth.token && auth.role === 'ADMIN') {
      return '/goods-audit'
    }
    return true
  }
  if (to.meta.requireAdmin) {
    if (!auth.token) {
      ElMessage.warning('请先登录管理端')
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (auth.role !== 'ADMIN') {
      ElMessage.error('无权限访问管理端')
      return '/403'
    }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · 校园二手交易平台管理端`
    : '校园二手交易平台管理端'
})

export default router
