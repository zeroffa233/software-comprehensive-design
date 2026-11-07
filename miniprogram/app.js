const auth = require('./utils/auth');

App({
  onLaunch() {
    // 启动时若已有 Token，则拉取个人信息刷新本地用户上下文（userId/role 等），
    // 失败（如 Token 过期）时静默忽略，由各页面的 401 处理统一引导登录。
    if (auth.isLoggedIn()) {
      const request = require('./utils/request');
      request.get('/users/me', { silent: true }).then((me) => {
        auth.setUserInfo(Object.assign({}, me, {
          avatar: me && me.avatar ? request.assetUrl(me.avatar) : ''
        }));
      }).catch(() => {});
    }
  }
});
