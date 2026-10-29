package com.teamx.market.trade.controller;

import com.teamx.market.auth.JwtUtil;
import com.teamx.market.auth.UserContext;
import com.teamx.market.common.PageResult;
import com.teamx.market.common.R;
import com.teamx.market.trade.dto.CancelOrderReq;
import com.teamx.market.trade.dto.CreateOrderReq;
import com.teamx.market.trade.service.OrderService;
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
 * 订单接口（design/api-购物交易.md #5-#10）
 * agent-svc（role=AGENT_SVC）经 X-User-Id 注入 uid 后可只读 GET /orders、/orders/{orderNo}
 */
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    /** #5 提交订单（价格快照、重复下单 409 附 existOrderNo、requestId 幂等） */
    @PostMapping
    public R<Map<String, Object>> create(@Valid @RequestBody CreateOrderReq req) {
        return R.ok(orderService.create(UserContext.uid(), req));
    }

    /** #6 模拟支付 */
    @PostMapping("/{orderNo}/pay")
    public R<Map<String, Object>> pay(@PathVariable String orderNo) {
        return R.ok(orderService.pay(UserContext.uid(), orderNo));
    }

    /** #7 取消订单（仅待支付） */
    @PostMapping("/{orderNo}/cancel")
    public R<Map<String, Object>> cancel(@PathVariable String orderNo,
                                         @Valid @RequestBody(required = false) CancelOrderReq req) {
        return R.ok(orderService.cancel(UserContext.uid(), orderNo, req == null ? null : req.getReason()));
    }

    /** #8 确认收货（已支付 → 已完成） */
    @PostMapping("/{orderNo}/confirm")
    public R<Map<String, Object>> confirm(@PathVariable String orderNo) {
        return R.ok(orderService.confirm(UserContext.uid(), orderNo));
    }

    /** #9 我的订单列表 */
    @GetMapping
    public R<PageResult<Map<String, Object>>> list(@RequestParam(required = false) String status,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "10") long pageSize) {
        return R.ok(orderService.listMine(UserContext.uid(), status, normalizePage(page), normalizeSize(pageSize)));
    }

    /** #10 订单详情（属主；管理员任意） */
    @GetMapping("/{orderNo}")
    public R<Map<String, Object>> detail(@PathVariable String orderNo) {
        boolean isAdmin = JwtUtil.ROLE_ADMIN.equals(UserContext.get().getRole());
        return R.ok(orderService.detail(UserContext.uid(), orderNo, isAdmin));
    }

    private static long normalizePage(long page) {
        return page < 1 ? 1 : page;
    }

    private static long normalizeSize(long pageSize) {
        if (pageSize < 1) {
            return 10;
        }
        return Math.min(pageSize, 50);
    }
}
