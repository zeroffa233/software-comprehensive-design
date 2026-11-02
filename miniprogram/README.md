# miniprogram · 用户端（微信小程序）

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> 校园二手物品交易平台 · 用户端（原生 WXML/WXSS/JS，无第三方 UI 框架）

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss      # 入口、12 页注册 + 5 项 tabBar、全局样式
├── project.config.json               # 导入配置（urlCheck 已关闭，指向本地后端）
├── utils/
│   ├── request.js                    # BASE_URL http://127.0.0.1:8080/api/v1；Promise 封装 wx.request，
│   │                                 #   自动携带 Bearer Token，解包 {code,msg,data}；0→resolve(data)，
│   │                                 #   非 0→reject 并 toast；401→清 Token 跳登录页；含 multipart upload
│   └── auth.js                       # Token/用户上下文存取、requireLogin 登录引导
├── pages/
│   ├── auth/        login / register / findpwd   # 密码/验证码双 Tab 登录、注册（60s 倒计时）、找回密码
│   ├── profile/     profile                      # 个人中心：资料编辑/头像上传/改密码/退出/入口
│   ├── goods/       list / detail / publish / mine  # 首页列表、详情、发布（九宫格传图+Agent 润色）、我的商品
│   ├── trade/       cart / order-confirm / order-list  # 购物车、确认订单（409 重复下单引导）、订单列表
│   └── agent/       agent                        # AI 助手对话（POST /api/v1/agent/chat，上下文由后端 Redis 维护）
└── tests/
    ├── run.js                        # 测试入口：node tests/run.js
    ├── helpers/wx-shim.js            # wx 桥 shim（存储/提示/导航记录；request/uploadFile 走真实 Node HTTP）
    ├── helpers/server.js             # Node 契约后端（按 design/api-*.md 实现，含种子数据与错误码分支）
    ├── expected-endpoints.js         # 30 个端点契约清单（逐字取自三份 api 文档）
    ├── test-request.js               # request.js 解包/401/Token/静默/upload 单测（mock transport）
    ├── test-flow.js                  # 端到端主流程（注册→登录→列表→详情→加购→下单→409→支付→确认收货→Agent）
    ├── test-pages.js                 # 12 页面 shim 加载并驱动，请求路径/方法/字段与 api 文档逐字比对
    └── smoke-live.js                 # 真机后端冒烟：node tests/smoke-live.js [baseUrl]（默认 :8080，只读）
```

## tabBar（5 项）

首页（goods/list）｜ 发布（goods/publish）｜ 购物车（trade/cart）｜ 我的（profile/profile）｜ 助手（agent/agent）

## 在微信开发者工具中导入运行

1. 打开微信开发者工具（稳定版）→ 导入项目 → 目录选择本 `miniprogram/`，AppID 用测试号（已内置 `touristappid`）；
2. 详情 → 本地设置 → 勾选 **"不校验合法域名…"**（后端为 `http://127.0.0.1:8080`，非 https）；
3. 启动后端（见 `server-springboot/`，监听 :8080），种子账号：
   - 普通用户 `13800000002` / `User123456`、`13800000003` / `User123456`
   - 平台管理员 `13800000001` / `Admin123456`（按原型流转提示使用 PC 管理端）
4. 编译运行。验证码场景：无真实短信通道，`POST /auth/sms-code` 在 dev 模式于 `data.devCode` 返回 6 位验证码，页面会弹窗展示并显示在提示行。

## 演示路径（课程验收动线）

1. **游客浏览**：首页（分类级联筛选 + 关键词搜索 + 价格排序 + 触底分页）→ 商品详情（轮播/价格/库存/卖家）；
2. **注册/登录**：登录页 → 注册新账号（手机号 + devCode 验证码 + 60s 倒计时，成功自动登录回首页）；
3. **买家下单**：详情页选数量 → 加入购物车 → 购物车（步进/勾选/合计）→ 去结算 → 确认订单（备注）→ 提交订单 → 模拟支付 → 订单列表（状态 Tab / 去支付 / 取消 / 确认收货 / 点击查看时间线）；
   重复下单分支：同一商品再次提交 → 409 弹窗引导"前往支付 / 取消原订单后重新下单"；
4. **卖家发布**：发布 Tab（表单校验、分类级联、九宫格选图上传、Agent 润色建议确认后填入）→ 提交审核 → 我的商品（状态 Tab、下架、重新上架、编辑）；
5. **个人中心**：我的 Tab（资料编辑/头像上传/改密码/退出登录/我的商品/我的订单入口）；
6. **AI 助手**：助手 Tab → "帮我找 50 元以内的教材"（SK-001）/ "润色我的商品文案"（SK-002）/ "查一下我的订单"（SK-003）。

## 自动化验证（Node，无需微信开发者工具）

```bash
node miniprogram/tests/run.js          # 全量：request 单测 + 端到端主流程 + 12 页面契约比对 + 端点对照表
node miniprogram/tests/smoke-live.js   # 直连真实 SpringBoot :8080 冒烟（只读：登录→me→分类→列表→详情→401）
```

`run.js` 输出端点对照表：30 个契约端点全覆盖、契约外调用 0 个（零偏差）。测试基于 `helpers/wx-shim.js`
（wx 桥 shim）与 `helpers/server.js`（按 api 文档实现的 Node 契约后端，含 400/401/403/404/409/423/429 分支）。

## 需在微信开发者工具中验证的部分（Node 无法覆盖）

- **渲染与视觉**：WXML 结构渲染、WXSS rpx 布局、swiper 轮播、弹层/遮罩、状态标签配色；
- **触摸交互**：picker 级联选择、checkbox 勾选、stepper 按压、下拉刷新/触底加载、图片预览（wx.previewImage）；
- **真实设备能力**：wx.chooseMedia 相册/相机选图、wx.uploadFile 真实分片上传、键盘 confirm-type 行为、
  tabBar 切换与页面栈（navigateTo/redirectTo/switchTab 混合流转）；
- **登录态生命周期**：小程序冷启动 Token 恢复（app.js onLaunch 静默刷新用户上下文）。
