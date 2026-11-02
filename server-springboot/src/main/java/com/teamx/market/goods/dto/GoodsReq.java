package com.teamx.market.goods.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 发布/编辑商品入参（编辑时除 requestId 外均可选）
 */
@Data
public class GoodsReq {

    @Size(min = 5, max = 40, message = "标题须为 5-40 字")
    private String title;

    /** 编辑时可省略；发布时显式校验必填 */
    private Long categoryId;

    /** 编辑时可省略；发布时显式校验必填 */
    @DecimalMin(value = "0.01", message = "价格最低 0.01 元")
    @DecimalMax(value = "9999.00", message = "价格最高 9999.00 元")
    private BigDecimal price;

    private Boolean negotiable;

    /** 急售标记（v2.1.0，可选） */
    private Boolean urgent;

    /** 运费 0-50.00，0=包邮（v2.1.0，可选，缺省 0） */
    @DecimalMin(value = "0.00", message = "运费最低 0 元（0=包邮）")
    @DecimalMax(value = "50.00", message = "运费最高 50 元")
    private BigDecimal freight;

    @Min(value = 1, message = "库存最低 1")
    @Max(value = 99, message = "库存最高 99")
    private Integer stock;

    @Size(min = 10, max = 500, message = "描述须为 10-500 字")
    private String description;

    private List<Long> imageIds;

    private String requestId;
}
