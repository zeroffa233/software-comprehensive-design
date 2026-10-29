// pages/auth/register/register · 注册页（手机号+验证码，注册即登录）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

Page({
  data: {
    phone: '',
    smsCode: '',
    password: '',
    confirmPassword: '',
    agreed: false,
    devCode: '',
    countdown: 0,
    submitting: false
  },

  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onSmsCode(e) { this.setData({ smsCode: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onConfirmPassword(e) { this.setData({ confirmPassword: e.detail.value }); },
  onAgreed(e) { this.setData({ agreed: e.detail.value }); },

  isValidPhone(phone) {
    return /^1\d{10}$/.test(phone);
  },

  isValidPassword(pwd) {
    // 8-20 位，含字母和数字
    return typeof pwd === 'string' && pwd.length >= 8 && pwd.length <= 20 &&
      /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
  },

  sendSms() {
    if (this.data.countdown > 0) { return; }
    const phone = this.data.phone;
    if (!this.isValidPhone(phone)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    api.post('/auth/sms-code', { phone: phone, scene: 'REGISTER' }).then((data) => {
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
    const { phone, smsCode, password, confirmPassword, agreed } = this.data;
    if (!this.isValidPhone(phone)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(smsCode)) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }
    if (!this.isValidPassword(password)) {
      wx.showToast({ title: '密码须 8-20 位且含字母和数字', icon: 'none' });
      return;
    }
    if (password !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    if (!agreed) {
      wx.showToast({ title: '请先同意《平台使用协议》', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api.post('/auth/register', {
      phone: phone,
      smsCode: smsCode,
      password: password,
      confirmPassword: confirmPassword
    }).then((data) => {
      // 注册即登录：后端直接返回 token
      if (data && data.token) {
        auth.setToken(data.token);
        return api.get('/users/me', { silent: true }).then((me) => {
          auth.setUserInfo(me);
        }).catch(() => {});
      }
      return null;
    }).then(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/goods/list/list' });
      }, 600);
    }).catch((err) => {
      this.setData({ submitting: false });
      // 手机号已注册(409)/验证码错误(400)/限频(429) 由 request 统一 toast，不再重复提示
      if (err && err.code && err.code !== 409 && err.code !== 400 && err.code !== 429) {
        // 已由统一 toast 展示
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login/login' });
  }
});
