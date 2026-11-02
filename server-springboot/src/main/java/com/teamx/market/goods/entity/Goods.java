package com.teamx.market.goods.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品：status 0草稿/1待审核/2在售/3已下架/4已售出
 */
@Data
@TableName("goods")
public class Goods {

    public static final int STATUS_DRAFT = 0;
    public static final int STATUS_PENDING = 1;
    public static final int STATUS_ON_SALE = 2;
    public static final int STATUS_OFF_SHELF = 3;
    public static final int STATUS_SOLD = 4;

    public static final String[] STATUS_NAMES = {"草稿", "待审核", "在售", "已下架", "已售出"};

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long sellerId;
    private Long categoryId;
    private String title;
    private String description;
    private BigDecimal price;
    private Integer negotiable;
    private Integer stock;
    /** 急售标记 0/1（v2.1.0） */
    private Integer urgent;
    /** 浏览量：详情每次访问 +1（v2.1.0） */
    private Integer viewCount;
    /** 加购次数：加入 +1、移除 -1，下限 0（v2.1.0） */
    private Integer cartCount;
    /** 运费 0-50，0=包邮（v2.1.0） */
    private BigDecimal freight;
    private Integer status;
    private String offShelfReason;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private List<GoodsImage> images;

    @TableField(exist = false)
    private String mainImage;

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
            return v >= 0 && v <= 4 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
