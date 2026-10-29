package com.teamx.market.common;

/**
 * 全组统一错误码表（design/接口规范总则.md §3）
 */
public final class Codes {

    public static final int OK = 0;
    /** 参数非法 */
    public static final int BAD_REQUEST = 400;
    /** 未登录 / Token 失效 */
    public static final int UNAUTHORIZED = 401;
    /** 权限不足 / 非资源属主 */
    public static final int FORBIDDEN = 403;
    /** 资源不存在 */
    public static final int NOT_FOUND = 404;
    /** 业务状态冲突 */
    public static final int CONFLICT = 409;
    /** 账号状态受限 */
    public static final int LOCKED = 423;
    /** 请求过于频繁 */
    public static final int TOO_MANY = 429;
    /** 服务器内部错误 */
    public static final int SERVER_ERROR = 5000;
    /** Agent 参数非法 */
    public static final int AGENT_BAD_PARAMS = 4001;
    /** Agent 权限不足 */
    public static final int AGENT_FORBIDDEN = 4003;

    private Codes() {
    }
}
