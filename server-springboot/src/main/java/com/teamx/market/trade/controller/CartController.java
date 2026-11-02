package com.teamx.market.trade.controller;

import com.teamx.market.auth.UserContext;
import com.teamx.market.common.R;
import com.teamx.market.trade.dto.CartAddReq;
import com.teamx.market.trade.dto.CartUpdateReq;
import com.teamx.market.trade.service.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 购物车接口（design/api-购物交易.md #1-#4）
 */
@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;

    /** #1 查询购物车 */
    @GetMapping
    public R<Map<String, Object>> list() {
        return R.ok(cartService.list(UserContext.uid()));
    }

    /** #2 加入购物车（重复加入累加 num，种类上限 20） */
    @PostMapping("/items")
    public R<Map<String, Object>> add(@Valid @RequestBody CartAddReq req) {
        return R.ok(cartService.add(UserContext.uid(), req.getGoodsId(), req.getNum()));
    }

    /** #3 调整数量 */
    @PutMapping("/items/{goodsId}")
    public R<Map<String, Object>> update(@PathVariable Long goodsId, @Valid @RequestBody CartUpdateReq req) {
        return R.ok(cartService.update(UserContext.uid(), goodsId, req.getNum()));
    }

    /** #4 移除条目 */
    @DeleteMapping("/items/{goodsId}")
    public R<Void> remove(@PathVariable Long goodsId) {
        cartService.remove(UserContext.uid(), goodsId);
        R<Void> r = R.ok();
        r.setMsg("已移除");
        return r;
    }
}
