import request from './request'

// ---------- 认证 ----------
export function login(data) {
  // data: { phone, password, loginType }
  return request.post('/auth/login', data)
}

export function logout() {
  return request.post('/auth/logout')
}

// ---------- 商品审核（管理员） ----------
// 待审核/在售 商品分页列表（status: 待审核 | 在售）
export function listAdminGoods(params) {
  return request.get('/admin/goods', { params })
}

// 审核通过（待审核→在售）
export function approveGoods(id) {
  return request.post(`/admin/goods/${id}/approve`)
}

// 审核驳回（待审核→草稿），body: { reason }
export function rejectGoods(id, reason) {
  return request.post(`/admin/goods/${id}/reject`, { reason })
}

// 违规下架（在售→已下架），body: { reason }
export function forceOffShelfGoods(id, reason) {
  return request.post(`/admin/goods/${id}/force-off-shelf`, { reason })
}

// ---------- 订单管理（管理员） ----------
// design/api-购物交易.md #11：query orderNo?/buyerPhone?/status?/page/pageSize
export function listAdminOrders(params) {
  return request.get('/admin/orders', { params })
}

// ---------- 用户管理 ----------
// params: { page, pageSize, phone?, nickname?, status? }
export function listUsers(params) {
  return request.get('/admin/users', { params })
}

// body: { reason }
export function banUser(id, reason) {
  return request.put(`/admin/users/${id}/ban`, { reason })
}

export function unbanUser(id) {
  return request.put(`/admin/users/${id}/unban`)
}

// ---------- 操作日志 ----------
// params: { page, pageSize, adminId?, action?, targetType? }
export function listOpLogs(params) {
  return request.get('/admin/op-logs', { params })
}
