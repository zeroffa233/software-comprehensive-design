// tests/helpers/wx-shim.js · 微信小程序 wx/Page/App 桥 shim（Node 环境）
// 提供存储/提示/导航记录，request/uploadFile 走真实 Node HTTP（或注入 mock transport）。
'use strict';
const http = require('http');
const { URL } = require('url');

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// setData 路径赋值：支持 'a.b'、'items[0].num'
function setPath(obj, path, value) {
  if (path.indexOf('.') === -1 && path.indexOf('[') === -1) {
    obj[path] = value;
    return;
  }
  const keys = [];
  String(path).replace(/([^.[\]]+)|\[(-?\d+)\]/g, (_, k, idx) => {
    keys.push(k !== undefined ? k : Number(idx));
    return '';
  });
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
      cur[k] = typeof keys[i + 1] === 'number' ? [] : {};
    }
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function createWxShim() {
  const state = {
    storage: new Map(),
    toasts: [],        // {title, icon}
    modals: [],        // {title, content, confirmed}
    navigations: [],   // {type, url}
    requests: [],      // {method, path, header, data}
    uploads: [],       // {path, filePath}
    pages: [],         // Page() 注册的配置
    showModalAutoConfirm: true,
    modalConfirmQueue: [], // 依次取值的确认/取消队列，用于驱动多步 modal 流程
    chooseMediaResult: null,
    baseUrl: 'http://127.0.0.1:18080/api/v1',
    transport: null    // (options, cb) 注入 mock；为 null 时走真实 HTTP
  };

  function recordNavigation(type, url) {
    state.navigations.push({ type: type, url: url });
    return Promise.resolve();
  }

  function httpJson(options, cb) {
    const target = new URL(options.url);
    let dataStr = null;
    const headers = Object.assign({}, options.header);
    let method = options.method || 'GET';
    if (options.data !== undefined && options.data !== null) {
      if (method === 'GET') {
        Object.keys(options.data).forEach((k) => {
          if (options.data[k] !== undefined && options.data[k] !== null) {
            target.searchParams.append(k, String(options.data[k]));
          }
        });
      } else {
        dataStr = JSON.stringify(options.data);
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        // Node 对 DELETE 等方法默认不启用 chunked，必须显式声明 Content-Length
        headers['Content-Length'] = Buffer.byteLength(dataStr);
      }
    }
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: method,
        headers: headers
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let body = raw;
          try { body = JSON.parse(raw); } catch (e) { /* 保留原文 */ }
          cb({ statusCode: res.statusCode, data: body });
        });
      }
    );
    req.on('error', () => cb(null));
    if (dataStr !== null) { req.write(dataStr); }
    req.end();
  }

  function multipartUpload(options, cb) {
    const target = new URL(options.url);
    const boundary = '----wxshimboundary' + Date.now();
    const parts = [];
    Object.keys(options.formData || {}).forEach((k) => {
      parts.push(
        Buffer.from(
          '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' +
          String(options.formData[k]) + '\r\n'
        )
      );
    });
    parts.push(
      Buffer.from(
        '--' + boundary + '\r\nContent-Disposition: form-data; name="' + (options.name || 'file') +
        '"; filename="upload.png"\r\nContent-Type: image/png\r\n\r\n'
      )
    );
    parts.push(Buffer.from('fake-png-bytes-for-test'));
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length,
          'Authorization': (options.header && options.header.Authorization) || ''
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = raw;
          try { data = JSON.parse(raw); } catch (e) { /* 保留原文 */ }
          cb({ statusCode: res.statusCode, data: data });
        });
      }
    );
    req.on('error', () => cb(null));
    req.write(body);
    req.end();
  }

  const wx = {
    // —— 存储 ——
    setStorageSync(k, v) { state.storage.set(k, v); },
    getStorageSync(k) { return state.storage.has(k) ? state.storage.get(k) : ''; },
    removeStorageSync(k) { state.storage.delete(k); },
    clearStorageSync() { state.storage.clear(); },

    // —— 提示 ——
    showToast(o) { state.toasts.push({ title: o.title, icon: o.icon }); },
    showModal(o) {
      const confirmed = state.modalConfirmQueue.length > 0
        ? state.modalConfirmQueue.shift()
        : state.showModalAutoConfirm;
      state.modals.push({ title: o.title, content: o.content, confirmed: confirmed });
      setTimeout(() => {
        if (o.success) { o.success({ confirm: confirmed, cancel: !confirmed }); }
      }, 0);
    },

    // —— 导航 ——
    navigateTo(o) { return recordNavigation('navigateTo', o.url); },
    redirectTo(o) { return recordNavigation('redirectTo', o.url); },
    switchTab(o) { return recordNavigation('switchTab', o.url); },
    reLaunch(o) { return recordNavigation('reLaunch', o.url); },
    navigateBack() { return recordNavigation('navigateBack', ''); },
    setNavigationBarTitle() {},

    // —— 媒体 ——
    chooseMedia(o) {
      const result = state.chooseMediaResult || {
        tempFiles: [{ tempFilePath: '/tmp/wx-test-image.png', size: 1024 }],
        tempFilePaths: ['/tmp/wx-test-image.png']
      };
      setTimeout(() => { if (o.success) { o.success(result); } }, 0);
    },
    previewImage() {},

    // —— 网络 ——
    request(options) {
      state.requests.push({
        method: (options.method || 'GET').toUpperCase(),
        url: options.url,
        path: options.url.replace(/^https?:\/\/[^/]+(\/api\/v\d+)?/, ''),
        header: options.header,
        data: options.data
      });
      if (state.transport) {
        state.transport(options, (res) => setTimeout(() => {
          if (res === null) { if (options.fail) { options.fail({ errMsg: 'request:fail' }); } return; }
          if (options.success) { options.success(res); }
        }, 0));
        return;
      }
      httpJson(options, (res) => {
        if (res === null) {
          if (options.fail) { options.fail({ errMsg: 'request:fail' }); }
          return;
        }
        if (options.success) { options.success(res); }
      });
    },

    uploadFile(options) {
      state.uploads.push({ path: options.url.replace(/^https?:\/\/[^/]+(\/api\/v\d+)?/, ''), filePath: options.filePath });
      if (state.transport) {
        state.transport(Object.assign({}, options, { method: 'UPLOAD' }), (res) => setTimeout(() => {
          if (res === null) { if (options.fail) { options.fail({ errMsg: 'uploadFile:fail' }); } return; }
          if (options.success) { options.success(res); }
        }, 0));
        return;
      }
      multipartUpload(options, (res) => {
        if (res === null) {
          if (options.fail) { options.fail({ errMsg: 'uploadFile:fail' }); }
          return;
        }
        if (options.success) { options.success(res); }
      });
    },

    stopPullDownRefresh() {}
  };

  // Page()/App() 全局：记录配置，供测试实例化
  global.Page = (config) => {
    state.pages.push(config);
    global.__lastPage__ = config;
  };
  global.App = (config) => {
    global.__lastApp__ = config;
  };
  global.wx = wx;

  return {
    state: state,
    wx: wx,

    // 实例化页面：注入 setData/路径赋值，data 深拷贝隔离
    createPage(config) {
      const inst = Object.assign({}, config);
      inst.data = deepClone(config.data || {});
      inst.setData = (patch, cb) => {
        Object.keys(patch).forEach((k) => setPath(inst.data, k, patch[k]));
        if (cb) { cb(); }
      };
      inst.noop = inst.noop || function () {};
      return inst;
    },

    reset() {
      state.storage.clear();
      state.toasts.length = 0;
      state.modals.length = 0;
      state.navigations.length = 0;
      state.requests.length = 0;
      state.uploads.length = 0;
      state.showModalAutoConfirm = true;
      state.modalConfirmQueue.length = 0;
      state.chooseMediaResult = null;
    },

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    // 轮询等待页面副作用完成（request 回调/setTimeout）
    async settle(predicate, timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 3000);
      while (Date.now() < deadline) {
        if (predicate()) { return true; }
        await this.wait(25);
      }
      return predicate();
    }
  };
}

module.exports = { createWxShim, deepClone };
