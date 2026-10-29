package com.teamx.market.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 订单：status 0待支付/1已支付/2已完成/3已取消
 */
@Data
@TableName("orders")
public class Order {

    public static final int STATUS_PENDING_PAY = 0;
    public static final int STATUS_PAID = 1;
    public static final int STATUS_FINISHED = 2;
    public static final int STATUS_CANCELED = 3;

    public static final String[] STATUS_NAMES = {"待支付", "已支付", "已完成", "已取消"};

    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    private Long buyerId;
    private Long sellerId;
    private Long goodsId;
    private BigDecimal dealPrice;
    private Integer num;
    private String remark;
    private Integer status;
    private LocalDateTime payTime;
    private LocalDateTime finishTime;
    private LocalDateTime cancelTime;
    private String requestId;
    private LocalDateTime createTime;

    public String statusName() {
        return status == null ? null : STATUS_NAMES[status];
    }

    public static Integer statusOf(String label) {
        for (int i = 0; i < STATUS_NAMES.length; i++) {
            if (STATUS_NAMES[i].equals(label)) {
                return i;
            }
        }
        try {
            int v = Integer.parseInt(label);
            return v >= 0 && v <= 3 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
