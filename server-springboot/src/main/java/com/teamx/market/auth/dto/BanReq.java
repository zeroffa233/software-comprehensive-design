package com.teamx.market.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class BanReq {

    @NotBlank(message = "封禁原因不能为空")
    @Size(min = 1, max = 100, message = "封禁原因 1-100 字")
    private String reason;
}
