package com.teamx.market.trade.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CartAddReq {

    @NotNull(message = "goodsId 不能为空")
    private Long goodsId;

    @Min(value = 1, message = "num 最低 1")
    @Max(value = 99, message = "num 最高 99")
    private Integer num = 1;
}
