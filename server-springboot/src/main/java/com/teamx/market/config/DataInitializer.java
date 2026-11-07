package com.teamx.market.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.teamx.market.auth.entity.User;
import com.teamx.market.auth.mapper.UserMapper;
import com.teamx.market.goods.entity.Goods;
import com.teamx.market.goods.mapper.GoodsMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.security.SecureRandom;
import java.util.List;
import java.util.Map;

/**
 * 启动初始化（幂等）：
 * 1. 种子账号密码以 BCrypt 写入/校正（seed.sql 中为占位符，避免入库明文）；
 * 2. 生成种子商品主图（纯色 PNG，/images/seed/g{n}.png 静态映射）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserMapper userMapper;
    private final GoodsMapper goodsMapper;
    private final MarketProperties properties;
    private final Environment environment;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** 手机号 → 明文密码（仅 dev 启动时使用，不持久化明文） */
    private static final Map<String, String> SEED_ACCOUNTS = Map.of(
            "13800000001", "Admin123456",
            "13800000002", "User123456",
            "13800000003", "User123456");

    @Override
    public void run(String... args) {
        if (devLike()) {
            seedPasswords();
        } else {
            // 生产环境重启会把种子账号密码改回默认值 → 等于内置后门，只允许 dev/test 执行
            log.warn("非 dev/test profile：跳过种子账号口令初始化（生产不应存在种子账号）");
        }
        seedImages();
    }

    /** 未显式指定 profile 时按本地开发处理（application.yml 默认 dev） */
    private boolean devLike() {
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

    private void seedPasswords() {
        SEED_ACCOUNTS.forEach((phone, rawPassword) -> {
            User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
            if (user == null) {
                log.warn("seed account {} missing, expected from seed.sql", phone);
                return;
            }
            if (!encoder.matches(rawPassword, user.getPasswordHash())) {
                user.setPasswordHash(encoder.encode(rawPassword));
                userMapper.updateById(user);
                log.info("seeded bcrypt password for {}", phone);
            }
        });
    }

    private void seedImages() {
        List<Goods> goodsList = goodsMapper.selectList(null);
        File dir = new File(properties.getUploadDir(), "seed");
        if (!dir.exists() && !dir.mkdirs()) {
            log.warn("cannot create seed image dir {}", dir);
            return;
        }
        for (Goods g : goodsList) {
            File f = new File(dir, "g" + g.getId() + ".png");
            if (f.exists()) {
                continue;
            }
            try {
                float hue = (g.getId() * 47) % 360;
                Color color = Color.getHSBColor(hue / 360f, 0.45f, 0.75f);
                BufferedImage img = new BufferedImage(400, 400, BufferedImage.TYPE_INT_RGB);
                for (int x = 0; x < 400; x++) {
                    for (int y = 0; y < 400; y++) {
                        img.setRGB(x, y, color.getRGB());
                    }
                }
                ImageIO.write(img, "png", f);
            } catch (Exception e) {
                log.warn("seed image {} failed: {}", f, e.getMessage());
            }
        }
    }
}
