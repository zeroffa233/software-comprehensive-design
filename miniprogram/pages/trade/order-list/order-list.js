// pages/trade/order-list/order-list · 订单列表（状态 Tab、去支付/取消/确认收货、时间线详情）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待支付', value: '待支付' },
  { label: '已支付', value: '已支付' },
  { label: '已完成', value: '已完成' },
  { label: '已取消', value: '已取消' }
];
const PAGE_SIZE = 10;

Page({
  data: {
    tabs: STATUS_TABS.map((t) => t.label),
    tabIndex: 0,
    orderNoFilter: '',
    list: [], // {orderNo,goodsTitle,dealPrice,num,status,createTime,keyTimesText}
    visibleList: [],
    filterActive: false,
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loaded: false,
    // 订单详情时间线弹层
    detailOrder: null,
    detailTimeline: []
  },

  onLoad(options) {
    if (!auth.requireLogin()) { return; }
    if (options && options.tab === 'paid') {
      // 支付成功跳入：默认停在"已支付"
      const idx = STATUS_TABS.findIndex((t) => t.value === '已支付');
      if (idx > 0) { this.setData({ tabIndex: idx }); }
    }
  },

  onShow() {
    if (auth.isLoggedIn()) {
      this.loadOrders(true);
    }
  },

  onTabChange(e) {
    this.setData({ tabIndex: Number(e.detail.value) });
    this.loadOrders(true);
  },

  onOrderNoFilter(e) {
    // 订单号搜索为"本页筛选"（/orders 接口无 orderNo 查询参数），输入即筛
    this.setData({ orderNoFilter: e.detail.value });
    this.recomputeVisible();
  },

  applyFilter() {
    this.recomputeVisible();
  },

  // 本页订单号筛选；_index 保留原列表下标供操作按钮定位
  recomputeVisible() {
    const kw = (this.data.orderNoFilter || '').trim();
    const filterActive = kw.length > 0;
    const visibleList = this.data.list
      .map((o, i) => Object.assign({}, o, { _index: i }))
      .filter((o) => !filterActive || String(o.orderNo).indexOf(kw) >= 0);
    this.setData({ visibleList: visibleList, filterActive: filterActive });
  },

  // GET /orders：query status?/page/pageSize，create_time 倒序
  loadOrders(reset) {
    if (this.data.loading) { return; }
    const page = reset ? 1 : this.data.page + 1;
    const params = { page: page, pageSize: PAGE_SIZE };
    const status = STATUS_TABS[this.data.tabIndex].value;
    if (status) { params.status = status; }
    this.setData({ loading: true });
    api.get('/orders', { data: params, silent: true }).then((data) => {
      const list = ((data && data.list) || []).map((o) => Object.assign({}, o, {
        keyTimesText: keyTimesToText(o.keyTimes)
      }));
      const total = data && data.total ? data.total : 0;
      this.setData({
        list: reset ? list : this.data.list.concat(list),
        page: page,
        total: total,
        hasMore: this.data.list.length + list.length < total,
        loading: false,
        loaded: true
      });
      this.recomputeVisible();
    }).catch(() => {
      this.setData({ loading: false, loaded: true });
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(false);
    }
  },

  onPullDownRefresh() {
    this.loadOrders(true);
    wx.stopPullDownRefresh();
  },

  // GET /orders/{orderNo}：订单详情（商品快照 + 状态流转时间线）
  openDetail(e) {
    const orderNo = e.currentTarget.dataset.orderno;
    api.get('/orders/' + orderNo, { silent: true }).then((o) => {
      this.setData({
        detailOrder: o,
        detailTimeline: (o && o.timeline) || []
      });
    }).catch(() => {});
  },

  closeDetail() {
    this.setData({ detailOrder: null, detailTimeline: [] });
  },

  // —— 去支付（模拟支付弹窗：待支付→已支付） ——
  openPay(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.list[index];
    wx.showModal({
      title: '模拟支付',
      content: '订单号：' + order.orderNo + '\n应付金额：¥' + order.dealPrice,
      confirmText: '确认支付',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/orders/' + order.orderNo + '/pay').then(() => {
          wx.showToast({ title: '支付成功', icon: 'success' });
          this.loadOrders(true);
        }).catch(() => {});
      }
    });
  },

  // —— 取消订单（仅待支付；二次确认，30 分钟未支付将自动取消） ——
  cancelOrder(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.list[index];
    wx.showModal({
      title: '取消订单',
      content: '确定取消订单 ' + order.orderNo + '？30 分钟未支付的订单将自动取消。',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/orders/' + order.orderNo + '/cancel', {}).then(() => {
          wx.showToast({ title: '已取消', icon: 'none' });
          this.loadOrders(true);
        }).catch(() => {});
      }
    });
  },

  // —— 确认收货（已支付→已完成，终态不可再变更） ——
  confirmOrder(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.list[index];
    wx.showModal({
      title: '确认收货',
      content: '确认已收到「' + order.goodsTitle + '」？确认后订单完成，不可再变更。',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/orders/' + order.orderNo + '/confirm').then(() => {
          wx.showToast({ title: '交易完成', icon: 'success' });
          this.loadOrders(true);
        }).catch(() => {});
      }
    });
  },

  noop() {}
});

// keyTimes 兼容对象/字符串两种口径，拼为"下单 xxx ｜ 支付 xxx"
function keyTimesToText(keyTimes) {
  if (!keyTimes) { return ''; }
  if (typeof keyTimes === 'string') { return keyTimes; }
  if (typeof keyTimes === 'object') {
    const labels = {
      createTime: '下单', payTime: '支付', finishTime: '完成',
      cancelTime: '取消', expireAt: '支付截止'
    };
    return Object.keys(keyTimes)
      .filter((k) => keyTimes[k])
      .map((k) => (labels[k] ? labels[k] + ' ' : k + ' ') + keyTimes[k])
      .join(' ｜ ');
  }
  return String(keyTimes);
}
