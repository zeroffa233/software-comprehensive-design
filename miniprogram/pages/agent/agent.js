// pages/agent/agent · AI 助手对话（POST /api/v1/agent/chat，多轮上下文由后端 Redis 维护）
// 快捷指令 chips；SK-006 智能下单草稿（data.draft）渲染草稿卡片，"去确认下单"跳商品详情走真实购买流程；
// 详情页"AI 比对/买前建议"经 agentPrefill 存储预填 prompt（tab 页无法带参跳转）。
const api = require('../../utils/request');
const auth = require('../../utils/auth');

const QUICK_CHIPS = ['比对两个商品', '这个值不值得买', '帮我下单'];

Page({
  data: {
    messages: [
      {
        role: 'bot',
        text: '你好，我是校园二手交易 AI 助手 🤖\n我可以帮你：\n1. 查询在售商品（如"帮我找 50 元以内的教材"）\n2. 比对商品、给出买前建议\n3. 润色商品文案、推荐分类\n4. 查询你本人的订单状态\n5. 帮你挑选商品、生成下单草稿（确认后才会真实下单）',
        skillName: '',
        time: ''
      }
    ],
    chips: QUICK_CHIPS,
    inputValue: '',
    sending: false,
    scrollInto: ''
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      auth.requireLogin();
    }
    // 详情页"AI 比对/买前建议"入口预填 prompt（switchTab 不能携带 url 参数）
    const prefill = wx.getStorageSync('agentPrefill');
    if (prefill) {
      wx.removeStorageSync('agentPrefill');
      this.setData({ inputValue: String(prefill) });
    }
  },

  onInput(e) { this.setData({ inputValue: e.detail.value }); },

  // 快捷指令：填入输入框，用户可修改后发送
  onChipTap(e) {
    this.setData({ inputValue: e.currentTarget.dataset.chip });
  },

  appendMessage(msg) {
    const messages = this.data.messages.concat([msg]);
    this.setData({
      messages: messages,
      scrollInto: 'msg-' + (messages.length - 1)
    });
  },

  // SK-006 下单草稿：跳商品详情页复用现有购买流程，由用户真实下单
  goDraft(e) {
    const goodsId = e.currentTarget.dataset.goodsid;
    if (!goodsId) { return; }
    wx.navigateTo({ url: '/pages/goods/detail/detail?id=' + goodsId });
  },

  // POST /agent/chat：prompt(≤1000) + requestId；多轮上下文由后端 Redis 维护
  send() {
    const prompt = (this.data.inputValue || '').trim();
    if (!prompt) { return; }
    if (this.data.sending) { return; }
    if (!auth.requireLogin()) { return; }
    if (prompt.length > 1000) {
      wx.showToast({ title: '输入不能超过 1000 字', icon: 'none' });
      return;
    }
    this.setData({ inputValue: '', sending: true });
    this.appendMessage({ role: 'user', text: prompt, skillName: '', time: '' });
    api.post('/agent/chat', {
      prompt: prompt,
      requestId: api.genRequestId()
    }, { silent: true }).then((data) => {
      this.setData({ sending: false });
      this.appendMessage({
        role: 'bot',
        text: (data && data.reply) || '（空回复）',
        skillName: (data && data.skillName) || '',
        draft: (data && data.draft) || null,
        time: ''
      });
    }).catch((err) => {
      this.setData({ sending: false });
      // 4003 → 明确回复"该操作不在 Agent 可用范围内"；其余按错误话术
      let text;
      if (err && err.code === 4003) {
        text = '该操作不在 Agent 可用范围内。目前仅支持商品查询/比对、买前建议、文案润色、本人订单状态查询与下单草稿。';
      } else if (err && err.code === 4001) {
        text = '我没理解你的说法，请换个方式描述（如"找 50 元以内的教材"）。';
      } else if (err && err.code === 401) {
        return; // 401 已由 request 统一跳登录
      } else {
        text = (err && err.msg) || '系统繁忙，请稍后再试';
      }
      this.appendMessage({ role: 'bot', text: text, skillName: '', draft: null, time: '' });
    });
  }
});
