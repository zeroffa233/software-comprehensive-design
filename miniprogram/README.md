# miniprogram · 用户端（微信小程序）脚手架规划

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **脚手架规划，业务编码待数据库/接口定稿后开始。**

## 技术栈

微信小程序原生（WXML/WXSS/JS），面向普通用户（游客/买家/卖家合一）。

## 规划目录结构（对应 prototype/ 页面）

```
miniprogram/
├── app.js / app.json / app.wxss
├── pages/
│   ├── auth/        # login / register / findpwd（对应 prototype/pages/auth-*.html）
│   ├── profile/     # 个人中心（auth-profile）
│   ├── goods/       # list / detail / publish / mine（万佰鑫）
│   ├── trade/       # cart / order-confirm / order-list（周子航）
│   └── agent/       # AI 助手对话（课次 15 集成）
├── utils/
│   ├── request.js   # 封装 /api/v1 + Authorization: Bearer {token} + {code,msg,data} 处理
│   └── auth.js      # Token 存取、401 跳登录、423 封禁提示
└── project.config.json
```

## 依赖清单（规划）

- 无第三方 UI 框架（第一版原生控件）；图片上传用 `wx.chooseMedia` + `wx.uploadFile`。

## 环境准备步骤

1. 微信开发者工具（稳定版）导入本目录，填 AppID（测试号即可）；
2. 详情 → 本地设置 → 勾选"不校验合法域名"，指向本地 `http://127.0.0.1:8080`；
3. `utils/request.js` 的 BASE_URL 按环境切换（dev/prod 走配置，不硬编码密钥）。
