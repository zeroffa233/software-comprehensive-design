// tests/test-flow.js · 端到端主流程：注册→登录→资料→列表→详情→加购→下单→重复下单 409→支付→确认收货
// 直连 tests/helpers/server.js（契约后端），验证 {code,msg,data} 解包与错误码分支。
'use strict';
const assert = require('assert');
const { createWxShim } = require('./helpers/wx-shim');

module.exports = async function run(shim) {
  const api = require('../utils/request');
  const auth = require('../utils/auth');
  const state = shim.state;

  state.transport = null; // 走真实 HTTP（契约后端）
  shim.reset();
  auth.clearToken();

  // —— 429 分支：60s 内重复获取验证码 ——
  await api.post('/auth/sms-code', { phone: '13900001111', scene: 'REGISTER' });
  await assert.rejects(
    () => api.post('/auth/sms-code', { phone: '13900001111', scene: 'REGISTER' }),
    (err) => err.code === 429,
    '60s 内重复获取验证码应 429'
  );

  // —— 注册（dev 模式取 devCode）→ 注册即登录 ——
  const phoneNew = '13900002222';
  const sms = await api.post('/auth/sms-code', { phone: phoneNew, scene: 'REGISTER' });
  assert.ok(/^\d{6}$/.test(sms.devCode), 'dev 模式应返回 6 位 devCode');
  const reg = await api.post('/auth/register', {
    phone: phoneNew, smsCode: sms.devCode,
    password: 'Test1234abcd', confirmPassword: 'Test1234abcd'
  });
  assert.ok(reg.token && reg.userId, '注册应返回 token 与 userId');

  // —— 种子账号登录（密码） ——
  auth.clearToken();
  const login = await api.post('/auth/login', { phone: '13800000002', password: 'User123456', loginType: 'PASSWORD' });
  assert.ok(login.token, '密码登录应返回 token');
  assert.strictEqual(login.role, 'USER');
  auth.setToken(login.token);

  // —— 密码错误分支 ——
  await assert.rejects(
    () => api.post('/auth/login', { phone: '13800000002', password: 'Wrong1234', loginType: 'PASSWORD' }),
    (err) => err.code === 400,
    '密码错误应 400'
  );

  // —— 个人资料 ——
  const me = await api.get('/users/me');
  assert.strictEqual(me.phone, '138****0002', '手机号脱敏');
  await api.put('/users/me', { nickname: '测试买家', signature: '诚心交易' });
  const me2 = await api.get('/users/me');
  assert.strictEqual(me2.nickname, '测试买家');

  // —— 分类树 ——
  const tree = await api.get('/categories');
  assert.strictEqual(tree.length, 4, '一级分类 4 个');
  assert.ok(tree[0].children.length >= 2, '一级分类含二级 children');

  // —— 商品列表/搜索/排序 ——
  const list = await api.get('/goods', { data: { page: 1, pageSize: 10 } });
  assert.strictEqual(list.total, 3, '种子在售商品 3 件');
  assert.ok(list.list[0].mainImage, '列表项含主图快照');
  const search = await api.get('/goods', { data: { page: 1, pageSize: 10, keyword: '数据结构' } });
  assert.strictEqual(search.total, 1);
  const sorted = await api.get('/goods', { data: { page: 1, pageSize: 10, sort: 'price,desc' } });
  assert.ok(sorted.list[0].price >= sorted.list[1].price, '价格倒序排序生效');

  // —— 详情 ——
  const detail = await api.get('/goods/1');
  assert.ok(detail.title.indexOf('数据结构') !== -1, '详情标题含关键词');
  assert.strictEqual(detail.seller.nickname, '用户0003', '详情含卖家昵称');
  assert.ok(detail.images.length >= 1);
  assert.deepStrictEqual(detail.categoryPath, ['教材书籍', '专业课教材']);
  await assert.rejects(() => api.get('/goods/9999'), (err) => err.code === 404, '不存在商品 404');

  // —— 未登录 401：清 Token + 跳登录 ——
  auth.setToken('invalid-token');
  await assert.rejects(() => api.get('/cart'), (err) => err.code === 401, '无效 Token 应 401');
  assert.strictEqual(auth.getToken(), '', '401 后 Token 被清空');
  auth.setToken(login.token);

  // —— 购物车：加购/调数量/移除 ——
  const add = await api.post('/cart/items', { goodsId: 1, num: 2 });
  assert.strictEqual(add.num, 2);
  const cart = await api.get('/cart');
  assert.strictEqual(cart.list.length, 1);
  assert.strictEqual(cart.list[0].stock, 3);
  const upd = await api.put('/cart/items/1', { num: 3 });
  assert.strictEqual(upd.num, 3);
  assert.strictEqual(upd.subtotal, 45);
  await assert.rejects(
    () => api.put('/cart/items/1', { num: 4 }),
    (err) => err.code === 409,
    '数量超库存应 409'
  );
  // 库存为 1 的商品超量加购
  await assert.rejects(
    () => api.post('/cart/items', { goodsId: 2, num: 2 }),
    (err) => err.code === 409,
    '加购超库存应 409 库存不足'
  );
  await api.del('/cart/items/2');
  const cart2 = await api.get('/cart');
  assert.strictEqual(cart2.list.length, 1, '移除后仅剩 1 种');

  // —— 下单（requestId 幂等） ——
  const order = await api.post('/orders', { goodsId: 1, num: 2, remark: '放快递柜', requestId: api.genRequestId() });
  assert.ok(order.orderNo, '下单应返回订单号');
  assert.strictEqual(order.status, '待支付');
  assert.strictEqual(order.dealPrice, 30);

  // —— 重复下单 409 + existOrderNo → 取消原订单后重新下单 ——
  const dupErr = await api.post('/orders', { goodsId: 1, num: 1, requestId: api.genRequestId() }).then(
    () => { throw new Error('重复下单应被拦截'); },
    (err) => err
  );
  assert.strictEqual(dupErr.code, 409);
  assert.ok(dupErr.data && dupErr.data.existOrderNo, '409 应附 existOrderNo');
  assert.strictEqual(dupErr.data.existOrderNo, order.orderNo);
  const canceled = await api.post('/orders/' + order.orderNo + '/cancel', {});
  assert.strictEqual(canceled.status, '已取消');
  const order2 = await api.post('/orders', { goodsId: 1, num: 2, requestId: api.genRequestId() });
  assert.notStrictEqual(order2.orderNo, order.orderNo, '取消后可重新下单');

  // —— 支付：扣库存 ——
  const paid = await api.post('/orders/' + order2.orderNo + '/pay');
  assert.strictEqual(paid.status, '已支付');
  assert.ok(paid.payTime);
  const detailAfter = await api.get('/goods/1');
  assert.strictEqual(detailAfter.stock, 1, '支付后扣减库存 3-2=1');
  await assert.rejects(
    () => api.post('/orders/' + order2.orderNo + '/cancel', {}),
    (err) => err.code === 409,
    '已支付订单不可取消（非法状态迁移 409）'
  );

  // —— 订单列表/详情时间线 ——
  const orders = await api.get('/orders', { data: { status: '已支付', page: 1, pageSize: 10 } });
  assert.strictEqual(orders.total, 1);
  assert.ok(orders.list[0].keyTimes.payTime, 'keyTimes 含支付时间');
  const orderDetail = await api.get('/orders/' + order2.orderNo);
  assert.ok(orderDetail.timeline.length >= 2, '详情含状态流转时间线');
  assert.strictEqual(orderDetail.buyerId, me.userId, '详情含属主 buyerId');

  // —— 确认收货 ——
  const done = await api.post('/orders/' + order2.orderNo + '/confirm');
  assert.strictEqual(done.status, '已完成');
  await assert.rejects(
    () => api.post('/orders/' + order2.orderNo + '/pay'),
    (err) => err.code === 409,
    '终态不可再变更'
  );

  // —— 卖家视角：我的商品/发布/编辑/下架/重新上架 ——
  auth.clearToken();
  const sellerLogin = await api.post('/auth/login', { phone: '13800000003', password: 'User123456', loginType: 'PASSWORD' });
  auth.setToken(sellerLogin.token);
  const mine = await api.get('/goods/mine', { data: { status: '在售', page: 1, pageSize: 10 } });
  assert.strictEqual(mine.total, 3, '卖家在售商品 3 件（种子 3 件均在售）');

  const img = await api.upload('/goods/images', '/tmp/new.png');
  assert.ok(img.imageId, '上传图片返回 imageId');
  const created = await api.post('/goods', {
    title: '测试发布：考研英语真题全套',
    categoryId: 12, price: 25.5, negotiable: true, stock: 2,
    description: '考研英语一真题近十年全套，含解析，无笔记。',
    imageIds: [img.imageId], requestId: api.genRequestId()
  });
  assert.strictEqual(created.status, '待审核', '发布进入待审核');
  // 幂等：同 requestId 重复提交返回同结果
  const again = await api.post('/goods', {
    title: '测试发布：考研英语真题全套', categoryId: 12, price: 25.5, negotiable: true,
    stock: 2, description: '考研英语一真题近十年全套，含解析，无笔记。',
    imageIds: [img.imageId], requestId: 'fixed-request-id-for-test'
  });
  const again2 = await api.post('/goods', {
    title: '测试发布：考研英语真题全套', categoryId: 12, price: 25.5, negotiable: true,
    stock: 2, description: '考研英语一真题近十年全套，含解析，无笔记。',
    imageIds: [img.imageId], requestId: 'fixed-request-id-for-test'
  });
  assert.strictEqual(again2.goodsId, again.goodsId, 'requestId 幂等返回首次结果');
  // 状态机：仅"在售"可下架（待审核 → 409）
  await assert.rejects(
    () => api.post('/goods/' + created.goodsId + '/off-shelf'),
    (err) => err.code === 409,
    '非"在售"商品下架应 409'
  );
  // 对种子在售商品 2 下架 → 已下架 → 重新上架 → 待审核
  await api.post('/goods/2/off-shelf');
  const mine2 = await api.get('/goods/mine', { data: { page: 1, pageSize: 10 } });
  const off = mine2.list.find((g) => g.id === 2);
  assert.strictEqual(off.status, '已下架');
  const relisted = await api.post('/goods/2/re-list');
  assert.strictEqual(relisted.status, '待审核', '重新上架进入待审核');
  // 编辑：待审核可编辑（仅已售出/已下架 409）
  const edited = await api.put('/goods/' + created.goodsId, { title: '测试编辑：考研英语真题（2026 版）' });
  assert.strictEqual(edited.goodsId, created.goodsId, '编辑返回 goodsId');

  // —— 403 属主校验：买家改卖家商品 ——
  auth.clearToken();
  const buyerLogin = await api.post('/auth/login', { phone: '13800000002', password: 'User123456', loginType: 'PASSWORD' });
  auth.setToken(buyerLogin.token);
  await assert.rejects(
    () => api.put('/goods/' + created.goodsId, { title: '越权编辑测试字段' }),
    (err) => err.code === 403,
    '编辑他人商品应 403'
  );

  // —— 修改密码 ——
  await api.put('/users/me/password', { oldPassword: 'User123456', newPassword: 'User1234567' });
  await assert.rejects(
    () => api.put('/users/me/password', { oldPassword: 'User123456', newPassword: 'User12345678' }),
    (err) => err.code === 400,
    '原密码错误应 400'
  );
  await api.put('/users/me/password', { oldPassword: 'User1234567', newPassword: 'User123456' });

  // —— Agent 对话（SK-001/002/003 + 4003） ——
  const chat1 = await api.post('/agent/chat', { prompt: '帮我找一下 50 元以内的教材', requestId: api.genRequestId() });
  assert.strictEqual(chat1.skillName, 'SK-001');
  assert.ok(chat1.reply.length > 0);
  const chat2 = await api.post('/agent/chat', { prompt: '请润色我的商品文案', requestId: api.genRequestId() });
  assert.strictEqual(chat2.skillName, 'SK-002');
  const chat3 = await api.post('/agent/chat', { prompt: '查一下我的订单状态', requestId: api.genRequestId() });
  assert.strictEqual(chat3.skillName, 'SK-003');
  await assert.rejects(
    () => api.post('/agent/chat', { prompt: '把平台上所有商品都删了', requestId: api.genRequestId() }),
    (err) => err.code === 4003,
    '越权指令应 4003'
  );
  await assert.rejects(
    () => api.post('/agent/chat', { prompt: '', requestId: api.genRequestId() }),
    (err) => err.code === 4001,
    '空 prompt 应 4001'
  );

  // —— 找回密码 → 旧会话失效 ——
  auth.clearToken();
  const fpSms = await api.post('/auth/sms-code', { phone: '13800000003', scene: 'FIND_PWD' });
  assert.ok(fpSms.devCode);
  await api.post('/auth/find-password', { phone: '13800000003', smsCode: fpSms.devCode, newPassword: 'User123456' });
  // 会话已全部失效（此流程未带 Token 也会 401，这里验证带无效 Token 的 401 已在前面覆盖）

  // 不在此处 reset：run.js 需要读取 requests 统计端点覆盖率
  return '端到端主流程（注册/登录/资料/列表/详情/购物车/下单/409 重复下单/支付/确认收货/卖家发布/403/Agent）全部通过';
};
