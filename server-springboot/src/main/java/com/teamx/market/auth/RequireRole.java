package com.teamx.market.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 角色校验注解：@RequireRole("ADMIN")，由 RoleAspect 在方法进入前校验
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRole {

    /** 允许访问的角色，如 "ADMIN"；多角色 {"USER","ADMIN"} */
    String[] value();
}
