// pages/trade/order-confirm/order-confirm · 确认订单（清单/备注/提交订单/重复下单 409 引导/模拟支付）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

Page({
  data: {
    source: 'cart', // cart | direct
    items: [], // [{goodsId,title,unitPrice,num,stock}]
    remark: '',
    totalPrice: '0.00',
    submitting: false,
    // 模拟支付弹窗
    showPay: false,
    payOrders: [], // [{orderNo, dealPrice}]
    payTotal: '0.00',
    paying: false
  },

  onLoad(options) {
    if (!auth.requireLogin()) { return; }
    const source = options && options.source === 'direct' ? 'direct' : 'cart';
    let items = [];
    if (source === 'direct') {
      const direct = wx.getStorageSync('directBuy');
      if (direct && direct.goodsId) {
        items = [direct];
      }
    } else {
      items = wx.getStorageSync('checkoutItems') || [];
    }
    if (items.length === 0) {
      wx.showToast({ title: '没有待下单的商品', icon: 'none' });
      setTimeout(() => { wx.navigateBack(); }, 800);
      return;
    }
    const total = items.reduce((sum, it) => sum + it.unitPrice * it.num, 0);
    items.forEach((it) => { it.subtotalText = (it.unitPrice * it.num).toFixed(2); });
    this.setData({ source: source, items: items, totalPrice: total.toFixed(2) });
  },

  onRemark(e) { this.setData({ remark: e.detail.value }); },

  openSubmitConfirm() {
    if (this.data.submitting) { return; }
    wx.showModal({
      title: '提交订单',
      content: '共 ' + this.data.items.length + ' 种商品，合计 ¥' + this.data.totalPrice + '，确认提交？',
      success: (res) => {
        if (res.confirm) { this.submit(); }
      }
    });
  },

  // POST /orders：逐商品提交（后端校验在售+库存、重复下单拦截、价格快照）
  submit() {
    if (this.data.submitting) { return; }
    if ((this.data.remark || '').trim().length > 100) {
      wx.showToast({ title: '备注不能超过 100 字', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    this.submitItem(this.data.items.slice(), []);
  },

  // 递归提交剩余条目；created 累计已创建订单
  submitItem(remaining, created) {
    if (remaining.length === 0) {
      // 全部提交成功 → 弹出模拟支付
      const total = created.reduce((sum, o) => sum + o.dealPrice, 0);
      this.setData({
        submitting: false,
        showPay: true,
        payOrders: created,
        payTotal: total.toFixed(2)
      });
      return;
    }
    const item = remaining[0];
    api.post('/orders', {
      goodsId: item.goodsId,
      num: item.num,
      remark: remarkOf(this.data.remark),
      requestId: api.genRequestId()
    }).then((data) => {
      created.push({ orderNo: data.orderNo, dealPrice: data.dealPrice, goodsTitle: item.title });
      this.submitItem(remaining.slice(1), created);
    }).catch((err) => {
      if (err && err.code === 409 && err.data && err.data.existOrderNo) {
        // 重复下单：同商品存在待支付订单 → 引导"前往支付 / 取消原订单后重新下单"
        this.handleDuplicate(err.data.existOrderNo, item, remaining, created);
      } else {
        this.setData({ submitting: false });
        // 库存不足/已下架等：toast 已由 request 统一展示，停留本页
      }
    });
  },

  handleDuplicate(existOrderNo, item, remaining, created) {
    wx.showModal({
      title: '已存在待支付订单',
      content: '商品「' + item.title + '」已有待支付订单（' + existOrderNo + '），前往支付或取消原订单后重新下单。',
      confirmText: '前往支付',
      cancelText: '取消原订单',
      success: (res) => {
        if (res.confirm) {
          this.setData({ submitting: false });
          wx.redirectTo({ url: '/pages/trade/order-list/order-list' });
        } else {
          api.post('/orders/' + existOrderNo + '/cancel', {}).then(() => {
            // 原订单已取消，重新提交当前商品
            this.submitItem(remaining, created);
          }).catch(() => {
            this.setData({ submitting: false });
          });
        }
      }
    });
  },

  // 模拟支付确认：POST /orders/{orderNo}/pay（待支付→已支付，扣库存）
  confirmPay() {
    if (this.data.paying) { return; }
    this.setData({ paying: true });
    const orders = this.data.payOrders.slice();
    this.payItem(orders);
  },

  payItem(remaining) {
    if (remaining.length === 0) {
      this.setData({ paying: false, showPay: false });
      wx.removeStorageSync('checkoutItems');
      wx.removeStorageSync('directBuy');
      wx.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => {
        // 支付成功 → 订单列表，该订单置顶展示
        wx.redirectTo({ url: '/pages/trade/order-list/order-list?tab=paid' });
      }, 600);
      return;
    }
    api.post('/orders/' + remaining[0].orderNo + '/pay').then(() => {
      this.payItem(remaining.slice(1));
    }).catch(() => {
      // 支付失败（如订单已超时取消）：去订单列表处理
      this.setData({ paying: false, showPay: false });
      wx.removeStorageSync('checkoutItems');
      wx.removeStorageSync('directBuy');
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/trade/order-list/order-list' });
      }, 800);
    });
  },

  dismissPay() {
    // 暂不支付：订单保留为待支付，30 分钟未支付将自动取消
    this.setData({ showPay: false });
    wx.removeStorageSync('checkoutItems');
    wx.removeStorageSync('directBuy');
    wx.redirectTo({ url: '/pages/trade/order-list/order-list' });
  },

  goBackCart() {
    wx.switchTab({ url: '/pages/trade/cart/cart' });
  }
});

function remarkOf(remark) {
  const r = (remark || '').trim();
  return r.length > 0 ? r : undefined;
}
