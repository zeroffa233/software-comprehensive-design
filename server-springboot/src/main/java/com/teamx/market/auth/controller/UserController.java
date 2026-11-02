package com.teamx.market.auth.controller;

import com.teamx.market.auth.UserContext;
import com.teamx.market.auth.dto.ChangePwdReq;
import com.teamx.market.auth.dto.UpdateMeReq;
import com.teamx.market.auth.service.UserService;
import com.teamx.market.common.R;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * 个人信息接口（design/api-用户及权限.md）：GET/PUT /users/me、password、avatar
 */
@RestController
@RequestMapping("/api/v1/users/me")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public R<Map<String, Object>> me() {
        return R.ok(userService.me(UserContext.uid()));
    }

    @PutMapping
    public R<Map<String, Object>> updateMe(@Valid @RequestBody UpdateMeReq req) {
        return R.ok(userService.updateMe(UserContext.uid(), req));
    }

    @PutMapping("/password")
    public R<Void> changePassword(@Valid @RequestBody ChangePwdReq req) {
        userService.changePassword(UserContext.uid(), req);
        return R.ok();
    }

    @PostMapping("/avatar")
    public R<Map<String, Object>> uploadAvatar(@RequestPart(value = "file", required = false) MultipartFile file) {
        return R.ok(userService.uploadAvatar(UserContext.uid(), file));
    }
}
