# admin-web · PC 管理端脚手架规划

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **脚手架规划，业务编码待数据库/接口定稿后开始。**

## 技术栈

Vue 3 + Vite + Element Plus，面向平台管理员（商品审核、用户管理、操作日志）。

## 规划目录结构（对应 prototype/pages/admin-*.html）

```
admin-web/
├── index.html
├── src/
│   ├── main.js / App.vue
│   ├── router/          # 登录守卫：无 token → /login；role≠ADMIN → 403 页
│   ├── api/             # axios 封装：/api/v1 前缀、{code,msg,data} 拦截器、401/423 处理
│   ├── views/
│   │   ├── login/       # 管理端登录（admin-login）
│   │   ├── goods-audit/ # 商品审核/违规下架（admin-goods-audit）
│   │   ├── user-manage/ # 用户管理封禁/解封（admin-user-manage）
│   │   └── oplog/       # 操作日志只读分页（admin-oplog）
│   └── components/      # 分页表格、原因填写弹窗（复用）
├── vite.config.js       # dev 代理 /api → http://127.0.0.1:8080
└── package.json
```

## 依赖清单（规划）

- vue@3、vue-router@4、pinia（登录态）
- element-plus、axios
- vite、@vitejs/plugin-vue

## 环境准备步骤

1. Node 18+，`npm install`；
2. `npm run dev`（Vite 代理 /api 到本地 SpringBoot :8080）；
3. `npm run build` 产物可由 Nginx 托管（与商品图片静态映射同机）。
