# server-springboot · 主服务（校园二手物品交易平台）

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **已实现**：39 个契约端点（api-用户及权限 14、api-商品发布 13、api-购物交易 11、POST /api/v1/agent/chat 薄代理）全部落地，10 张表随启动自动建表 + 幂等种子数据。

## 技术栈

Java 17 + SpringBoot 3.2 + MyBatis-Plus 3.5.7 + JWT（jjwt 0.11.5）+ Redis（会话/验证码/商品缓存）+ 本地文件存储 + MySQL 8.0。

## 目录结构

```
server-springboot/
├── src/main/java/com/teamx/market/
│   ├── common/          # R{code,msg,data}、错误码表、全局异常处理器、分页结构
│   ├── config/          # CORS（最高优先级 Filter）、/images/** 静态映射、Redis、Jackson 时间格式、启动初始化
│   ├── auth/            # JWT 工具+过滤器+Redis 会话、@RequireRole AOP、@AdminOp 日志切面、认证/用户/管理端
│   ├── goods/           # 分类树、商品 CRUD/状态机、图片上传、审核流
│   ├── trade/           # 购物车、订单（价格快照/幂等/防超卖）、管理端订单
│   ├── agent/           # POST /api/v1/agent/chat 薄代理 → FastAPI :8100（X-User-Id + agent-svc Bearer，留痕 agent_chat_log）
│   └── schedule/        # 30 分钟未支付订单自动取消 @Scheduled
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/    # schema.sql（10 表，CREATE TABLE IF NOT EXISTS）+ seed.sql（INSERT IGNORE 幂等）
└── pom.xml
```

## 环境准备步骤

1. MySQL 8.0（127.0.0.1:3306，root/campus-root-2026，库 campus_market utf8mb4）、Redis（127.0.0.1:6379）；
2. `mvn spring-boot:run`（默认 `:8080`）：启动时自动执行 schema.sql + seed.sql（幂等），并生成种子账号 BCrypt 密码与种子商品主图（纯色 PNG → `uploads/seed/`，经 `/images/**` 静态映射访问）；
3. 环境变量可覆盖：`JWT_SECRET`（默认 `campus-market-dev-2026-SECRET-KEY`，≥32 字节，与 FastAPI 端一致）、`UPLOAD_DIR`、`AGENT_BASE_URL`。

## 种子账号（BCrypt 由启动初始化写入）

| 手机号 | 密码 | 角色 | 说明 |
|---|---|---|---|
| 13800000001 | Admin123456 | ADMIN | 管理员 |
| 13800000002 | User123456 | USER | 张同学 |
| 13800000003 | User123456 | USER | 李同学 |
| 13800000000 | Agent@2026 | AGENT_SVC | agent-svc 服务账号（仅签发服务令牌，不入库） |

## dev accommodation（对契约"初稿·待课次4校准"的说明）

1. **短信验证码**：无真实短信通道。`POST /api/v1/auth/sms-code` 按契约返回 `data=null` 的口径调整为：dev 环境在 `data` 中附 `devCode`（6 位数字）；Redis 键 `sms:{scene}:{phone}` TTL 300s，60s 限频（429）。此为本服务唯一的 dev accommodation。
2. **agent-svc 服务账号**：`POST /api/v1/auth/login` 对约定凭证（13800000000/Agent@2026）签发 `role=AGENT_SVC` 令牌（载荷 uid=0，2h）；另提供 `POST /api/v1/auth/svc-token`（ADMIN 签发）供手动签发。agent-svc 令牌仅放行 GET，且 uid 强制取 `X-User-Id` 头做属主校验（Skill 转发用户上下文，403 语义由 FastAPI 映射为 4003）。
3. **管理端商品列表**：契约未定义，按前端需求实现 `GET /api/v1/admin/goods?status=中文状态&page&pageSize`（AdminWeb 对齐契约）。
4. **user 表补充列**：`signature`（api-用户及权限 PUT /users/me 入参）、`last_login_time`（管理端用户列表返回字段）；`goods_image.goods_id` 允许 NULL（先传图后发布）。

## 集成契约（与兄弟端对齐结论）

- **小程序 → 8080**：全部业务端点，`Authorization: Bearer {token}`。
- **管理端 → 8080**：`/api/v1/admin/**`，`users.status` 返回 `ACTIVE/BANNED`，`op-logs.action` 为 `BAN_USER/UNBAN_USER/OFF_SHELF_GOODS/AUDIT_PASS/AUDIT_REJECT`。
- **8080 → FastAPI :8100**：`POST /api/v1/agent/chat` 薄代理，携带 `X-User-Id: {uid}` + agent-svc Bearer，body `{prompt(≤1000), requestId, userId}`；响应原样透传，并按 code=0/4003/其他 落 `agent_chat_log` 的 OK/DENIED/ERROR。
- **FastAPI → 8080**（Skill 只读）：agent-svc Bearer + `X-User-Id`，可用 `GET /api/v1/goods`、`GET /api/v1/categories`、`GET /api/v1/orders`、`GET /api/v1/orders/{orderNo}`。
