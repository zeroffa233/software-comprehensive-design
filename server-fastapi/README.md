# server-fastapi · 数据/AI 服务脚手架规划

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **脚手架规划，业务编码待数据库/接口定稿后开始。**

## 技术栈

Python 3.11 + FastAPI + Pydantic + SQLAlchemy 2.0 + MySQL 8.0（只读分析 + Agent-Skill-MCP）。

## 规划目录结构

```
server-fastapi/
├── app/
│   ├── main.py          # FastAPI 入口
│   ├── core/            # 配置（.env 读环境变量，严禁入库）、安全
│   ├── agent/           # Agent 编排：自然语言 → Skill 选择 → MCP 报文组装
│   ├── skills/          # SK-001 商品查询 / SK-002 发布辅助 / SK-003 订单查询（鉴权后转发 /api/v1）
│   ├── mcp/             # MCP 报文模型（request_id, service_account, skill_id, params, timestamp）与错误码 4001/4003/5000
│   └── analysis/        # 数据分析（初稿 · 待课次4校准）
├── requirements.txt
└── .env.example         # 仅示例，真实 .env 不入库
```

## 依赖清单（规划）

- fastapi、uvicorn[standard]
- pydantic、sqlalchemy、pymysql
- httpx（转发业务 API）、python-dotenv

## 环境准备步骤

1. Python 3.11 + `python -m venv .venv && source .venv/bin/activate`；
2. `pip install -r requirements.txt`；
3. 复制 `.env.example` → `.env`（数据库连接、agent-svc 凭证；.gitignore 已挡 .env）；
4. `uvicorn app.main:app --reload --port 8100`；健康检查 `GET /health`。

## 与主服务的关系

- Agent 链路：用户自然语言 → 本服务 Agent → MCP 报文 → Skill 层先鉴权（agent-svc，仅 DESIGN.md §7 清单内允许操作）→ 转发 SpringBoot `/api/v1/` 业务接口；
- 所有调用写 `agent_chat_log`（服务账号、Skill 名、入参、时间、结果），越权指令一律 4003。
