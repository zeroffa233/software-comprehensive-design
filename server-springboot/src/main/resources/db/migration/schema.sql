-- =====================================================================
-- 校园二手物品交易平台 · MySQL 8.0 建表脚本（幂等，CREATE TABLE IF NOT EXISTS）
-- 依据：design/db-用户及权限.md、design/db-商品发布.md、design/db-购物交易.md
-- 字符集：utf8mb4 / utf8mb4_unicode_ci；引擎 InnoDB；时间字段 DATETIME（UTC+8）
-- =====================================================================

-- 1. user 用户表 ------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
    `id`              BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    `phone`           CHAR(11)          NOT NULL COMMENT '手机号（账号标识，全平台唯一，注册后不可改）',
    `password_hash`   VARCHAR(64)       NOT NULL COMMENT '密码哈希（bcrypt，严禁明文）',
    `nickname`        VARCHAR(20)       NOT NULL DEFAULT '' COMMENT '昵称（2-20 字符）',
    `avatar`          VARCHAR(255)               DEFAULT NULL COMMENT '头像 URL（jpg/png ≤2MB，本地文件相对路径）',
    `signature`       VARCHAR(200)               DEFAULT NULL COMMENT '个性签名（api-用户及权限 PUT /users/me 入参）',
    `role`            ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER' COMMENT '角色（RBAC：用户→角色→权限）',
    `status`          ENUM('ACTIVE','BANNED') NOT NULL DEFAULT 'ACTIVE' COMMENT '账号状态（封禁后登录 423、JWT 失效、在售商品自动下架）',
    `last_login_time` DATETIME                   DEFAULT NULL COMMENT '最近登录时间（管理端用户列表展示）',
    `create_time`     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_phone` (`phone`),
    KEY `idx_status` (`role`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='用户表';

-- 2. admin_op_log 管理员操作日志表 ------------------------------------
CREATE TABLE IF NOT EXISTS `admin_op_log` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志ID',
    `admin_id`    BIGINT UNSIGNED NOT NULL COMMENT '操作管理员（角色必须 ADMIN，Service 层校验）',
    `action`      VARCHAR(32)     NOT NULL COMMENT '动作（BAN_USER/UNBAN_USER/OFF_SHELF_GOODS/AUDIT_PASS/AUDIT_REJECT）',
    `target_type` VARCHAR(16)     NOT NULL COMMENT '目标类型（user/goods/order）',
    `target_id`   BIGINT UNSIGNED NOT NULL COMMENT '目标ID',
    `detail`      VARCHAR(200)    NOT NULL COMMENT '详情（封禁/下架原因 1-200 字，对目标用户可见）',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    PRIMARY KEY (`id`),
    KEY `idx_target` (`target_type`, `target_id`),
    KEY `idx_admin_time` (`admin_id`, `create_time`),
    CONSTRAINT `fk_aol_admin` FOREIGN KEY (`admin_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='管理员操作日志表';

-- 3. agent_chat_log Agent 调用留痕表 ----------------------------------
CREATE TABLE IF NOT EXISTS `agent_chat_log` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录ID',
    `user_id`     BIGINT UNSIGNED          DEFAULT NULL COMMENT '发起用户（匿名/服务调用可空）',
    `prompt`      VARCHAR(1000)   NOT NULL COMMENT '用户自然语言输入原文',
    `response`    VARCHAR(2000)            DEFAULT NULL COMMENT 'Agent 响应摘要',
    `skill_name`  VARCHAR(32)              DEFAULT NULL COMMENT '命中 Skill（SK-001/002/003，未命中为 NULL）',
    `status`      ENUM('OK','DENIED','ERROR') NOT NULL COMMENT '结果（DENIED=越权拦截 4003）',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
    PRIMARY KEY (`id`),
    KEY `idx_user_time` (`user_id`, `create_time`),
    KEY `idx_skill_status` (`skill_name`, `status`),
    CONSTRAINT `fk_acl_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='Agent 调用留痕表';

-- 4. category 分类表 --------------------------------------------------
CREATE TABLE IF NOT EXISTS `category` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    `name`        VARCHAR(20)     NOT NULL COMMENT '分类名称（同层级内唯一）',
    `parent_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父分类ID；0=一级分类',
    `sort`        INT             NOT NULL DEFAULT 0 COMMENT '排序值，越小越靠前',
    `is_active`   TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否启用；0=停用',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_parent_name` (`parent_id`, `name`),
    KEY `idx_parent` (`parent_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='分类表';

-- 5. goods 商品表 -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `goods` (
    `id`               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '商品ID',
    `seller_id`        BIGINT UNSIGNED  NOT NULL COMMENT '卖家用户ID → user.id（逻辑外键，应用层校验）',
    `category_id`      BIGINT UNSIGNED  NOT NULL COMMENT '分类ID → category.id（须为二级分类）',
    `title`            VARCHAR(40)      NOT NULL COMMENT '标题，5-40 字',
    `description`      VARCHAR(500)     NOT NULL COMMENT '描述，10-500 字',
    `price`            DECIMAL(6,2)     NOT NULL COMMENT '价格 0.01-9999.00',
    `negotiable`       TINYINT(1)       NOT NULL DEFAULT 0 COMMENT '是否可议价',
    `stock`            INT              NOT NULL DEFAULT 1 COMMENT '库存 1-99；0 表示已售罄不可购买',
    `status`           TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0草稿/1待审核/2在售/3已下架/4已售出',
    `off_shelf_reason` VARCHAR(200)              DEFAULT NULL COMMENT '下架原因；管理员下架违规时必填（10-200 字），卖家可见',
    `create_time`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布提交时间',
    `update_time`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后编辑时间',
    PRIMARY KEY (`id`),
    KEY `idx_category_status` (`category_id`, `status`),
    KEY `idx_seller` (`seller_id`),
    KEY `idx_status_create` (`status`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='商品表';

-- 6. goods_image 商品图片表 -------------------------------------------
CREATE TABLE IF NOT EXISTS `goods_image` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片ID',
    `goods_id`    BIGINT UNSIGNED          DEFAULT NULL COMMENT '所属商品 → goods.id；NULL=未绑定商品（先传图后发布）',
    `uploader_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '上传者用户ID（未绑定期间属主判定）',
    `url`         VARCHAR(255)    NOT NULL COMMENT '图片相对 URL（本地文件存储，/images/** 静态映射访问）',
    `sort`        TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序；0=主图（第一张）',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (`id`),
    KEY `idx_goods` (`goods_id`, `sort`),
    UNIQUE KEY `uk_goods_sort` (`goods_id`, `sort`),
    CONSTRAINT `fk_gi_goods` FOREIGN KEY (`goods_id`) REFERENCES `goods` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='商品图片表';

-- 7. cart_item 购物车条目表 -------------------------------------------
CREATE TABLE IF NOT EXISTS `cart_item` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`     BIGINT UNSIGNED NOT NULL COMMENT '所属买家（登录态解析，防越权）',
    `goods_id`    BIGINT UNSIGNED NOT NULL COMMENT '商品 id；同一用户同商品仅一条，重复加购累加 num',
    `num`         INT             NOT NULL COMMENT '购买数量 1≤num≤99（上限取商品当前 stock）',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次加入时间',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近调整时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_goods` (`user_id`, `goods_id`),
    KEY `idx_user` (`user_id`),
    CONSTRAINT `fk_ci_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
    CONSTRAINT `fk_ci_goods` FOREIGN KEY (`goods_id`) REFERENCES `goods` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='购物车条目表';

-- 8. orders 订单表 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`    VARCHAR(20)     NOT NULL COMMENT '业务订单号：日期(yyyyMMdd)+当日序号(6位)，如 20261029000001',
    `buyer_id`    BIGINT UNSIGNED NOT NULL COMMENT '买家；查询与属主校验依据',
    `seller_id`   BIGINT UNSIGNED NOT NULL COMMENT '卖家，下单时从 goods.seller_id 冗余',
    `goods_id`    BIGINT UNSIGNED NOT NULL COMMENT '商品 id；一单一商品（购物车多件→拆单）',
    `deal_price`  DECIMAL(10,2)   NOT NULL COMMENT '成交价快照＝下单时刻 goods.price',
    `num`         INT             NOT NULL COMMENT '购买数量 ≥1',
    `remark`      VARCHAR(100)             DEFAULT NULL COMMENT '收货备注 ≤100 字',
    `status`      TINYINT         NOT NULL DEFAULT 0 COMMENT '状态：0待支付/1已支付/2已完成/3已取消',
    `pay_time`    DATETIME                 DEFAULT NULL COMMENT '模拟支付成功时间',
    `finish_time` DATETIME                 DEFAULT NULL COMMENT '确认收货时间',
    `cancel_time` DATETIME                 DEFAULT NULL COMMENT '取消时间',
    `request_id`  VARCHAR(64)     NOT NULL COMMENT '客户端幂等键（uk_request 兜底防重复提交）',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    UNIQUE KEY `uk_request` (`request_id`),
    KEY `idx_buyer_status` (`buyer_id`, `status`, `create_time`),
    KEY `idx_seller` (`seller_id`, `create_time`),
    CONSTRAINT `fk_o_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `user` (`id`),
    CONSTRAINT `fk_o_seller` FOREIGN KEY (`seller_id`) REFERENCES `user` (`id`),
    CONSTRAINT `fk_o_goods` FOREIGN KEY (`goods_id`) REFERENCES `goods` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='订单表';

-- 9. review 交易评价表【可选模块，随建库创建】 --------------------------
CREATE TABLE IF NOT EXISTS `review` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_id`    BIGINT UNSIGNED NOT NULL COMMENT '仅"已完成"订单可评价',
    `rater_id`    BIGINT UNSIGNED NOT NULL COMMENT '评价人（买家或卖家）',
    `ratee_id`    BIGINT UNSIGNED NOT NULL COMMENT '被评价人；与 rater 分属订单买卖双方',
    `score`       TINYINT         NOT NULL COMMENT '星级 1≤score≤5',
    `content`     VARCHAR(200)    NOT NULL COMMENT '评价文字',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评价时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_rater` (`order_id`, `rater_id`),
    KEY `idx_ratee` (`ratee_id`, `create_time`),
    CONSTRAINT `fk_r_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
    CONSTRAINT `fk_r_rater` FOREIGN KEY (`rater_id`) REFERENCES `user` (`id`),
    CONSTRAINT `fk_r_ratee` FOREIGN KEY (`ratee_id`) REFERENCES `user` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='交易评价表（可选模块）';

-- 10. message 站内消息表【可选模块，随建库创建】 ------------------------
CREATE TABLE IF NOT EXISTS `message` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`     BIGINT UNSIGNED NOT NULL COMMENT '接收人',
    `type`        VARCHAR(20)     NOT NULL COMMENT '消息类型：order_created/order_paid/order_canceled/system',
    `content`     VARCHAR(255)    NOT NULL COMMENT '消息内容（含订单号）',
    `is_read`     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '0 未读 / 1 已读',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '产生时间',
    PRIMARY KEY (`id`),
    KEY `idx_user_read` (`user_id`, `is_read`, `create_time`),
    CONSTRAINT `fk_m_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='站内消息表（可选模块）';
