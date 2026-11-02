// pages/auth/findpwd/findpwd · 找回密码（验证码 + 新密码）
const api = require('../../../utils/request');

Page({
  data: {
    phone: '',
    smsCode: '',
    newPassword: '',
    confirmPassword: '',
    devCode: '',
    countdown: 0,
    submitting: false
  },

  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onSmsCode(e) { this.setData({ smsCode: e.detail.value }); },
  onNewPassword(e) { this.setData({ newPassword: e.detail.value }); },
  onConfirmPassword(e) { this.setData({ confirmPassword: e.detail.value }); },

  isValidPhone(phone) {
    return /^1\d{10}$/.test(phone);
  },

  isValidPassword(pwd) {
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
    api.post('/auth/sms-code', { phone: phone, scene: 'FIND_PWD' }).then((data) => {
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
    const { phone, smsCode, newPassword, confirmPassword } = this.data;
    if (!this.isValidPhone(phone)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(smsCode)) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }
    if (!this.isValidPassword(newPassword)) {
      wx.showToast({ title: '新密码须 8-20 位且含字母和数字', icon: 'none' });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api.post('/auth/find-password', {
      phone: phone,
      smsCode: smsCode,
      newPassword: newPassword
    }).then(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '重置成功，请重新登录', icon: 'none' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/auth/login/login' });
      }, 800);
    }).catch(() => {
      this.setData({ submitting: false });
    });
  },

  goLogin() {
    wx.redirectTo({ url: '/pages/auth/login/login' });
  }
});
