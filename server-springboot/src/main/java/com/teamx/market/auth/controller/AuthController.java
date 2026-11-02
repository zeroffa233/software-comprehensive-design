package com.teamx.market.auth.controller;

import com.teamx.market.auth.JwtUtil;
import com.teamx.market.auth.RequireRole;
import com.teamx.market.auth.UserContext;
import com.teamx.market.auth.dto.FindPwdReq;
import com.teamx.market.auth.dto.LoginReq;
import com.teamx.market.auth.dto.RegisterReq;
import com.teamx.market.auth.dto.SmsCodeReq;
import com.teamx.market.auth.service.AuthService;
import com.teamx.market.common.R;
import com.teamx.market.config.MarketProperties;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 认证接口（design/api-用户及权限.md）：register/sms-code/login/logout/find-password
 * 另：/auth/svc-token 为 agent-svc 服务令牌签发（集成辅助端点，ADMIN 签发）
 */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final MarketProperties properties;

    @PostMapping("/register")
    public R<Map<String, Object>> register(@Valid @RequestBody RegisterReq req) {
        return R.ok(authService.register(req));
    }

    /** 契约：data=null；dev profile 下附 devCode（无真实短信通道，见 README 说明） */
    @PostMapping("/sms-code")
    public R<Map<String, Object>> smsCode(@Valid @RequestBody SmsCodeReq req) {
        return R.ok(authService.smsCode(req));
    }

    @PostMapping("/login")
    public R<Map<String, Object>> login(@Valid @RequestBody LoginReq req) {
        // agent-svc 服务账号走专用签发（约定凭证，不入库）
        if (properties.getAgent().getSvcPhone().equals(req.getPhone())
                && "PASSWORD".equals(req.getLoginType())) {
            return R.ok(authService.svcToken(req.getPhone(), req.getPassword(),
                    properties.getAgent().getSvcPhone(), properties.getAgent().getSvcPassword()));
        }
        return R.ok(authService.login(req));
    }

    @PostMapping("/logout")
    public R<Void> logout() {
        authService.logout(UserContext.uid());
        return R.ok();
    }

    @PostMapping("/find-password")
    public R<Void> findPassword(@Valid @RequestBody FindPwdReq req) {
        authService.findPassword(req);
        return R.ok();
    }

    /** 集成辅助：管理员为 agent-svc 签发服务令牌（载荷 role=AGENT_SVC，2h） */
    @PostMapping("/svc-token")
    @RequireRole("ADMIN")
    public R<Map<String, Object>> svcToken() {
        Map<String, Object> data = authService.svcToken(properties.getAgent().getSvcPhone(),
                properties.getAgent().getSvcPassword(),
                properties.getAgent().getSvcPhone(), properties.getAgent().getSvcPassword());
        return R.ok(data);
    }
}
