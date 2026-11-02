// pages/goods/publish/publish · 发布/编辑商品（全字段校验、分类级联、九宫格选图上传、提交审核）
// 编辑模式（?id=）：仅编辑文字字段；商品图片编辑无对应接口（详情不含 imageId、
// DELETE /goods/images/{imageId} 仅限未发布图片），故编辑态图片只读展示。
const api = require('../../../utils/request');
const auth = require('../../../utils/auth');

const MAX_IMAGES = 6;
const MAX_IMG_SIZE = 5 * 1024 * 1024; // 单张 ≤5MB

Page({
  data: {
    editId: null,
    editStatus: '',
    // 表单
    title: '',
    price: '',
    negotiable: false,
    stock: '1',
    freight: '0', // 运费（元），0 = 包邮，上限 50
    urgent: false, // 急售开关
    description: '',
    // 分类级联
    categoryTree: [],
    topNames: ['请选择一级分类'],
    secondNames: ['请选择二级分类'],
    topIndex: 0,
    secondIndex: 0,
    secondDisabled: true,
    // 图片（新建模式可增删；编辑模式只读）
    images: [], // [{imageId, url, tempPath}]
    uploading: false,
    // 状态
    submitting: false,
    showConfirm: false,
    // Agent 润色（SK-002：仅生成建议，确认后填入）
    polishModal: false,
    polishedText: '',
    polishing: false,
    // Agent 识图（SK-007：仅生成建议，确认后填入）
    aiVisionLoading: false,
    aiVisionModal: false,
    aiVision: { title: '', description: '', tags: [], categoryLabel: '', matched: null }
  },

  onLoad(options) {
    if (!auth.requireLogin()) { return; }
    if (options && options.id) {
      this.setData({ editId: Number(options.id) });
    }
    // 编辑模式需先有分类树才能回填级联选择，故串行加载
    this.loadCategories().then(() => {
      if (this.data.editId) {
        this.loadForEdit();
      }
    });
  },

  // GET /categories：分类树
  loadCategories() {
    return api.get('/categories', { silent: true }).then((tree) => {
      const tops = (tree || []).map((c) => ({
        id: c.id,
        name: c.name,
        children: c.children || []
      }));
      this.setData({
        categoryTree: tops,
        topNames: ['请选择一级分类'].concat(tops.map((c) => c.name))
      });
    }).catch(() => {
      wx.showToast({ title: '分类加载失败', icon: 'none' });
    });
  },

  // 编辑模式：GET /goods/{id} 预填
  loadForEdit() {
    api.get('/goods/' + this.data.editId, { silent: true }).then((goods) => {
      const path = goods.categoryPath;
      const pathArr = Array.isArray(path) ? path : (path ? path.split('/') : []);
      let topIndex = 0;
      let secondIndex = 0;
      let secondNames = ['请选择二级分类'];
      let secondDisabled = true;
      const top = this.data.categoryTree.find((c) => pathArr.length > 0 && c.name === pathArr[0]);
      if (top) {
        topIndex = this.data.categoryTree.indexOf(top) + 1;
        secondNames = ['请选择二级分类'].concat(top.children.map((c) => c.name));
        const child = top.children.find((c) => pathArr.length > 1 && c.name === pathArr[1]);
        if (child) {
          secondIndex = top.children.indexOf(child) + 1;
          secondDisabled = false;
        } else {
          secondDisabled = top.children.length === 0;
        }
      }
      this.setData({
        editStatus: goods.status,
        title: goods.title,
        price: String(goods.price),
        negotiable: !!goods.negotiable,
        stock: String(goods.stock),
        freight: String(Number(goods.freight) || 0),
        urgent: goods.urgent === 1,
        description: goods.description,
        categoryTree: this.data.categoryTree,
        topNames: this.data.topNames,
        topIndex: topIndex,
        secondNames: secondNames,
        secondIndex: secondIndex,
        secondDisabled: secondDisabled,
        images: (goods.images || []).map((img) => ({ url: img.url }))
      });
      wx.setNavigationBarTitle({ title: '编辑商品' });
    }).catch((err) => {
      wx.showToast({ title: (err && err.msg) || '商品加载失败', icon: 'none' });
      setTimeout(() => { wx.navigateBack(); }, 800);
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onPrice(e) { this.setData({ price: e.detail.value }); },
  onNegotiable(e) { this.setData({ negotiable: e.detail.value.length > 0 }); },
  onStock(e) { this.setData({ stock: e.detail.value }); },
  onFreight(e) { this.setData({ freight: e.detail.value }); },
  onUrgent(e) { this.setData({ urgent: e.detail.value }); },
  onDescription(e) { this.setData({ description: e.detail.value }); },

  onTopCategoryChange(e) {
    const topIndex = Number(e.detail.value);
    const top = this.data.categoryTree[topIndex - 1];
    this.setData({
      topIndex: topIndex,
      secondIndex: 0,
      secondNames: top ? ['请选择二级分类'].concat(top.children.map((c) => c.name)) : ['请选择二级分类'],
      secondDisabled: !top
    });
  },

  onSecondCategoryChange(e) {
    this.setData({ secondIndex: Number(e.detail.value) });
  },

  currentCategoryId() {
    const { topIndex, secondIndex, categoryTree } = this.data;
    if (topIndex === 0 || secondIndex === 0) { return null; }
    const top = categoryTree[topIndex - 1];
    const child = top && top.children[secondIndex - 1];
    return child ? child.id : null;
  },

  // —— 九宫格选图上传：POST /goods/images（multipart file，先传图拿 imageId） ——
  chooseImage() {
    const remain = MAX_IMAGES - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 6 张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = res.tempFiles || [];
        const oversized = files.filter((f) => f.size > MAX_IMG_SIZE);
        if (oversized.length > 0) {
          wx.showToast({ title: '单张图片不能超过 5MB', icon: 'none' });
          return;
        }
        this.uploadImages(files.map((f) => f.tempFilePath));
      }
    });
  },

  uploadImages(paths) {
    if (paths.length === 0) { return; }
    this.setData({ uploading: true });
    const path = paths[0];
    api.upload('/goods/images', path).then((data) => {
      const images = this.data.images.concat([{ imageId: data.imageId, url: data.url, tempPath: path }]);
      this.setData({ images: images, uploading: false });
      this.uploadImages(paths.slice(1));
    }).catch(() => {
      this.setData({ uploading: false });
      wx.showToast({ title: '部分图片上传失败，请重试', icon: 'none' });
    });
  },

  // DELETE /goods/images/{imageId}：删除未发布的图片
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const image = this.data.images[index];
    if (this.data.editId) { return; }
    if (!image || !image.imageId) { return; }
    api.del('/goods/images/' + image.imageId, {}, { silent: true }).then(() => {
      const images = this.data.images.slice();
      images.splice(index, 1);
      this.setData({ images: images });
    }).catch(() => {
      // 删除失败也允许本地移除（未发布图片服务端会话过期后自动清理）
      const images = this.data.images.slice();
      images.splice(index, 1);
      this.setData({ images: images });
    });
  },

  // —— Agent 润色文案（SK-002：仅生成建议，须用户确认后填入） ——
  polishDescription() {
    if (this.data.polishing) { return; }
    const text = (this.data.title + '。' + this.data.description).trim();
    if (text.length < 6) {
      wx.showToast({ title: '请先填写标题或描述', icon: 'none' });
      return;
    }
    this.setData({ polishing: true });
    api.post('/agent/chat', {
      prompt: '请润色以下二手商品的描述文案，直接给出润色后的描述：' + text,
      requestId: api.genRequestId()
    }, { silent: true }).then((data) => {
      this.setData({
        polishing: false,
        polishModal: true,
        polishedText: (data && data.reply) || ''
      });
    }).catch((err) => {
      this.setData({ polishing: false });
      wx.showToast({ title: (err && err.msg) || '润色失败，请稍后再试', icon: 'none' });
    });
  },

  applyPolish() {
    this.setData({ description: this.data.polishedText, polishModal: false });
  },

  dismissPolish() {
    this.setData({ polishModal: false });
  },

  // —— Agent 识图填充（SK-007：POST /agent/describe-image，multipart image；仅生成建议，确认后填入） ——
  describeImage() {
    if (this.data.editId) { return; }
    if (this.data.aiVisionLoading) { return; }
    const first = this.data.images[0];
    if (!first || !first.tempPath) {
      wx.showToast({ title: '请先上传商品图片', icon: 'none' });
      return;
    }
    this.setData({ aiVisionLoading: true });
    api.upload('/agent/describe-image', first.tempPath).then((data) => {
      const d = data || {};
      const matched = this.matchCategory(d.categoryHint);
      this.setData({
        aiVisionLoading: false,
        aiVisionModal: true,
        aiVision: {
          title: d.title || '',
          description: d.description || '',
          tags: d.tags || [],
          categoryLabel: matched ? matched.label : '未匹配（请手选分类）',
          matched: matched
        }
      });
      if (!matched) {
        wx.showToast({ title: '未匹配到分类，请手动选择', icon: 'none' });
      }
    }).catch(() => {
      // 错误 toast 已由 request/upload 统一展示
      this.setData({ aiVisionLoading: false });
    });
  },

  // categoryHint 与分类级联匹配：先匹配二级分类名，再退一级分类名
  matchCategory(hint) {
    const h = String(hint || '').trim();
    if (!h) { return null; }
    const tree = this.data.categoryTree;
    for (let t = 0; t < tree.length; t++) {
      const top = tree[t];
      for (let s = 0; s < top.children.length; s++) {
        const child = top.children[s];
        if (child.name === h || child.name.indexOf(h) !== -1 || h.indexOf(child.name) !== -1) {
          return {
            topIndex: t + 1,
            secondIndex: s + 1,
            secondNames: ['请选择二级分类'].concat(top.children.map((c) => c.name)),
            secondDisabled: false,
            label: top.name + ' / ' + child.name
          };
        }
      }
    }
    for (let t = 0; t < tree.length; t++) {
      const top = tree[t];
      if (top.name === h || top.name.indexOf(h) !== -1 || h.indexOf(top.name) !== -1) {
        return {
          topIndex: t + 1,
          secondIndex: 0,
          secondNames: ['请选择二级分类'].concat(top.children.map((c) => c.name)),
          secondDisabled: top.children.length === 0,
          label: top.name + '（请再选二级分类）'
        };
      }
    }
    return null;
  },

  applyAiVision() {
    const v = this.data.aiVision;
    const patch = { aiVisionModal: false };
    if (v.title) { patch.title = v.title; }
    if (v.description) { patch.description = v.description; }
    if (v.matched) {
      patch.topIndex = v.matched.topIndex;
      patch.secondNames = v.matched.secondNames;
      patch.secondIndex = v.matched.secondIndex;
      patch.secondDisabled = v.matched.secondDisabled;
    }
    this.setData(patch);
  },

  dismissAiVision() {
    this.setData({ aiVisionModal: false });
  },

  // —— 校验（必填缺失/格式错误提示，不跳转） ——
  validate() {
    const title = this.data.title.trim();
    if (title.length < 5 || title.length > 40) {
      return '标题须 5-40 字';
    }
    if (this.currentCategoryId() === null) {
      return '请选择二级分类';
    }
    const price = Number(this.data.price);
    if (!(price >= 0.01 && price <= 9999.00)) {
      return '价格须在 0.01-9999.00 之间';
    }
    const stock = parseInt(this.data.stock, 10);
    if (!(stock >= 1 && stock <= 99) || String(stock) !== String(this.data.stock).trim()) {
      return '库存须为 1-99 的整数';
    }
    if (this.data.freight !== '') {
      const freight = Number(this.data.freight);
      if (isNaN(freight) || freight < 0 || freight > 50) {
        return '运费须在 0-50 之间（0 为包邮）';
      }
    }
    const desc = this.data.description.trim();
    if (desc.length < 10 || desc.length > 500) {
      return '描述须 10-500 字';
    }
    if (!this.data.editId && this.data.images.length < 1) {
      return '请至少上传 1 张商品图片';
    }
    return null;
  },

  openConfirm() {
    if (this.data.submitting) { return; }
    const err = this.validate();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    this.setData({ showConfirm: true });
  },

  closeConfirm() {
    this.setData({ showConfirm: false });
  },

  // 提交：新建 POST /goods（requestId 幂等）；编辑 PUT /goods/{id}
  submit() {
    if (this.data.submitting) { return; }
    this.setData({ submitting: true, showConfirm: false });
    const categoryId = this.currentCategoryId();
    const freight = Number(this.data.freight) || 0;
    const urgent = this.data.urgent ? 1 : 0;
    if (this.data.editId) {
      api.put('/goods/' + this.data.editId, {
        title: this.data.title.trim(),
        categoryId: categoryId,
        price: Number(this.data.price),
        negotiable: this.data.negotiable,
        stock: parseInt(this.data.stock, 10),
        freight: freight,
        urgent: urgent,
        description: this.data.description.trim()
      }).then(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 800);
      }).catch(() => {
        this.setData({ submitting: false });
      });
      return;
    }
    api.post('/goods', {
      title: this.data.title.trim(),
      categoryId: categoryId,
      price: Number(this.data.price),
      negotiable: this.data.negotiable,
      stock: parseInt(this.data.stock, 10),
      freight: freight,
      urgent: urgent,
      description: this.data.description.trim(),
      imageIds: this.data.images.map((img) => img.imageId),
      requestId: api.genRequestId()
    }).then(() => {
      this.setData({ submitting: false });
      // 提交流转：二次确认 → "已提交，等待管理员审核" → 跳我的商品
      wx.showModal({
        title: '已提交',
        content: '商品已提交，等待管理员审核。',
        showCancel: false,
        success: () => {
          wx.redirectTo({ url: '/pages/goods/mine/mine' });
        }
      });
    }).catch(() => {
      this.setData({ submitting: false });
    });
  }
});
