package com.teamx.market.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;

/**
 * v2.1.0 增量列迁移（幂等）：
 * CREATE TABLE IF NOT EXISTS 不会为已存在的旧库补列，这里在启动时
 * 查询 information_schema.COLUMNS，仅当列不存在时执行 ALTER TABLE ADD COLUMN。
 * 列定义与 db/migration/schema.sql 中 CREATE TABLE 保持一致。
 *
 * 顺序保证：seed.sql（spring.sql.init）已引用新列，迁移必须先于脚本初始化执行，
 * 故通过静态 BeanFactoryPostProcessor 给 SqlDataSourceScriptDatabaseInitializer
 * 显式加 depends-on = schemaMigrator。
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class SchemaMigrator implements InitializingBean {

    /** 表名 → 列名 → 列定义（与 schema.sql 完全一致） */
    private static final Map<String, Map<String, String>> REQUIRED_COLUMNS = Map.of(
            "goods", Map.of(
                    "urgent", "`urgent` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '急售标记：0 否 / 1 是（v2.1.0，sort=hot 首要排序依据）'",
                    "view_count", "`view_count` INT NOT NULL DEFAULT 0 COMMENT '浏览量：详情每次访问 +1（v2.1.0）'",
                    "cart_count", "`cart_count` INT NOT NULL DEFAULT 0 COMMENT '加购次数：加入 +1、移除 -1，下限 0（v2.1.0）'",
                    "freight", "`freight` DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '运费 0-50.00；0=包邮（v2.1.0，发布/编辑入参校验）'"),
            "orders", Map.of(
                    "freight_amount", "`freight_amount` DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '运费快照＝下单时刻 goods.freight（v2.1.0）'",
                    "total_amount", "`total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '应付总额＝deal_price*num+freight_amount（v2.1.0）'"));

    private final DataSource dataSource;

    @Bean
    public static BeanFactoryPostProcessor schemaMigratorOrder() {
        return (ConfigurableListableBeanFactory bf) -> {
            // Spring Boot 3.2：dataSourceScriptDatabaseInitializer（老版本为 sqlDataSourceScriptDatabaseInitializer）
            for (String initializer : List.of("dataSourceScriptDatabaseInitializer",
                    "sqlDataSourceScriptDatabaseInitializer")) {
                if (bf.containsBeanDefinition(initializer)) {
                    BeanDefinition bd = bf.getBeanDefinition(initializer);
                    List<String> dependsOn = bd.getDependsOn() == null
                            ? List.of() : List.of(bd.getDependsOn());
                    if (!dependsOn.contains("schemaMigrator")) {
                        bd.setDependsOn(java.util.stream.Stream
                                .concat(dependsOn.stream(), java.util.stream.Stream.of("schemaMigrator"))
                                .toArray(String[]::new));
                    }
                }
            }
        };
    }

    @Override
    public void afterPropertiesSet() {
        try {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            String catalog = jdbc.queryForObject("SELECT DATABASE()", String.class);
            for (Map.Entry<String, Map<String, String>> table : REQUIRED_COLUMNS.entrySet()) {
                // 该迁移只服务"旧库补列"场景：本迁移先于脚本初始化执行（seed.sql 要用新列），
                // 全新数据库此时还没有表，若继续 ALTER 会报 Table doesn't exist，导致首次启动失败。
                Long exists = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM information_schema.TABLES "
                                + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
                        Long.class, catalog, table.getKey());
                if (exists == null || exists == 0L) {
                    log.info("schema migrate skipped: {} 表不存在（首建库由 schema.sql 建全列）", table.getKey());
                    continue;
                }
                for (Map.Entry<String, String> col : table.getValue().entrySet()) {
                    List<Map<String, Object>> found = jdbc.queryForList(
                            "SELECT 1 FROM information_schema.COLUMNS "
                                    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                            catalog, table.getKey(), col.getKey());
                    if (found.isEmpty()) {
                        jdbc.execute("ALTER TABLE `" + table.getKey() + "` ADD COLUMN " + col.getValue());
                        log.info("schema migrated: {}.{} added", table.getKey(), col.getKey());
                    }
                }
            }
        } catch (Exception e) {
            throw new IllegalStateException("v2.1.0 schema migration failed", e);
        }
    }
}
