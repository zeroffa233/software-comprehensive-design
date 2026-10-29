package com.teamx.market.goods.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.teamx.market.auth.entity.User;
import com.teamx.market.auth.mapper.UserMapper;
import com.teamx.market.common.BizException;
import com.teamx.market.common.PageResult;
import com.teamx.market.config.MarketProperties;
import com.teamx.market.goods.dto.GoodsReq;
import com.teamx.market.goods.entity.Category;
import com.teamx.market.goods.entity.Goods;
import com.teamx.market.goods.entity.GoodsImage;
import com.teamx.market.goods.mapper.CategoryMapper;
import com.teamx.market.goods.mapper.GoodsImageMapper;
import com.teamx.market.goods.mapper.GoodsMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 商品发布服务（design/api-商品发布.md）：分类树、搜索、详情、发布、图片、编辑、上下架、审核
 * 缓存：goods:list:{sig} / goods:detail:{id}，TTL 60s，任何状态变更逐出 goods:*
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GoodsService {

    public static final String KEY_LIST_PREFIX = "goods:list:";
    public static final String KEY_DETAIL_PREFIX = "goods:detail:";
    public static final String KEY_PRICE_COOL = "goods:price-cool:";
    public static final String KEY_PUBLISH_REQ = "goods:req:";

    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final CategoryMapper categoryMapper;
    private final UserMapper userMapper;
    private final RedisTemplate<String, Object> redis;
    private final StringRedisTemplate stringRedis;
    private final MarketProperties properties;
    private final ObjectMapper objectMapper;

    // ---------------- 分类 ----------------

    /** 分类树；parentId 缺省返回全树 */
    public List<Map<String, Object>> categoryTree(Long parentId) {
        List<Category> all = categoryMapper.selectList(new LambdaQueryWrapper<Category>()
                .eq(Category::getIsActive, 1)
                .orderByAsc(Category::getSort));
        Map<Long, List<Category>> byParent = all.stream()
                .collect(Collectors.groupingBy(Category::getParentId));
        List<Category> roots = parentId == null
                ? byParent.getOrDefault(0L, List.of())
                : all.stream().filter(c -> c.getId().equals(parentId)).toList();
        return roots.stream().map(c -> node(c, byParent)).collect(Collectors.toList());
    }

    private Map<String, Object> node(Category c, Map<Long, List<Category>> byParent) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("parentId", c.getParentId());
        m.put("sort", c.getSort());
        m.put("children", byParent.getOrDefault(c.getId(), List.of()).stream()
                .map(child -> node(child, byParent)).collect(Collectors.toList()));
        return m;
    }

    // ---------------- 游客：列表 / 详情 ----------------

    public PageResult<Map<String, Object>> list(Long categoryId, String keyword, String sort,
                                                long page, long pageSize) {
        List<Long> categoryIds = expandCategory(categoryId);
        String sig = categoryId + "|" + (keyword == null ? "" : keyword) + "|" + sort + "|" + page + "|" + pageSize;
        String cacheKey = KEY_LIST_PREFIX + Integer.toHexString(sig.hashCode());
        Object cached = redis.opsForValue().get(cacheKey);
        if (cached != null) {
            return (PageResult<Map<String, Object>>) cached;
        }
        String orderBy = normalizeSort(sort);
        LambdaQueryWrapper<Goods> qw = new LambdaQueryWrapper<Goods>()
                .eq(Goods::getStatus, Goods.STATUS_ON_SALE)
                .in(categoryIds != null, Goods::getCategoryId, categoryIds)
                .and(keyword != null && !keyword.isBlank(),
                        w -> w.like(Goods::getTitle, keyword).or().like(Goods::getDescription, keyword))
                .last("ORDER BY " + orderBy);
        Page<Goods> p = goodsMapper.selectPage(new Page<>(page, pageSize), qw);
        PageResult<Map<String, Object>> result = toListPage(p);
        redis.opsForValue().set(cacheKey, result, Duration.ofSeconds(60));
        return result;
    }

    private String normalizeSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return "create_time DESC";
        }
        String[] parts = sort.split(",");
        String field = parts[0].trim();
        String dir = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim()) ? "ASC" : "DESC";
        // 排序白名单：create_time / price
        if (!"create_time".equals(field) && !"price".equals(field)) {
            throw BizException.badRequest("sort 仅支持 create_time/price");
        }
        return field + " " + dir;
    }

    /** 分类过滤：一级分类展开为其子分类，二级精确匹配 */
    private List<Long> expandCategory(Long categoryId) {
        if (categoryId == null) {
            return null;
        }
        Category c = categoryMapper.selectById(categoryId);
        if (c == null) {
            throw BizException.notFound("分类不存在");
        }
        if (c.getParentId() == 0L) {
            return categoryMapper.selectList(new LambdaQueryWrapper<Category>()
                            .eq(Category::getParentId, categoryId)).stream()
                    .map(Category::getId).collect(Collectors.toList());
        }
        return List.of(categoryId);
    }

    private PageResult<Map<String, Object>> toListPage(Page<Goods> p) {
        Map<Long, String> mainImages = mainImageMap(p.getRecords().stream().map(Goods::getId).toList());
        Map<Long, String> categoryNames = categoryNameMap(
                p.getRecords().stream().map(Goods::getCategoryId).toList());
        List<Map<String, Object>> list = p.getRecords().stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", g.getId());
            m.put("title", g.getTitle());
            m.put("price", g.getPrice());
            m.put("mainImage", mainImages.getOrDefault(g.getId(), ""));
            m.put("categoryName", categoryNames.getOrDefault(g.getCategoryId(), ""));
            m.put("stock", g.getStock());
            m.put("createTime", fmt(g.getCreateTime()));
            return m;
        }).collect(Collectors.toList());
        return new PageResult<>(list, p.getTotal(), p.getCurrent(), p.getSize());
    }

    /** 缓存数据中的时间统一为字符串（Redis 序列化不含 jsr310 模块） */
    private static String fmt(java.time.LocalDateTime t) {
        return t == null ? null : t.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private Map<Long, String> mainImageMap(List<Long> goodsIds) {
        if (goodsIds.isEmpty()) {
            return Map.of();
        }
        return goodsImageMapper.selectList(new LambdaQueryWrapper<GoodsImage>()
                        .in(GoodsImage::getGoodsId, goodsIds)
                        .eq(GoodsImage::getSort, 0)).stream()
                .collect(Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));
    }

    private Map<Long, String> categoryNameMap(List<Long> categoryIds) {
        if (categoryIds.isEmpty()) {
            return Map.of();
        }
        return categoryMapper.selectBatchIds(categoryIds.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(Category::getId, Category::getName));
    }

    /**
     * 商品详情：在售游客可见；非在售仅属主/管理员可见（否则 404 不暴露存在性）
     */
    public Map<String, Object> detail(long id) {
        Object cached = redis.opsForValue().get(KEY_DETAIL_PREFIX + id);
        if (cached != null) {
            return (Map<String, Object>) cached;
        }
        Goods g = goodsMapper.selectById(id);
        if (g == null) {
            throw BizException.notFound("商品不存在");
        }
        com.teamx.market.auth.LoginUser login = com.teamx.market.auth.UserContext.get();
        boolean privileged = login != null && (login.getUid() == g.getSellerId()
                || com.teamx.market.auth.JwtUtil.ROLE_ADMIN.equals(login.getRole()));
        if (g.getStatus() != Goods.STATUS_ON_SALE && !privileged) {
            throw BizException.notFound("商品不存在");
        }
        Map<String, Object> data = detailOf(g);
        redis.opsForValue().set(KEY_DETAIL_PREFIX + id, data, Duration.ofSeconds(60));
        return data;
    }

    private Map<String, Object> detailOf(Goods g) {
        List<GoodsImage> images = goodsImageMapper.selectList(new LambdaQueryWrapper<GoodsImage>()
                .eq(GoodsImage::getGoodsId, g.getId())
                .orderByAsc(GoodsImage::getSort));
        Category category = categoryMapper.selectById(g.getCategoryId());
        Category parent = category != null && category.getParentId() != 0
                ? categoryMapper.selectById(category.getParentId()) : null;

        Map<String, Object> data = new HashMap<>();
        data.put("id", g.getId());
        data.put("title", g.getTitle());
        data.put("description", g.getDescription());
        data.put("price", g.getPrice());
        data.put("negotiable", g.getNegotiable() != null && g.getNegotiable() == 1);
        data.put("stock", g.getStock());
        data.put("status", g.statusName());
        data.put("images", images.stream().map(i -> {
            Map<String, Object> im = new HashMap<>();
            im.put("url", i.getUrl());
            im.put("sort", i.getSort());
            return im;
        }).collect(Collectors.toList()));
        String categoryPath = parent == null
                ? (category == null ? "" : category.getName())
                : parent.getName() + "/" + category.getName();
        data.put("categoryPath", categoryPath);
        Map<String, Object> seller = new HashMap<>();
        seller.put("uid", g.getSellerId());
        seller.put("nickname", sellerNickname(g.getSellerId()));
        data.put("seller", seller);
        data.put("createTime", fmt(g.getCreateTime()));
        data.put("offShelfReason", g.getOffShelfReason());
        return data;
    }

    private String sellerNickname(long sellerId) {
        User u = userMapper.selectById(sellerId);
        return u == null ? "" : u.getNickname();
    }

    // ---------------- 发布 / 编辑 / 上下架 ----------------

    @Transactional
    public Map<String, Object> publish(long uid, GoodsReq req) {
        if (req.getTitle() == null || req.getDescription() == null || req.getStock() == null
                || req.getImageIds() == null || req.getPrice() == null || req.getCategoryId() == null) {
            throw BizException.badRequest("发布商品需完整提供 title/categoryId/price/description/stock/imageIds");
        }
        if (req.getRequestId() == null || req.getRequestId().isBlank()) {
            throw BizException.badRequest("requestId 不能为空（防重复提交）");
        }
        if (req.getImageIds().size() < 1 || req.getImageIds().size() > 6) {
            throw BizException.badRequest("商品图片须为 1-6 张");
        }
        validateCategory(req.getCategoryId());

        // requestId 幂等：重复提交 → 409
        String reqKey = KEY_PUBLISH_REQ + uid + ":" + req.getRequestId();
        if (Boolean.TRUE.equals(stringRedis.hasKey(reqKey))) {
            throw BizException.conflict("请勿重复提交发布");
        }

        Goods g = new Goods();
        g.setSellerId(uid);
        g.setCategoryId(req.getCategoryId());
        g.setTitle(req.getTitle());
        g.setDescription(req.getDescription());
        g.setPrice(req.getPrice());
        g.setNegotiable(Boolean.TRUE.equals(req.getNegotiable()) ? 1 : 0);
        g.setStock(req.getStock());
        g.setStatus(Goods.STATUS_PENDING);
        goodsMapper.insert(g);

        bindImages(g.getId(), uid, req.getImageIds());
        stringRedis.opsForValue().set(reqKey, String.valueOf(g.getId()), Duration.ofHours(24));
        evictGoodsCache();

        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", g.getId());
        data.put("status", g.statusName());
        return data;
    }

    private void validateCategory(Long categoryId) {
        Category c = categoryMapper.selectById(categoryId);
        if (c == null || c.getParentId() == 0) {
            throw BizException.badRequest("categoryId 必须为二级分类");
        }
    }

    private void bindImages(long goodsId, long uid, List<Long> imageIds) {
        int sort = 0;
        for (Long imageId : imageIds) {
            GoodsImage img = goodsImageMapper.selectById(imageId);
            if (img == null) {
                throw BizException.badRequest("图片不存在：imageId=" + imageId);
            }
            boolean unassignedOwner = img.getGoodsId() == null && img.getUploaderId() == uid;
            boolean assignedOwner = img.getGoodsId() != null && img.getGoodsId() == goodsId;
            if (!unassignedOwner && !assignedOwner) {
                throw BizException.forbidden("图片不属于当前用户");
            }
            img.setGoodsId(goodsId);
            img.setSort(sort++);
            goodsImageMapper.updateById(img);
        }
    }

    /** 上传商品图片：jpg/png/webp ≤5MB；限频 10 次/分钟 */
    public Map<String, Object> uploadImage(long uid, org.springframework.web.multipart.MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BizException.badRequest("图片文件不能为空");
        }
        String limitKey = "goods:upload-limit:" + uid;
        Long count = stringRedis.opsForValue().increment(limitKey);
        if (count != null && count == 1) {
            stringRedis.expire(limitKey, Duration.ofSeconds(60));
        }
        if (count != null && count > 10) {
            throw BizException.tooMany("图片上传过于频繁，请稍后再试");
        }

        String ext = UserService_extOf(file.getOriginalFilename());
        if (!Set.of("jpg", "jpeg", "png", "webp").contains(ext)) {
            throw BizException.badRequest("图片仅支持 jpg/png/webp");
        }
        if (file.getSize() > 5L * 1024 * 1024) {
            throw BizException.badRequest("单张图片不能超过 5MB");
        }
        try {
            String filename = "goods/" + UUID.randomUUID().toString().replace("-", "") + "." + ext;
            Path target = Paths.get(properties.getUploadDir(), filename);
            Files.createDirectories(target.getParent());
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            BufferedImage img = ImageIO.read(file.getInputStream());
            GoodsImage gi = new GoodsImage();
            gi.setGoodsId(null);
            gi.setUploaderId(uid);
            gi.setUrl("/images/" + filename);
            gi.setSort(0);
            goodsImageMapper.insert(gi);

            Map<String, Object> data = new HashMap<>();
            data.put("imageId", gi.getId());
            data.put("url", gi.getUrl());
            data.put("width", img != null ? img.getWidth() : 0);
            data.put("height", img != null ? img.getHeight() : 0);
            return data;
        } catch (Exception e) {
            throw new BizException(5000, "图片保存失败");
        }
    }

    /** 删除未发布的图片（未绑定：仅上传者；已绑定：商品属主且商品可编辑） */
    @Transactional
    public void deleteImage(long uid, long imageId) {
        GoodsImage img = goodsImageMapper.selectById(imageId);
        if (img == null) {
            throw BizException.notFound("图片不存在");
        }
        if (img.getGoodsId() == null) {
            if (img.getUploaderId() != uid) {
                throw BizException.forbidden("非图片上传者");
            }
        } else {
            Goods g = goodsMapper.selectById(img.getGoodsId());
            if (g == null || g.getSellerId() != uid) {
                throw BizException.forbidden("非商品属主");
            }
            if (g.getStatus() == Goods.STATUS_SOLD || g.getStatus() == Goods.STATUS_OFF_SHELF) {
                throw BizException.conflict("商品当前状态不可编辑图片");
            }
        }
        goodsImageMapper.deleteById(imageId);
        try {
            Files.deleteIfExists(Paths.get(properties.getUploadDir(),
                    img.getUrl().replace("/images/", "")));
        } catch (Exception ignored) {
            // 物理文件删除失败不影响业务
        }
    }

    /** 编辑商品（属主）；已售出/已下架 → 409；改价触发 10 分钟下单冷却 */
    @Transactional
    public Map<String, Object> update(long uid, long goodsId, GoodsReq req) {
        Goods g = mustOwn(uid, goodsId);
        if (g.getStatus() == Goods.STATUS_SOLD || g.getStatus() == Goods.STATUS_OFF_SHELF) {
            throw BizException.conflict("商品已" + g.statusName() + "，不可编辑");
        }
        if (req.getTitle() != null) {
            g.setTitle(req.getTitle());
        }
        if (req.getCategoryId() != null) {
            validateCategory(req.getCategoryId());
            g.setCategoryId(req.getCategoryId());
        }
        boolean priceChanged = req.getPrice() != null && req.getPrice().compareTo(g.getPrice()) != 0;
        if (req.getPrice() != null) {
            g.setPrice(req.getPrice());
        }
        if (req.getNegotiable() != null) {
            g.setNegotiable(Boolean.TRUE.equals(req.getNegotiable()) ? 1 : 0);
        }
        if (req.getStock() != null) {
            g.setStock(req.getStock());
        }
        if (req.getDescription() != null) {
            g.setDescription(req.getDescription());
        }
        if (req.getImageIds() != null && !req.getImageIds().isEmpty()) {
            if (req.getImageIds().size() > 6) {
                throw BizException.badRequest("商品图片最多 6 张");
            }
            goodsImageMapper.delete(new LambdaQueryWrapper<GoodsImage>().eq(GoodsImage::getGoodsId, goodsId));
            bindImages(goodsId, uid, req.getImageIds());
        }
        // 编辑视为按原因整改：清除管理员下架/驳回原因（null 需显式 set，updateById 忽略 null 字段）
        g.setOffShelfReason(null);
        goodsMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Goods>()
                .eq(Goods::getId, g.getId())
                .set(Goods::getOffShelfReason, null));
        goodsMapper.updateById(g);
        if (priceChanged) {
            stringRedis.opsForValue().set(KEY_PRICE_COOL + goodsId, "1", Duration.ofMinutes(10));
        }
        evictGoodsCache();
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("updateTime", goodsMapper.selectById(goodsId).getUpdateTime());
        return data;
    }

    /** 卖家主动下架：仅"在售"可下架，否则 409 */
    @Transactional
    public void offShelf(long uid, long goodsId) {
        Goods g = mustOwn(uid, goodsId);
        if (g.getStatus() != Goods.STATUS_ON_SALE) {
            throw BizException.conflict("仅\"在售\"商品可下架");
        }
        g.setStatus(Goods.STATUS_OFF_SHELF);
        goodsMapper.updateById(g);
        evictGoodsCache();
    }

    /** 重新上架：草稿/已下架 → 待审核；管理员下架的需先按原因修改商品 */
    @Transactional
    public Map<String, Object> reList(long uid, long goodsId) {
        Goods g = mustOwn(uid, goodsId);
        if (g.getStatus() != Goods.STATUS_DRAFT && g.getStatus() != Goods.STATUS_OFF_SHELF) {
            throw BizException.conflict("仅\"草稿/已下架\"商品可重新上架");
        }
        if (g.getOffShelfReason() != null && !g.getOffShelfReason().isBlank()) {
            throw BizException.conflict("该商品因\"" + g.getOffShelfReason() + "\"被下架，请先按原因修改商品");
        }
        g.setStatus(Goods.STATUS_PENDING);
        goodsMapper.updateById(g);
        evictGoodsCache();
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("status", g.statusName());
        return data;
    }

    /** 我的商品列表（状态可多值，create_time 倒序） */
    public PageResult<Map<String, Object>> mine(long uid, List<String> statuses, long page, long pageSize) {
        LambdaQueryWrapper<Goods> qw = new LambdaQueryWrapper<Goods>()
                .eq(Goods::getSellerId, uid)
                .orderByDesc(Goods::getCreateTime);
        if (statuses != null && !statuses.isEmpty()) {
            List<Integer> codes = statuses.stream().map(Goods::statusOf).filter(c -> c != null).toList();
            if (codes.size() != statuses.size()) {
                throw BizException.badRequest("status 含非法状态值");
            }
            qw.in(Goods::getStatus, codes);
        }
        Page<Goods> p = goodsMapper.selectPage(new Page<>(page, pageSize), qw);
        Map<Long, String> mainImages = mainImageMap(p.getRecords().stream().map(Goods::getId).toList());
        List<Map<String, Object>> list = p.getRecords().stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", g.getId());
            m.put("title", g.getTitle());
            m.put("price", g.getPrice());
            m.put("stock", g.getStock());
            m.put("status", g.statusName());
            m.put("mainImage", mainImages.getOrDefault(g.getId(), ""));
            m.put("offShelfReason", g.getOffShelfReason());
            return m;
        }).collect(Collectors.toList());
        return new PageResult<>(list, p.getTotal(), p.getCurrent(), p.getSize());
    }

    // ---------------- 管理端 ----------------

    /** 管理端商品列表（AdminWeb 对齐契约） */
    public PageResult<Map<String, Object>> adminList(String status, Long categoryId, String keyword,
                                                     long page, long pageSize) {
        LambdaQueryWrapper<Goods> qw = new LambdaQueryWrapper<Goods>()
                .orderByAsc(Goods::getStatus)
                .orderByDesc(Goods::getCreateTime);
        if (status != null && !status.isBlank()) {
            Integer code = Goods.statusOf(status);
            if (code == null) {
                throw BizException.badRequest("status 非法");
            }
            qw.eq(Goods::getStatus, code);
        }
        qw.eq(categoryId != null, Goods::getCategoryId, categoryId);
        qw.and(keyword != null && !keyword.isBlank(),
                w -> w.like(Goods::getTitle, keyword).or().like(Goods::getDescription, keyword));
        Page<Goods> p = goodsMapper.selectPage(new Page<>(page, pageSize), qw);
        Map<Long, String> mainImages = mainImageMap(p.getRecords().stream().map(Goods::getId).toList());
        List<Map<String, Object>> list = p.getRecords().stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", g.getId());
            m.put("title", g.getTitle());
            m.put("price", g.getPrice());
            m.put("status", g.statusName());
            m.put("sellerNickname", sellerNickname(g.getSellerId()));
            m.put("mainImage", mainImages.getOrDefault(g.getId(), ""));
            m.put("categoryId", g.getCategoryId());
            m.put("stock", g.getStock());
            m.put("createTime", g.getCreateTime());
            m.put("offShelfReason", g.getOffShelfReason());
            return m;
        }).collect(Collectors.toList());
        return new PageResult<>(list, p.getTotal(), p.getCurrent(), p.getSize());
    }

    /** 管理员审核通过：待审核 → 在售 */
    @Transactional
    public Map<String, Object> approve(long goodsId) {
        Goods g = mustExist(goodsId);
        if (g.getStatus() != Goods.STATUS_PENDING) {
            throw BizException.conflict("仅\"待审核\"商品可审核通过");
        }
        g.setStatus(Goods.STATUS_ON_SALE);
        goodsMapper.updateById(g);
        evictGoodsCache();
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("status", g.statusName());
        return data;
    }

    /** 管理员驳回：待审核 → 草稿 */
    @Transactional
    public Map<String, Object> reject(long goodsId, String reason) {
        Goods g = mustExist(goodsId);
        if (g.getStatus() != Goods.STATUS_PENDING) {
            throw BizException.conflict("仅\"待审核\"商品可驳回");
        }
        g.setStatus(Goods.STATUS_DRAFT);
        g.setOffShelfReason(reason);
        goodsMapper.updateById(g);
        evictGoodsCache();
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("status", g.statusName());
        return data;
    }

    /** 管理员下架违规：→ 已下架（必填原因） */
    @Transactional
    public Map<String, Object> forceOffShelf(long goodsId, String reason) {
        Goods g = mustExist(goodsId);
        if (g.getStatus() != Goods.STATUS_ON_SALE && g.getStatus() != Goods.STATUS_PENDING) {
            throw BizException.conflict("商品已" + g.statusName() + "，无需下架");
        }
        g.setStatus(Goods.STATUS_OFF_SHELF);
        g.setOffShelfReason(reason);
        goodsMapper.updateById(g);
        evictGoodsCache();
        Map<String, Object> data = new HashMap<>();
        data.put("goodsId", goodsId);
        data.put("status", g.statusName());
        return data;
    }

    // ---------------- helpers ----------------

    public Goods mustExist(long goodsId) {
        Goods g = goodsMapper.selectById(goodsId);
        if (g == null) {
            throw BizException.notFound("商品不存在");
        }
        return g;
    }

    public Goods mustOwn(long uid, long goodsId) {
        Goods g = mustExist(goodsId);
        if (g.getSellerId() != uid) {
            throw BizException.forbidden("非商品属主");
        }
        return g;
    }

    /** 逐出商品相关缓存（发布/审核/下架/编辑后调用） */
    public void evictGoodsCache() {
        Set<String> keys = redis.keys("goods:list:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
        Set<String> detailKeys = redis.keys("goods:detail:*");
        if (detailKeys != null && !detailKeys.isEmpty()) {
            redis.delete(detailKeys);
        }
    }

    private static String UserService_extOf(String name) {
        if (name == null || !name.contains(".")) {
            return "";
        }
        return name.substring(name.lastIndexOf('.') + 1).toLowerCase();
    }
}
