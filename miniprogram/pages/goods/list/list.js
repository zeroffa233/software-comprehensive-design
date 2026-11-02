// pages/goods/list/list · 首页：商品列表（分类级联筛选 + 关键词搜索 + 排序 + 分页）
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

const SORT_OPTIONS = [
  { label: '默认（最新发布）', value: '' },
  { label: '价格从低到高', value: 'price,asc' },
  { label: '价格从高到低', value: 'price,desc' },
  { label: '热度（浏览+加购）', value: 'hot' }
];
const PAGE_SIZE = 10;

Page({
  data: {
    // 分类级联：一级/二级选择索引（0 = 全部）
    categoryTree: [],
    topNames: ['全部'],
    secondNames: ['全部二级'],
    topIndex: 0,
    secondIndex: 0,
    secondDisabled: true,
    keyword: '',
    sortLabels: SORT_OPTIONS.map((o) => o.label),
    sortIndex: 0,
    goodsList: [],
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loaded: false
  },

  onLoad() {
    this.loadCategories();
    this.loadGoods(true);
  },

  onShow() {
    // 从发布/详情返回时刷新在售列表
    if (this.data.loaded) {
      this.loadGoods(true);
    }
  },

  // GET /categories：分类树（级联选择用），缺省返回全树
  loadCategories() {
    api.get('/categories', { silent: true }).then((tree) => {
      const tops = (tree || []).map((c) => ({
        id: c.id,
        name: c.name,
        children: c.children || []
      }));
      this.setData({
        categoryTree: tops,
        topNames: ['全部'].concat(tops.map((c) => c.name))
      });
    }).catch(() => {});
  },

  onTopCategoryChange(e) {
    const topIndex = Number(e.detail.value);
    const top = this.data.categoryTree[topIndex - 1];
    this.setData({
      topIndex: topIndex,
      secondIndex: 0,
      secondNames: top ? ['全部二级'].concat(top.children.map((c) => c.name)) : ['全部二级'],
      secondDisabled: !top
    });
    this.loadGoods(true);
  },

  onSecondCategoryChange(e) {
    this.setData({ secondIndex: Number(e.detail.value) });
    this.loadGoods(true);
  },

  onKeyword(e) { this.setData({ keyword: e.detail.value }); },

  onSearch() {
    this.loadGoods(true);
  },

  onSortChange(e) {
    this.setData({ sortIndex: Number(e.detail.value) });
    this.loadGoods(true);
  },

  // 计算当前分类入参：选了二级传二级 id；只选一级传一级 id
  currentCategoryId() {
    const { topIndex, secondIndex, categoryTree } = this.data;
    if (secondIndex > 0) {
      const top = categoryTree[topIndex - 1];
      return top && top.children[secondIndex - 1] ? top.children[secondIndex - 1].id : null;
    }
    if (topIndex > 0) {
      const top = categoryTree[topIndex - 1];
      return top ? top.id : null;
    }
    return null;
  },

  // GET /goods：仅"在售"，query: categoryId/keyword/sort/page/pageSize
  loadGoods(reset) {
    if (this.data.loading) { return; }
    const page = reset ? 1 : this.data.page + 1;
    const params = {
      page: page,
      pageSize: PAGE_SIZE
    };
    const categoryId = this.currentCategoryId();
    if (categoryId !== null) { params.categoryId = categoryId; }
    const keyword = (this.data.keyword || '').trim();
    if (keyword) { params.keyword = keyword; }
    const sort = SORT_OPTIONS[this.data.sortIndex].value;
    if (sort) { params.sort = sort; }

    this.setData({ loading: true });
    api.get('/goods', { data: params, silent: true }).then((data) => {
      const list = data && data.list ? data.list : [];
      const total = data && data.total ? data.total : 0;
      this.setData({
        goodsList: reset ? list : this.data.goodsList.concat(list),
        page: page,
        total: total,
        hasMore: this.data.goodsList.length + list.length < total,
        loading: false,
        loaded: true
      });
      if (reset) { wx.stopPullDownRefresh(); }
    }).catch(() => {
      this.setData({ loading: false, loaded: true });
      if (reset) { wx.stopPullDownRefresh(); }
    });
  },

  onPullDownRefresh() {
    this.loadCategories();
    this.loadGoods(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadGoods(false);
    }
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/goods/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goCart() {
    auth.requireLogin() && wx.switchTab({ url: '/pages/trade/cart/cart' });
  }
});
