package com.teamx.market.trade.controller;

import com.teamx.market.auth.RequireRole;
import com.teamx.market.common.PageResult;
import com.teamx.market.common.R;
import com.teamx.market.trade.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 管理端订单接口（design/api-购物交易.md #11）
 */
@RestController
@RequestMapping("/api/v1/admin/orders")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderService orderService;

    /** #11 全部订单：可按订单号/买家手机号/状态筛选 */
    @GetMapping
    @RequireRole("ADMIN")
    public R<PageResult<Map<String, Object>>> list(@RequestParam(required = false) String orderNo,
                                                   @RequestParam(required = false) String buyerPhone,
                                                   @RequestParam(required = false) String status,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "10") long pageSize) {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 10 : Math.min(pageSize, 50);
        return R.ok(orderService.adminList(orderNo, buyerPhone, status, page, pageSize));
    }
}
