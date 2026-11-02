package com.teamx.market.goods.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ReasonReq {

    @NotBlank(message = "reason 不能为空")
    @Size(min = 10, max = 200, message = "原因须为 10-200 字")
    private String reason;
}
