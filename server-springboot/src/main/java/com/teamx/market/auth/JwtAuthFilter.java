package com.teamx.market.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.teamx.market.common.Codes;
import com.teamx.market.common.R;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * JWT 鉴权过滤器：解析 Bearer token → 校验 Redis 会话 session:{uid} → 注入 UserContext
 * 白名单（游客可访问）：注册/验证码/登录/找回密码、分类树、商品列表与详情（GET）
 * agent-svc 令牌：仅放行 GET；uid 取 X-User-Id 头（Skill 转发用户上下文）
 */
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String SESSION_PREFIX = "session:";
    public static final String HEADER_X_USER_ID = "X-User-Id";

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    /** 游客白名单：{method, pattern} */
    private static final List<String[]> WHITE_LIST = List.of(
            new String[]{"POST", "/api/v1/auth/register"},
            new String[]{"POST", "/api/v1/auth/sms-code"},
            new String[]{"POST", "/api/v1/auth/login"},
            new String[]{"POST", "/api/v1/auth/find-password"},
            new String[]{"GET", "/api/v1/categories"},
            new String[]{"GET", "/api/v1/categories/*"},
            new String[]{"GET", "/api/v1/goods"},
            new String[]{"GET", "/api/v1/goods/*"});

    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String method = request.getMethod();
        if (HttpMethod.OPTIONS.matches(method)) {
            chain.doFilter(request, response);
            return;
        }
        String path = request.getRequestURI();
        boolean whitelisted = isWhiteListed(method, path);
        String token = extractToken(request);
        if (whitelisted) {
            // 游客可访问；若携带有效令牌则注入上下文（商品详情属主/管理员可见性判断需要）
            if (token != null) {
                tryInject(request, response, chain, token, method);
                return;
            }
            chain.doFilter(request, response);
            return;
        }

        if (token == null) {
            writeError(response, Codes.UNAUTHORIZED, "未登录，请先登录");
            return;
        }
        tryInject(request, response, chain, token, method);
    }

    private void tryInject(HttpServletRequest request, HttpServletResponse response,
                           FilterChain chain, String token, String method)
            throws ServletException, IOException {
        Claims claims;
        try {
            claims = jwtUtil.parse(token);
        } catch (Exception e) {
            // 白名单路径携带无效令牌 → 按游客放行；受保护路径 → 401
            if (isWhiteListed(method, request.getRequestURI())) {
                chain.doFilter(request, response);
            } else {
                writeError(response, Codes.UNAUTHORIZED, "Token 无效或已过期");
            }
            return;
        }
        long uid = ((Number) claims.get("uid")).longValue();
        String role = (String) claims.get("role");

        // Redis 会话校验：封禁/退出/改密后主动失效
        if (!JwtUtil.ROLE_AGENT_SVC.equals(role)
                && Boolean.FALSE.equals(redis.hasKey(SESSION_PREFIX + uid))) {
            writeError(response, Codes.UNAUTHORIZED, "登录已失效，请重新登录");
            return;
        }

        // agent-svc 服务账号：只读（GET），uid 强制取 X-User-Id 头
        if (JwtUtil.ROLE_AGENT_SVC.equals(role)) {
            if (!HttpMethod.GET.matches(method)) {
                writeError(response, Codes.FORBIDDEN, "agent-svc 仅允许只读操作");
                return;
            }
            String xUid = request.getHeader(HEADER_X_USER_ID);
            if (xUid == null || !xUid.matches("\\d+")) {
                writeError(response, Codes.UNAUTHORIZED, "缺少用户上下文 X-User-Id");
                return;
            }
            uid = Long.parseLong(xUid);
        }

        UserContext.set(new LoginUser(uid, role));
        try {
            chain.doFilter(request, response);
        } finally {
            UserContext.clear();
        }
    }

    private boolean isWhiteListed(String method, String path) {
        // /goods/mine 需要登录，先于 /goods/* 白名单排除
        if ("/api/v1/goods/mine".equals(path)) {
            return false;
        }
        return WHITE_LIST.stream().anyMatch(r -> r[0].equals(method) && MATCHER.match(r[1], path));
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7).trim();
            return token.isEmpty() ? null : token;
        }
        return null;
    }

    private void writeError(HttpServletResponse response, int code, String msg) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType("application/json;charset=UTF-8");
        // CORS 头由最高优先级 CorsFilter 统一写入（含本过滤器提前写回的响应）
        response.getWriter().write(objectMapper.writeValueAsString(R.fail(code, msg)));
    }
}
