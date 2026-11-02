package com.teamx.market.auth;

import com.teamx.market.common.BizException;
import com.teamx.market.common.Codes;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * @RequireRole AOP：未登录 401；角色不匹配 403
 */
@Aspect
@Component
public class RoleAspect {

    @Before("@annotation(requireRole)")
    public void check(RequireRole requireRole) {
        LoginUser user = UserContext.get();
        if (user == null) {
            throw new BizException(Codes.UNAUTHORIZED, "未登录或登录已失效");
        }
        boolean allowed = Arrays.asList(requireRole.value()).contains(user.getRole());
        if (!allowed) {
            throw new BizException(Codes.FORBIDDEN, "权限不足");
        }
    }
}
