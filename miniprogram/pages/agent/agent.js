// pages/agent/agent · AI 助手对话（POST /api/v1/agent/chat，多轮上下文由后端 Redis 维护）
const api = require('../../utils/request');
const auth = require('../../utils/auth');

Page({
  data: {
    messages: [
      {
        role: 'bot',
        text: '你好，我是校园二手交易 AI 助手 🤖\n我可以帮你：\n1. 查询在售商品（如"帮我找 50 元以内的教材"）\n2. 润色商品文案、推荐分类\n3. 查询你本人的订单状态（如"查一下我最近的订单"）',
        skillName: '',
        time: ''
      }
    ],
    inputValue: '',
    sending: false,
    scrollInto: ''
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      auth.requireLogin();
    }
  },

  onInput(e) { this.setData({ inputValue: e.detail.value }); },

  appendMessage(msg) {
    const messages = this.data.messages.concat([msg]);
    this.setData({
      messages: messages,
      scrollInto: 'msg-' + (messages.length - 1)
    });
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
        time: ''
      });
    }).catch((err) => {
      this.setData({ sending: false });
      // 4003 → 明确回复"该操作不在 Agent 可用范围内"；其余按错误话术
      let text;
      if (err && err.code === 4003) {
        text = '该操作不在 Agent 可用范围内。目前仅支持商品查询、文案润色、本人订单状态查询。';
      } else if (err && err.code === 4001) {
        text = '我没理解你的说法，请换个方式描述（如"找 50 元以内的教材"）。';
      } else if (err && err.code === 401) {
        return; // 401 已由 request 统一跳登录
      } else {
        text = (err && err.msg) || '系统繁忙，请稍后再试';
      }
      this.appendMessage({ role: 'bot', text: text, skillName: '', time: '' });
    });
  }
});
