package com.teamx.market.auth;

import com.teamx.market.auth.service.AdminUserService;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * 管理员关键操作落库切面：@AdminOp(action, targetType)
 * 成功返回后取方法中第一个 Long 参数为目标 ID、DTO 的 reason 字段为详情，写 admin_op_log
 */
@Aspect
@Component
public class AdminOpLogAspect {

    private final AdminUserService adminUserService;

    public AdminOpLogAspect(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @AfterReturning("@annotation(adminOp)")
    public void record(JoinPoint jp, AdminOp adminOp) {
        long adminId = com.teamx.market.auth.UserContext.uid();
        Long targetId = null;
        String detail = adminOp.detailFallback();
        for (Object arg : jp.getArgs()) {
            if (arg instanceof Long l && targetId == null) {
                targetId = l;
            } else if (arg != null) {
                String reason = reasonOf(arg);
                if (reason != null) {
                    detail = reason;
                }
            }
        }
        adminUserService.insertLog(adminId, adminOp.action(), adminOp.targetType(),
                targetId == null ? 0L : targetId, detail);
    }

    private String reasonOf(Object dto) {
        try {
            Method m = dto.getClass().getMethod("getReason");
            Object v = m.invoke(dto);
            return v instanceof String s ? s : null;
        } catch (Exception e) {
            return null;
        }
    }
}
