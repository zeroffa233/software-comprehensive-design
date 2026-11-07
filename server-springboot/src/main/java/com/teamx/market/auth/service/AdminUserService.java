package com.teamx.market.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.teamx.market.auth.JwtAuthFilter;
import com.teamx.market.auth.entity.AdminOpLog;
import com.teamx.market.auth.entity.User;
import com.teamx.market.auth.mapper.AdminOpLogMapper;
import com.teamx.market.auth.mapper.UserMapper;
import com.teamx.market.common.BizException;
import com.teamx.market.common.PageResult;
import com.teamx.market.goods.entity.Goods;
import com.teamx.market.goods.mapper.GoodsMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 管理端用户服务：用户列表、封禁/解封（JWT 失效 + 在售商品自动下架 + 日志）
 */
@Service
@RequiredArgsConstructor
public class AdminUserService {

    private final UserMapper userMapper;
    private final AdminOpLogMapper opLogMapper;
    private final GoodsMapper goodsMapper;
    private final RedisTemplate<String, Object> redisTemplate;

    public PageResult<Map<String, Object>> listUsers(long page, long pageSize,
                                                     String phone, String nickname, String status) {
        LambdaQueryWrapper<User> qw = new LambdaQueryWrapper<User>()
                .like(phone != null && !phone.isBlank(), User::getPhone, phone)
                .like(nickname != null && !nickname.isBlank(), User::getNickname, nickname)
                .eq(status != null && !status.isBlank(), User::getStatus, status)
                .orderByAsc(User::getId);
        Page<User> p = userMapper.selectPage(new Page<>(page, pageSize), qw);
        List<Map<String, Object>> list = p.getRecords().stream().map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("userId", u.getId());
            m.put("phone", UserService.maskPhone(u.getPhone()));
            m.put("nickname", u.getNickname());
            m.put("role", u.getRole());
            m.put("status", u.getStatus());
            m.put("createTime", u.getCreateTime());
            m.put("lastLoginTime", u.getLastLoginTime());
            return m;
        }).collect(Collectors.toList());
        return new PageResult<>(list, p.getTotal(), p.getCurrent(), p.getSize());
    }

    /** 封禁：JWT 失效 + 其在售商品自动下架 + 操作日志 */
    @Transactional
    public void ban(long targetUserId, String reason) {
        User user = userMapper.selectById(targetUserId);
        if (user == null) {
            throw BizException.notFound("用户不存在");
        }
        if (User.ROLE_ADMIN.equals(user.getRole())) {
            throw BizException.forbidden("不能封禁管理员账号");
        }
        if (User.STATUS_BANNED.equals(user.getStatus())) {
            throw BizException.conflict("该账号已是封禁状态");
        }
        user.setStatus(User.STATUS_BANNED);
        userMapper.updateById(user);
        // 在售商品自动下架（连带清除缓存）
        List<Goods> onSale = goodsMapper.selectList(new LambdaQueryWrapper<Goods>()
                .eq(Goods::getSellerId, targetUserId)
                .eq(Goods::getStatus, Goods.STATUS_ON_SALE));
        for (Goods g : onSale) {
            g.setStatus(Goods.STATUS_OFF_SHELF);
            g.setOffShelfReason("账号被封禁，商品自动下架：" + reason);
            goodsMapper.updateById(g);
        }
        // 已签发 Token 失效
        redisTemplate.delete(JwtAuthFilter.SESSION_PREFIX + targetUserId);
        redisTemplate.delete(redisTemplate.keys("goods:*"));
        insertLog(currentAdminId(), AdminOpLog.ACTION_BAN_USER, "user", targetUserId, reason);
    }

    /** 解封：恢复原角色权限 + 日志 */
    @Transactional
    public void unban(long targetUserId) {
        User user = userMapper.selectById(targetUserId);
        if (user == null) {
            throw BizException.notFound("用户不存在");
        }
        if (!User.STATUS_BANNED.equals(user.getStatus())) {
            throw BizException.conflict("该账号未被封禁");
        }
        user.setStatus(User.STATUS_ACTIVE);
        userMapper.updateById(user);
        insertLog(currentAdminId(), AdminOpLog.ACTION_UNBAN_USER, "user", targetUserId, "解封账号");
    }

    /** 操作日志分页（只读，按时间倒序） */
    public PageResult<Map<String, Object>> opLogs(long page, long pageSize, Long adminId,
                                                  String action, String targetType) {
        LambdaQueryWrapper<AdminOpLog> qw = new LambdaQueryWrapper<AdminOpLog>()
                .eq(adminId != null, AdminOpLog::getAdminId, adminId)
                .eq(action != null && !action.isBlank(), AdminOpLog::getAction, action)
                .eq(targetType != null && !targetType.isBlank(), AdminOpLog::getTargetType, targetType)
                .orderByDesc(AdminOpLog::getCreateTime);
        Page<AdminOpLog> p = opLogMapper.selectPage(new Page<>(page, pageSize), qw);
        List<Map<String, Object>> list = p.getRecords().stream().map(l -> {
            Map<String, Object> m = new HashMap<>();
            m.put("action", l.getAction());
            m.put("adminName", adminName(l.getAdminId()));
            m.put("targetType", l.getTargetType());
            m.put("targetId", l.getTargetId());
            m.put("detail", l.getDetail());
            m.put("createTime", l.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return new PageResult<>(list, p.getTotal(), p.getCurrent(), p.getSize());
    }

    /** 供切面/服务写日志的统一入口 */
    public void insertLog(long adminId, String action, String targetType, long targetId, String detail) {
        AdminOpLog log = new AdminOpLog();
        log.setAdminId(adminId);
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setDetail(detail == null || detail.isBlank() ? "-" :
                detail.substring(0, Math.min(detail.length(), 200)));
        log.setCreateTime(LocalDateTime.now());
        opLogMapper.insert(log);
    }

    private String adminName(Long adminId) {
        User admin = userMapper.selectById(adminId);
        return admin == null ? String.valueOf(adminId) : admin.getNickname();
    }

    private static long currentAdminId() {
        return com.teamx.market.auth.UserContext.uid();
    }
}
