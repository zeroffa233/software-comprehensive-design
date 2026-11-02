package com.teamx.market.auth.controller;

import com.teamx.market.auth.AdminOp;
import com.teamx.market.auth.RequireRole;
import com.teamx.market.auth.dto.BanReq;
import com.teamx.market.auth.service.AdminUserService;
import com.teamx.market.common.PageResult;
import com.teamx.market.common.R;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 管理端用户接口（design/api-用户及权限.md）：用户列表、封禁/解封、操作日志
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    @GetMapping("/users")
    @RequireRole("ADMIN")
    public R<PageResult<Map<String, Object>>> users(@RequestParam(defaultValue = "1") long page,
                                                    @RequestParam(defaultValue = "10") long pageSize,
                                                    @RequestParam(required = false) String phone,
                                                    @RequestParam(required = false) String nickname,
                                                    @RequestParam(required = false) String status) {
        return R.ok(adminUserService.listUsers(normalizePage(page), normalizeSize(pageSize),
                phone, nickname, status));
    }

    @PutMapping("/users/{id}/ban")
    @RequireRole("ADMIN")
    @AdminOp(action = "BAN_USER", targetType = "user")
    public R<Void> ban(@PathVariable Long id, @Valid @RequestBody BanReq req) {
        adminUserService.ban(id, req.getReason());
        return R.ok();
    }

    @PutMapping("/users/{id}/unban")
    @RequireRole("ADMIN")
    @AdminOp(action = "UNBAN_USER", targetType = "user", detailFallback = "解封账号")
    public R<Void> unban(@PathVariable Long id) {
        adminUserService.unban(id);
        return R.ok();
    }

    @GetMapping("/op-logs")
    @RequireRole("ADMIN")
    public R<PageResult<Map<String, Object>>> opLogs(@RequestParam(defaultValue = "1") long page,
                                                     @RequestParam(defaultValue = "10") long pageSize,
                                                     @RequestParam(required = false) Long adminId,
                                                     @RequestParam(required = false) String action,
                                                     @RequestParam(required = false) String targetType) {
        return R.ok(adminUserService.opLogs(normalizePage(page), normalizeSize(pageSize),
                adminId, action, targetType));
    }

    static long normalizePage(long page) {
        return page < 1 ? 1 : page;
    }

    static long normalizeSize(long pageSize) {
        if (pageSize < 1) {
            return 10;
        }
        return Math.min(pageSize, 50);
    }
}
