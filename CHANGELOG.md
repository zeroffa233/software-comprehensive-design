# CHANGELOG · 变更历史

> **东南大学 计算机科学与技术专业 · 软件开发综合课程设计** ｜ 校园二手物品交易平台）
> 记录每次提交/合并的要点。时间：2026-10-14（需求分析阶段 v1.0/v1.0.1/v1.0.2、设计准备阶段 v1.1）。

## 2026-10-29 v2.0.0 四端工程实现（对照验收标准）

- **server-springboot**（:8080）：39 契约端点逐字实现（auth 14/goods 13/trade 11 + 对齐追加 GET /admin/goods、svc-token），Java 17 + MyBatis-Plus + JWT(uid/role)+Redis 会话 + @RequireRole AOP + @AdminOp 日志切面 + 全局异常(错误码逐项)；10 张表 schema/seed 幂等随启动执行；Redis 商品缓存 TTL 60s 变更逐出；下单价格快照/requestId 幂等(uk_request)/条件 UPDATE 防超卖/30 分钟未支付自动取消；端点 curl 校验 101/101 绿。
- **server-fastapi**（:8100）：Agent 对话真入口，doubao-seed-2.0-mini 真 LLM（凭证经环境变量注入，不入库）+ 规则引擎降级；SK-001 查商品/SK-002 发布辅助/SK-003 订单查询只读白名单，agent-svc 令牌+X-User-Id 属主校验，越权 4003；Redis 多轮会话上下文（追问链式命中）；agent_chat_log 真实留痕。
- **admin-web**（:5173）：Vue3 + Vite + Element Plus 四页（审核/用户/日志/登录）+ 登录守卫 + {code,msg,data} 拦截器；真实浏览器 E2E 全流程通过（登录→审核通过/驳回/违规下架→封禁/解封→日志留痕→401 处理）。
- **miniprogram**：原生小程序 12 页（11 业务页 + Agent 助手 Tab），request 封装（Bearer/解包/401 reLaunch）；Node 桥 shim 契约测试 3 套件全过（端点对照 30/30 零偏差）+ 直连真实后端冒烟通过。
- **基础设施**：Docker 容器 campus-mysql(MySQL 8 utf8mb4)/campus-redis(Redis 7)；集成冒烟脚本 28 项全绿（全链路：游客浏览→注册→购物车→下单支付→确认收货→发布→审核→日志→Agent 三场景→错误码抽检）。
- **压测达标 NFR-01**：tools/stress_test.py，50 并发×3000 请求，吞吐 4424 req/s，p50=7ms/**p95=16ms**/p99=147ms，零错误。
- **缺陷闭环**：D1 订单号 COUNT+1 序号撞号（删行留洞）→ 改 MAX+1 递增，冒烟复验通过；D2 JWT 401 提前返回缺 CORS 头 → 过滤器顺序修复；D3 小程序 7 处 require 深度错误 → 修正。详见《测试报告.md》。
- validate_report.py 8/8、validate_phase2.py 11/11 复跑全绿。

## 2026-10-18 v1.1.4 原型截图入报告与交付包重打包（课次 4 交付）

- 按课次 4 交付要求，16 张原型页面截图（1280×900 无头 Chrome 实截，渲染质检通过）入库 `report/images/prototype/`，并插入《软件需求分析报告》对应章节"本模块原型页面说明"小节（每图前配一行说明文字，相对路径引用，不改写报告现有内容）：第四章 6 张（auth-register/auth-login/auth-findpwd/admin-login/admin-user-manage/admin-oplog，其中找回密码与管理端三页归入新增小节 §4.5）、第五章 5 张（goods-list/goods-detail/goods-publish/goods-mine/admin-goods-audit，列表页与审核页归入新增小节 §4.5）、第六章 3 张（cart/order-confirm/order-list）；index 原型入口总览图插在第四章 §4 开头（报告首次介绍原型交付处）。auth-profile.png 已入库未插入（第四章个人中心小节本轮不配图）。
- `原型交付包.zip` 从当前 prototype/ 全量重打（19 个文件）替换仓库根目录旧包，消除旧包残留的"第X组"占位文案（当前口径为"小组"）；打包后自校验：解压 grep 无"第X组/第 X 组"，zip 内文件与 prototype/ 逐字节 diff 为空；sha256 = `8cb5ac5a91a6963174a47159493c48301366102acf3b5d096ba246a1a5aa5e78`。
- 阶段校验复跑全绿：validate_report.py 8/8、validate_phase2.py 11/11。本次仅改文档与打包，未动 server-*、miniprogram、admin-web、prototype 页面本体与图片文件。

## 2026-10-15 v1.1.3 分工明确

- 明确万佰鑫为**核心开发**：商品发布模块全栈之外，四端工程脚手架规划、tools/validate_phase2.py、项目 README 主笔均归属其名下（对应历史提交的提交者已按实际分工更正）。
- 分工表述同步统一：README（功能总览+分工说明）、DESIGN.md §5、CONTRIBUTING.md 成员行、《软件需求分析报告》第一章分工表、工作日志汇总表。
- 阶段校验复跑：validate_report.py 8/8、validate_phase2.py 11/11 全绿。

## 2026-10-14 需求分析报告整合为单文档 v1.0.2

- 依据课程交付形态（老师示例为单一完整文件，要求"整合输出完整《软件需求分析报告》初稿"），将 report/01~09 九个章节文件按顺序合并进根目录《软件需求分析报告.md》：保留抬头与报告说明，章标题"一~九"，各章原文件头（> 引用块）去除，图表编号不变，文末保留"图表清单""阶段测试"；三份个人工作记录保留在 report/ 下（评审会用），章节文件已 `git rm`。
- **内容零变更，仅结构归并**；tools/validate_report.py 同步改为校验单文档结构（九个章标题齐全有序；四/五/六章功能条目 10/9/8；第七章 NFR≥5；第九章 Skill 七字段；无 .env），复跑 8/8 全绿。
- 工作日志/CHANGELOG 中指向 report/0X 章节文件的引用同步改为"报告第X章"。

## 2026-10-14 设计准备阶段 v1.1（第二阶段）

### 设计基线（feature/design-zhangyuwei · 张雨薇）

| 提交/合并 | 说明 |
|---|---|
| `3c626f0` | [设计基线] feat：修订 DESIGN.md（goods.status 对齐 报告第五章状态机：草稿/待审核/在售/已下架/已售出并补 off_shelf_reason、分类初始数据约定与 seed SQL 思路）、.gitignore 注释中性化（"本地多分支工作区"）、新增 design/接口规范总则.md（/api/v1、{code,msg,data}、错误码、JWT、分页）——合并 develop 后广播"设计基线已就绪"，组员随即开工 |
| `83cbc17` | merge: 合并 feature/design-zhangyuwei · 原型壳与认证管理页、db/api 用户及权限、脚手架、阶段校验脚本 |
| `51673c1` | merge: 审核页表单化与校验器容错修复 |
| `b612bcb` / `18032a8` | merge: 合并万佰鑫（商品侧原型 4 页 + db/api 商品发布初稿）、周子航（交易侧原型 3 页 + db/api 购物交易初稿 + 开源预调研笔记） |
| `8951ebd`/`23305d5`/`e9a45a0`/`07d1819` | merge: 组员 4 次表单化修复（goods-list/goods-detail/goods-mine/order-list，阶段校验闭环） |
| 组长自查修复 | 用户管理页/操作日志页表单化、校验器端点正则兼容分列/编号两种格式 |

### 组员提交（各自分支）

- 万佰鑫（feature/proto-product-wanbaixin）：4fbb112、baf354c（商品侧 4 页原型）、534487a（db-商品发布）、defec97（api-商品发布 13 端点）+ 3 次表单化 fix（6fbf6ed、495a96e、cdff6d3）。
- 周子航（feature/proto-trade-zhouzihang）：f30a5d6、13b630c（交易侧 3 页原型）、59ed0dd（db-购物交易）、b56e379（api-购物交易 11 端点）、ac82d51（开源预调研笔记）+ 1 次表单化 fix（67779b5）。

### 本次测试结论（tools/validate_phase2.py）

- 首轮 3 项失败（管理页缺 form、组员端点行格式未被正则覆盖），经组长修复自身页面与校验器、组员 4+1+1 次表单化修复后闭环。
- 复跑结果：**11/11 全部通过** ✔ —— 16 页齐全且含表单/流转链接、index 可达全部页面；db-*.md 覆盖 §6 全部 10 张表；api 三文档端点 14/13/11 个（≥10/≥9/≥8）且全部 /api/v1 前缀；无 .env 入库。第一阶段校验 validate_report.py 复跑 8/8 全绿。
- 原型打包：`原型交付包.zip`（prototype/ 全量，16 页），sha256 = `24ea68d568e9bb4a69bcb62e15e87de17b53a5b2b22d63ab99866da09bd28772`。

### 开放点（初稿 · 待课次4校准）

- db/api 各文档均标注"初稿 · 待课次4校准"。
- 周子航记录：第一版支付时才扣库存（下单不锁），若改下单锁库存需与商品模块联调。
- 万佰鑫记录："已售出"状态置位由交易模块支付成功触发（跨模块联动，联调时确认）。

## 2026-10-14 需求分析阶段 v1.0

### 初始化

| 提交 | 作者 | 说明 |
|---|---|---|
| `723fcde` | 王明 | [项目] feat：初始化仓库，固定 DESIGN.md 设计基线 |

### feature/user-zhangyuwei（张雨薇 · 用户及权限模块）

| 提交 | 说明 |
|---|---|
| `c0c3c66` | [文档] docs：新增 Git 团队协作规约 CONTRIBUTING.md（三级分支、commit 格式、合并流程与红线） |
| `cfe99e7` | [文档] docs：新增小组选题与分工记录表（选题通道、模块划分、范围边界、三铁律自查） |
| `27a0920` | [文档] docs：新增项目背景与系统概述（痛点、拓扑图、技术栈表、第一版边界清单） |
| `ef6bf3f` | [用户模块] feat：完成用户及权限模块需求（RBAC 对照表、10 条功能需求、原型页面说明与流转图） |
| `724de77` | [文档] docs：新增组长个人工作记录（任务、产出、设计裁定、耗时） |
| `32cc543` | [项目] docs：更新小组成员信息（东南大学计算机科学与技术：张雨薇/万佰鑫/周子航），统一文档抬头署名；含 DESIGN.md 抬头与 §5 分工表修订 |
| `09eefa1` | [文档] docs：工作记录文件更名为工作记录-zhangyuwei.md |

### feature/product-wanbaixin（万佰鑫 · 商品发布模块）

| 提交 | 说明 |
|---|---|
| `3b44924` | [文档] docs：用四步法梳理三条业务线清单与系统边界 |
| `9f247a7` | [商品模块] feat：编写商品发布模块功能需求与原型页面说明 |
| `a58455b` | [文档] feat：编写用户画像卡片与系统用例图 |
| `b6614bc` | [文档] docs：补充商品模块个人工作记录 |
| `b69ac7d` | [文档] docs：更正成员署名（含作者历史重写为 万佰鑫 <wanbaixin@team.example>） |
| `7d08f99` | [文档] docs：同步组员更名（周子航） |
| `c2064b8` | [商品模块] fix：功能条目改为校验器要求的 `- [角色]` 列表格式（阶段测试修复） |

### feature/trade-zhouzihang（周子航 · 购物交易模块）

| 提交 | 说明 |
|---|---|
| `3f25148` | [交易模块] feat：编写购物交易功能需求与原型页面说明 |
| `a6e241a` | [交易模块] docs：编写非功能性需求（性能/安全/易用性/兼容性/可维护性） |
| `42abd36` | [AI模块] docs：输出 Skill 能力清单、Agent 安全约束与 MCP 交互方案 |
| `996722f` | [交易模块] docs：补充个人工作记录 |

### 集成合并（develop，均 `--no-ff`，由组长张雨薇执行）

| 合并 | 说明 |
|---|---|
| `d057b1b` | merge: 合并 feature/user-zhangyuwei · 用户及权限模块需求与协作规约 |
| `1a000d8` | merge: 合并 feature/product-wanbaixin · 商品发布模块需求与业务线清单 |
| `e1b8c7b` | merge: 合并 feature/trade-zhouzihang · 购物交易模块需求与 Agent-Skill-MCP 专项 |
| `b78b1fd` | merge: 合并 feature/product-wanbaixin · 修复商品发布模块功能条目格式以通过阶段校验 |

### 集成与收尾（develop 直提，组长权限内文件）

| 提交 | 说明 |
|---|---|
| `cf11fb3` | [文档] docs：新增需求分析报告索引页与阶段测试脚本 tools/validate_report.py |

### 本次测试结论（阶段测试 tools/validate_report.py）

- 首轮运行 8 项检查通过 7 项：`报告第五章` 功能条目为数字列表+反引号角色格式，不满足"`- [` 开头且含约束"，由万佰鑫按校验器格式修复（`c2064b8`）后合并重跑。
- 复跑结果：**8/8 全部通过** ✔ —— 索引链接 12 个 report/*.md 全部存在；NFR 条目 8 条（≥5）；四/五/六章功能条目 10/9/8 条（各≥6）；Skill 清单 7 字段齐全；git 跟踪文件中无 `.env`。
- 结论：需求分析阶段交付物全部通过阶段测试，develop 达到合并 main 的稳定标准。

### v1.0.1 增量（2026-10-14 · 工作记录命名统一）

| 提交/合并 | 说明 |
|---|---|
| `2c0d4e4` | [文档] docs：工作记录文件更名（周子航）——report/工作记录-lisi.md → report/工作记录-zhouzihang.md |
| `dcfafb7` | merge: 合并 feature/trade-zhouzihang · 周子航工作记录更名为工作记录-zhouzihang.md |
| `b647477` | [文档] fix：同步周子航工作记录更名（索引/工作日志引用改为工作记录-zhouzihang.md） |

工作记录命名统一：三份个人工作记录文件统一为"工作记录-成员名.md"（工作记录-zhangyuwei / -wanbaixin / -zhouzihang），索引与汇总表引用同步更新，阶段测试复跑 8/8 全绿。

### 基线修订决议（设计阶段待办）

- `goods.status` 枚举裁定扩展为"草稿/待审核/在售/已下架/已售出"（万佰鑫上报，组长裁定，已在 报告第五章状态机落地）；DESIGN.md 正式修订留到设计阶段走 feature 分支变更流程。
- 分类初始数据：第一版 SQL 预置初始二级分类，管理端分类维护列为可选功能。
