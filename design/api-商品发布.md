# 接口规范 · 商品发布模块（万佰鑫）

> **初稿 · 待课次4校准**
> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> 遵循 `design/接口规范总则.md`：统一前缀 `/api/v1/`、返回 `{code, msg, data}`、JWT 鉴权（`Authorization: Bearer {token}`）、分页约定（page/pageSize，data 含 list/total/page/pageSize）、错误码表（400/401/403/404/409/423/429/5000）。
> 依据：DESIGN.md §6/§8、report/05-商品发布模块需求.md；goods.status 枚举：草稿/待审核/在售/已下架/已售出（v1.1 修订）。

## 一、端点清单

| # | 方法 + 路径 | 说明 | 允许角色 | 入参 | 返回 data 摘要 |
|---|---|---|---|---|---|
| 1 | GET /api/v1/categories | 分类树（级联选择用） | 游客 | Query：`parentId`（缺省返回全树） | `[{id,name,parentId,sort,children:[{id,name,sort}]}]` |
| 2 | GET /api/v1/goods | 商品列表/搜索（仅"在售"） | 游客 | Query：`categoryId`、`keyword`（LIKE 匹配 title/description）、`sort`（白名单：create_time/price）、`page`、`pageSize` | 分页结构：`list:[{id,title,price,mainImage,categoryName,stock,createTime}]`, total, page, pageSize |
| 3 | GET /api/v1/goods/{id} | 商品详情 | 游客（在售）；卖家本人与管理员可见全状态 | Path：`id` | `{id,title,description,price,negotiable,stock,status,images:[{url,sort}],categoryPath,seller:{uid,nickname},createTime,offShelfReason}`；非在售且非属主/管理员 → 404（不暴露存在性） |
| 4 | POST /api/v1/goods | 发布商品 | USER | Body：`title`(5-40字)、`categoryId`(二级)、`price`(0.01-9999.00)、`negotiable`、`stock`(1-99)、`description`(10-500字)、`imageIds`（先传图后发布，1-6个）、`requestId`（幂等） | `{goodsId, status:"待审核"}`；参数非法 400 |
| 5 | POST /api/v1/goods/images | 上传商品图片（先传图拿 imageIds） | USER | multipart/form-data：`file`（≤5MB，jpg/png/webp） | `{imageId, url, width, height}` |
| 6 | DELETE /api/v1/goods/images/{imageId} | 删除未发布的图片 | USER（图片所属商品属主） | Path：`imageId` | `null`；非属主 403 |
| 7 | PUT /api/v1/goods/{id} | 编辑商品 | USER（属主） | Body：同发布（字段可选）；`status=已售出/已下架` → 409 状态冲突 | `{goodsId, updateTime}`；改价格触发 10 分钟下单冷却（应用层） |
| 8 | POST /api/v1/goods/{id}/off-shelf | 卖家主动下架 | USER（属主） | Path：`id` | `null`；仅"在售"可下架，否则 409 |
| 9 | POST /api/v1/goods/{id}/re-list | 重新上架（草稿/已下架→待审核） | USER（属主） | Path：`id` | `{goodsId, status:"待审核"}`；管理员下架的需先按原因修改商品 |
| 10 | GET /api/v1/goods/mine | 我的商品列表 | USER | Query：`status`（可多值）、`page`、`pageSize`；按 create_time 倒序 | 分页结构：`list:[{id,title,price,stock,status,mainImage,offShelfReason}]` |
| 11 | POST /api/v1/admin/goods/{id}/approve | 管理员审核通过（待审核→在售） | ADMIN | Path：`id` | `{goodsId, status:"在售"}`；非待审核 409 |
| 12 | POST /api/v1/admin/goods/{id}/reject | 管理员驳回（待审核→草稿） | ADMIN | Path：`id`；Body：`reason`(10-200字) | `{goodsId, status:"草稿"}`；操作写 admin_op_log |
| 13 | POST /api/v1/admin/goods/{id}/force-off-shelf | 管理员下架违规商品（→已下架） | ADMIN | Path：`id`；Body：`reason`(10-200字，必填) | `{goodsId, status:"已下架"}`；操作写 admin_op_log（target_type=goods） |

## 二、通用错误码对照（本模块典型场景）

| code | 场景 |
|---|---|
| 400 | 标题超长、价格越界、图片超过 6 张、图片格式/大小非法 |
| 401 | 未携带 JWT 调发布/编辑/下架接口 |
| 403 | 编辑/下架他人商品（属主校验在 Service 层比对 user_id） |
| 404 | 商品不存在或（对游客）非在售状态 |
| 409 | 对非"在售"商品下架、重复提交发布（requestId 幂等冲突）、库存/状态冲突 |
| 429 | 图片上传接口限频 |

## 三、功能需求条目 → 端点映射（report/05 §一）

| report/05 功能条目 | 映射端点 |
|---|---|
| 条目1 发布商品（标题/描述/价格/分类/图片，进入待审核） | #4 POST /goods（+#5 传图、#1 分类树） |
| 条目2 设置库存 | #4 POST /goods、#7 PUT /goods/{id}（stock 1-99 校验） |
| 条目3 多图上传（≤6张，主图） | #5 POST /goods/images、#6 DELETE /goods/images/{imageId} |
| 条目4 编辑商品（属主、已售出/已下架不可编辑、价格冷却） | #7 PUT /goods/{id} |
| 条目5 主动下架 | #8 POST /goods/{id}/off-shelf |
| 条目6 按分类与关键词浏览搜索（游客可、仅"在售"） | #2 GET /goods（+#1 分类树） |
| 条目7 管理员下架违规（填原因、写日志） | #13 POST /admin/goods/{id}/force-off-shelf |
| 条目8 审核通过/驳回（驳回填原因回草稿） | #11 POST /admin/goods/{id}/approve、#12 POST /admin/goods/{id}/reject |
| 条目9 我的商品列表（状态筛选、展示下架原因） | #10 GET /goods/mine（详情见 #3 GET /goods/{id}） |

> 状态流转实现口径：#4 发布→待审核；#11→在售；#12→草稿；#9 草稿/已下架→待审核；#8→已下架；#13→已下架（必填原因）；"已售出"由交易模块支付成功回调置位（周子航 api-购物交易.md），本模块不提供直接置"已售出"的端点。
