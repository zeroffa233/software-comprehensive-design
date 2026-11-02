package com.teamx.market.trade.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.teamx.market.auth.JwtUtil;
import com.teamx.market.common.BizException;
import com.teamx.market.common.PageResult;
import com.teamx.market.goods.entity.Goods;
import com.teamx.market.goods.mapper.GoodsMapper;
import com.teamx.market.goods.service.GoodsService;
import com.teamx.market.trade.dto.CreateOrderReq;
import com.teamx.market.trade.entity.Order;
import com.teamx.market.trade.mapper.OrderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 订单服务（design/api-购物交易.md #5-#10）：
 * 价格快照、重复下单 409 附 existOrderNo、requestId 幂等（uk_request 兜底）、
 * 模拟支付条件 UPDATE 扣库存防超卖、订单状态机校验
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 下单后 30 分钟未支付自动取消 */
    public static final int PAY_TIMEOUT_MINUTES = 30;

    private final OrderMapper orderMapper;
    private final GoodsMapper goodsMapper;
    private final GoodsService goodsService;
    private final StringRedisTemplate redis;

    /** #5 提交订单 */
    @Transactional
    public Map<String, Object> create(long uid, CreateOrderReq req) {
        // requestId 幂等：uk_request 兜底，命中直接返回首次结果
        Order existed = orderMapper.selectOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getRequestId, uid + ":" + req.getRequestId()));
        if (existed != null) {
            return orderCreateData(existed);
        }

        Goods g = goodsMapper.selectById(req.getGoodsId());
        if (g == null || g.getStatus() != Goods.STATUS_ON_SALE) {
            throw BizException.conflict("商品已下架");
        }
        if (g.getStock() < req.getNum()) {
            throw BizException.conflict("库存不足");
        }
        // 改价 10 分钟下单冷却
        if (Boolean.TRUE.equals(redis.hasKey(GoodsService.KEY_PRICE_COOL + req.getGoodsId()))) {
            throw BizException.conflict("商品刚调整价格，下单冷却中（10 分钟）");
        }
        // 重复下单：同买家同商品存在待支付订单 → 409 + existOrderNo
        Order pending = orderMapper.selectOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getBuyerId, uid)
                .eq(Order::getGoodsId, req.getGoodsId())
                .eq(Order::getStatus, Order.STATUS_PENDING_PAY)
                .last("LIMIT 1"));
        if (pending != null) {
            BizException e = BizException.conflict("该商品存在待支付订单，请先支付或取消原订单");
            e.setData(Map.of("existOrderNo", pending.getOrderNo()));
            throw e;
        }

        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setBuyerId(uid);
        order.setSellerId(g.getSellerId());
        order.setGoodsId(g.getId());
        // 价格快照＝下单时刻 goods.price；运费快照＝下单时刻 goods.freight（v2.1.0）
        order.setDealPrice(g.getPrice());
        order.setFreightAmount(g.getFreight() == null ? BigDecimal.ZERO : g.getFreight());
        order.setTotalAmount(g.getPrice().multiply(BigDecimal.valueOf(req.getNum())).add(order.getFreightAmount()));
        order.setNum(req.getNum());
        order.setRemark(req.getRemark());
        order.setStatus(Order.STATUS_PENDING_PAY);
        order.setRequestId(uid + ":" + req.getRequestId());
        order.setCreateTime(LocalDateTime.now());
        orderMapper.insert(order);
        return orderCreateData(order);
    }

    private Map<String, Object> orderCreateData(Order order) {
        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", order.getOrderNo());
        data.put("dealPrice", order.getDealPrice());
        data.put("num", order.getNum());
        data.put("freightAmount", order.getFreightAmount());
        data.put("totalAmount", order.getTotalAmount());
        data.put("status", order.statusName());
        data.put("expireAt", order.getCreateTime().plusMinutes(PAY_TIMEOUT_MINUTES)
                .format(TS_FMT));
        return data;
    }

    /** 订单号：yyyyMMdd + 当日 6 位序号；取当日 MAX 序号递增（COUNT 会因删行留洞撞号），并发冲突靠重试推进 */
    private String generateOrderNo() {
        String date = LocalDateTime.now().format(NO_FMT);
        int seq = orderMapper.maxSeqByPrefix(date);
        for (int i = 0; i < 5; i++) {
            seq++;
            String no = date + String.format("%06d", seq);
            if (orderMapper.selectCount(new LambdaQueryWrapper<Order>().eq(Order::getOrderNo, no)) == 0) {
                return no;
            }
        }
        throw new BizException(5000, "订单号生成失败，请重试");
    }

    /** #6 模拟支付：待支付 → 已支付，条件 UPDATE 扣库存防超卖 */
    @Transactional
    public Map<String, Object> pay(long uid, String orderNo) {
        Order order = mustOwnOrder(uid, orderNo);
        if (order.getStatus() != Order.STATUS_PENDING_PAY) {
            throw BizException.conflict("订单状态不允许该操作");
        }
        if (order.getCreateTime().plusMinutes(PAY_TIMEOUT_MINUTES).isBefore(LocalDateTime.now())) {
            // 已超时但定时任务未跑：立即取消再拒绝
            order.setStatus(Order.STATUS_CANCELED);
            order.setCancelTime(LocalDateTime.now());
            orderMapper.updateById(order);
            throw BizException.conflict("订单已超时取消");
        }
        // 条件 UPDATE 扣库存（防超卖）
        int rows = goodsMapper.update(null, new LambdaUpdateWrapper<Goods>()
                .eq(Goods::getId, order.getGoodsId())
                .apply("stock >= {0}", order.getNum())
                .setSql("stock = stock - " + order.getNum()));
        if (rows == 0) {
            throw BizException.conflict("库存不足");
        }
        // 库存归零 → 已售出
        goodsMapper.update(null, new LambdaUpdateWrapper<Goods>()
                .eq(Goods::getId, order.getGoodsId())
                .eq(Goods::getStock, 0)
                .eq(Goods::getStatus, Goods.STATUS_ON_SALE)
                .set(Goods::getStatus, Goods.STATUS_SOLD));
        order.setStatus(Order.STATUS_PAID);
        order.setPayTime(LocalDateTime.now());
        orderMapper.updateById(order);
        goodsService.evictGoodsCache();

        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", orderNo);
        data.put("status", order.statusName());
        data.put("payTime", order.getPayTime());
        return data;
    }

    /** #7 取消订单：仅待支付 */
    @Transactional
    public Map<String, Object> cancel(long uid, String orderNo, String reason) {
        Order order = mustOwnOrder(uid, orderNo);
        if (order.getStatus() != Order.STATUS_PENDING_PAY) {
            throw BizException.conflict("订单状态不允许该操作");
        }
        order.setStatus(Order.STATUS_CANCELED);
        order.setCancelTime(LocalDateTime.now());
        orderMapper.updateById(order);
        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", orderNo);
        data.put("status", order.statusName());
        return data;
    }

    /** #8 确认收货：已支付 → 已完成（终态） */
    @Transactional
    public Map<String, Object> confirm(long uid, String orderNo) {
        Order order = mustOwnOrder(uid, orderNo);
        if (order.getStatus() != Order.STATUS_PAID) {
            throw BizException.conflict("订单状态不允许该操作");
        }
        order.setStatus(Order.STATUS_FINISHED);
        order.setFinishTime(LocalDateTime.now());
        orderMapper.updateById(order);
        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", orderNo);
        data.put("status", order.statusName());
        data.put("finishTime", order.getFinishTime());
        return data;
    }

    /** #9 我的订单列表（状态筛选，create_time 倒序） */
    public PageResult<Map<String, Object>> listMine(long uid, String status, long page, long pageSize) {
        Integer statusCode = parseStatus(status);
        long total = orderMapper.countBuyer(uid, statusCode);
        List<Map<String, Object>> rows = total == 0 ? List.of()
                : orderMapper.selectBuyerPage(uid, statusCode, (page - 1) * pageSize, pageSize);
        return new PageResult<>(rows.stream().map(this::toListItem).collect(Collectors.toList()),
                total, page, pageSize);
    }

    /** #10 订单详情（属主；管理员任意；agent-svc 由 X-User-Id 注入 uid） */
    public Map<String, Object> detail(long uid, String orderNo, boolean isAdmin) {
        Order order = orderByNo(orderNo);
        if (!isAdmin && order.getBuyerId() != uid) {
            throw BizException.forbidden("仅订单属主可查看");
        }
        return detailData(order);
    }

    /** #11 管理端全部订单 */
    public PageResult<Map<String, Object>> adminList(String orderNo, String buyerPhone, String status,
                                                     long page, long pageSize) {
        Integer statusCode = parseStatus(status);
        long total = orderMapper.countAdmin(orderNo, buyerPhone, statusCode);
        List<Map<String, Object>> rows = total == 0 ? List.of()
                : orderMapper.selectAdminPage(orderNo, buyerPhone, statusCode, (page - 1) * pageSize, pageSize);
        return new PageResult<>(rows.stream().map(this::toListItem).collect(Collectors.toList()),
                total, page, pageSize);
    }

    /** 30 分钟未支付自动取消（@Scheduled 调用） */
    @Transactional
    public int cancelExpired() {
        List<Order> expired = orderMapper.selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getStatus, Order.STATUS_PENDING_PAY)
                .lt(Order::getCreateTime, LocalDateTime.now().minusMinutes(PAY_TIMEOUT_MINUTES)));
        for (Order order : expired) {
            order.setStatus(Order.STATUS_CANCELED);
            order.setCancelTime(LocalDateTime.now());
            orderMapper.updateById(order);
        }
        return expired.size();
    }

    // ---------------- helpers ----------------

    public Order orderByNo(String orderNo) {
        Order order = orderMapper.selectOne(new LambdaQueryWrapper<Order>().eq(Order::getOrderNo, orderNo));
        if (order == null) {
            throw BizException.notFound("订单不存在");
        }
        return order;
    }

    private Order mustOwnOrder(long uid, String orderNo) {
        Order order = orderByNo(orderNo);
        if (order.getBuyerId() != uid) {
            throw BizException.forbidden("仅订单属主可操作");
        }
        return order;
    }

    private Integer parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        Integer code = Order.statusOf(status);
        if (code == null) {
            throw BizException.badRequest("status 非法");
        }
        return code;
    }

    private Map<String, Object> toListItem(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("orderNo", row.get("order_no"));
        m.put("goodsTitle", row.get("goodsTitle"));
        m.put("dealPrice", row.get("deal_price"));
        m.put("num", row.get("num"));
        m.put("freightAmount", row.get("freight_amount"));
        m.put("totalAmount", row.get("total_amount"));
        int st = ((Number) row.get("status")).intValue();
        m.put("status", Order.STATUS_NAMES[st]);
        Map<String, Object> keyTimes = new LinkedHashMap<>();
        keyTimes.put("createTime", row.get("create_time"));
        keyTimes.put("payTime", row.get("pay_time"));
        keyTimes.put("finishTime", row.get("finish_time"));
        keyTimes.put("cancelTime", row.get("cancel_time"));
        m.put("keyTimes", keyTimes);
        if (row.containsKey("buyerPhone")) {
            m.put("buyerPhone", row.get("buyerPhone"));
        }
        return m;
    }

    private Map<String, Object> detailData(Order order) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", order.getOrderNo());
        data.put("status", order.statusName());
        data.put("dealPrice", order.getDealPrice());
        data.put("num", order.getNum());
        data.put("freightAmount", order.getFreightAmount());
        data.put("totalAmount", order.getTotalAmount());
        data.put("remark", order.getRemark());
        List<Map<String, Object>> timeline = new ArrayList<>();
        addTimeline(timeline, "CREATE", order.getCreateTime());
        addTimeline(timeline, "PAY", order.getPayTime());
        addTimeline(timeline, "FINISH", order.getFinishTime());
        addTimeline(timeline, "CANCEL", order.getCancelTime());
        data.put("timeline", timeline);
        data.put("buyerId", order.getBuyerId());
        data.put("sellerId", order.getSellerId());
        return data;
    }

    private void addTimeline(List<Map<String, Object>> timeline, String action, LocalDateTime time) {
        if (time != null) {
            Map<String, Object> t = new HashMap<>();
            t.put("action", action);
            t.put("time", time);
            timeline.add(t);
        }
    }
}
