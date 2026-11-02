package com.teamx.market.trade.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateOrderReq {

    @NotNull(message = "goodsId 不能为空")
    private Long goodsId;

    @NotNull(message = "num 不能为空")
    @Min(value = 1, message = "num 最低 1")
    @Max(value = 99, message = "num 最高 99")
    private Integer num;

    @Size(max = 100, message = "备注最长 100 字")
    private String remark;

    /** 幂等键（必带） */
    @NotBlank(message = "requestId 不能为空")
    private String requestId;
}
