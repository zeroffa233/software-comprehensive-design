// utils/auth.js · Token 与用户上下文存取、登录引导
const TOKEN_KEY = 'token';
const USER_KEY = 'userInfo';

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token || '');
}

function getUserInfo() {
  return wx.getStorageSync(USER_KEY) || null;
}

function setUserInfo(userInfo) {
  wx.setStorageSync(USER_KEY, userInfo || null);
}

function getUserId() {
  const info = getUserInfo();
  return info ? info.userId : null;
}

function isLoggedIn() {
  return !!getToken();
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

// 未登录时提示并跳转登录页；返回是否已登录，供调用方短路
function requireLogin() {
  if (isLoggedIn()) {
    return true;
  }
  wx.showToast({ title: '请先登录', icon: 'none' });
  setTimeout(() => {
    wx.navigateTo({ url: '/pages/auth/login/login' });
  }, 600);
  return false;
}

module.exports = {
  getToken,
  setToken,
  getUserInfo,
  setUserInfo,
  getUserId,
  isLoggedIn,
  clearToken,
  requireLogin
};
