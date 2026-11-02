#!/usr/bin/env python3
"""压测脚本：对照 NFR-01（50 并发用户浏览场景，核心页面接口响应 <2s，记录 95 分位）。
场景：游客浏览商品列表（Redis 缓存路径）+ 商品详情（缓存路径），混合 7:3。
用法：python3 tools/stress_test.py [总请求数=3000] [并发=50]
"""
import asyncio
import json
import statistics
import sys
import time

import aiohttp

BASE = "http://127.0.0.1:8080/api/v1"
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
CONC = int(sys.argv[2]) if len(sys.argv) > 2 else 50


async def fetch(session, path, latencies, errors):
    t0 = time.perf_counter()
    try:
        async with session.get(f"{BASE}{path}") as resp:
            body = await resp.read()
            dt = (time.perf_counter() - t0) * 1000
            ok = resp.status == 200 and json.loads(body).get("code") == 0
            latencies.append(dt)
            if not ok:
                errors.append((path, resp.status, body[:80]))
    except Exception as e:  # noqa: BLE001
        errors.append((path, 0, str(e)[:80]))


async def worker(session, paths, latencies, errors):
    for i, path in enumerate(paths):
        await fetch(session, path, latencies, errors)


async def plan(session):
    """详情路径的 id 动态取自当前在售列表，避免引用已删除数据。"""
    ids = []
    async with session.get(f"{BASE}/goods?page=1&pageSize=50") as resp:
        data = (await resp.json()).get("data") or {}
        ids = [g["id"] for g in data.get("list", [])] or [1]
    out = []
    for i in range(TOTAL):
        if i % 10 < 7:
            out.append(f"/goods?page={i % 3 + 1}&pageSize=10")
        else:
            out.append(f"/goods/{ids[i % len(ids)]}")
    return out


async def main():
    conn = aiohttp.TCPConnector(limit=CONC + 10)
    async with aiohttp.ClientSession(connector=conn, timeout=aiohttp.ClientTimeout(total=30)) as s:
        paths = await plan(s)
        chunks = [paths[i::CONC] for i in range(CONC)]
        latencies: list[float] = []
        errors: list = []
        t0 = time.perf_counter()
        await asyncio.gather(*(worker(s, c, latencies, errors) for c in chunks))
        wall = time.perf_counter() - t0

    latencies.sort()

    def pct(p):
        return latencies[min(int(len(latencies) * p), len(latencies) - 1)]

    print(f"目标={BASE}  总请求={TOTAL}  并发={CONC}")
    print(f"成功={len(latencies)}  失败={len(errors)}  错误率={len(errors)/TOTAL:.2%}")
    print(f"吞吐={TOTAL/wall:.0f} req/s  墙钟={wall:.1f}s")
    print(f"延迟ms: min={latencies[0]:.0f} p50={pct(0.50):.0f} p90={pct(0.90):.0f} "
          f"p95={pct(0.95):.0f} p99={pct(0.99):.0f} max={latencies[-1]:.0f}")
    nfr_ok = pct(0.95) < 2000 and not errors
    print(f"NFR-01 判定（p95<2000ms 且零错误）: {'达标' if nfr_ok else '未达标'}")
    for e in errors[:5]:
        print("  ERR:", e)
    return 0 if nfr_ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
