// tests/test-request.js · utils/request.js 响应解包/401/Token 注入/异常分支单测（mock transport，不依赖后端）
'use strict';
const assert = require('assert');
const { createWxShim } = require('./helpers/wx-shim');

module.exports = async function run(shim) {
  const api = require('../utils/request');
  const auth = require('../utils/auth');
  const state = shim.state;

  // —— 环境准备 ——
  state.transport = null;
  state.baseUrl = 'http://mock/api/v1';
  api.setBaseUrl('http://mock/api/v1');
  shim.reset();
  auth.clearToken();

  // 1. code=0 → resolve(data)
  state.transport = (options, cb) => cb({ statusCode: 200, data: { code: 0, msg: 'success', data: { hello: 1 } } });
  const data = await api.get('/ping');
  assert.deepStrictEqual(data, { hello: 1 }, 'code=0 应 resolve(data)');

  // 2. 非 0 → reject({code,msg}) + toast(msg)
  state.transport = (options, cb) => cb({ statusCode: 200, data: { code: 409, msg: '库存不足', data: null } });
  state.toasts.length = 0;
  await assert.rejects(
    () => api.post('/x', {}),
    (err) => err.code === 409 && err.msg === '库存不足',
    '非 0 应 reject {code,msg}'
  );
  assert.strictEqual(state.toasts.length, 1, '非 0 应 toast msg');
  assert.strictEqual(state.toasts[0].title, '库存不足');

  // 3. silent 选项：不 toast
  state.toasts.length = 0;
  await assert.rejects(() => api.post('/x', {}, { silent: true }));
  assert.strictEqual(state.toasts.length, 0, 'silent 不应 toast');

  // 4. 401 → 清 Token + reLaunch 登录页
  state.transport = (options, cb) => cb({ statusCode: 200, data: { code: 401, msg: '登录已失效', data: null } });
  auth.setToken('stale-token');
  state.navigations.length = 0;
  await assert.rejects(() => api.get('/users/me'), (err) => err.code === 401);
  assert.strictEqual(auth.getToken(), '', '401 后应清空 Token');
  await shim.settle(() => state.navigations.some((n) => n.type === 'reLaunch' && n.url.indexOf('auth/login') !== -1));
  assert.ok(state.navigations.some((n) => n.type === 'reLaunch' && n.url.indexOf('auth/login') !== -1), '401 应跳登录页');

  // 5. Token 注入：有 Token 时携带 Bearer
  auth.setToken('good-token');
  state.transport = (options, cb) => {
    assert.strictEqual(options.header.Authorization, 'Bearer good-token', '应携带 Bearer Token');
    cb({ statusCode: 200, data: { code: 0, msg: 'ok', data: null } });
  };
  await api.get('/ping');

  // 6. 无 Token 时不带 Authorization
  auth.clearToken();
  state.transport = (options, cb) => {
    assert.strictEqual(options.header.Authorization, undefined, '无 Token 不应带 Authorization');
    cb({ statusCode: 200, data: { code: 0, msg: 'ok', data: null } });
  };
  await api.get('/ping');

  // 7. 网络失败 → reject code -1 + toast
  state.transport = (options, cb) => cb(null);
  await assert.rejects(() => api.get('/x'), (err) => err.code === -1, '网络失败应 reject code -1');

  // 8. uploadFile 解包：合法 JSON {code,msg,data}
  auth.setToken('up-token');
  state.transport = (options, cb) => {
    assert.strictEqual(options.method, 'UPLOAD');
    cb({ statusCode: 200, data: JSON.stringify({ code: 0, msg: 'ok', data: { imageId: 1, url: '/a.png' } }) });
  };
  const up = await api.upload('/goods/images', '/tmp/a.png');
  assert.strictEqual(up.imageId, 1, 'upload 应解包 data');

  // 9. uploadFile 非 0 → reject
  state.transport = (options, cb) => cb({ statusCode: 200, data: JSON.stringify({ code: 400, msg: '图片格式非法', data: null }) });
  await assert.rejects(() => api.upload('/goods/images', '/tmp/a.png'), (err) => err.code === 400);

  // 10. genRequestId / formatTime
  const rid = api.genRequestId();
  assert.ok(/^req-\d+-[a-z0-9]+$/.test(rid), 'genRequestId 形如 req-ts-rand');
  assert.strictEqual(api.formatTime(new Date(2026, 9, 29, 8, 5, 3)), '2026-10-29 08:05:03', 'formatTime 格式 yyyy-MM-dd HH:mm:ss');

  // 11. PUT/DELETE 方法透传
  const methodsSeen = [];
  state.transport = (options, cb) => { methodsSeen.push(options.method); cb({ statusCode: 200, data: { code: 0, msg: 'ok', data: null } }); };
  await api.put('/x', { a: 1 });
  await api.del('/x', { b: 2 });
  assert.deepStrictEqual(methodsSeen, ['PUT', 'DELETE'], 'put/del 透传 HTTP 方法');

  state.transport = null;
  shim.reset();
  return 'request 解包/401/Token/silent/upload 分支 11 项全部通过';
};
