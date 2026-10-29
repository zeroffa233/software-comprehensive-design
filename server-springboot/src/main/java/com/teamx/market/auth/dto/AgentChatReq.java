package com.teamx.market.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AgentChatReq {

    @NotBlank(message = "prompt 不能为空")
    @jakarta.validation.constraints.Size(max = 1000, message = "prompt 最长 1000 字")
    private String prompt;

    private String requestId;
}
