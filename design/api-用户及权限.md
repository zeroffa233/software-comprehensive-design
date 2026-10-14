# 接口规范初稿 · 用户及权限模块

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 负责人：张雨薇
> **初稿 · 待课次4校准**。遵循 design/接口规范总则.md（/api/v1 前缀、{code,msg,data}、错误码、JWT、分页）。

## 端点清单（14 个）

| 方法 | 路径 | 说明 | 允许角色 | 入参 | 返回 data 摘要 |
|---|---|---|---|---|---|
| POST | /api/v1/auth/register | 手机号+验证码注册 | 游客 | phone, smsCode, password, confirmPassword | userId, token（注册即登录） |
| POST | /api/v1/auth/sms-code | 获取短信验证码 | 游客/登录用户 | phone, scene(REGISTER/LOGIN/FIND_PWD) | null（60s 限频 429） |
| POST | /api/v1/auth/login | 密码或验证码登录 | 游客 | phone, password 或 smsCode, loginType | token, expiresIn, role, status |
| POST | /api/v1/auth/logout | 退出登录 | 普通用户/管理员 | 无（JWT） | null（Redis 会话失效） |
| POST | /api/v1/auth/find-password | 找回密码 | 游客 | phone, smsCode, newPassword | null（旧会话全部失效） |
| GET | /api/v1/users/me | 查询个人信息 | 普通用户/管理员 | 无（JWT） | userId, phone(脱敏), nickname, avatar, role, status, createTime |
| PUT | /api/v1/users/me | 修改个人资料 | 普通用户/管理员 | nickname(2-20), avatar(file/URL), signature | nickname, avatar |
| PUT | /api/v1/users/me/password | 修改密码 | 普通用户/管理员 | oldPassword, newPassword(8-20 位含字母数字) | null（其他会话失效） |
| POST | /api/v1/users/me/avatar | 上传头像 | 普通用户/管理员 | multipart file（jpg/png ≤2MB） | avatarUrl |
| GET | /api/v1/admin/users | 用户列表/搜索 | 管理员 | page, pageSize, phone?, nickname?, status? | 分页：list(userId, phone, nickname, role, status, createTime, lastLoginTime), total |
| PUT | /api/v1/admin/users/{id}/ban | 封禁用户 | 管理员 | reason(1-100 必填) | null（JWT 失效+在售商品自动下架+日志） |
| PUT | /api/v1/admin/users/{id}/unban | 解封用户 | 管理员 | 无 | null（恢复原角色权限+日志） |
| GET | /api/v1/admin/op-logs | 操作日志分页 | 管理员 | page, pageSize, adminId?, action?, targetType? | 分页：list(action, adminName, targetType, targetId, detail, createTime), total（只读） |
| POST | /api/v1/agent/chat | Agent 对话入口 | 普通用户（agent-svc 服务账号后端转发） | prompt(≤1000), requestId | reply, skillName；留痕 agent_chat_log（4001/4003 按 §7 错误码） |

## 通用规则

- 除 `auth/register`、`auth/sms-code`、`auth/login`、`auth/find-password`、`agent/chat`（服务账号鉴权）外一律携带 `Authorization: Bearer {token}`。
- 资源属主校验：users/me 系列仅能操作本人（403）；admin/* 一律 `@RequireRole("ADMIN")`。
- 封禁账号：登录返回 423 + 封禁原因摘要；已签发 Token 由封禁操作触发 Redis 失效（401）。

## report 条目映射清单

| report/04 功能需求条目 | 端点 |
|---|---|
| [游客] 浏览商品/搜索（401 引导登录） | 由商品模块 /api/v1/goods 提供；未登录访问受限接口统一 401 |
| [普通用户] 手机号+验证码注册 | POST /auth/sms-code、POST /auth/register |
| [普通用户] 密码/验证码登录（5 次锁定、封禁提示） | POST /auth/login（423/429 错误码） |
| [普通用户] 找回密码 | POST /auth/sms-code(scene=FIND_PWD)、POST /auth/find-password |
| [普通用户] 维护个人资料 | GET/PUT /users/me、POST /users/me/avatar |
| [普通用户] 发布商品等需登录操作（JWT 中间件） | 全局 JWT 校验链路（总则 §4） |
| [平台管理员] 封禁/解封 | PUT /admin/users/{id}/ban、/unban |
| [平台管理员] 查看操作日志 | GET /admin/op-logs |
| [平台管理员] 用户列表搜索 | GET /admin/users |
| [agent-svc] Skill 层鉴权转发 | POST /agent/chat（4001/4003/5000，留痕） |
