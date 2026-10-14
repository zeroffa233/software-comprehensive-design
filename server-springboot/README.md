# server-springboot · 主服务脚手架规划

> 东南大学 计算机科学与技术专业 · 软件开发综合课程设计 ｜ 小组
> **脚手架规划，业务编码待数据库/接口定稿后开始。**

## 技术栈

Java 17 + SpringBoot 3 + MyBatis-Plus + JWT + Redis（缓存【必选】）+ 本地文件存储【必选】+ MySQL 8.0。

## 规划目录结构

```
server-springboot/
├── src/main/java/com/teamx/market/
│   ├── config/          # Web/JWT 过滤器/Redis/静态映射配置
│   ├── common/          # 统一返回 R{code,msg,data}、错误码、全局异常处理
│   ├── auth/            # 用户及权限模块（注册/登录/JWT/权限校验中间件/管理端）→ design/api-用户及权限.md
│   ├── goods/           # 商品发布模块 → design/api-商品发布.md（万佰鑫）
│   ├── trade/           # 购物交易模块 → design/api-购物交易.md（周子航）
│   └── agent/           # Agent 对话入口 → Skill 转发 FastAPI
├── src/main/resources/
│   ├── application.yml  # 密钥走环境变量（.env 已 ignore，严禁入库）
│   └── db/migration/    # 建库与 seed SQL（含分类初始数据，见 DESIGN.md §6）
└── pom.xml
```

## 依赖清单（规划）

- spring-boot-starter-web、validation
- mybatis-plus-boot-starter、mysql-connector-j
- spring-boot-starter-data-redis
- jjwt（io.jsonwebtoken）
- lombok、springdoc-openapi（接口自查）

## 环境准备步骤

1. 安装 JDK 17、Maven 3.9+、MySQL 8.0、Redis；
2. `mysql` 执行 migration 建库（utf8mb4_unicode_ci）与 seed 数据；
3. 复制 `application.yml.example` → `application.yml`，填本地 MySQL/Redis 与 JWT 密钥（或用环境变量注入）；
4. `mvn spring-boot:run`，默认 `:8080`，统一前缀 `/api/v1/`。
