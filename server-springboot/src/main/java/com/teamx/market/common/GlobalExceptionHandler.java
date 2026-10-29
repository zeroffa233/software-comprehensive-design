package com.teamx.market.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.validation.ConstraintViolationException;

/**
 * 全局异常处理器：错误码表逐项对应（400/404/5000 等），5000 不暴露堆栈
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public R<Object> biz(BizException e) {
        return R.fail(e.getCode(), e.getMessage(), e.getData());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public R<Void> invalidBody(BindException e) {
        FieldError fe = e.getBindingResult().getFieldError();
        String msg = fe == null ? "参数非法" : fe.getField() + " " + fe.getDefaultMessage();
        return R.fail(Codes.BAD_REQUEST, msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public R<Void> invalidParam(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream().findFirst()
                .map(v -> v.getMessage()).orElse("参数非法");
        return R.fail(Codes.BAD_REQUEST, msg);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestPartException.class})
    public R<Void> unreadable(Exception e) {
        return R.fail(Codes.BAD_REQUEST, "参数非法");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public R<Void> tooLarge(MaxUploadSizeExceededException e) {
        return R.fail(Codes.BAD_REQUEST, "文件大小超出限制");
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class,
            HttpRequestMethodNotSupportedException.class})
    public R<Void> notFound(Exception e) {
        return R.fail(Codes.NOT_FOUND, "资源不存在");
    }

    @ExceptionHandler(Exception.class)
    public R<Void> unknown(Exception e) {
        log.error("unhandled exception", e);
        return R.fail(Codes.SERVER_ERROR, "服务器内部错误");
    }
}
