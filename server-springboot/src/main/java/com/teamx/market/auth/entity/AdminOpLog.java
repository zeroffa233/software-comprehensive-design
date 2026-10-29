package com.teamx.market.auth.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("admin_op_log")
public class AdminOpLog {

    public static final String ACTION_BAN_USER = "BAN_USER";
    public static final String ACTION_UNBAN_USER = "UNBAN_USER";
    public static final String ACTION_OFF_SHELF_GOODS = "OFF_SHELF_GOODS";
    public static final String ACTION_AUDIT_PASS = "AUDIT_PASS";
    public static final String ACTION_AUDIT_REJECT = "AUDIT_REJECT";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long adminId;
    private String action;
    private String targetType;
    private Long targetId;
    private String detail;
    private LocalDateTime createTime;
}
