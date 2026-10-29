// tests/smoke-live.js · 真机后端冒烟：直连 SpringBoot :8080 验证请求报文正确性（只读流程）
// 运行：node miniprogram/tests/smoke-live.js [baseUrl]（默认 http://127.0.0.1:8080/api/v1）
// 流程：登录种子账号 → 个人资料 → 分类树 → 商品列表 → 商品详情（全程不产生业务数据变更）。
'use strict';
const assert = require('assert');
const { createWxShim } = require('./helpers/wx-shim');

async function main() {
  const baseUrl = process.argv[2] || 'http://127.0.0.1:8080/api/v1';
  const shim = createWxShim();
  const api = require('../utils/request');
  const auth = require('../utils/auth');
  api.setBaseUrl(baseUrl);
  shim.state.baseUrl = baseUrl;
  shim.reset();
  auth.clearToken();

  console.log('目标后端：' + baseUrl);

  // 1. 密码登录（种子普通用户）
  const login = await api.post('/auth/login', { phone: '13800000002', password: 'User123456', loginType: 'PASSWORD' });
  assert.ok(login.token, '登录返回 token');
  assert.strictEqual(login.role, 'USER', '种子账号为普通用户');
  auth.setToken(login.token);
  console.log('✓ POST /auth/login → token/expiresIn=' + login.expiresIn + '/role=' + login.role);

  // 2. 个人资料（手机号脱敏）
  const me = await api.get('/users/me');
  assert.ok(me.userId && /^\d{3}\*{4}\d{4}$/.test(me.phone), 'me 含 userId 且手机号脱敏');
  console.log('✓ GET /users/me → userId=' + me.userId + ' phone=' + me.phone + ' nickname=' + me.nickname);

  // 3. 分类树
  const tree = await api.get('/categories');
  assert.ok(Array.isArray(tree) && tree.length >= 1, '分类树非空');
  console.log('✓ GET /categories → ' + tree.length + ' 个一级分类');

  // 4. 商品列表（分页结构 list/total/page/pageSize）
  const list = await api.get('/goods', { data: { page: 1, pageSize: 10 } });
  assert.ok(typeof list.total === 'number' && Array.isArray(list.list), '分页结构正确');
  console.log('✓ GET /goods → total=' + list.total + '（返回 ' + list.list.length + ' 条）');

  // 5. 商品详情（取列表第一件）
  if (list.list.length > 0) {
    const detail = await api.get('/goods/' + list.list[0].id);
    assert.ok(detail.title && typeof detail.price === 'number', '详情含标题与价格');
    assert.ok(Array.isArray(detail.images), '详情含图片数组');
    console.log('✓ GET /goods/' + list.list[0].id + ' → 「' + detail.title + '」¥' + detail.price + ' 状态=' + detail.status);
  }

  // 6. 无效 Token → 401
  auth.setToken('smoke-invalid-token');
  await assert.rejects(() => api.get('/cart'), (err) => err.code === 401, '无效 Token 应 401');
  assert.strictEqual(auth.getToken(), '', '401 后清 Token');
  console.log('✓ 无效 Token → 401 并清空本地 Token');

  console.log('\n冒烟通过：小程序请求封装与真实 SpringBoot 后端报文互通。');
  process.exit(0);
}

main().catch((e) => {
  console.error('冒烟失败：', e instanceof Error ? e.message : JSON.stringify(e));
  process.exit(1);
});
