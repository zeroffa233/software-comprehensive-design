// pages/goods/mine/mine · 我的商品（状态 Tab 筛选、下架/重新上架/编辑）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '在售', value: '在售' },
  { label: '待审核', value: '待审核' },
  { label: '已下架', value: '已下架' },
  { label: '已售出', value: '已售出' }
];
const PAGE_SIZE = 10;

Page({
  data: {
    tabs: STATUS_TABS.map((t) => t.label),
    tabIndex: 0,
    list: [],
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loaded: false
  },

  onLoad() {
    if (!auth.requireLogin()) { return; }
  },

  onShow() {
    if (auth.isLoggedIn()) {
      this.loadGoods(true);
    }
  },

  onTabChange(e) {
    // bindtap 只带 dataset，没有 detail.value（读 detail.value 会得到 NaN）
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index) || index === this.data.tabIndex) { return; }
    this.setData({ tabIndex: index });
    this.loadGoods(true);
  },

  // GET /goods/mine：status 可多值，这里按单个 Tab 值筛选；create_time 倒序
  loadGoods(reset) {
    if (this.data.loading) { return; }
    const page = reset ? 1 : this.data.page + 1;
    const params = { page: page, pageSize: PAGE_SIZE };
    const status = STATUS_TABS[this.data.tabIndex].value;
    if (status) { params.status = status; }
    this.setData({ loading: true });
    api.get('/goods/mine', { data: params, silent: true }).then((data) => {
      const list = (data && data.list ? data.list : []).map((g) => Object.assign({}, g, {
        mainImage: api.assetUrl(g.mainImage)
      }));
      const total = data && data.total ? data.total : 0;
      const merged = reset ? list : this.data.list.concat(list);
      this.setData({
        list: merged,
        page: page,
        total: total,
        hasMore: merged.length < total && list.length > 0,
        loading: false,
        loaded: true
      });
    }).catch(() => {
      this.setData({ loading: false, loaded: true });
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadGoods(false);
    }
  },

  onPullDownRefresh() {
    this.loadGoods(true);
    wx.stopPullDownRefresh();
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/goods/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goEdit(e) {
    wx.navigateTo({ url: '/pages/goods/publish/publish?id=' + e.currentTarget.dataset.id });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/goods/publish/publish' });
  },

  // POST /goods/{id}/off-shelf：仅"在售"可下架；弹窗确认后状态变已下架
  offShelf(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    wx.showModal({
      title: '下架商品',
      content: '确定将「' + item.title + '」下架？下架后买家不可见。',
      success: (res) => {
        if (!res.confirm) { return; }
        api.post('/goods/' + item.id + '/off-shelf').then(() => {
          wx.showToast({ title: '已下架', icon: 'success' });
          this.loadGoods(true);
        }).catch(() => {});
      }
    });
  },

  // POST /goods/{id}/re-list：草稿/已下架 → 待审核；管理员下架的需先按原因修改商品
  reList(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    api.post('/goods/' + item.id + '/re-list').then((data) => {
      wx.showToast({ title: '已重新提交审核', icon: 'none' });
      this.loadGoods(true);
      return data;
    }).catch((err) => {
      if (err && err.code === 409) {
        // 管理员下架的需先按原因修改
        wx.showModal({
          title: '无法直接重新上架',
          content: (err.msg || '该商品为管理员下架，请先按原因修改商品') + '。是否前往编辑？',
          confirmText: '去编辑',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/goods/publish/publish?id=' + item.id });
            }
          }
        });
      }
    });
  }
});
