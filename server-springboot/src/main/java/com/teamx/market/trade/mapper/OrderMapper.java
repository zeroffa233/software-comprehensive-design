package com.teamx.market.trade.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.teamx.market.trade.entity.Order;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

public interface OrderMapper extends BaseMapper<Order> {

    /** 我的订单（联商品标题），按 create_time 倒序分页 */
    @Select("""
            <script>
            SELECT o.*, g.title AS goodsTitle
            FROM orders o LEFT JOIN goods g ON o.goods_id = g.id
            WHERE o.buyer_id = #{buyerId}
            <if test="status != null"> AND o.status = #{status}</if>
            ORDER BY o.create_time DESC
            LIMIT #{offset}, #{size}
            </script>
            """)
    List<Map<String, Object>> selectBuyerPage(@Param("buyerId") long buyerId,
                                              @Param("status") Integer status,
                                              @Param("offset") long offset,
                                              @Param("size") long size);

    @Select("""
            <script>
            SELECT COUNT(*)
            FROM orders o LEFT JOIN goods g ON o.goods_id = g.id
            WHERE o.buyer_id = #{buyerId}
            <if test="status != null"> AND o.status = #{status}</if>
            </script>
            """)
    long countBuyer(@Param("buyerId") long buyerId, @Param("status") Integer status);

    /** 管理端全部订单（联买家手机号），可按订单号/买家手机号/状态筛选 */
    @Select("""
            <script>
            SELECT o.*, g.title AS goodsTitle, u.phone AS buyerPhone
            FROM orders o
            LEFT JOIN goods g ON o.goods_id = g.id
            LEFT JOIN `user` u ON o.buyer_id = u.id
            <where>
                <if test="orderNo != null and orderNo != ''"> AND o.order_no = #{orderNo}</if>
                <if test="buyerPhone != null and buyerPhone != ''"> AND u.phone LIKE CONCAT('%', #{buyerPhone}, '%')</if>
                <if test="status != null"> AND o.status = #{status}</if>
            </where>
            ORDER BY o.create_time DESC
            LIMIT #{offset}, #{size}
            </script>
            """)
    List<Map<String, Object>> selectAdminPage(@Param("orderNo") String orderNo,
                                              @Param("buyerPhone") String buyerPhone,
                                              @Param("status") Integer status,
                                              @Param("offset") long offset,
                                              @Param("size") long size);

    @Select("""
            <script>
            SELECT COUNT(*)
            FROM orders o
            LEFT JOIN goods g ON o.goods_id = g.id
            LEFT JOIN `user` u ON o.buyer_id = u.id
            <where>
                <if test="orderNo != null and orderNo != ''"> AND o.order_no = #{orderNo}</if>
                <if test="buyerPhone != null and buyerPhone != ''"> AND u.phone LIKE CONCAT('%', #{buyerPhone}, '%')</if>
                <if test="status != null"> AND o.status = #{status}</if>
            </where>
            </script>
            """)
    long countAdmin(@Param("orderNo") String orderNo, @Param("buyerPhone") String buyerPhone,
                    @Param("status") Integer status);

    /** 当日订单数（生成订单号当日序号） */
    @Select("SELECT COUNT(*) FROM orders WHERE order_no LIKE CONCAT(#{prefix}, '%')")
    int countByPrefix(@Param("prefix") String prefix);

    /** 当日最大序号（订单号第 9 位起的数字；删行留洞时 COUNT+1 会撞号，须用 MAX） */
    @Select("SELECT COALESCE(MAX(CAST(SUBSTRING(order_no, 9) AS UNSIGNED)), 0) FROM orders WHERE order_no LIKE CONCAT(#{prefix}, '%')")
    int maxSeqByPrefix(@Param("prefix") String prefix);
}
