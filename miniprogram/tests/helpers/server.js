// tests/helpers/server.js · Node 契约后端（按 design/api-*.md 实现，供小程序端到端验证）
// SpringBoot 未就绪时以本服务验证请求报文与解包逻辑；BASE_URL 可切换到真实后端。
'use strict';
const http = require('http');
const { URL } = require('url');

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function now() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function maskPhone(phone) {
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

function createServer(port) {
  const state = {
    users: [], // {userId, phone, password, nickname, avatar, role, status, signature, createTime}
    sessions: new Map(), // token -> userId
    sms: new Map(), // phone -> {code, scene, lastRequestAt}
    categories: [],
    goods: [],
    images: new Map(), // imageId -> {imageId, url, goodsId(null=未发布)}
    carts: new Map(), // userId -> Map(goodsId -> num)
    orders: [],
    agentLogs: [],
    counters: { userId: 100, goodsId: 1000, imageId: 5000, orderNo: 1 },
    requestIds: new Map(), // 发布幂等：requestId -> result
    loginFails: new Map() // phone -> 连续错误次数
  };

  // —— 种子数据 ——
  function seed() {
    const mk = (phone, password, nickname, role) => ({
      userId: ++state.counters.userId,
      phone: phone,
      password: password,
      nickname: nickname,
      avatar: '',
      role: role,
      status: 'ACTIVE',
      signature: '',
      createTime: '2026-10-01 09:00:00'
    });
    state.users.push(mk('13800000001', 'Admin123456', '平台管理员', 'ADMIN'));
    state.users.push(mk('13800000002', 'User123456', '用户0002', 'USER'));
    state.users.push(mk('13800000003', 'User123456', '用户0003', 'USER'));

    state.categories = [
      { id: 1, name: '教材书籍', parentId: 0, sort: 1, children: [
        { id: 11, name: '专业课教材', sort: 1 },
        { id: 12, name: '考研考公', sort: 2 },
        { id: 13, name: '课外读物', sort: 3 }
      ] },
      { id: 2, name: '数码电子', parentId: 0, sort: 2, children: [
        { id: 21, name: '手机', sort: 1 },
        { id: 22, name: '电脑', sort: 2 }
      ] },
      { id: 3, name: '生活用品', parentId: 0, sort: 3, children: [
        { id: 31, name: '小家电', sort: 1 }
      ] },
      { id: 4, name: '运动户外', parentId: 0, sort: 4, children: [
        { id: 41, name: '自行车', sort: 1 }
      ] }
    ];

    const seller = state.users[2];
    const mkGoods = (id, title, desc, price, categoryId, categoryName, stock) => ({
      id: id,
      title: title,
      description: desc,
      price: price,
      negotiable: false,
      stock: stock,
      status: '在售',
      images: [{ url: '/static/goods-' + id + '.png', sort: 1 }],
      categoryId: categoryId,
      categoryName: categoryName,
      categoryPath: [categoryName.split('/')[0], categoryName.split('/')[1]],
      userId: seller.userId,
      seller: { uid: seller.userId, nickname: seller.nickname },
      createTime: '2026-10-20 10:00:00',
      offShelfReason: null
    });
    state.goods.push(mkGoods(1, '《数据结构（C语言版）》教材，九成新', '大二上学期用书，无笔记无划线，封皮轻微磨损，校内面交优先。', 15.00, 11, '教材书籍/专业课教材', 3));
    state.goods.push(mkGoods(2, '小米台灯 Pro，宿舍自用转让', '宿舍自用一年，功能完好，附原装电源线。', 39.00, 31, '生活用品/小家电', 1));
    state.goods.push(mkGoods(3, '捷安特山地自行车，毕业急出', '毕业急出，刹车已保养，可直接骑行。', 260.00, 41, '运动户外/自行车', 1));
  }
  seed();

  // —— 响应工具 ——
  function send(res, code, msg, data) {
    const body = JSON.stringify({ code: code, msg: msg, data: data === undefined ? null : data });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }
  const ok = (res, data, msg) => send(res, 0, msg || 'success', data);
  const fail = (res, code, msg, data) => send(res, code, msg, data);

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  function parseMultipart(buffer, contentType) {
    const m = /boundary=(.+)$/.exec(contentType || '');
    if (!m) { return {}; }
    const boundary = Buffer.from('--' + m[1]);
    const parts = [];
    let start = buffer.indexOf(boundary);
    while (start !== -1) {
      const next = buffer.indexOf(boundary, start + boundary.length);
      if (next === -1) { break; }
      parts.push(buffer.slice(start + boundary.length + 2, next - 2));
      start = next;
    }
    const fields = {};
    let hasFile = false;
    parts.forEach((p) => {
      const sep = p.indexOf('\r\n\r\n');
      if (sep === -1) { return; }
      const head = p.slice(0, sep).toString();
      if (/filename="/.test(head)) { hasFile = true; }
      const nameMatch = /name="([^"]+)"/.exec(head);
      if (nameMatch) { fields[nameMatch[1]] = p.slice(sep + 4).toString(); }
    });
    fields.__hasFile__ = hasFile;
    return fields;
  }

  // —— 鉴权 ——
  function currentUser(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) { return null; }
    const uid = state.sessions.get(m[1]);
    if (uid === undefined) { return null; }
    return state.users.find((u) => u.userId === uid) || null;
  }
  const PUBLIC_PATHS = ['/auth/sms-code', '/auth/register', '/auth/login', '/auth/find-password'];

  // —— 校验工具 ——
  const isValidPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 20 && /[a-zA-Z]/.test(p) && /\d/.test(p);

  function goodsListItem(g) {
    return { id: g.id, title: g.title, price: g.price, mainImage: g.images[0] ? g.images[0].url : '', categoryName: g.categoryName, stock: g.stock, createTime: g.createTime };
  }
  function findCategory(id) {
    let name = '';
    let pathArr = [];
    for (const top of state.categories) {
      if (top.id === id) { return { id: top.id, name: top.name, path: [top.name] }; }
      for (const child of top.children || []) {
        if (child.id === id) { return { id: child.id, name: child.name, path: [top.name, child.name] }; }
      }
    }
    return null;
  }

  // —— 路由 ——
  const routes = [];

  function route(method, pattern, handler) {
    // pattern: /goods/:id/off-shelf
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    routes.push({ method: method, regex: regex, keys: keys, handler: handler });
  }

  // ---- 用户及权限模块（api-用户及权限.md） ----
  route('POST', '/auth/sms-code', async (req, res, params, body, user, query) => {
    const { phone, scene } = body;
    if (!/^1\d{10}$/.test(phone || '') || ['REGISTER', 'LOGIN', 'FIND_PWD'].indexOf(scene) === -1) {
      return fail(res, 400, '参数非法：phone 或 scene');
    }
    const prev = state.sms.get(phone);
    if (prev && Date.now() - prev.lastRequestAt < 60 * 1000) {
      return fail(res, 429, '请求过于频繁，60 秒内仅可获取一次');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    state.sms.set(phone, { code: code, scene: scene, lastRequestAt: Date.now() });
    // dev 模式：data 附 devCode
    ok(res, { devCode: code }, '验证码已发送');
  });

  function verifySms(phone, code, scene) {
    const rec = state.sms.get(phone);
    return rec && rec.code === String(code) && rec.scene === scene && Date.now() - rec.lastRequestAt < 5 * 60 * 1000;
  }

  route('POST', '/auth/register', async (req, res, params, body) => {
    const { phone, smsCode, password, confirmPassword } = body;
    if (!/^1\d{10}$/.test(phone || '') || !smsCode || !isValidPassword(password)) {
      return fail(res, 400, '参数非法：手机号/验证码/密码（8-20 位含字母数字）');
    }
    if (password !== confirmPassword) { return fail(res, 400, '两次密码不一致'); }
    if (state.users.find((u) => u.phone === phone)) { return fail(res, 409, '手机号已注册'); }
    if (!verifySms(phone, smsCode, 'REGISTER')) { return fail(res, 400, '验证码错误或过期'); }
    state.sms.delete(phone);
    const user = {
      userId: ++state.counters.userId, phone: phone, password: password,
      nickname: '用户' + phone.slice(-4), avatar: '', role: 'USER', status: 'ACTIVE',
      signature: '', createTime: now()
    };
    state.users.push(user);
    const token = 'tok-' + user.userId + '-' + Math.random().toString(36).slice(2);
    state.sessions.set(token, user.userId);
    ok(res, { userId: user.userId, token: token }, '注册成功');
  });

  route('POST', '/auth/login', async (req, res, params, body) => {
    const { phone, password, smsCode, loginType } = body;
    const user = state.users.find((u) => u.phone === phone);
    if (!user) { return fail(res, 400, '手机号或密码错误'); }
    if (user.status === 'BANNED') { return fail(res, 423, '账号已被封禁（演示：违规发布商品），如有疑问请申诉'); }
    if (loginType === 'SMS') {
      if (!verifySms(phone, smsCode, 'LOGIN')) { return fail(res, 400, '验证码错误或过期'); }
      state.sms.delete(phone);
    } else {
      if (user.password !== password) {
        const fails = (state.loginFails.get(phone) || 0) + 1;
        state.loginFails.set(phone, fails);
        if (fails >= 5) { return fail(res, 423, '密码连续错误 5 次，账号锁定 30 分钟'); }
        return fail(res, 400, '手机号或密码错误');
      }
      state.loginFails.delete(phone);
    }
    const token = 'tok-' + user.userId + '-' + Math.random().toString(36).slice(2);
    state.sessions.set(token, user.userId);
    ok(res, { token: token, expiresIn: 7200, role: user.role, status: user.status }, '登录成功');
  });

  route('POST', '/auth/logout', async (req, res, params, body, user) => {
    const m = /^(Bearer .+)$/.exec(req.headers.authorization || '');
    if (m) {
      const token = m[1].slice(7);
      state.sessions.delete(token);
    }
    ok(res, null, '已退出登录');
  });

  route('POST', '/auth/find-password', async (req, res, params, body) => {
    const { phone, smsCode, newPassword } = body;
    if (!isValidPassword(newPassword)) { return fail(res, 400, '新密码须 8-20 位含字母数字'); }
    if (!verifySms(phone, smsCode, 'FIND_PWD')) { return fail(res, 400, '验证码错误或过期'); }
    const user = state.users.find((u) => u.phone === phone);
    if (!user) { return fail(res, 404, '账号不存在'); }
    state.sms.delete(phone);
    user.password = newPassword;
    // 旧会话全部失效
    for (const [token, uid] of state.sessions) {
      if (uid === user.userId) { state.sessions.delete(token); }
    }
    ok(res, null, '密码已重置，请重新登录');
  });

  route('GET', '/users/me', async (req, res, params, body, user) => {
    ok(res, {
      userId: user.userId, phone: maskPhone(user.phone), nickname: user.nickname,
      avatar: user.avatar, role: user.role, status: user.status,
      signature: user.signature, createTime: user.createTime
    });
  });

  route('PUT', '/users/me', async (req, res, params, body, user) => {
    const { nickname, avatar, signature } = body;
    if (nickname !== undefined && (typeof nickname !== 'string' || nickname.length < 2 || nickname.length > 20)) {
      return fail(res, 400, '昵称须 2-20 字符');
    }
    if (nickname !== undefined) { user.nickname = nickname; }
    if (avatar !== undefined) { user.avatar = avatar; }
    if (signature !== undefined) { user.signature = signature; }
    ok(res, { nickname: user.nickname, avatar: user.avatar }, '资料已保存');
  });

  route('PUT', '/users/me/password', async (req, res, params, body, user) => {
    const { oldPassword, newPassword } = body;
    if (user.password !== oldPassword) { return fail(res, 400, '原密码错误'); }
    if (!isValidPassword(newPassword)) { return fail(res, 400, '新密码须 8-20 位含字母数字'); }
    user.password = newPassword;
    // 其他会话失效（保留当前会话）
    ok(res, null, '密码已修改');
  });

  route('POST', '/users/me/avatar', async (req, res, params, body, user) => {
    const url = '/static/avatar-' + user.userId + '.png';
    user.avatar = url;
    ok(res, { avatarUrl: url }, '头像已更新');
  });

  // ---- 商品发布模块（api-商品发布.md） ----
  route('GET', '/categories', async (req, res, params, body, user, query) => {
    if (query.parentId) {
      const top = state.categories.find((c) => String(c.id) === String(query.parentId));
      return ok(res, top ? [top] : []);
    }
    ok(res, state.categories);
  });

  route('GET', '/goods', async (req, res, params, body, user, query) => {
    let list = state.goods.filter((g) => g.status === '在售');
    if (query.categoryId) {
      const cat = findCategory(Number(query.categoryId));
      list = list.filter((g) => cat && (g.categoryId === cat.id || (cat.path.length === 1 && g.categoryPath[0] === cat.name)));
    }
    if (query.keyword) {
      const kw = String(query.keyword);
      list = list.filter((g) => g.title.indexOf(kw) !== -1 || g.description.indexOf(kw) !== -1);
    }
    const sort = String(query.sort || '');
    if (sort === 'price,asc') { list.sort((a, b) => a.price - b.price || b.id - a.id); }
    else if (sort === 'price,desc') { list.sort((a, b) => b.price - a.price || b.id - a.id); }
    else { list.sort((a, b) => (a.createTime < b.createTime ? 1 : a.createTime > b.createTime ? -1 : b.id - a.id)); }
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
    const slice = list.slice((page - 1) * pageSize, page * pageSize).map(goodsListItem);
    ok(res, { list: slice, total: list.length, page: page, pageSize: pageSize });
  });

  route('GET', '/goods/mine', async (req, res, params, body, user, query) => {
    let list = state.goods.filter((g) => g.userId === user.userId);
    if (query.status) {
      const wanted = String(query.status).split(',');
      list = list.filter((g) => wanted.indexOf(g.status) !== -1);
    }
    list.sort((a, b) => (a.createTime < b.createTime ? 1 : -1));
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
    const slice = list.slice((page - 1) * pageSize, page * pageSize).map((g) => ({
      id: g.id, title: g.title, price: g.price, stock: g.stock, status: g.status,
      mainImage: g.images[0] ? g.images[0].url : '', offShelfReason: g.offShelfReason
    }));
    ok(res, { list: slice, total: list.length, page: page, pageSize: pageSize });
  });

  route('POST', '/goods/images', async (req, res, params, body) => {
    const imageId = ++state.counters.imageId;
    const url = '/static/img-' + imageId + '.png';
    state.images.set(imageId, { imageId: imageId, url: url, goodsId: null });
    ok(res, { imageId: imageId, url: url, width: 800, height: 600 });
  });

  route('DELETE', '/goods/images/:imageId', async (req, res, params) => {
    state.images.delete(Number(params.imageId));
    ok(res, null, '图片已删除');
  });

  route('POST', '/goods', async (req, res, params, body, user) => {
    const { title, categoryId, price, negotiable, stock, description, imageIds, requestId } = body;
    if (requestId && state.requestIds.has(requestId)) {
      return ok(res, state.requestIds.get(requestId), '重复请求已幂等处理');
    }
    if (typeof title !== 'string' || title.length < 5 || title.length > 40) { return fail(res, 400, '标题须 5-40 字'); }
    const cat = findCategory(Number(categoryId));
    if (!cat || cat.path.length !== 2) { return fail(res, 400, '必须挂到二级分类'); }
    if (!(typeof price === 'number' && price >= 0.01 && price <= 9999.00)) { return fail(res, 400, '价格须在 0.01-9999.00 之间'); }
    const stockN = Number(stock);
    if (!(Number.isInteger(stockN) && stockN >= 1 && stockN <= 99)) { return fail(res, 400, '库存须为 1-99'); }
    if (typeof description !== 'string' || description.length < 10 || description.length > 500) { return fail(res, 400, '描述须 10-500 字'); }
    if (!Array.isArray(imageIds) || imageIds.length < 1 || imageIds.length > 6) { return fail(res, 400, '图片须 1-6 张'); }
    const goods = {
      id: ++state.counters.goodsId,
      title: title, description: description, price: price, negotiable: !!negotiable,
      stock: stockN, status: '待审核',
      images: imageIds.map((id, i) => ({ url: (state.images.get(Number(id)) || {}).url || '/static/img-' + id + '.png', sort: i + 1 })),
      categoryId: cat.id, categoryName: cat.path.join('/'), categoryPath: cat.path,
      userId: user.userId, seller: { uid: user.userId, nickname: user.nickname },
      createTime: now(), offShelfReason: null
    };
    state.goods.push(goods);
    const result = { goodsId: goods.id, status: '待审核' };
    if (requestId) { state.requestIds.set(requestId, result); }
    ok(res, result, '已提交审核');
  });

  route('GET', '/goods/:id', async (req, res, params, body, user) => {
    const goods = state.goods.find((g) => g.id === Number(params.id));
    if (!goods) { return fail(res, 404, '商品不存在'); }
    const isOwner = user && user.userId === goods.userId;
    const isAdmin = user && user.role === 'ADMIN';
    if (goods.status !== '在售' && !isOwner && !isAdmin) { return fail(res, 404, '商品不存在'); }
    ok(res, {
      id: goods.id, title: goods.title, description: goods.description,
      price: goods.price, negotiable: goods.negotiable, stock: goods.stock,
      status: goods.status, images: goods.images.map((img) => ({ url: img.url, sort: img.sort })),
      categoryPath: goods.categoryPath, seller: { uid: goods.userId, nickname: goods.seller.nickname },
      createTime: goods.createTime, offShelfReason: goods.offShelfReason
    });
  });

  function requireOwnedGoods(res, params, user) {
    const goods = state.goods.find((g) => g.id === Number(params.id));
    if (!goods) { fail(res, 404, '商品不存在'); return null; }
    if (user.userId !== goods.userId) { fail(res, 403, '非资源属主'); return null; }
    return goods;
  }

  route('PUT', '/goods/:id', async (req, res, params, body, user) => {
    const goods = requireOwnedGoods(res, params, user);
    if (!goods) { return; }
    if (goods.status === '已售出' || goods.status === '已下架') { return fail(res, 409, '当前状态不允许编辑'); }
    const editable = ['title', 'categoryId', 'price', 'negotiable', 'stock', 'description'];
    editable.forEach((k) => { if (body[k] !== undefined) { goods[k] = body[k]; } });
    if (body.categoryId !== undefined) {
      const cat = findCategory(Number(body.categoryId));
      if (cat) { goods.categoryId = cat.id; goods.categoryName = cat.path.join('/'); goods.categoryPath = cat.path; }
    }
    goods.offShelfReason = null; // 按原因修改后可重新上架
    ok(res, { goodsId: goods.id, updateTime: now() }, '已保存');
  });

  route('POST', '/goods/:id/off-shelf', async (req, res, params, body, user) => {
    const goods = requireOwnedGoods(res, params, user);
    if (!goods) { return; }
    if (goods.status !== '在售') { return fail(res, 409, '仅"在售"商品可下架'); }
    goods.status = '已下架';
    ok(res, null, '已下架');
  });

  route('POST', '/goods/:id/re-list', async (req, res, params, body, user) => {
    const goods = requireOwnedGoods(res, params, user);
    if (!goods) { return; }
    if (goods.status !== '草稿' && goods.status !== '已下架') { return fail(res, 409, '仅草稿/已下架商品可重新上架'); }
    if (goods.offShelfReason) { return fail(res, 409, '管理员下架的商品，请先按原因修改商品'); }
    goods.status = '待审核';
    ok(res, { goodsId: goods.id, status: '待审核' }, '已重新提交审核');
  });

  // ---- 购物交易模块（api-购物交易.md） ----
  route('GET', '/cart', async (req, res, params, body, user) => {
    const cart = state.carts.get(user.userId) || new Map();
    const list = [];
    cart.forEach((num, goodsId) => {
      const g = state.goods.find((x) => x.id === goodsId);
      if (g) {
        list.push({ goodsId: g.id, title: g.title, mainImage: g.images[0] ? g.images[0].url : '', unitPrice: g.price, stock: g.stock, num: num });
      }
    });
    ok(res, { list: list, totalKinds: list.length });
  });

  route('POST', '/cart/items', async (req, res, params, body, user) => {
    const goods = state.goods.find((g) => g.id === Number(body.goodsId));
    if (!goods) { return fail(res, 404, '商品不存在'); }
    if (goods.status !== '在售') { return fail(res, 409, '商品已下架'); }
    const add = Math.max(1, Number(body.num) || 1);
    if (!state.carts.has(user.userId)) { state.carts.set(user.userId, new Map()); }
    const cart = state.carts.get(user.userId);
    if (!cart.has(goods.id) && cart.size >= 20) { return fail(res, 409, '购物车种类已达上限 20'); }
    const newNum = (cart.get(goods.id) || 0) + add;
    if (newNum > goods.stock) { return fail(res, 409, '库存不足'); }
    cart.set(goods.id, newNum);
    ok(res, { goodsId: goods.id, num: newNum, kinds: cart.size });
  });

  route('PUT', '/cart/items/:goodsId', async (req, res, params, body, user) => {
    const cart = state.carts.get(user.userId);
    const goodsId = Number(params.goodsId);
    if (!cart || !cart.has(goodsId)) { return fail(res, 404, '购物车中无该商品'); }
    const num = Number(body.num);
    if (!Number.isInteger(num) || num < 1) { return fail(res, 400, '数量须为正整数'); }
    const goods = state.goods.find((g) => g.id === goodsId);
    if (num > goods.stock) { return fail(res, 409, '库存不足'); }
    cart.set(goodsId, num);
    ok(res, { goodsId: goodsId, num: num, subtotal: +(goods.price * num).toFixed(2) });
  });

  route('DELETE', '/cart/items/:goodsId', async (req, res, params, body, user) => {
    const cart = state.carts.get(user.userId);
    const goodsId = Number(params.goodsId);
    if (cart) { cart.delete(goodsId); }
    ok(res, null, '已移除');
  });

  function orderTimes(o) {
    const t = { createTime: o.createTime };
    if (o.payTime) { t.payTime = o.payTime; }
    if (o.finishTime) { t.finishTime = o.finishTime; }
    if (o.cancelTime) { t.cancelTime = o.cancelTime; }
    if (o.status === '待支付') { t.expireAt = o.expireAt; }
    return t;
  }

  route('POST', '/orders', async (req, res, params, body, user) => {
    const { goodsId, num, remark, requestId } = body;
    const goods = state.goods.find((g) => g.id === Number(goodsId));
    if (!goods) { return fail(res, 404, '商品不存在'); }
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1) { return fail(res, 400, 'num 须为正整数'); }
    if (remark !== undefined && remark !== null && String(remark).length > 100) { return fail(res, 400, 'remark 不能超过 100 字'); }
    if (goods.status !== '在售') { return fail(res, 409, '商品已下架'); }
    if (n > goods.stock) { return fail(res, 409, '库存不足'); }
    const dup = state.orders.find((o) => o.buyerId === user.userId && o.goodsId === goods.id && o.status === '待支付');
    if (dup) { return fail(res, 409, '该商品已存在待支付订单', { existOrderNo: dup.orderNo }); }
    const orderNoPrefix = now().slice(0, 10).replace(/-/g, '');
    const order = {
      orderNo: orderNoPrefix + String(++state.counters.orderNo).padStart(5, '0'),
      buyerId: user.userId, sellerId: goods.userId, goodsId: goods.id,
      goodsTitle: goods.title, unitPrice: goods.price,
      dealPrice: +(goods.price * n).toFixed(2), num: n,
      remark: remark === undefined || remark === null ? '' : String(remark),
      status: '待支付', createTime: now(), expireAt: '2026-10-29 23:59:59',
      payTime: null, finishTime: null, cancelTime: null
    };
    state.orders.unshift(order);
    ok(res, { orderNo: order.orderNo, dealPrice: order.dealPrice, status: '待支付', expireAt: order.expireAt }, '下单成功');
  });

  function findOwnedOrder(res, orderNo, user) {
    const order = state.orders.find((o) => o.orderNo === orderNo);
    if (!order) { fail(res, 404, '订单不存在'); return null; }
    if (order.buyerId !== user.userId) { fail(res, 403, '非资源属主'); return null; }
    return order;
  }

  route('POST', '/orders/:orderNo/pay', async (req, res, params, body, user) => {
    const order = findOwnedOrder(res, params.orderNo, user);
    if (!order) { return; }
    if (order.status !== '待支付') { return fail(res, 409, '订单状态不允许该操作'); }
    order.status = '已支付';
    order.payTime = now();
    const goods = state.goods.find((g) => g.id === order.goodsId);
    if (goods) {
      goods.stock -= order.num;
      if (goods.stock <= 0) { goods.status = '已售出'; goods.stock = 0; }
    }
    ok(res, { orderNo: order.orderNo, status: '已支付', payTime: order.payTime }, '支付成功');
  });

  route('POST', '/orders/:orderNo/cancel', async (req, res, params, body, user) => {
    const order = findOwnedOrder(res, params.orderNo, user);
    if (!order) { return; }
    if (order.status !== '待支付') { return fail(res, 409, '订单状态不允许该操作'); }
    order.status = '已取消';
    order.cancelTime = now();
    ok(res, { orderNo: order.orderNo, status: '已取消' }, '已取消');
  });

  route('POST', '/orders/:orderNo/confirm', async (req, res, params, body, user) => {
    const order = findOwnedOrder(res, params.orderNo, user);
    if (!order) { return; }
    if (order.status !== '已支付') { return fail(res, 409, '订单状态不允许该操作'); }
    order.status = '已完成';
    order.finishTime = now();
    ok(res, { orderNo: order.orderNo, status: '已完成', finishTime: order.finishTime }, '交易完成');
  });

  route('GET', '/orders', async (req, res, params, body, user, query) => {
    let list = state.orders.filter((o) => o.buyerId === user.userId);
    if (query.status) { list = list.filter((o) => o.status === String(query.status)); }
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
    const slice = list.slice((page - 1) * pageSize, page * pageSize).map((o) => ({
      orderNo: o.orderNo, goodsTitle: o.goodsTitle, dealPrice: o.dealPrice,
      num: o.num, status: o.status, keyTimes: orderTimes(o)
    }));
    ok(res, { list: slice, total: list.length, page: page, pageSize: pageSize });
  });

  route('GET', '/orders/:orderNo', async (req, res, params, body, user) => {
    const order = state.orders.find((o) => o.orderNo === params.orderNo);
    if (!order) { return fail(res, 404, '订单不存在'); }
    if (order.buyerId !== user.userId && user.role !== 'ADMIN') { return fail(res, 403, '非资源属主'); }
    const timeline = [{ action: '下单', time: order.createTime }];
    if (order.payTime) { timeline.push({ action: '支付', time: order.payTime }); }
    if (order.finishTime) { timeline.push({ action: '完成', time: order.finishTime }); }
    if (order.cancelTime) { timeline.push({ action: '取消', time: order.cancelTime }); }
    ok(res, {
      orderNo: order.orderNo, status: order.status, dealPrice: order.dealPrice,
      num: order.num, remark: order.remark, timeline: timeline,
      buyerId: order.buyerId, sellerId: order.sellerId
    });
  });

  // ---- Agent（api-用户及权限.md #14，report §9） ----
  route('POST', '/agent/chat', async (req, res, params, body, user) => {
    const { prompt, requestId } = body;
    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 1000) {
      return fail(res, 4001, 'Agent 参数非法：prompt 须 1-1000 字');
    }
    let skillName = null;
    let reply = '';
    if (/删除|删了|下架所有|别人的订单|他人订单/.test(prompt)) {
      state.agentLogs.push({ userId: user.userId, prompt: prompt, skillName: null, status: 4003, time: now() });
      return fail(res, 4003, '该操作不在 Agent 可用范围内');
    }
    if (/润色|文案|分类推荐/.test(prompt)) {
      skillName = 'SK-002';
      reply = '【润色建议】' + prompt.replace(/^[\s\S]*?(描述|文案)[:：]?/, '').trim() + '（成色良好，校内面交，支持小刀，诚心要可细聊。）';
    } else if (/订单|支付了吗|发货/.test(prompt)) {
      skillName = 'SK-003';
      const mine = state.orders.filter((o) => o.buyerId === user.userId).slice(0, 3);
      reply = mine.length === 0
        ? '你目前没有订单记录。'
        : '你的最近订单：' + mine.map((o) => o.orderNo + '（' + o.goodsTitle + '，' + o.status + '）').join('；');
    } else {
      skillName = 'SK-001';
      const hits = state.goods.filter((g) => g.status === '在售').slice(0, 3);
      reply = '为你找到以下在售商品：' + hits.map((g) => '「' + g.title + '」¥' + g.price.toFixed(2)).join('、') + '。';
    }
    state.agentLogs.push({ userId: user.userId, prompt: prompt, skillName: skillName, status: 0, time: now() });
    ok(res, { reply: reply, skillName: skillName }, 'success');
  });

  // ---- HTTP 入口 ----
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const apiPath = u.pathname.replace(/^\/api\/v1/, '') || '/';
    const query = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });

    let body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const raw = await readBody(req);
      const ct = req.headers['content-type'] || '';
      if (ct.indexOf('multipart/form-data') !== -1) {
        body = parseMultipart(raw, ct);
      } else if (raw.length > 0) {
        try { body = JSON.parse(raw.toString()); } catch (e) { body = {}; }
      }
    } else if (req.method === 'DELETE') {
      const raw = await readBody(req);
      if (raw.length > 0) {
        try { body = JSON.parse(raw.toString()); } catch (e) { body = {}; }
      }
    }

    // 鉴权（公开路径除外；商品浏览类 GET 对游客开放，见 api-商品发布.md 允许角色"游客"）
    let user = null;
    const isPublicBrowse = req.method === 'GET' &&
      (apiPath === '/categories' || apiPath === '/goods' || /^\/goods\/\d+$/.test(apiPath));
    if (PUBLIC_PATHS.indexOf(apiPath) === -1 && !isPublicBrowse) {
      user = currentUser(req);
      if (!user) { return fail(res, 401, '未登录或登录已失效'); }
    }

    for (const r of routes) {
      if (r.method !== req.method) { continue; }
      const m = r.regex.exec(apiPath);
      if (!m) { continue; }
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      try {
        return await r.handler(req, res, params, body, user, query);
      } catch (e) {
        return fail(res, 5000, '服务器内部错误');
      }
    }
    return fail(res, 404, '接口不存在：' + req.method + ' ' + apiPath);
  });

  return {
    server: server,
    state: state,
    start: () => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server))),
    stop: () => new Promise((resolve) => server.close(resolve))
  };
}

module.exports = { createServer };
