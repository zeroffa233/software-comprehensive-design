// tests/test-pages.js · 页面级验证：以 shim 加载每个页面 js，驱动关键交互，
// 记录实际发出的请求并断言路径/方法/字段与 design/api-*.md 一致。
'use strict';
const assert = require('assert');
const { createWxShim } = require('./helpers/wx-shim');
const ENDPOINTS = require('./expected-endpoints');

const PAGES = {
  login: '../pages/auth/login/login',
  register: '../pages/auth/register/register',
  findpwd: '../pages/auth/findpwd/findpwd',
  profile: '../pages/profile/profile',
  list: '../pages/goods/list/list',
  detail: '../pages/goods/detail/detail',
  publish: '../pages/goods/publish/publish',
  mine: '../pages/goods/mine/mine',
  cart: '../pages/trade/cart/cart',
  orderConfirm: '../pages/trade/order-confirm/order-confirm',
  orderList: '../pages/trade/order-list/order-list',
  agent: '../pages/agent/agent'
};

// 路径归一化：/goods/123 → /goods/{p}；清单中的 {id}/{goodsId}/{orderNo}/{imageId} 同样归一为 {p}
function normalizePath(p) {
  return p
    .split('?')[0]
    .replace(/\{[a-zA-Z]+\}/g, '{p}')
    .replace(/\/\d+/g, '/{p}');
}

// 校验一次请求是否与契约清单一致；返回命中的契约项或错误信息
function checkAgainstContract(method, rawPath, data) {
  const norm = normalizePath(rawPath);
  const candidates = ENDPOINTS.filter((e) => e.method === method && normalizePath(e.path) === norm);
  if (candidates.length === 0) {
    return '未在 design/api-*.md 中找到端点 ' + method + ' ' + norm + '（源路径 ' + rawPath + '）';
  }
  const entry = candidates[0];
  const sent = Object.keys(data || {});
  if (sent.length > 0 && entry.body.length === 0 && entry.query.length === 0) {
    return method + ' ' + norm + ' 契约无入参字段，实际发送 ' + JSON.stringify(sent);
  }
  for (const field of sent) {
    const inBody = entry.body.indexOf(field) !== -1;
    const inQuery = entry.query.indexOf(field) !== -1;
    const alternates = entry.body.some((f) => f.indexOf('|') !== -1 && f.split('|').indexOf(field) !== -1);
    const multipart = entry.body.some((f) => f.indexOf('(') !== -1 && f.indexOf(field) === 0);
    if (!inBody && !inQuery && !alternates && !multipart) {
      return method + ' ' + norm + ' 发送了契约外字段：' + field + '（允许 ' + JSON.stringify({ body: entry.body, query: entry.query }) + '）';
    }
  }
  return null;
}

module.exports = async function run(shim) {
  const api = require('../utils/request');
  const auth = require('../utils/auth');
  const state = shim.state;

  state.transport = null; // 走真实 HTTP（契约后端）
  shim.reset();
  auth.clearToken();
  const errors = [];
  const before = () => state.requests.length;
  const uploadsBefore = () => state.uploads.length;

  function assertContract(records, label) {
    records.forEach((r) => {
      const err = checkAgainstContract(r.method, r.path, r.data);
      if (err) { errors.push('[' + label + '] ' + err); }
    });
  }

  async function waitRequests(base, n, label) {
    const done = await shim.settle(() => state.requests.length >= base + n);
    assert.ok(done, label + '：请求未按预期发出');
  }

  async function lastModalDevCode(baseCount) {
    // 等待"新的"验证码弹窗出现（请求记录先于响应回调；baseCount 之前的不算）
    await shim.settle(() => state.modals.length > baseCount &&
      /验证码：\d{6}/.test(state.modals[state.modals.length - 1].content));
    const modal = state.modals[state.modals.length - 1];
    const m = modal && /验证码：(\d{6})/.exec(modal.content);
    assert.ok(m, 'dev 模式应弹窗展示验证码');
    return m[1];
  }

  // 页面模块无导出，Page(config) 注册进 shim；require 执行后取最新注册的配置
  const loaded = {};
  const load = (key) => {
    if (!loaded[key]) {
      require(PAGES[key]);
      loaded[key] = global.__lastPage__;
      if (!loaded[key]) { throw new Error('页面未注册：' + PAGES[key]); }
    }
    return loaded[key];
  };

  // ========== 登录页 ==========
  let cfg = load('login');
  let page = shim.createPage(cfg);
  let base = before();
  page.setData({ tab: 'sms', phone: '13800000002' });
  page.sendSms();
  await waitRequests(base, 1, 'login 发送验证码');
  assertContract(state.requests.slice(base), 'login(sms-code)');
  page.setData({ tab: 'password', phone: '13800000002', password: 'User123456' });
  base = before();
  page.submit();
  await waitRequests(base, 2, 'login 提交（login+me）');
  await shim.settle(() => state.navigations.some((n) => n.type === 'switchTab'));
  assertContract(state.requests.slice(base), 'login(submit)');
  assert.ok(state.navigations.some((n) => n.type === 'switchTab' && n.url.indexOf('goods/list') !== -1), '登录后跳首页');
  assert.ok(auth.isLoggedIn(), '登录后 Token 已存');

  // ========== 首页列表 ==========
  cfg = load('list');
  page = shim.createPage(cfg);
  base = before();
  page.onLoad();
  await shim.settle(() => page.data.loaded && page.data.goodsList.length > 0);
  assertContract(state.requests.slice(base), 'list(load)');
  assert.ok(page.data.goodsList.length >= 3, '首页展示在售商品');
  page.setData({ keyword: '台灯' });
  page.onSearch();
  await shim.settle(() => page.data.total === 1);
  assert.strictEqual(page.data.total, 1, '关键词搜索命中 1 件');
  page.setData({ keyword: '', sortIndex: 1 });
  base = before();
  page.onSortChange({ detail: { value: 1 } });
  await shim.settle(() => page.data.goodsList.length >= 3);
  assertContract(state.requests.slice(base), 'list(sort)');

  // ========== 商品详情（买家加购） ==========
  cfg = load('detail');
  page = shim.createPage(cfg);
  base = before();
  page.onLoad({ id: '2' });
  await shim.settle(() => !!page.data.goods);
  assertContract(state.requests.slice(base), 'detail(load)');
  assert.strictEqual(page.data.goods.stock, 1);
  assert.strictEqual(page.data.isOwner, false, '买家视角非属主');
  base = before();
  page.openNumPicker();
  page.onNumPlus();
  assert.strictEqual(page.data.num, 1, '库存 1 时步进封顶');
  page.addToCart();
  await waitRequests(base, 1, 'detail 加购');
  await shim.settle(() => state.modals.length > 0 && state.modals[state.modals.length - 1].title === '已加入购物车');
  assertContract(state.requests.slice(base), 'detail(addCart)');
  assert.ok(auth.getUserId() !== null, '登录上下文含 userId');

  // ========== 购物车 ==========
  cfg = load('cart');
  page = shim.createPage(cfg);
  page.onShow();
  await shim.settle(() => page.data.items.length === 1 && page.data.totalPrice !== '0.00');
  assertContract(state.requests.slice(-1), 'cart(load)');
  // 步进封顶：库存 1 时 onPlus 不发请求
  base = before();
  page.onPlus({ currentTarget: { dataset: { index: 0 } } });
  assert.strictEqual(state.requests.length, base, '库存上限时不发请求');
  // 移除（即时生效）
  base = before();
  page.onRemove({ currentTarget: { dataset: { index: 0 } } });
  await waitRequests(base, 1, 'cart 移除');
  await shim.settle(() => page.data.items.length === 0);
  assertContract(state.requests.slice(base), 'cart(remove)');
  // 再加购商品 1（数量 2）用于步进与结算
  const dp = shim.createPage(load('detail'));
  dp.onLoad({ id: '1' });
  await shim.settle(() => !!dp.data.goods);
  dp.openNumPicker();
  dp.onNumPlus();
  assert.strictEqual(dp.data.num, 2, '步进 +1');
  base = before();
  dp.addToCart();
  await waitRequests(base, 1, 'detail 加购商品1');
  // 购物车重新加载
  page.onShow();
  await shim.settle(() => page.data.items.length === 1 && page.data.items[0].goodsId === 1);
  base = before();
  page.onPlus({ currentTarget: { dataset: { index: 0 } } });
  await waitRequests(base, 1, 'cart 步进 +1');
  await shim.settle(() => page.data.items[0].num === 3);
  assertContract(state.requests.slice(base), 'cart(put)');
  assert.strictEqual(page.data.items[0].num, 3);
  // 步进 -1 ×2 → 数量 1（保留库存，避免整件售出；串行等待避免读到旧值）
  base = before();
  page.onMinus({ currentTarget: { dataset: { index: 0 } } });
  await shim.settle(() => page.data.items[0].num === 2);
  page.onMinus({ currentTarget: { dataset: { index: 0 } } });
  await waitRequests(base, 2, 'cart 步进 -2');
  await shim.settle(() => page.data.items[0].num === 1);
  assertContract(state.requests.slice(base), 'cart(put minus)');
  // 勾选与全选
  page.onToggleAll();
  assert.strictEqual(page.data.selectedCount, 0, '全不选后 0 件');
  page.onToggleAll();
  assert.ok(page.data.selectedCount >= 1, '全选后可结算');
  page.checkout();
  assert.ok(Array.isArray(wx.getStorageSync('checkoutItems')) && wx.getStorageSync('checkoutItems').length === 1, '结算清单写入存储');
  assert.ok(state.navigations.some((n) => n.url.indexOf('order-confirm') !== -1), '去结算跳确认订单页');

  // ========== 确认订单（购物车结算） → 支付 ==========
  cfg = load('orderConfirm');
  page = shim.createPage(cfg);
  page.onLoad({ source: 'cart' });
  assert.strictEqual(page.data.items.length, 1, '结算清单 1 件');
  assert.strictEqual(page.data.totalPrice, '15.00', '合计 15×1=15');
  page.setData({ remark: '放宿舍楼下快递柜' });
  base = before();
  page.openSubmitConfirm(); // modal 自动确认 → submit
  await waitRequests(base, 1, 'order-confirm 下单');
  await shim.settle(() => page.data.showPay === true);
  assertContract(state.requests.slice(base), 'order-confirm(create)');
  assert.ok(page.data.payOrders[0].orderNo, '支付弹层携带订单号');
  base = before();
  page.confirmPay();
  await shim.settle(() => state.requests.length >= base + 1 && page.data.showPay === false, 5000);
  assertContract(state.requests.slice(base), 'order-confirm(pay)');
  await shim.settle(() => state.navigations.some((n) => n.type === 'redirectTo' && n.url.indexOf('order-list') !== -1), 5000);
  assert.ok(state.navigations.some((n) => n.type === 'redirectTo' && n.url.indexOf('order-list') !== -1), '支付后跳订单列表');

  // ========== 确认订单（直购） → 重复下单 409 → 取消原订单后重新下单 ==========
  wx.setStorageSync('directBuy', { goodsId: 3, title: '捷安特山地自行车，毕业急出', unitPrice: 260, num: 1, stock: 1 });
  const oc1 = shim.createPage(load('orderConfirm'));
  oc1.onLoad({ source: 'direct' });
  assert.strictEqual(oc1.data.items.length, 1, '直购清单 1 件');
  base = before();
  oc1.openSubmitConfirm();
  await shim.settle(() => oc1.data.showPay === true);
  assertContract(state.requests.slice(base), 'order-confirm(direct create)');
  // 同商品再下一单 → 409 → modal 分支"取消原订单后重新下单"
  // modalConfirmQueue：第 1 个 modal（提交订单确认）= 确认；第 2 个（重复下单引导）= 取消原订单
  state.modalConfirmQueue = [true, false];
  base = before();
  const oc2 = shim.createPage(load('orderConfirm'));
  oc2.onLoad({ source: 'direct' });
  oc2.openSubmitConfirm();
  await shim.settle(() => oc2.data.showPay === true, 5000);
  const dupRecords = state.requests.slice(base);
  assert.ok(dupRecords.some((r) => r.method === 'POST' && /\/orders$/.test(r.path)), '重复下单发出 POST /orders');
  assert.ok(dupRecords.some((r) => r.method === 'POST' && /\/orders\/\d+\/cancel$/.test(r.path)), '取消原订单被调用');
  assert.ok(dupRecords.filter((r) => r.method === 'POST' && /\/orders$/.test(r.path)).length >= 2, '取消原订单后重新下单');
  assertContract(dupRecords, 'order-confirm(dup 409)');
  state.modalConfirmQueue.length = 0;
  // 清理：支付 oc2 的新订单（oc1 的原订单已在重复下单分支中被取消）
  await api.post('/orders/' + oc2.data.payOrders[0].orderNo + '/pay');

  // ========== 订单列表 ==========
  cfg = load('orderList');
  page = shim.createPage(cfg);
  base = before();
  page.onLoad({ tab: 'paid' });
  page.onShow();
  await shim.settle(() => page.data.loaded && page.data.list.length >= 1);
  assertContract(state.requests.slice(base), 'order-list(load)');
  assert.strictEqual(page.data.tabIndex, 2, '支付成功跳入停在已支付 Tab');
  // 已完成的订单（cart 流程支付那笔已确认？未确认——先确认收货）
  const paidIdx = page.data.list.findIndex((o) => o.status === '已支付');
  assert.ok(paidIdx !== -1, '存在已支付订单');
  base = before();
  page.confirmOrder({ currentTarget: { dataset: { index: paidIdx } } });
  await waitRequests(base, 1, 'order-list 确认收货');
  assertContract(state.requests.slice(base), 'order-list(confirm)');
  // 详情时间线
  base = before();
  page.openDetail({ currentTarget: { dataset: { orderno: page.data.list[0].orderNo } } });
  await shim.settle(() => !!page.data.detailOrder);
  assertContract(state.requests.slice(base), 'order-list(detail)');
  assert.ok(page.data.detailTimeline.length >= 1, '时间线渲染数据就绪');
  page.closeDetail();
  // 本页订单号筛选
  page.setData({ orderNoFilter: String(page.data.list[0].orderNo).slice(-3) });
  page.applyFilter();
  assert.strictEqual(page.data.visibleList.length, 1, '订单号筛选命中 1 条');

  // ========== 个人中心 ==========
  cfg = load('profile');
  page = shim.createPage(cfg);
  page.onShow();
  await shim.settle(() => page.data.logged === true && !!page.data.me);
  assertContract(state.requests.slice(-1), 'profile(load)');
  base = before();
  page.setData({ nickname: '测试买家改' });
  page.saveProfile();
  await waitRequests(base, 2, 'profile 保存（put+刷新）');
  assertContract(state.requests.slice(base), 'profile(save)');
  base = before();
  page.setData({ oldPassword: 'User123456', newPassword: 'User12345x', confirmPassword: 'User12345x' });
  page.changePassword();
  await waitRequests(base, 1, 'profile 改密');
  await shim.settle(() => page.data.changingPwd === false); // 等待提交态复位
  assertContract(state.requests.slice(base), 'profile(password)');
  page.setData({ oldPassword: 'User12345x', newPassword: 'User123456', confirmPassword: 'User123456' });
  base = before();
  page.changePassword(); // 改回原密码，供后续使用
  await waitRequests(base, 1, 'profile 改回密码');
  assertContract(state.requests.slice(base), 'profile(password revert)');
  // 头像上传（wx.uploadFile → POST /users/me/avatar）
  base = uploadsBefore();
  page.chooseAvatar();
  await shim.settle(() => state.uploads.length >= base + 1);
  assert.ok(state.uploads.some((u) => u.path === '/users/me/avatar'), '头像上传调用 POST /users/me/avatar');
  // 退出登录
  base = before();
  page.logout();
  await shim.settle(() => page.data.logged === false && auth.isLoggedIn() === false, 5000);
  assert.ok(state.requests.slice(base).some((r) => r.method === 'POST' && /\/auth\/logout$/.test(r.path)), '退出调用 POST /auth/logout');
  assert.strictEqual(auth.isLoggedIn(), false, '退出后清 Token');
  // 重新登录（买家），供注册页流程使用
  auth.setToken((await api.post('/auth/login', { phone: '13800000002', password: 'User123456', loginType: 'PASSWORD' })).token);

  // ========== 注册页 ==========
  cfg = load('register');
  page = shim.createPage(cfg);
  base = before();
  page.setData({ phone: '13900003333' });
  const modalCount = state.modals.length;
  page.sendSms();
  await waitRequests(base, 1, 'register 发码');
  assertContract(state.requests.slice(base), 'register(sms-code)');
  const regCode = await lastModalDevCode(modalCount);
  page.setData({ phone: '13900003333', smsCode: regCode, password: 'Test1234abcd', confirmPassword: 'Test1234abcd', agreed: true });
  base = before();
  page.submit();
  await shim.settle(() => state.navigations.some((n) => n.type === 'switchTab'), 5000);
  assertContract(state.requests.slice(base), 'register(submit)');
  assert.ok(state.navigations.some((n) => n.type === 'switchTab' && n.url.indexOf('goods/list') !== -1), '注册成功自动登录进首页');
  auth.clearToken();
  auth.setToken((await api.post('/auth/login', { phone: '13800000002', password: 'User123456', loginType: 'PASSWORD' })).token);

  // ========== 找回密码页 ==========
  cfg = load('findpwd');
  page = shim.createPage(cfg);
  base = before();
  page.setData({ phone: '13800000003' });
  const fpModalCount = state.modals.length;
  page.sendSms();
  await waitRequests(base, 1, 'findpwd 发码');
  const fpCode = await lastModalDevCode(fpModalCount);
  page.setData({ phone: '13800000003', smsCode: fpCode, newPassword: 'User123456', confirmPassword: 'User123456' });
  base = before();
  page.submit();
  await waitRequests(base, 1, 'findpwd 提交');
  assertContract(state.requests.slice(base), 'findpwd(submit)');

  // ========== 发布页（新建：上传图片 → 分类级联 → 提交审核） ==========
  cfg = load('publish');
  page = shim.createPage(cfg);
  page.onLoad({});
  await shim.settle(() => page.data.categoryTree.length > 0);
  assertContract(state.requests.slice(-2), 'publish(categories)');
  base = uploadsBefore();
  page.chooseImage(); // chooseMedia shim 默认返回 1 张
  await shim.settle(() => page.data.images.length >= 1 && !page.data.uploading, 5000);
  assert.ok(page.data.images.length >= 1, '九宫格选图上传成功');
  assert.ok(state.uploads.slice(base).some((u) => u.path === '/goods/images'), '上传调用 POST /goods/images');
  // 再传一张并删除 → 覆盖 DELETE /goods/images/{imageId}
  page.chooseImage();
  await shim.settle(() => page.data.images.length >= 2 && !page.data.uploading, 5000);
  base = before();
  page.removeImage({ currentTarget: { dataset: { index: page.data.images.length - 1 } } });
  await shim.settle(() => page.data.images.length === 1 && state.requests.length >= base + 1, 5000);
  assert.ok(state.requests.slice(base).some((r) => r.method === 'DELETE' && /^\/goods\/images\/\d+$/.test(r.path)), '删除未发布图片调用 DELETE /goods/images/{imageId}');
  assertContract(state.requests.slice(base), 'publish(removeImage)');
  page.setData({
    title: '九成新台灯几乎全新',
    price: '29.9', negotiable: true, stock: '1',
    description: '宿舍台灯九成新，无维修历史，附原装电源线，校内可面交自提。'
  });
  page.onTopCategoryChange({ detail: { value: 3 } }); // 生活用品
  page.onSecondCategoryChange({ detail: { value: 1 } }); // 小家电
  assert.strictEqual(page.currentCategoryId(), 31, '分类级联定位二级分类 id');
  base = before();
  page.openConfirm(); // 校验通过 → 显示二次确认弹层（WXML 弹层，非 wx.showModal）
  assert.ok(page.data.showConfirm === true, '二次确认弹层出现');
  page.submit(); // 弹层"确定"按钮
  await shim.settle(() => state.requests.length >= base + 1, 5000);
  assertContract(state.requests.slice(base), 'publish(create)');
  assert.ok(state.requests.slice(base).some((r) => r.method === 'POST' && /\/goods$/.test(r.path)), '发布调用 POST /goods');

  // 切换卖家账号：编辑 + 我的商品（状态 Tab/下架/重新上架）
  auth.clearToken();
  auth.setToken((await api.post('/auth/login', { phone: '13800000003', password: 'User123456', loginType: 'PASSWORD' })).token);

  // ========== 发布页（编辑模式：预填 + PUT /goods/{id}） ==========
  cfg = load('publish');
  page = shim.createPage(cfg);
  page.onLoad({ id: '1' });
  await shim.settle(() => !!page.data.editId && page.data.title.length > 0);
  assert.strictEqual(page.data.editStatus, '在售', '编辑模式预填状态');
  page.setData({ price: '16.5' });
  base = before();
  page.openConfirm();
  page.submit();
  await shim.settle(() => state.requests.length >= base + 1, 5000);
  assertContract(state.requests.slice(base), 'publish(edit)');
  assert.ok(state.requests.slice(base).some((r) => r.method === 'PUT' && /^\/goods\/\d+$/.test(r.path)), '编辑调用 PUT /goods/{id}');

  // ========== 我的商品 ==========
  cfg = load('mine');
  page = shim.createPage(cfg);
  page.onShow();
  await shim.settle(() => page.data.loaded && page.data.list.length >= 2);
  assertContract(state.requests.slice(-1), 'mine(load)');
  base = before();
  page.onTabChange({ detail: { value: 1 } }); // 在售
  await shim.settle(() => page.data.list.every((g) => g.status === '在售') && page.data.list.length >= 2, 5000);
  assertContract(state.requests.slice(base), 'mine(tab)');
  const saleIdx = page.data.list.findIndex((g) => g.status === '在售');
  base = before();
  page.offShelf({ currentTarget: { dataset: { index: saleIdx } } }); // modal 自动确认
  await shim.settle(() => state.requests.length >= base + 1, 5000);
  assertContract(state.requests.slice(base), 'mine(offShelf)');
  await shim.settle(() => page.data.list.some((g) => g.status === '已下架') || true, 100);
  // 下架后当前"在售"Tab 看不到该商品 → 切回"全部"验证状态
  page.onTabChange({ detail: { value: 0 } });
  await shim.settle(() => page.data.list.some((g) => g.status === '已下架'), 5000);
  const offIdx = page.data.list.findIndex((g) => g.status === '已下架');
  assert.ok(offIdx !== -1, '下架商品出现在全部列表');
  base = before();
  page.reList({ currentTarget: { dataset: { index: offIdx } } });
  await shim.settle(() => state.requests.length >= base + 1, 5000);
  assertContract(state.requests.slice(base), 'mine(reList)');

  // ========== Agent 对话页 ==========
  cfg = load('agent');
  page = shim.createPage(cfg);
  page.onShow();
  base = before();
  page.setData({ inputValue: '帮我找 50 元以内的教材' });
  page.send();
  await shim.settle(() => page.data.messages.length >= 3 && page.data.sending === false, 5000);
  assertContract(state.requests.slice(base), 'agent(chat)');
  assert.strictEqual(page.data.messages[page.data.messages.length - 1].skillName, 'SK-001', '回复携带 skillName');
  assert.ok(page.data.messages[page.data.messages.length - 1].text.length > 0, 'Agent 回复非空');

  // ========== 契约断言汇总 ==========
  if (errors.length > 0) {
    throw new Error('页面请求契约偏差 ' + errors.length + ' 处：\n' + errors.join('\n'));
  }
  // 不在此处 reset：run.js 需要读取 requests 统计端点覆盖率
  return '12 个页面全部加载并驱动，发出的请求与 design/api-*.md 零偏差';
};
