package com.teamx.market.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.teamx.market.auth.JwtUtil;
import com.teamx.market.auth.JwtAuthFilter;
import com.teamx.market.auth.dto.FindPwdReq;
import com.teamx.market.auth.dto.LoginReq;
import com.teamx.market.auth.dto.RegisterReq;
import com.teamx.market.auth.dto.SmsCodeReq;
import com.teamx.market.auth.entity.AdminOpLog;
import com.teamx.market.auth.entity.User;
import com.teamx.market.auth.mapper.AdminOpLogMapper;
import com.teamx.market.auth.mapper.UserMapper;
import com.teamx.market.common.BizException;
import com.teamx.market.common.Codes;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * 认证服务：注册 / 验证码 / 登录 / 退出 / 找回密码
 * Redis：sms:{scene}:{phone}(TTL 300s)、sms:lock:{scene}:{phone}(60s 限频)、
 *        session:{uid}(JWT 会话白名单)、login:fail:{phone}、login:lock:{phone}
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    public static final String KEY_SMS = "sms:";
    public static final String KEY_SMS_LOCK = "sms:lock:";
    public static final String KEY_SESSION = "session:";
    public static final String KEY_LOGIN_FAIL = "login:fail:";
    public static final String KEY_LOGIN_LOCK = "login:lock:";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserMapper userMapper;
    private final AdminOpLogMapper adminOpLogMapper;
    private final StringRedisTemplate redis;
    private final JwtUtil jwtUtil;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** 获取短信验证码（dev：data 附 devCode；无真实短信通道） */
    public Map<String, Object> smsCode(SmsCodeReq req) {
        String lockKey = KEY_SMS_LOCK + req.getScene() + ":" + req.getPhone();
        if (Boolean.TRUE.equals(redis.hasKey(lockKey))) {
            throw BizException.tooMany("验证码获取过于频繁，请 60 秒后再试");
        }
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        redis.opsForValue().set(KEY_SMS + req.getScene() + ":" + req.getPhone(), code, Duration.ofSeconds(300));
        redis.opsForValue().set(lockKey, "1", Duration.ofSeconds(60));
        Map<String, Object> data = new HashMap<>();
        // dev accommodation（契约初稿·待课次4校准）：无真实短信通道，dev 环境回显验证码
        data.put("devCode", code);
        return data;
    }

    /** 注册（注册即登录） */
    public Map<String, Object> register(RegisterReq req) {
        if (!req.getPassword().equals(req.getConfirmPassword())) {
            throw BizException.badRequest("两次输入的密码不一致");
        }
        if (userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getPhone, req.getPhone())) > 0) {
            throw BizException.conflict("手机号已注册");
        }
        verifySms("REGISTER", req.getPhone(), req.getSmsCode());
        User user = new User();
        user.setPhone(req.getPhone());
        user.setPasswordHash(encoder.encode(req.getPassword()));
        user.setNickname("用户" + req.getPhone().substring(7));
        user.setRole(User.ROLE_USER);
        user.setStatus(User.STATUS_ACTIVE);
        userMapper.insert(user);

        redis.delete(KEY_SMS + "REGISTER:" + req.getPhone());
        String token = issueSession(user.getId(), user.getRole());
        Map<String, Object> data = new HashMap<>();
        data.put("userId", user.getId());
        data.put("token", token);
        return data;
    }

    /** 登录：密码或验证码；5 次密码错锁定 15 分钟；封禁 423+原因 */
    public Map<String, Object> login(LoginReq req) {
        String lockKey = KEY_LOGIN_LOCK + req.getPhone();
        if (Boolean.TRUE.equals(redis.hasKey(lockKey))) {
            throw BizException.locked("密码连续错误已锁定，请 15 分钟后重试");
        }
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, req.getPhone()));
        if (user == null) {
            throw BizException.notFound("用户不存在");
        }
        if (User.STATUS_BANNED.equals(user.getStatus())) {
            throw new BizException(Codes.LOCKED, "账号已被封禁：" + latestBanReason(user.getId()));
        }

        if ("SMS".equals(req.getLoginType())) {
            verifySms("LOGIN", req.getPhone(), req.getSmsCode());
            redis.delete(KEY_SMS + "LOGIN:" + req.getPhone());
        } else {
            if (req.getPassword() == null || !encoder.matches(req.getPassword(), user.getPasswordHash())) {
                long fails = redis.opsForValue().increment(KEY_LOGIN_FAIL + req.getPhone());
                redis.expire(KEY_LOGIN_FAIL + req.getPhone(), Duration.ofSeconds(900));
                if (fails >= 5) {
                    redis.opsForValue().set(lockKey, "1", Duration.ofSeconds(900));
                    redis.delete(KEY_LOGIN_FAIL + req.getPhone());
                }
                throw BizException.badRequest("手机号或密码错误");
            }
            redis.delete(KEY_LOGIN_FAIL + req.getPhone());
        }

        user.setLastLoginTime(java.time.LocalDateTime.now());
        userMapper.updateById(user);
        String token = issueSession(user.getId(), user.getRole());
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("expiresIn", jwtUtil.expireSeconds());
        data.put("role", user.getRole());
        data.put("status", user.getStatus());
        return data;
    }

    /** agent-svc 服务账号登录（dev 约定凭证，签发 role=AGENT_SVC 令牌，无 DB 记录） */
    public Map<String, Object> svcToken(String phone, String password, String expectPhone, String expectPassword) {
        if (!expectPhone.equals(phone) || !expectPassword.equals(password)) {
            throw new BizException(Codes.FORBIDDEN, "服务账号凭证错误");
        }
        String token = jwtUtil.generate(0, JwtUtil.ROLE_AGENT_SVC);
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("expiresIn", jwtUtil.expireSeconds());
        data.put("role", JwtUtil.ROLE_AGENT_SVC);
        return data;
    }

    /** 退出：Redis 会话失效 */
    public void logout(long uid) {
        redis.delete(KEY_SESSION + uid);
    }

    /** 找回密码：旧会话全部失效 */
    public void findPassword(FindPwdReq req) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, req.getPhone()));
        if (user == null) {
            throw BizException.notFound("用户不存在");
        }
        verifySms("FIND_PWD", req.getPhone(), req.getSmsCode());
        user.setPasswordHash(encoder.encode(req.getNewPassword()));
        userMapper.updateById(user);
        redis.delete(KEY_SMS + "FIND_PWD:" + req.getPhone());
        redis.delete(KEY_SESSION + user.getId());
    }

    /** 封禁原因摘要：取最近一条 BAN_USER 操作日志的 detail */
    public String latestBanReason(long userId) {
        AdminOpLog log = adminOpLogMapper.selectOne(new LambdaQueryWrapper<AdminOpLog>()
                .eq(AdminOpLog::getTargetType, "user")
                .eq(AdminOpLog::getTargetId, userId)
                .eq(AdminOpLog::getAction, AdminOpLog.ACTION_BAN_USER)
                .orderByDesc(AdminOpLog::getCreateTime)
                .last("LIMIT 1"));
        return log == null || log.getDetail() == null ? "违规使用" : log.getDetail();
    }

    /** 写入会话并签发 token */
    public String issueSession(long uid, String role) {
        String token = jwtUtil.generate(uid, role);
        redis.opsForValue().set(KEY_SESSION + uid, token, Duration.ofSeconds(jwtUtil.expireSeconds()));
        return token;
    }

    private void verifySms(String scene, String phone, String code) {
        String key = KEY_SMS + scene + ":" + phone;
        String saved = redis.opsForValue().get(key);
        if (saved == null || !saved.equals(code)) {
            throw BizException.badRequest("验证码错误或已过期");
        }
    }
}
