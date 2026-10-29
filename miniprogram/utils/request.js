// utils/request.js · 统一请求封装
// BASE_URL 指向 SpringBoot 业务后端（小程序唯一后端入口），统一返回 {code, msg, data}。
// 测试环境可通过 setBaseUrl 覆盖（见 miniprogram/tests/）。
let BASE_URL = 'http://127.0.0.1:8080/api/v1';
const LOGIN_PAGE = '/pages/auth/login/login';

const auth = require('./auth');

// 生成幂等 requestId（下单/发布等创建类接口防重复提交）
function genRequestId() {
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// 时间格式化 yyyy-MM-dd HH:mm:ss（服务器统一 UTC+8，本机展示同口径）
function formatTime(date) {
  const d = typeof date === 'number' ? new Date(date) : date;
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  );
}

function buildHeader(extra) {
  const header = Object.assign(
    { 'Content-Type': 'application/json' },
    extra || {}
  );
  const token = auth.getToken();
  if (token) {
    header.Authorization = 'Bearer ' + token;
  }
  return header;
}

// 401 统一处理：清 Token、跳登录页
function handleUnauthorized(msg) {
  auth.clearToken();
  wx.showToast({ title: msg || '登录已失效，请重新登录', icon: 'none' });
  setTimeout(() => {
    wx.reLaunch({ url: LOGIN_PAGE });
  }, 600);
}

// 解包 {code, msg, data}：0 → resolve(data)，非 0 → reject({code, msg})
function unwrap(body, silent) {
  if (!body || typeof body.code === 'undefined') {
    // 网关/代理异常等非契约响应
    const err = { code: 5000, msg: '服务响应格式异常' };
    if (!silent) { wx.showToast({ title: err.msg, icon: 'none' }); }
    return Promise.reject(err);
  }
  if (body.code === 0) {
    return Promise.resolve(body.data);
  }
  const err = { code: body.code, msg: body.msg || '请求失败', data: body.data };
  if (body.code === 401) {
    handleUnauthorized(body.msg);
  } else if (!silent) {
    wx.showToast({ title: err.msg, icon: 'none' });
  }
  return Promise.reject(err);
}

// code 拦截逻辑要求 reject 后调用方仍能区分 401；这里保证 reject 携带 {code, msg}
function request(method, path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method: method,
      data: opts.data || {},
      header: buildHeader(opts.header),
      timeout: 15000,
      success(res) {
        unwrap(res.data, opts.silent).then(resolve, reject);
      },
      fail() {
        const err = { code: -1, msg: '网络异常，请检查后端服务' };
        if (!opts.silent) { wx.showToast({ title: err.msg, icon: 'none' }); }
        reject(err);
      }
    });
  });
}

// multipart 图片上传：POST /goods/images、POST /users/me/avatar
function upload(path, filePath, formData) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + path,
      filePath: filePath,
      name: 'file',
      formData: formData || {},
      header: buildHeader(),
      timeout: 30000,
      success(res) {
        let body = res.data;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch (e) { body = null; }
        }
        unwrap(body).then(resolve, reject);
      },
      fail() {
        const err = { code: -1, msg: '上传失败，请检查网络' };
        wx.showToast({ title: err.msg, icon: 'none' });
        reject(err);
      }
    });
  });
}

function setBaseUrl(url) {
  BASE_URL = url;
}

const get = (path, options) => request('GET', path, options);
const post = (path, data, options) => request('POST', path, Object.assign({}, options, { data }));
const put = (path, data, options) => request('PUT', path, Object.assign({}, options, { data }));
const del = (path, data, options) => request('DELETE', path, Object.assign({}, options, { data }));

module.exports = {
  get BASE_URL() { return BASE_URL; },
  setBaseUrl,
  genRequestId,
  formatTime,
  request,
  upload,
  get,
  post,
  put,
  del
};
