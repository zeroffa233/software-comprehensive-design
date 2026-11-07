package com.teamx.market.config;

import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.format.DateTimeFormatter;

/**
 * Web 配置：/images/** 静态映射本地文件、时间格式 yyyy-MM-dd HH:mm:ss
 * CORS 统一由 {@link CorsConfig} 的 CorsFilter 处理（此处不再重复注册，避免两处策略不一致）。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final MarketProperties properties;

    public WebMvcConfig(MarketProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/images/**")
                .addResourceLocations("file:" + properties.getUploadDir() + "/");
    }

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer localDateTimeFormat() {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        return builder -> builder
                .serializers(new LocalDateTimeSerializer(fmt))
                .deserializers(new LocalDateTimeDeserializer(fmt));
    }
}
