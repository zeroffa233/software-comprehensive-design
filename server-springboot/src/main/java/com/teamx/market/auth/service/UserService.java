package com.teamx.market.auth.service;

import com.teamx.market.auth.dto.ChangePwdReq;
import com.teamx.market.auth.dto.UpdateMeReq;
import com.teamx.market.auth.entity.User;
import com.teamx.market.auth.mapper.UserMapper;
import com.teamx.market.auth.JwtAuthFilter;
import com.teamx.market.common.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 个人信息服务：查询/修改资料、修改密码、上传头像
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;
    private final StringRedisTemplate redis;
    private final com.teamx.market.config.MarketProperties properties;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public Map<String, Object> me(long uid) {
        User user = mustGet(uid);
        Map<String, Object> data = new HashMap<>();
        data.put("userId", user.getId());
        data.put("phone", maskPhone(user.getPhone()));
        data.put("nickname", user.getNickname());
        data.put("avatar", user.getAvatar());
        data.put("signature", user.getSignature());
        data.put("role", user.getRole());
        data.put("status", user.getStatus());
        data.put("createTime", user.getCreateTime());
        return data;
    }

    public Map<String, Object> updateMe(long uid, UpdateMeReq req) {
        User user = mustGet(uid);
        if (req.getNickname() != null) {
            user.setNickname(req.getNickname());
        }
        if (req.getAvatar() != null) {
            user.setAvatar(req.getAvatar());
        }
        if (req.getSignature() != null) {
            user.setSignature(req.getSignature());
        }
        userMapper.updateById(user);
        Map<String, Object> data = new HashMap<>();
        data.put("nickname", user.getNickname());
        data.put("avatar", user.getAvatar());
        return data;
    }

    public void changePassword(long uid, ChangePwdReq req) {
        User user = mustGet(uid);
        if (!encoder.matches(req.getOldPassword(), user.getPasswordHash())) {
            throw BizException.badRequest("旧密码错误");
        }
        if (encoder.matches(req.getNewPassword(), user.getPasswordHash())) {
            throw BizException.badRequest("新密码不能与旧密码相同");
        }
        user.setPasswordHash(encoder.encode(req.getNewPassword()));
        userMapper.updateById(user);
        // 其他会话失效（当前会话同样失效，须重新登录）
        redis.delete(JwtAuthFilter.SESSION_PREFIX + uid);
    }

    /** 上传头像：jpg/png ≤2MB，存 uploads/avatar/，静态映射 /images/** */
    public Map<String, Object> uploadAvatar(long uid, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BizException.badRequest("头像文件不能为空");
        }
        String ext = extOf(file.getOriginalFilename());
        if (!Set.of("jpg", "jpeg", "png").contains(ext)) {
            throw BizException.badRequest("头像仅支持 jpg/png");
        }
        if (file.getSize() > 2L * 1024 * 1024) {
            throw BizException.badRequest("头像不能超过 2MB");
        }
        try {
            BufferedImage img = ImageIO.read(file.getInputStream());
            if (img == null) {
                throw BizException.badRequest("图片文件无法解析");
            }
            String filename = "avatar/" + UUID.randomUUID().toString().replace("-", "") + "." + ext;
            Path target = Paths.get(properties.getUploadDir(), filename);
            Files.createDirectories(target.getParent());
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            User user = mustGet(uid);
            String url = "/images/" + filename;
            user.setAvatar(url);
            userMapper.updateById(user);
            Map<String, Object> data = new HashMap<>();
            data.put("avatarUrl", url);
            return data;
        } catch (IOException e) {
            throw new BizException(5000, "头像保存失败");
        }
    }

    public User mustGet(long uid) {
        User user = userMapper.selectById(uid);
        if (user == null) {
            throw BizException.notFound("用户不存在");
        }
        return user;
    }

    public static String maskPhone(String phone) {
        return phone == null || phone.length() < 11 ? phone : phone.substring(0, 3) + "****" + phone.substring(7);
    }

    static String extOf(String name) {
        if (name == null || !name.contains(".")) {
            return "";
        }
        return name.substring(name.lastIndexOf('.') + 1).toLowerCase();
    }
}
