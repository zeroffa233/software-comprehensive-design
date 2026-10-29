// pages/trade/cart/cart · 购物车（数量步进/移除/勾选/合计/去结算）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

Page({
  data: {
    items: [], // {goodsId,title,mainImage,unitPrice,stock,num,checked}
    allChecked: true,
    selectedCount: 0,
    totalPrice: '0.00',
    loading: true,
    loaded: false
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      this.setData({ items: [], loading: false, loaded: true, totalPrice: '0.00', selectedCount: 0, allChecked: false });
      return;
    }
    this.loadCart();
  },

  // GET /cart：购物车全部条目（含商品快照：标题/主图/单价/剩余库存）
  loadCart() {
    this.setData({ loading: true });
    api.get('/cart', { silent: true }).then((data) => {
      const list = (data && data.list) || [];
      const items = list.map((it) => ({
        goodsId: it.goodsId,
        title: it.title,
        mainImage: it.mainImage,
        unitPrice: it.unitPrice,
        stock: it.stock,
        num: it.num,
        checked: true
      }));
      this.setData({ items: items, loading: false, loaded: true });
      this.recalc();
    }).catch(() => {
      this.setData({ loading: false, loaded: true });
    });
  },

  recalc() {
    const items = this.data.items;
    const selected = items.filter((it) => it.checked);
    const total = selected.reduce((sum, it) => sum + it.unitPrice * it.num, 0);
    this.setData({
      selectedCount: selected.reduce((sum, it) => sum + it.num, 0),
      totalPrice: total.toFixed(2),
      allChecked: items.length > 0 && selected.length === items.length
    });
  },

  onToggle(e) {
    const index = e.currentTarget.dataset.index;
    const key = 'items[' + index + '].checked';
    this.setData({ [key]: !this.data.items[index].checked });
    this.recalc();
  },

  onToggleAll() {
    const target = !this.data.allChecked;
    const items = this.data.items.map((it) => Object.assign({}, it, { checked: target }));
    this.setData({ items: items });
    this.recalc();
  },

  // PUT /cart/items/{goodsId}：调整数量（1～剩余库存）
  onMinus(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];
    if (item.num <= 1) { return; }
    this.updateNum(index, item.num - 1);
  },

  onPlus(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];
    if (item.num >= item.stock) {
      wx.showToast({ title: '已达库存上限', icon: 'none' });
      return;
    }
    this.updateNum(index, item.num + 1);
  },

  updateNum(index, num) {
    const item = this.data.items[index];
    api.put('/cart/items/' + item.goodsId, { num: num }).then((data) => {
      const realNum = data && data.num ? data.num : num;
      this.setData({ ['items[' + index + '].num']: realNum });
      this.recalc();
    }).catch(() => {
      // 库存不足等：刷新购物车取服务端口径
      this.loadCart();
    });
  },

  // DELETE /cart/items/{goodsId}：移除即时生效，无二次确认
  onRemove(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];
    api.del('/cart/items/' + item.goodsId).then(() => {
      wx.showToast({ title: '已移除', icon: 'none' });
      const items = this.data.items.slice();
      items.splice(index, 1);
      this.setData({ items: items });
      this.recalc();
    }).catch(() => {});
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/goods/detail/detail?id=' + e.currentTarget.dataset.goodsid });
  },

  // 去结算：校验勾选 ≥1 件，携带选中商品进入确认订单页
  checkout() {
    const selected = this.data.items.filter((it) => it.checked);
    if (selected.length === 0) {
      wx.showToast({ title: '请先勾选要结算的商品', icon: 'none' });
      return;
    }
    wx.setStorageSync('checkoutItems', selected.map((it) => ({
      goodsId: it.goodsId,
      title: it.title,
      unitPrice: it.unitPrice,
      num: it.num,
      stock: it.stock
    })));
    wx.navigateTo({ url: '/pages/trade/order-confirm/order-confirm?source=cart' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/goods/list/list' });
  }
});
