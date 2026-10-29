package com.teamx.market.trade.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CartUpdateReq {

    @NotNull(message = "num 不能为空")
    @Min(value = 1, message = "num 最低 1")
    @Max(value = 99, message = "num 最高 99")
    private Integer num;
}
