package com.teamx.market.trade.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.teamx.market.common.BizException;
import com.teamx.market.goods.entity.Goods;
import com.teamx.market.goods.entity.GoodsImage;
import com.teamx.market.goods.mapper.GoodsImageMapper;
import com.teamx.market.goods.mapper.GoodsMapper;
import com.teamx.market.trade.entity.CartItem;
import com.teamx.market.trade.mapper.CartItemMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 购物车服务：在售校验、重复加入累加 num、种类上限 20、1~剩余库存
 */
@Service
@RequiredArgsConstructor
public class CartService {

    public static final int MAX_KINDS = 20;

    private final CartItemMapper cartItemMapper;
    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final com.teamx.market.goods.service.GoodsService goodsService;

    /** #1 查询购物车全部条目（含商品快照） */
    public Map<String, Object> list(long uid) {
        List<CartItem> items = cartItemMapper.selectList(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, uid)
                .orderByDesc(CartItem::getUpdateTime));
        if (items.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("list", List.of());
            empty.put("totalKinds", 0);
            return empty;
        }
        Map<Long, Goods> goodsMap = goodsMapper.selectBatchIds(
                        items.stream().map(CartItem::getGoodsId).toList()).stream()
                .collect(Collectors.toMap(Goods::getId, g -> g));
        Map<Long, String> mainImages = items.isEmpty() ? Map.of()
                : goodsImageMapper.selectList(new LambdaQueryWrapper<GoodsImage>()
                        .in(GoodsImage::getGoodsId, items.stream().map(CartItem::getGoodsId).toList())
                        .eq(GoodsImage::getSort, 0)).stream()
                .collect(Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));
        List<Map<String, Object>> list = items.stream().map(item -> {
            Goods g = goodsMap.get(item.getGoodsId());
            Map<String, Object> m = new HashMap<>();
            m.put("goodsId", item.getGoodsId());
            m.put("title", g == null ? "" : g.getTitle());
            m.put("mainImage", mainImages.getOrDefault(item.getGoodsId(), ""));
            m.put("unitPrice", g == null ? BigDecimal.ZERO : g.getPrice());
            m.put("freight", g == null ? BigDecimal.ZERO : g.getFreight());
            m.put("urgent", g != null && g.getUrgent() != null && g.getUrgent() == 1);
            m.put("stock", g == null ? 0 : g.getStock());
            m.put("num", item.getNum());
            return m;
        }).collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("totalKinds", list.size());
        return data;
    }

    /** #2 加入购物车：在售校验、累加、20 种上限 */
    public Map<String, Object> add(long uid, long goodsId, int num) {
        Goods g = goodsMapper.selectById(goodsId);
        if (g == null || g.getStatus() != Goods.STATUS_ON_SALE) {
            throw BizException.conflict("商品已下架");
        }
        CartItem existing = cartItemMapper.selectOne(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, uid).eq(CartItem::getGoodsId, goodsId));
        int newNum = (existing == null ? 0 : existing.getNum()) + num;
        if (newNum > g.getStock()) {
            throw BizException.conflict("库存不足");
        }
        if (existing == null) {
            long kinds = cartItemMapper.selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, uid));
            if (kinds >= MAX_KINDS) {
                throw BizException.conflict("购物车种类已达上限 20");
            }
            CartItem item = new CartItem();
            item.setUserId(uid);
            item.setGoodsId(goodsId);
            item.setNum(newNum);
            cartItemMapper.insert(item);
        } else {
            existing.setNum(newNum);
            cartItemMapper.updateById(existing);
        }
        // v2.1.0：加购次数 +1
        goodsMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Goods>()
                .eq(Goods::getId, goodsId)
                .setSql("cart_count = cart_count + 1"));
        goodsService.evictDetailCache(goodsId);
        return result(goodsId, newNum, uid);
    }

    /** #3 调整数量（1～剩余库存） */
    public Map<String, Object> update(long uid, long goodsId, int num) {
        CartItem item = cartItemMapper.selectOne(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, uid).eq(CartItem::getGoodsId, goodsId));
        if (item == null) {
            throw BizException.notFound("购物车条目不存在");
        }
        Goods g = goodsMapper.selectById(goodsId);
        if (g == null || g.getStatus() != Goods.STATUS_ON_SALE) {
            throw BizException.conflict("商品已下架");
        }
        if (num > g.getStock()) {
            throw BizException.conflict("库存不足");
        }
        item.setNum(num);
        cartItemMapper.updateById(item);
        Map<String, Object> data = result(goodsId, num, uid);
        data.put("subtotal", g.getPrice().multiply(BigDecimal.valueOf(num)));
        return data;
    }

    /** #4 移除条目 */
    public void remove(long uid, long goodsId) {
        int rows = cartItemMapper.delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, uid).eq(CartItem::getGoodsId, goodsId));
        if (rows == 0) {
            throw BizException.notFound("购物车条目不存在");
        }
        // v2.1.0：加购次数 -1（下限 0）
        goodsMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Goods>()
                .eq(Goods::getId, goodsId)
                .setSql("cart_count = GREATEST(cart_count - 1, 0)"));
        goodsService.evictDetailCache(goodsId);
    }

    private Map<String, Object> result(long goodsId, int num, long uid) {
        long kinds = cartItemMapper.selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, uid));
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("num", num);
        data.put("kinds", kinds);
        return data;
    }
}
