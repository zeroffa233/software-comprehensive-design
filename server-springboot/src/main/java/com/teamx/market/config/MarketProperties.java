package com.teamx.market.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 应用配置项（密钥走环境变量，默认值仅用于 dev）
 */
@Data
@Component
@ConfigurationProperties(prefix = "market")
public class MarketProperties {

    private Jwt jwt = new Jwt();
    private String uploadDir = "./uploads";
    private Agent agent = new Agent();

    @Data
    public static class Jwt {
        private String secret = "campus-market-dev-2026-SECRET-KEY";
        private int expireHours = 2;
    }

    @Data
    public static class Agent {
        private String baseUrl = "http://127.0.0.1:8100";
        private String svcPhone = "13800000000";
        private String svcPassword = "Agent@2026";
    }
}
