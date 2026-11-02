package com.teamx.market.goods.controller;

import com.teamx.market.auth.RequireRole;
import com.teamx.market.auth.UserContext;
import com.teamx.market.common.PageResult;
import com.teamx.market.common.R;
import com.teamx.market.goods.dto.GoodsReq;
import com.teamx.market.goods.service.GoodsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 商品接口（design/api-商品发布.md #1-#10）
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class GoodsController {

    private final GoodsService goodsService;

    /** #1 分类树（游客） */
    @GetMapping("/categories")
    public R<List<Map<String, Object>>> categories(@RequestParam(required = false) Long parentId) {
        return R.ok(goodsService.categoryTree(parentId));
    }

    /** #2 商品列表/搜索（游客，仅"在售"） */
    @GetMapping("/goods")
    public R<PageResult<Map<String, Object>>> list(@RequestParam(required = false) Long categoryId,
                                                   @RequestParam(required = false) String keyword,
                                                   @RequestParam(required = false) String sort,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "10") long pageSize) {
        return R.ok(goodsService.list(categoryId, keyword, sort,
                AdminUserController_normalizePage(page), AdminUserController_normalizeSize(pageSize)));
    }

    /** #3 商品详情（游客在售；属主/管理员全状态） */
    @GetMapping("/goods/{id}")
    public R<Map<String, Object>> detail(@PathVariable Long id) {
        return R.ok(goodsService.detail(id));
    }

    /** #10 我的商品列表 */
    @GetMapping("/goods/mine")
    @RequireRole("USER")
    public R<PageResult<Map<String, Object>>> mine(@RequestParam(required = false) List<String> status,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "10") long pageSize) {
        return R.ok(goodsService.mine(UserContext.uid(), status,
                AdminUserController_normalizePage(page), AdminUserController_normalizeSize(pageSize)));
    }

    /** #4 发布商品 */
    @PostMapping("/goods")
    @RequireRole("USER")
    public R<Map<String, Object>> publish(@Valid @RequestBody GoodsReq req) {
        return R.ok(goodsService.publish(UserContext.uid(), req));
    }

    /** #5 上传商品图片 */
    @PostMapping("/goods/images")
    @RequireRole("USER")
    public R<Map<String, Object>> uploadImage(@RequestPart(value = "file", required = false) MultipartFile file) {
        return R.ok(goodsService.uploadImage(UserContext.uid(), file));
    }

    /** #6 删除未发布的图片 */
    @DeleteMapping("/goods/images/{imageId}")
    @RequireRole("USER")
    public R<Void> deleteImage(@PathVariable Long imageId) {
        goodsService.deleteImage(UserContext.uid(), imageId);
        return R.ok();
    }

    /** #7 编辑商品 */
    @PutMapping("/goods/{id}")
    @RequireRole("USER")
    public R<Map<String, Object>> update(@PathVariable Long id, @Valid @RequestBody GoodsReq req) {
        return R.ok(goodsService.update(UserContext.uid(), id, req));
    }

    /** #8 卖家主动下架 */
    @PostMapping("/goods/{id}/off-shelf")
    @RequireRole("USER")
    public R<Void> offShelf(@PathVariable Long id) {
        goodsService.offShelf(UserContext.uid(), id);
        return R.ok();
    }

    /** #9 重新上架（草稿/已下架 → 待审核） */
    @PostMapping("/goods/{id}/re-list")
    @RequireRole("USER")
    public R<Map<String, Object>> reList(@PathVariable Long id) {
        return R.ok(goodsService.reList(UserContext.uid(), id));
    }

    private static long AdminUserController_normalizePage(long page) {
        return page < 1 ? 1 : page;
    }

    private static long AdminUserController_normalizeSize(long pageSize) {
        if (pageSize < 1) {
            return 10;
        }
        return Math.min(pageSize, 50);
    }
}
