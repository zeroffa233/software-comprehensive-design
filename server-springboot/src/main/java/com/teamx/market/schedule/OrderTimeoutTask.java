package com.teamx.market.schedule;

import com.teamx.market.trade.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 30 分钟未支付订单自动取消（每 60s 扫描一次）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderTimeoutTask {

    private final OrderService orderService;

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void autoCancel() {
        int n = orderService.cancelExpired();
        if (n > 0) {
            log.info("auto-canceled {} expired pending-pay orders", n);
        }
    }
}
