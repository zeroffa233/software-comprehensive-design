package com.teamx.market.config;

import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.format.DateTimeFormatter;

/**
 * Web 配置：CORS（dev 全放行）、/images/** 静态映射本地文件、时间格式 yyyy-MM-dd HH:mm:ss
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final MarketProperties properties;

    public WebMvcConfig(MarketProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*")
                .exposedHeaders("Authorization")
                .allowCredentials(true)
                .maxAge(3600);
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
