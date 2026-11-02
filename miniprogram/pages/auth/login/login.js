// pages/auth/login/login · 登录页（密码/验证码两 Tab）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

Page({
  data: {
    tab: 'password', // password | sms
    phone: '',
    password: '',
    smsCode: '',
    devCode: '',
    countdown: 0,
    submitting: false
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, devCode: '' });
  },

  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onSmsCode(e) { this.setData({ smsCode: e.detail.value }); },

  isValidPhone(phone) {
    return /^1\d{10}$/.test(phone);
  },

  // 获取验证码（scene=LOGIN）；dev 模式后端在 data.devCode 返回 6 位验证码
  sendSms() {
    if (this.data.countdown > 0) { return; }
    const phone = this.data.phone;
    if (!this.isValidPhone(phone)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    api.post('/auth/sms-code', { phone: phone, scene: 'LOGIN' }).then((data) => {
      const dev = data && data.devCode ? data.devCode : '';
      this.setData({ devCode: dev, countdown: 60 });
      if (dev) {
        wx.showModal({
          title: '验证码（dev 模式）',
          content: '验证码：' + dev + '（5 分钟内有效）',
          showCancel: false
        });
      } else {
        wx.showToast({ title: '验证码已发送', icon: 'none' });
      }
      this.tick();
    }).catch(() => {
      // 429 限频等错误由 request 统一 toast
      if (this.data.countdown === 0) { this.setData({ countdown: 60 }); this.tick(); }
    });
  },

  tick() {
    if (this.data.countdown <= 0) { return; }
    setTimeout(() => {
      this.setData({ countdown: this.data.countdown - 1 });
      this.tick();
    }, 1000);
  },

  submit() {
    if (this.data.submitting) { return; }
    const phone = this.data.phone;
    if (!this.isValidPhone(phone)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    let payload;
    if (this.data.tab === 'password') {
      if (!this.data.password || this.data.password.length < 6) {
        wx.showToast({ title: '请输入密码', icon: 'none' });
        return;
      }
      payload = { phone: phone, password: this.data.password, loginType: 'PASSWORD' };
    } else {
      if (!/^\d{6}$/.test(this.data.smsCode)) {
        wx.showToast({ title: '请输入 6 位验证码', icon: 'none' });
        return;
      }
      payload = { phone: phone, smsCode: this.data.smsCode, loginType: 'SMS' };
    }
    this.setData({ submitting: true });
    api.post('/auth/login', payload).then((data) => {
      // 423 封禁：后端返回 code 423（走 reject），不会进入此处
      auth.setToken(data.token);
      return api.get('/users/me', { silent: true }).then((me) => {
        auth.setUserInfo(me);
        return me;
      }).catch(() => {
        // 拉取资料失败不阻塞登录态，role 从登录返回兜底
        auth.setUserInfo({ userId: null, role: data.role, status: data.status });
        return { role: data.role };
      });
    }).then((me) => {
      this.setData({ submitting: false });
      const role = me && me.role ? me.role : '';
      if (role === 'ADMIN') {
        // 按原型流转：平台管理员 → PC 管理端登录入口，小程序不进入用户端
        wx.showModal({
          title: '提示',
          content: '平台管理员请使用 PC 管理端登录，小程序面向普通用户。',
          showCancel: false,
          success: () => {
            api.post('/auth/logout', {}, { silent: true }).catch(() => {});
            auth.clearToken();
          }
        });
        return;
      }
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/goods/list/list' });
      }, 600);
    }).catch((err) => {
      this.setData({ submitting: false });
      if (err && err.code === 423) {
        // 封禁/锁定：提示原因摘要与申诉入口
        wx.showModal({
          title: '账号受限',
          content: (err.msg || '账号状态受限') + '\n如有疑问请通过校内渠道申诉。',
          showCancel: false
        });
      }
    });
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/auth/register/register' });
  },

  goFindPwd() {
    wx.navigateTo({ url: '/pages/auth/findpwd/findpwd' });
  }
});
