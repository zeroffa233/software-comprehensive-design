package com.teamx.market.trade.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CancelOrderReq {

    @Size(max = 100, message = "原因最长 100 字")
    private String reason;
}
