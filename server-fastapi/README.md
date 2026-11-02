# server-fastapi · Agent 服务（已实现）

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> FastAPI Agent 服务（:8100）——Agent 对话真入口，按 report §9 / DESIGN.md §7 实现 Skill-MCP 链路。

## 技术栈（已落地）

Python 3.11+ · FastAPI · Pydantic v2 · SQLAlchemy 2.0 · PyMySQL · httpx · Redis · PyJWT

## 运行

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 按需修改；真实 .env 不入库
uvicorn app.main:app --host 0.0.0.0 --port 8100
# 健康检查 GET /health → {"status":"ok","springbootReady":...,"llmMode":...}
```

所有密钥/凭证一律从环境变量读取（`.env` 或进程 env），严禁写入任何入库文件：
`DB_URL` `REDIS_URL` `JWT_SECRET` `SPRINGBOOT_BASE_URL` `AGENT_SVC_PHONE/PASSWORD`
（或直接预置 `AGENT_SVC_TOKEN`）、`LLM_API_KEY` `LLM_BASE_URL` `LLM_MODEL`。

## 已实现能力

- **POST /api/v1/agent/chat**：入参 `{prompt(≤1000), requestId}`；用户上下文双通道兼容——
  直连时 `Authorization: Bearer {用户JWT}`（HS256 验签，密钥与 SpringBoot 共享），
  SpringBoot 代理转发时读 `X-User-Id` 头（代理侧已鉴权）；无上下文返回 401。
- **多轮对话**：Redis `agent:session:{uid}`，TTL 30min，保留最近 10 轮；支持追问与省略
  主语（先问"我的订单"再问"第二个呢"→ 命中上一轮 Skill 与结果列表）。
- **Skill 分发（只读/低风险，全部不写业务库）**：
  - SK-001 商品信息查询 → SpringBoot `GET /api/v1/goods`（在售、分类/关键词、分页）；
  - SK-002 商品发布辅助 → 润色标题/描述、推荐分类，仅生成建议文本，绝不落库（草稿 >2000 字 → 4001）；
  - SK-003 订单状态查询 → SpringBoot `GET /api/v1/orders` / `/api/v1/orders/{orderNo}`
    （`X-User-Id` 属主校验，仅查本人订单）；
  - SK-004 商品比对：示例问句 "比对 高数教材 和 iPhone"、"比对第一个和第二个"（指代上一轮
    查询结果）→ 解析商品名/ID → `GET /goods` 搜索 + `GET /goods/{id}` 取结构化数据
    （价格/议价/运费/库存/浏览/加购/急售/卖家/发布时长）→ LLM 输出对比表+结论+风险提示；
    商品不足两件时 4001 追问补齐；
  - SK-005 选购建议：示例问句 "高等数学教材 值不值得买"、"帮我看看 XX"、"选哪个" →
    取目标商品 + 同分类在售列表，基于 热度(viewCount/cartCount)/急售/价格 vs 同类均价/
    运费/库存/发布时长 给出 "建议买/再等等/建议对比" 结论与理由，结论后固定附免责声明
    "（以上建议仅供参考，请以商品实际信息与当面验货为准）"；
  - SK-006 智能下单草稿：示例问句 "帮我下单 高等数学教材"、"买 2 个 XX" → 取商品数据生成
    草稿 `{goodsId, title, num, unitPrice, freight, totalAmount}`，回复明确
    "已生成订单草稿，请到商品页确认下单"；**绝不调 POST /orders**，`data.draft`
    供小程序一键确认（report §9 红线：下单/支付必须由用户在页面确认）；
  - SK-007 识图生成描述（独立端点，非对话意图）：`POST /api/v1/agent/describe-image`，
    入参 multipart `image`（jpg/png/webp，≤5MB，最短边 ≥14px）或 JSON `{"imageUrl":
    "/images/**"}`（仅允许后端静态图片路径，防 SSRF）→ 视觉 LLM 生成
    `{title(≤40字), description(≤200字), categoryHint, tags[]}` 供发布页一键回填；
    LLM 无视觉/识别失败返回业务码 4001；
  - 越权/超清单操作（删除、下架、支付、查他人订单等）一律 `4003`；参数非法 `4001`；
    业务失败 `5000`；每次调用（含被拦截）落 `agent_chat_log`（user_id/prompt/response/
    skill_name/status: OK|DENIED|ERROR；若表存在 request_id/elapsed_ms 扩展列则一并写入）。
    新增 Skill 记 SK-004/005/006，识图记 SK-007。
- **MCP 报文**：`request_id / service_account=agent-svc / skill_id / params(含 user_id) / timestamp`，
  错误码 4001/4003/5000（report §9 §3.2）。
- **LLM 接入**：OpenAI 兼容协议 httpx 直调（env `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL`，
  当前模型 `doubao-seed-2.0-mini`（便宜优先），支持文本+视觉——识图走 messages content 数组 `image_url`；
  换 `glm-5.3-flash` 亦兼容（推理模型，token 预算已适配）），
  两段式——意图决策（会话历史一并送模型）+ 基于 Skill 实时取回的真实业务数据组织回复
  （SK-004/005 使用专用对比/建议提示词）；未配置 key 或调用失败时回退**内置规则引擎**
  （关键词意图识别 + 序号指代消解 + 模板回复，真实可用非占位，回复末尾如实标注"规则模式"）。
  业务数据一律实时调 SpringBoot，无任何硬编码假数据。
- **agent-svc 服务令牌**：优先 env 预置令牌，否则启动后向 SpringBoot `POST /api/v1/auth/login`
  换取 role=AGENT_SVC 服务令牌并缓存（401 自动重取）；SpringBoot 未就绪时后台轮询等待
  （≤600s），就绪前 Skill 调用惰性重试。

## HTTP 状态码约定

`401`（未登录/Token 失效）与 `400`（参数非法）同时反映在 HTTP 状态码与响应体 code；
`4001/4003/5000` 为业务级 Agent 错误码，HTTP 200、以响应体 `code` 表达（与总则 §3 一致）。

## 目录结构

```
server-fastapi/
├── app/
│   ├── main.py            # FastAPI 入口：/health、POST /api/v1/agent/chat、POST /api/v1/agent/describe-image、鉴权解析
│   ├── core/              # config(env) / security(JWT) / db(agent_chat_log) / redis / springboot 客户端
│   ├── agent/             # orchestrator 编排 / llm(OpenAI 兼容+视觉) / rules(规则引擎) / session(Redis 多轮)
│   ├── skills/            # SK-001 查询 / SK-002 发布辅助 / SK-003 订单 / SK-004 比对 / SK-005 建议 / SK-006 下单草稿 / SK-007 识图（+ goods_common 共用取数）
│   └── mcp/               # MCP 报文模型、4001/4003/5000
├── requirements.txt
└── .env.example           # 仅示例，真实 .env 不入库
```

## 与主服务的关系

- Agent 链路：小程序 → SpringBoot `POST /api/v1/agent/chat`（薄代理，携带 `X-User-Id`）→ 本服务
  → MCP 报文 → Skill 鉴权 → 转发 SpringBoot `/api/v1/` 业务接口 → 留痕 `agent_chat_log`。
- 本服务对 campus_market 库**只读写 `agent_chat_log` 一张表**，业务数据全部实时经 SpringBoot 获取。
- 越权指令一律 4003 并留痕（status=DENIED）。

