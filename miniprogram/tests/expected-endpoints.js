// tests/expected-endpoints.js · 端点契约清单（逐字取自 design/api-*.md，三份文档）
// 字段为文档"入参"栏所列字段；query 为文档所列查询参数。
'use strict';

module.exports = [
  // —— api-用户及权限.md ——
  { method: 'POST', path: '/auth/sms-code', body: ['phone', 'scene'], query: [], doc: 'api-用户及权限.md', page: 'login/register/findpwd' },
  { method: 'POST', path: '/auth/register', body: ['phone', 'smsCode', 'password', 'confirmPassword'], query: [], doc: 'api-用户及权限.md', page: 'register' },
  { method: 'POST', path: '/auth/login', body: ['phone', 'password|smsCode', 'loginType'], query: [], doc: 'api-用户及权限.md', page: 'login' },
  { method: 'POST', path: '/auth/logout', body: [], query: [], doc: 'api-用户及权限.md', page: 'profile' },
  { method: 'POST', path: '/auth/find-password', body: ['phone', 'smsCode', 'newPassword'], query: [], doc: 'api-用户及权限.md', page: 'findpwd' },
  { method: 'GET', path: '/users/me', body: [], query: [], doc: 'api-用户及权限.md', page: 'profile/login/register' },
  { method: 'PUT', path: '/users/me', body: ['nickname', 'avatar', 'signature'], query: [], doc: 'api-用户及权限.md', page: 'profile' },
  { method: 'PUT', path: '/users/me/password', body: ['oldPassword', 'newPassword'], query: [], doc: 'api-用户及权限.md', page: 'profile' },
  { method: 'POST', path: '/users/me/avatar', body: ['file(multipart)'], query: [], doc: 'api-用户及权限.md', page: 'profile' },
  { method: 'POST', path: '/agent/chat', body: ['prompt', 'requestId'], query: [], doc: 'api-用户及权限.md', page: 'agent' },
  { method: 'POST', path: '/agent/describe-image', body: ['file(multipart)'], query: [], doc: 'api-用户及权限.md', page: 'publish' },

  // —— api-商品发布.md ——
  { method: 'GET', path: '/categories', body: [], query: ['parentId'], doc: 'api-商品发布.md', page: 'list/publish' },
  { method: 'GET', path: '/goods', body: [], query: ['categoryId', 'keyword', 'sort', 'page', 'pageSize'], doc: 'api-商品发布.md', page: 'list' },
  { method: 'GET', path: '/goods/{id}', body: [], query: [], doc: 'api-商品发布.md', page: 'detail/publish(edit)' },
  { method: 'POST', path: '/goods', body: ['title', 'categoryId', 'price', 'negotiable', 'stock', 'freight', 'urgent', 'description', 'imageIds', 'requestId'], query: [], doc: 'api-商品发布.md', page: 'publish' },
  { method: 'POST', path: '/goods/images', body: ['file(multipart)'], query: [], doc: 'api-商品发布.md', page: 'publish' },
  { method: 'DELETE', path: '/goods/images/{imageId}', body: [], query: [], doc: 'api-商品发布.md', page: 'publish' },
  { method: 'PUT', path: '/goods/{id}', body: ['title', 'categoryId', 'price', 'negotiable', 'stock', 'freight', 'urgent', 'description'], query: [], doc: 'api-商品发布.md', page: 'publish(edit)' },
  { method: 'POST', path: '/goods/{id}/off-shelf', body: [], query: [], doc: 'api-商品发布.md', page: 'detail/mine' },
  { method: 'POST', path: '/goods/{id}/re-list', body: [], query: [], doc: 'api-商品发布.md', page: 'mine' },
  { method: 'GET', path: '/goods/mine', body: [], query: ['status', 'page', 'pageSize'], doc: 'api-商品发布.md', page: 'mine' },

  // —— api-购物交易.md ——
  { method: 'GET', path: '/cart', body: [], query: [], doc: 'api-购物交易.md', page: 'cart' },
  { method: 'POST', path: '/cart/items', body: ['goodsId', 'num'], query: [], doc: 'api-购物交易.md', page: 'detail' },
  { method: 'PUT', path: '/cart/items/{goodsId}', body: ['num'], query: [], doc: 'api-购物交易.md', page: 'cart' },
  { method: 'DELETE', path: '/cart/items/{goodsId}', body: [], query: [], doc: 'api-购物交易.md', page: 'cart' },
  { method: 'POST', path: '/orders', body: ['goodsId', 'num', 'remark', 'requestId'], query: [], doc: 'api-购物交易.md', page: 'order-confirm' },
  { method: 'POST', path: '/orders/{orderNo}/pay', body: [], query: [], doc: 'api-购物交易.md', page: 'order-confirm/order-list' },
  { method: 'POST', path: '/orders/{orderNo}/cancel', body: ['reason'], query: [], doc: 'api-购物交易.md', page: 'order-confirm/order-list' },
  { method: 'POST', path: '/orders/{orderNo}/confirm', body: [], query: [], doc: 'api-购物交易.md', page: 'order-list' },
  { method: 'GET', path: '/orders', body: [], query: ['status', 'page', 'pageSize'], doc: 'api-购物交易.md', page: 'order-list' },
  { method: 'GET', path: '/orders/{orderNo}', body: [], query: [], doc: 'api-购物交易.md', page: 'order-list' }
];
