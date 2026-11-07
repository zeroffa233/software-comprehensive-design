package com.teamx.market.auth;

import com.teamx.market.config.MarketProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * JWT 工具：载荷 uid + role(USER/ADMIN/AGENT_SVC) + iat + exp，HS256，默认 2h
 */
@Component
public class JwtUtil {

    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_AGENT_SVC = "AGENT_SVC";

    private final MarketProperties properties;
    private final byte[] secret;

    /** 仓库内可见的开发默认值：非 dev 环境仍使用它等于把令牌签发权交给所有读过代码的人 */
    private static final String DEFAULT_DEV_SECRET = "campus-market-dev-2026-SECRET-KEY";

    public JwtUtil(MarketProperties properties, Environment environment) {
        this.properties = properties;
        String secretText = properties.getJwt().getSecret();
        if (secretText == null || secretText.isEmpty()) {
            throw new IllegalStateException("JWT 密钥未配置：请通过环境变量 JWT_SECRET 注入（≥32 字节）");
        }
        this.secret = secretText.getBytes(StandardCharsets.UTF_8);
        if (!devLike(environment) && (DEFAULT_DEV_SECRET.equals(secretText) || this.secret.length < 32)) {
            throw new IllegalStateException(
                    "JWT_SECRET 使用了开发默认值或长度不足 32 字节：非 dev 环境必须注入独立密钥");
        }
    }

    /** 未显式指定 profile 时按本地开发处理（application.yml 默认 dev），test 视同开发 */
    private static boolean devLike(Environment environment) {
        String[] profiles = environment.getActiveProfiles();
        if (profiles == null || profiles.length == 0) {
            return true;
        }
        for (String profile : profiles) {
            if ("dev".equals(profile) || "test".equals(profile)) {
                return true;
            }
        }
        return false;
    }

    /** 签发访问令牌 */
    public String generate(long uid, String role) {
        return generate(uid, role, properties.getJwt().getExpireHours() * 3600L);
    }

    /** 签发指定有效期的令牌（服务令牌/代理转发用） */
    public String generate(long uid, String role, long ttlSeconds) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("uid", uid);
        claims.put("role", role);
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .setClaims(claims)
                .setIssuedAt(new Date(now))
                .setExpiration(new Date(now + ttlSeconds * 1000))
                .signWith(Keys.hmacShaKeyFor(secret), SignatureAlgorithm.HS256)
                .compact();
    }

    /** 解析并验签，失败抛 Jwts 异常（调用方转 401） */
    public Claims parse(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(Keys.hmacShaKeyFor(secret))
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public long expireSeconds() {
        return properties.getJwt().getExpireHours() * 3600L;
    }
}
