// pages/goods/detail/detail · 商品详情（轮播/价格/库存/卖家/加购；卖家本人显示编辑/下架）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

Page({
  data: {
    id: null,
    goods: null,
    categoryPathText: '',
    isOwner: false,
    num: 1,
    showNumPicker: false,
    submitting: false,
    loading: true,
    notFound: false
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) });
    this.loadDetail();
  },

  // GET /goods/{id}：游客可见在售商品；卖家本人/管理员可见全状态
  loadDetail() {
    this.setData({ loading: true, notFound: false });
    api.get('/goods/' + this.data.id, { silent: true }).then((goods) => {
      const path = goods.categoryPath;
      const pathText = Array.isArray(path) ? path.join(' / ') : (path || '');
      const me = auth.getUserInfo();
      const isOwner = !!(goods.seller && me && goods.seller.uid === me.userId);
      this.setData({
        goods: goods,
        categoryPathText: pathText,
        isOwner: isOwner,
        num: 1,
        loading: false
      });
    }).catch((err) => {
      this.setData({ loading: false, notFound: err && err.code === 404 });
    });
  },

  onImageTap(e) {
    const urls = (this.data.goods.images || []).map((img) => img.url);
    wx.previewImage({
      current: urls[e.currentTarget.dataset.index],
      urls: urls
    });
  },

  // —— 购买数量弹层（1-库存步进） ——
  openNumPicker() {
    if (!auth.requireLogin()) { return; }
    if (this.data.goods.status !== '在售' || this.data.goods.stock <= 0) {
      wx.showToast({ title: '商品当前不可购买', icon: 'none' });
      return;
    }
    this.setData({ showNumPicker: true, num: 1 });
  },

  closeNumPicker() {
    this.setData({ showNumPicker: false });
  },

  onNumMinus() {
    if (this.data.num > 1) {
      this.setData({ num: this.data.num - 1 });
    }
  },

  onNumPlus() {
    if (this.data.num < this.data.goods.stock) {
      this.setData({ num: this.data.num + 1 });
    }
  },

  onNumInput(e) {
    const v = parseInt(e.detail.value, 10);
    if (!isNaN(v)) {
      this.setData({ num: Math.min(Math.max(v, 1), this.data.goods.stock) });
    }
  },

  // POST /cart/items：加入购物车（商品须"在售"，重复加入累加 num）
  addToCart() {
    if (this.data.submitting) { return; }
    this.setData({ submitting: true });
    api.post('/cart/items', {
      goodsId: this.data.goods.id,
      num: this.data.num
    }).then(() => {
      this.setData({ submitting: false, showNumPicker: false });
      wx.showModal({
        title: '已加入购物车',
        content: '可继续挑选，或前往购物车结算。',
        confirmText: '去看看',
        cancelText: '继续逛',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/trade/cart/cart' });
          }
        }
      });
    }).catch(() => {
      this.setData({ submitting: false });
    });
  },

  // 立即购买：携带单商品直接进入确认订单页
  buyNow() {
    const goods = this.data.goods;
    wx.setStorageSync('directBuy', {
      goodsId: goods.id,
      title: goods.title,
      unitPrice: goods.price,
      num: this.data.num,
      stock: goods.stock
    });
    this.setData({ showNumPicker: false });
    wx.navigateTo({ url: '/pages/trade/order-confirm/order-confirm?source=direct' });
  },

  // —— 卖家本人操作 ——
  editGoods() {
    wx.navigateTo({ url: '/pages/goods/publish/publish?id=' + this.data.goods.id });
  },

  // POST /goods/{id}/off-shelf：仅"在售"可下架
  offShelf() {
    const goods = this.data.goods;
    wx.showModal({
      title: '下架商品',
      content: '确定将「' + goods.title + '」下架？下架后可重新上架。',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/goods/' + goods.id + '/off-shelf').then(() => {
          wx.showToast({ title: '已下架', icon: 'success' });
          this.loadDetail();
        }).catch(() => {});
      }
    });
  },

  onPullDownRefresh() {
    this.loadDetail();
    wx.stopPullDownRefresh();
  },

  noop() {}
});
