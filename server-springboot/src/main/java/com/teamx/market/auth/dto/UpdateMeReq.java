package com.teamx.market.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateMeReq {

    @Size(min = 2, max = 20, message = "昵称须为 2-20 字符")
    private String nickname;

    private String avatar;

    @Size(max = 200, message = "签名最长 200 字符")
    private String signature;
}
