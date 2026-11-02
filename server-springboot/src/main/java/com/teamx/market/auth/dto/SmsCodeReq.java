package com.teamx.market.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class SmsCodeReq {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
    private String phone;

    /** REGISTER / LOGIN / FIND_PWD */
    @NotBlank(message = "scene 不能为空")
    @Pattern(regexp = "^(REGISTER|LOGIN|FIND_PWD)$", message = "scene 非法")
    private String scene;
}
