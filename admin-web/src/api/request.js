import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../store/auth'
import router from '../router'

const request = axios.create({
  baseURL: 'http://127.0.0.1:8080/api/v1',
  timeout: 15000
})

request.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

let redirectingToLogin = false

function handleUnauthorized(msg) {
  const auth = useAuthStore()
  auth.clearCredentials()
  if (!redirectingToLogin) {
    redirectingToLogin = true
    if (router.currentRoute.value.path !== '/login') {
      ElMessage.error(msg || '登录已失效，请重新登录')
      router.replace('/login').finally(() => {
        redirectingToLogin = false
      })
    } else {
      redirectingToLogin = false
    }
  }
}

request.interceptors.response.use(
  (response) => {
    // HTTP 2xx：业务返回 {code, msg, data}
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data
      }
      if (body.code === 401) {
        handleUnauthorized(body.msg)
      } else if (body.code === 403) {
        ElMessage.error(body.msg || '无权限执行该操作')
      } else {
        ElMessage.error(body.msg || '操作失败')
      }
      return Promise.reject(new Error(body.msg || `请求失败（code=${body.code}）`))
    }
    // 非约定结构，原样返回
    return body
  },
  (error) => {
    const status = error.response ? error.response.status : null
    const body = error.response ? error.response.data : null
    const msg = (body && body.msg) || error.message || '网络异常，请稍后重试'
    if (status === 401 || (body && body.code === 401)) {
      handleUnauthorized(msg)
    } else if (status === 403 || (body && body.code === 403)) {
      ElMessage.error(msg || '无权限执行该操作')
    } else if (body && typeof body === 'object' && 'code' in body) {
      // HTTP 200 以外仍带 {code,msg}（如 423 封禁提示）
      ElMessage.error(msg)
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

export default request
