package com.teamx.market.auth.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("agent_chat_log")
public class AgentChatLog {

    public static final String STATUS_OK = "OK";
    public static final String STATUS_DENIED = "DENIED";
    public static final String STATUS_ERROR = "ERROR";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String prompt;
    private String response;
    private String skillName;
    private String status;
    private LocalDateTime createTime;
}
