package com.teamx.market.auth.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("`user`")
public class User {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_BANNED = "BANNED";
    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";

    @TableId(type = IdType.AUTO)
    private Long id;
    private String phone;
    private String passwordHash;
    private String nickname;
    private String avatar;
    private String signature;
    private String role;
    private String status;
    private LocalDateTime lastLoginTime;
    private LocalDateTime createTime;
}
