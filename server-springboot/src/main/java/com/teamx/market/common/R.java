package com.teamx.market.common;

import lombok.Data;

/**
 * 统一返回结构 {code, msg, data}（design/接口规范总则.md §2）
 */
@Data
public class R<T> {

    private int code;
    private String msg;
    private T data;

    public static <T> R<T> ok(T data) {
        R<T> r = new R<>();
        r.code = 0;
        r.msg = "success";
        r.data = data;
        return r;
    }

    public static R<Void> ok() {
        return ok(null);
    }

    public static <T> R<T> fail(int code, String msg) {
        return fail(code, msg, null);
    }

    public static <T> R<T> fail(int code, String msg, T data) {
        R<T> r = new R<>();
        r.code = code;
        r.msg = msg;
        r.data = data;
        return r;
    }
}
