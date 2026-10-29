package com.teamx.market.auth;

public final class UserContext {

    private static final ThreadLocal<LoginUser> HOLDER = new ThreadLocal<>();

    public static void set(LoginUser user) {
        HOLDER.set(user);
    }

    public static LoginUser get() {
        return HOLDER.get();
    }

    public static long uid() {
        LoginUser u = HOLDER.get();
        if (u == null) {
            throw new IllegalStateException("no login user in context");
        }
        return u.getUid();
    }

    public static void clear() {
        HOLDER.remove();
    }

    private UserContext() {
    }
}
