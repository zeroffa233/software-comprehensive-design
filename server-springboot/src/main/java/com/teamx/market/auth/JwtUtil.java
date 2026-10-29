package com.teamx.market.auth;

import com.teamx.market.config.MarketProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
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

    public JwtUtil(MarketProperties properties) {
        this.properties = properties;
        this.secret = properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
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
