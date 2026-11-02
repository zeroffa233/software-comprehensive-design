package com.teamx.market.goods.controller;

import com.teamx.market.auth.AdminOp;
import com.teamx.market.auth.RequireRole;
import com.teamx.market.common.PageResult;
import com.teamx.market.common.R;
import com.teamx.market.goods.dto.ReasonReq;
import com.teamx.market.goods.service.GoodsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 管理端商品接口（design/api-商品发布.md #11-#13 + 管理端列表）
 */
@RestController
@RequestMapping("/api/v1/admin/goods")
@RequiredArgsConstructor
public class GoodsAdminController {

    private final GoodsService goodsService;

    /** 管理端商品列表（与 AdminWeb 对齐：status=中文状态） */
    @GetMapping
    @RequireRole("ADMIN")
    public R<PageResult<Map<String, Object>>> list(@RequestParam(required = false) String status,
                                                   @RequestParam(required = false) Long categoryId,
                                                   @RequestParam(required = false) String keyword,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "10") long pageSize) {
        return R.ok(goodsService.adminList(status, categoryId, keyword, normalize(page), normalizeSize(pageSize)));
    }

    /** #11 审核通过：待审核 → 在售 */
    @PostMapping("/{id}/approve")
    @RequireRole("ADMIN")
    @AdminOp(action = "AUDIT_PASS", targetType = "goods", detailFallback = "审核通过")
    public R<Map<String, Object>> approve(@PathVariable Long id) {
        return R.ok(goodsService.approve(id));
    }

    /** #12 驳回：待审核 → 草稿 */
    @PostMapping("/{id}/reject")
    @RequireRole("ADMIN")
    @AdminOp(action = "AUDIT_REJECT", targetType = "goods")
    public R<Map<String, Object>> reject(@PathVariable Long id, @Valid @RequestBody ReasonReq req) {
        return R.ok(goodsService.reject(id, req.getReason()));
    }

    /** #13 下架违规商品：→ 已下架（必填原因） */
    @PostMapping("/{id}/force-off-shelf")
    @RequireRole("ADMIN")
    @AdminOp(action = "OFF_SHELF_GOODS", targetType = "goods")
    public R<Map<String, Object>> forceOffShelf(@PathVariable Long id, @Valid @RequestBody ReasonReq req) {
        return R.ok(goodsService.forceOffShelf(id, req.getReason()));
    }

    private static long normalize(long page) {
        return page < 1 ? 1 : page;
    }

    private static long normalizeSize(long pageSize) {
        if (pageSize < 1) {
            return 10;
        }
        return Math.min(pageSize, 50);
    }
}
