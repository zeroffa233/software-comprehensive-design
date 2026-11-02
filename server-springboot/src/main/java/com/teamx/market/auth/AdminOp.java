package com.teamx.market.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 管理员关键操作日志标记：成功执行后由 AdminOpLogAspect 写 admin_op_log
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AdminOp {

    /** 动作：BAN_USER/UNBAN_USER/OFF_SHELF_GOODS/AUDIT_PASS/AUDIT_REJECT */
    String action();

    /** 目标类型：user/goods/order */
    String targetType();

    /** 无显式 reason 入参时的日志详情 */
    String detailFallback() default "";
}
