// pages/profile/profile · 个人中心（我的）：资料展示/编辑、改密码、退出登录、入口
const api = require('../../utils/request');
const auth = require('../../utils/auth');

Page({
  data: {
    logged: false,
    me: null, // {userId, phone, nickname, avatar, role, status, signature, createTime}
    roleText: '',
    // 资料编辑
    nickname: '',
    signature: '',
    savingProfile: false,
    // 修改密码
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    changingPwd: false,
    uploadingAvatar: false
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      this.setData({ logged: false, me: null });
      return;
    }
    this.loadMe();
  },

  loadMe() {
    api.get('/users/me').then((me) => {
      auth.setUserInfo(me);
      this.setData({
        logged: true,
        me: me,
        roleText: me.role === 'ADMIN' ? '平台管理员' : '普通用户',
        nickname: me.nickname || '',
        signature: me.signature || ''
      });
    }).catch(() => {
      this.setData({ logged: false });
    });
  },

  onNickname(e) { this.setData({ nickname: e.detail.value }); },
  onSignature(e) { this.setData({ signature: e.detail.value }); },

  // 上传头像：jpg/png ≤2MB（前端先做类型/大小拦截）
  chooseAvatar() {
    if (this.data.uploadingAvatar) { return; }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) { return; }
        if (file.size > 2 * 1024 * 1024) {
          wx.showToast({ title: '头像不能超过 2MB', icon: 'none' });
          return;
        }
        this.setData({ uploadingAvatar: true });
        api.upload('/users/me/avatar', file.tempFilePath).then((data) => {
          this.setData({ uploadingAvatar: false });
          wx.showToast({ title: '头像已更新', icon: 'success' });
          this.loadMe();
          return data;
        }).catch(() => {
          this.setData({ uploadingAvatar: false });
        });
      }
    });
  },

  // 保存资料：nickname 2-20 字符、signature 选填
  saveProfile() {
    if (this.data.savingProfile) { return; }
    const nickname = (this.data.nickname || '').trim();
    if (nickname.length < 2 || nickname.length > 20) {
      wx.showToast({ title: '昵称须 2-20 字符', icon: 'none' });
      return;
    }
    this.setData({ savingProfile: true });
    api.put('/users/me', {
      nickname: nickname,
      signature: (this.data.signature || '').trim()
    }).then(() => {
      this.setData({ savingProfile: false });
      wx.showToast({ title: '资料已保存', icon: 'success' });
      this.loadMe();
    }).catch(() => {
      this.setData({ savingProfile: false });
    });
  },

  onOldPassword(e) { this.setData({ oldPassword: e.detail.value }); },
  onNewPassword(e) { this.setData({ newPassword: e.detail.value }); },
  onConfirmPassword(e) { this.setData({ confirmPassword: e.detail.value }); },

  isValidPassword(pwd) {
    return typeof pwd === 'string' && pwd.length >= 8 && pwd.length <= 20 &&
      /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
  },

  // 修改密码：成功后其他会话失效，当前会话仍有效
  changePassword() {
    if (this.data.changingPwd) { return; }
    const { oldPassword, newPassword, confirmPassword } = this.data;
    if (!oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' });
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
    this.setData({ changingPwd: true });
    api.put('/users/me/password', {
      oldPassword: oldPassword,
      newPassword: newPassword
    }).then(() => {
      this.setData({ changingPwd: false, oldPassword: '', newPassword: '', confirmPassword: '' });
      wx.showToast({ title: '密码已修改', icon: 'success' });
    }).catch(() => {
      this.setData({ changingPwd: false });
    });
  },

  goGoodsMine() {
    wx.navigateTo({ url: '/pages/goods/mine/mine' });
  },

  goOrderList() {
    wx.navigateTo({ url: '/pages/trade/order-list/order-list' });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login/login' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？（清除本机 Token 并使服务端会话失效）',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/auth/logout', {}, { silent: true }).catch(() => {}).then(() => {
          auth.clearToken();
          this.setData({ logged: false, me: null, oldPassword: '', newPassword: '', confirmPassword: '' });
          wx.showToast({ title: '已退出登录', icon: 'none' });
        });
      }
    });
  }
});
