package com.teamx.market.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class LoginReq {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
    private String phone;

    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).{8,20}$", message = "密码格式不正确")
    private String password;

    private String smsCode;

    /** PASSWORD / SMS */
    @NotBlank(message = "loginType 不能为空")
    @Pattern(regexp = "^(PASSWORD|SMS)$", message = "loginType 非法")
    private String loginType;
}
