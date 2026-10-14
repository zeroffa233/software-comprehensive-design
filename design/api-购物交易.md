# 接口规范初稿 · 购物交易模块

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **初稿 · 待课次4校准**
> 负责人：周子航 ｜ 遵循 design/接口规范总则.md（`/api/v1` 前缀、`{code,msg,data}`、JWT、分页、幂等 request_id）与 DESIGN.md §8。
> 数据库字段见 design/db-购物交易.md；需求条目见 report/06（8 条功能需求）。

## 1. 端点清单

| # | 方法 + 路径 | 说明 | 允许角色 | 入参 | 返回 data 摘要 |
|---|---|---|---|---|---|
| 1 | GET /api/v1/cart | 查询当前用户购物车全部条目（含商品快照：标题/主图/单价/剩余库存） | 普通用户 | 无（JWT 解析 user_id） | `{list:[{goodsId,title,mainImage,unitPrice,stock,num}],totalKinds}` |
| 2 | POST /api/v1/cart/items | 加入购物车：商品须"在售"，重复加入累加 num，种类上限 20 | 普通用户 | body `{goodsId, num?=1}` | `{goodsId, num, kinds}` |
| 3 | PUT /api/v1/cart/items/{goodsId} | 调整某商品购买数量（1～剩余库存） | 普通用户 | path `goodsId`；body `{num}` | `{goodsId, num, subtotal}` |
| 4 | DELETE /api/v1/cart/items/{goodsId} | 移除购物车条目（即时生效，无二次确认） | 普通用户 | path `goodsId` | `null`（msg 提示"已移除"） |
| 5 | POST /api/v1/orders | 提交订单：校验在售+库存、重复下单拦截，价格快照生成订单号 | 普通用户 | body `{goodsId, num, remark?≤100字, requestId}` | `{orderNo, dealPrice, status:"待支付", expireAt}` |
| 6 | POST /api/v1/orders/{orderNo}/pay | 模拟支付：待支付→已支付，扣库存、记 pay_time | 普通用户（属主） | path `orderNo` | `{orderNo, status:"已支付", payTime}` |
| 7 | POST /api/v1/orders/{orderNo}/cancel | 取消订单：仅待支付可取消，记 cancel_time | 普通用户（属主） | path `orderNo`；body `{reason?}` | `{orderNo, status:"已取消"}` |
| 8 | POST /api/v1/orders/{orderNo}/confirm | 确认收货：已支付→已完成，终态不可再变更 | 普通用户（属主） | path `orderNo` | `{orderNo, status:"已完成", finishTime}` |
| 9 | GET /api/v1/orders | 我的订单列表，按状态筛选，create_time 倒序分页 | 普通用户 | query `status?`、`page`、`pageSize≤50` | `{list:[{orderNo,goodsTitle,dealPrice,num,status,keyTimes}],total,page,pageSize}` |
| 10 | GET /api/v1/orders/{orderNo} | 订单详情：商品快照 + 状态流转时间线（下单/支付/完成/取消） | 普通用户（属主）；管理员可查任意 | path `orderNo` | `{orderNo,status,dealPrice,num,remark,timeline:[{action,time}],buyerId,sellerId}` |
| 11 | GET /api/v1/admin/orders | 管理端查看全部订单，支持按订单号/买家手机号/状态筛选 | 平台管理员 | query `orderNo?`、`buyerPhone?`、`status?`、`page`、`pageSize` | 分页结构同 #9，另含 buyerPhone（管理员可见） |

## 2. 关键校验与错误码（对照总则 §3）

| 场景 | 端点 | 返回 |
|---|---|---|
| 未登录/Token 失效 | 全部 | `401`，引导登录页 |
| 调整他人订单/购物车（非属主） | #6-#10 | `403` 资源属主校验失败 |
| 订单号不存在 | #6-#8、#10 | `404` |
| 加入非"在售"商品 / 库存不足 | #2、#3、#5 | `409`，msg 区分"商品已下架""库存不足" |
| 重复下单：同买家同商品存在待支付订单 | #5 | `409`，data 附 `{existOrderNo}`，前端提供"前往支付/取消原订单"选择 |
| num 超范围、remark>100 字、requestId 缺失 | #2、#3、#5 | `400` 参数非法 |
| 状态机非法迁移（已取消再支付、已完成再取消等） | #6-#8 | `409`，msg"订单状态不允许该操作" |
| 普通用户调 #11 | — | `403`（@RequireRole("ADMIN")） |
| 下单未带有效 requestId 重复提交 | #5 | `uk_request` 唯一键兜底返回首次结果（幂等） |

Agent 链路（SK-003 订单状态查询）复用 #10 的属主校验逻辑：Skill 层以 `agent-svc` 服务令牌转发时强制附加 `user_id`，仅允许查本人订单；越权返回 MCP `4003`（见 report/09），不直连业务端点。

## 3. 需求条目 → 端点映射清单

| report/06 功能需求条目 | 覆盖端点 |
|---|---|
| 1. 加入购物车（在售校验、累加数量、20 种上限） | #1 #2 |
| 2. 调整数量或移除商品（1～库存、即时生效） | #3 #4 |
| 3. 提交订单（在售+库存二次校验、价格快照、订单号规则） | #5 |
| 4. 重复下单校验（待支付订单拦截，引导支付/取消） | #5（409+existOrderNo）、#7（取消原订单后重新下单） |
| 5. 模拟支付（待支付→已支付、记支付时间、扣库存） | #6 |
| 6. 取消订单（仅待支付、30 分钟自动取消） | #7（人工）；自动取消为服务端定时任务，不设独立端点，效果同 #7 |
| 7. 确认收货（已支付→已完成，终态） | #8 |
| 8. 查看订单列表与详情（状态机两条合法路径、非法跳转后端拒绝） | #9 #10；管理员"查看全部订单"（report/04）→ #11 |

> 映射结论：8 条功能需求全部有端点承接，无遗漏；端点 #11 同时承接 report/04 管理员权限点 `admin:order:view-all`。
