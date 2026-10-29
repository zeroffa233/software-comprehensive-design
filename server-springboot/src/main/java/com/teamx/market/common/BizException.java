package com.teamx.market.common;

import lombok.Getter;
import lombok.Setter;

/**
 * 业务异常：携带统一错误码，由全局异常处理器转 {code, msg, data:null}
 */
@Getter
public class BizException extends RuntimeException {

    private final int code;
    /** 附加业务数据（如重复下单 409 附 existOrderNo），缺省 null */
    @Setter
    private Object data;

    public BizException(int code, String msg) {
        super(msg);
        this.code = code;
    }

    public static BizException badRequest(String msg) {
        return new BizException(Codes.BAD_REQUEST, msg);
    }

    public static BizException unauthorized(String msg) {
        return new BizException(Codes.UNAUTHORIZED, msg);
    }

    public static BizException forbidden(String msg) {
        return new BizException(Codes.FORBIDDEN, msg);
    }

    public static BizException notFound(String msg) {
        return new BizException(Codes.NOT_FOUND, msg);
    }

    public static BizException conflict(String msg) {
        return new BizException(Codes.CONFLICT, msg);
    }

    public static BizException locked(String msg) {
        return new BizException(Codes.LOCKED, msg);
    }

    public static BizException tooMany(String msg) {
        return new BizException(Codes.TOO_MANY, msg);
    }
}
