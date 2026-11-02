// tests/smoke-live.js · 真机后端冒烟：直连 SpringBoot :8080 验证请求报文正确性（只读流程）
// 运行：node miniprogram/tests/smoke-live.js [baseUrl]（默认 http://127.0.0.1:8080/api/v1）
// 流程：登录种子账号 → 个人资料 → 分类树 → 商品列表 → 商品详情（全程不产生业务数据变更）。
'use strict';
const assert = require('assert');
const fs = require('fs');
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

  // 6. v2.1 增强：热度排序 + urgent/viewCount/cartCount/freight 字段
  auth.setToken(login.token);
  const hot = await api.get('/goods', { data: { page: 1, pageSize: 10, sort: 'hot' } });
  assert.ok(typeof hot.total === 'number' && Array.isArray(hot.list), 'sort=hot 分页结构正确');
  if (hot.list.length > 0) {
    const g = hot.list[0];
    assert.ok(typeof g.viewCount === 'number' && typeof g.cartCount === 'number' &&
      typeof g.freight === 'number' && typeof g.urgent === 'boolean', '列表项含 urgent/viewCount/cartCount/freight');
    console.log('✓ GET /goods?sort=hot → 首位「' + g.title + '」urgent=' + g.urgent +
      ' 浏览=' + g.viewCount + ' 加购=' + g.cartCount + ' 运费=' + g.freight);
  } else {
    console.log('… GET /goods?sort=hot → 列表为空，跳过字段断言');
  }
  if (list.list.length > 0) {
    const d1 = await api.get('/goods/' + list.list[0].id);
    assert.ok(typeof d1.freight === 'number' && typeof d1.viewCount === 'number' &&
      typeof d1.cartCount === 'number' && typeof d1.urgent === 'boolean', '详情含 urgent/viewCount/cartCount/freight');
    console.log('✓ GET /goods/{id} → 热度/运费字段就绪（浏览 ' + d1.viewCount + '/加购 ' + d1.cartCount + '/运费 ' + d1.freight + '）');
  }

  // 7. v2.1 AI：SK-005 买前建议 / SK-006 下单草稿 / SK-007 识图
  // 生成真实 PNG fixture（≥14px，纯色商品底图；视觉 LLM 对纯色图如实返回引导话术也算通过）
  if (!fs.existsSync('/tmp/smoke-vision.png')) {
    const zlib = require('zlib');
    function crc32(buf) {
      let c, crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        c = (crc ^ buf[i]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
      }
      return (crc ^ 0xffffffff) >>> 0;
    }
    function chunk(type, data) {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    }
    const w = 32, h = 32;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, [70, 130, 180])])));
    fs.writeFileSync('/tmp/smoke-vision.png',
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  }
  const chat5 = await api.post('/agent/chat', { prompt: '高等数学教材 第七版 值不值得买', requestId: api.genRequestId() });
  assert.strictEqual(chat5.skillName, 'SK-005', '买前建议命中 SK-005');
  console.log('✓ POST /agent/chat → SK-005 买前建议');
  const chat6 = await api.post('/agent/chat', { prompt: '帮我下单买 AirPods Pro 一代', requestId: api.genRequestId() });
  assert.strictEqual(chat6.skillName, 'SK-006', '下单指令命中 SK-006');
  assert.ok(chat6.draft && chat6.draft.goodsId && chat6.draft.num >= 1 &&
    typeof chat6.draft.totalAmount === 'number', 'SK-006 返回 data.draft 草稿');
  console.log('✓ POST /agent/chat → SK-006 下单草稿（商品 ' + chat6.draft.goodsId +
    ' ×' + chat6.draft.num + ' 合计 ¥' + chat6.draft.totalAmount + '，真实下单须用户确认）');
  const vision = await api.upload('/agent/describe-image', '/tmp/smoke-vision.png');
  assert.ok(vision.title && vision.description && vision.categoryHint && Array.isArray(vision.tags), '识图返回标题/描述/分类提示/标签');
  console.log('✓ POST /agent/describe-image → title=' + vision.title + ' categoryHint=' + vision.categoryHint);

  // 8. 订单运费字段（软校验：仅当后端已有历史订单时核对）
  const orders = await api.get('/orders', { data: { page: 1, pageSize: 5 } });
  if (orders.list.length > 0) {
    const o = orders.list[0];
    assert.ok(typeof o.freightAmount === 'number' && typeof o.totalAmount === 'number', '订单列表含 freightAmount/totalAmount');
    console.log('✓ GET /orders → freightAmount=' + o.freightAmount + ' totalAmount=' + o.totalAmount);
  } else {
    console.log('… GET /orders → 无历史订单，跳过运费字段核对');
  }

  // 9. 无效 Token → 401
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
