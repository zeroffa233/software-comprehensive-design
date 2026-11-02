// tests/run.js · 测试入口：启动契约后端，依次运行全部测试并输出端点对照表
// 运行方式：node miniprogram/tests/run.js
'use strict';
const { createWxShim } = require('./helpers/wx-shim');
const { createServer } = require('./helpers/server');
const ENDPOINTS = require('./expected-endpoints');

const PORT = 18080;
const BASE = 'http://127.0.0.1:' + PORT + '/api/v1';
const TEST_FILES = ['test-request', 'test-flow', 'test-pages'];

function normalizePath(p) {
  return p
    .split('?')[0]
    .replace(/\{[a-zA-Z]+\}/g, '{p}')
    .replace(/\/\d+/g, '/{p}');
}

async function main() {
  const shim = createWxShim();

  let failed = 0;
  const coverage = new Map(); // 'METHOD path' -> {entry, count}

  for (const name of TEST_FILES) {
    const backend = createServer(PORT);
    await backend.start();
    require('../utils/request').setBaseUrl(BASE); // 各测试文件可能覆盖 BASE_URL，先复位
    shim.state.baseUrl = BASE;
    shim.reset();
    let ok = true;
    let message = '';
    try {
      message = await require('./' + name)(shim);
    } catch (e) {
      ok = false;
      if (e instanceof Error) {
        message = e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e.message;
      } else {
        try { message = JSON.stringify(e); } catch (err) { message = String(e); }
      }
    }
    // 汇总端点覆盖（仅统计命中契约的请求）
    shim.state.requests.concat(
      shim.state.uploads.map((u) => ({ method: 'POST', path: u.path }))
    ).forEach((r) => {
      const normPath = normalizePath(r.path);
      const key = r.method + ' ' + normPath;
      const entry = ENDPOINTS.find((e) => e.method === r.method && normalizePath(e.path) === normPath);
      if (entry) {
        const prev = coverage.get(key) || { entry: entry, count: 0 };
        prev.count += 1;
        coverage.set(key, prev);
      }
    });
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  ' + message);
    if (!ok) { failed += 1; }
    await backend.stop();
    shim.reset();
  }

  // —— 端点对照表（小程序实际调用 vs design/api-*.md） ——
  console.log('\n===== 端点对照表（miniprogram 实际调用 ↔ design/api-*.md）=====');
  console.log('方法    路径                          契约文档              页面                  调用次数');
  let matched = 0;
  ENDPOINTS.forEach((e) => {
    const cov = coverage.get(e.method + ' ' + normalizePath(e.path));
    if (cov) { matched += 1; }
    console.log(
      e.method.padEnd(8) + e.path.padEnd(30) + e.doc.padEnd(20) + e.page.padEnd(20) +
      (cov ? String(cov.count) : '0（未在本套测试覆盖）')
    );
  });
  const extra = [];
  coverage.forEach((v, key) => {
    if (!ENDPOINTS.some((e) => e.method + ' ' + normalizePath(e.path) === key)) { extra.push(key); }
  });
  console.log('\n契约端点 ' + ENDPOINTS.length + ' 个，测试覆盖 ' + matched + ' 个，契约外调用 ' + extra.length + ' 个' +
    (extra.length ? '：' + extra.join('、') : '（零偏差）'));
  console.log('说明：上传类端点（multipart）经 wx.uploadFile 记录；对照表路径已归一化 {id}。');

  if (failed > 0) {
    console.log('\n结果：' + failed + ' 个测试文件失败');
    process.exit(1);
  }
  console.log('\n结果：全部通过');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
