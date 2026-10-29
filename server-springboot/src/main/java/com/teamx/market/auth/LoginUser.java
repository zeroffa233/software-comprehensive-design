package com.teamx.market.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 当前登录用户上下文（由 JwtAuthFilter 注入 ThreadLocal）
 * agent-svc 令牌请求时 uid 取 X-User-Id 头（Skill 转发用户上下文）
 */
@Data
@AllArgsConstructor
public class LoginUser {

    private long uid;
    /** USER / ADMIN / AGENT_SVC */
    private String role;
}
