#!/usr/bin/env python3
"""第二阶段（设计准备）测试脚本（小组 · 组长张雨薇维护）

校验项：
  (a) prototype/ 16 个页面文件齐全且含表单/流转链接；index.html 可达所有页面
  (b) design/db-*.md 覆盖 DESIGN.md §6 全部表名
  (c) design/api-用户及权限/商品发布/购物交易 端点数达标（≥10/≥9/≥8）且全部用 /api/v1 前缀
  (d) git 跟踪文件无 .env

用法：python3 tools/validate_phase2.py   （仓库根目录运行）
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    "index.html",
    "pages/auth-register.html", "pages/auth-login.html", "pages/auth-findpwd.html",
    "pages/auth-profile.html",
    "pages/admin-login.html", "pages/admin-goods-audit.html",
    "pages/admin-user-manage.html", "pages/admin-oplog.html",
    "pages/goods-list.html", "pages/goods-detail.html",
    "pages/goods-publish.html", "pages/goods-mine.html",
    "pages/cart.html", "pages/order-confirm.html", "pages/order-list.html",
]
DB_TABLES = {
    "design/db-用户及权限.md": ["user", "admin_op_log", "agent_chat_log"],
    "design/db-商品发布.md": ["category", "goods", "goods_image"],
    "design/db-购物交易.md": ["cart_item", "orders", "review", "message"],
}
API_DOCS = {
    "design/api-用户及权限.md": 10,
    "design/api-商品发布.md": 9,
    "design/api-购物交易.md": 8,
}
ROW = re.compile(r"^\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*(\S+)\s*\|", re.M)

results: list[tuple[bool, str]] = []


def check(ok: bool, msg: str) -> None:
    results.append((ok, msg))
    print(("PASS  " if ok else "FAIL  ") + msg)


def main() -> int:
    # (a) 页面齐全 + 表单/流转链接 + index 可达
    missing = [p for p in PAGES if not (ROOT / "prototype" / p).is_file()]
    check(not missing, f"(a) 16 个页面文件齐全（缺失：{missing or '无'}）")
    for p in PAGES:
        f = ROOT / "prototype" / p
        if not f.is_file():
            continue
        text = f.read_text(encoding="utf-8")
        has_link = bool(re.search(r'href="[^"]*\.html"', text))
        has_form = "<form" in text
        if not (has_link and (has_form or p == "index.html")):
            check(False, f"(a) {p} 缺表单或流转链接（form={has_form}, link={has_link}）")
            break
    else:
        check(True, "(a) 每个页面均含表单/流转链接（index.html 为导航壳）")

    graph: dict[str, set[str]] = {}
    for p in PAGES:
        f = ROOT / "prototype" / p
        if not f.is_file():
            continue
        text = f.read_text(encoding="utf-8")
        base = p.rsplit("/", 1)[0] + "/" if "/" in p else ""
        graph[p] = set()
        for href in re.findall(r'href="([^"#?]+\.html)"', text):
            if href.startswith(("http", "mailto")):
                continue
            parts = (base + href).split("/")
            stack: list[str] = []
            for seg in parts:
                if seg == "..":
                    if stack:
                        stack.pop()
                elif seg not in ("", "."):
                    stack.append(seg)
            graph[p].add("/".join(stack))
    seen, queue = {"index.html"}, ["index.html"]
    while queue:
        for nxt in graph.get(queue.pop(), ()):
            if nxt not in seen and nxt in PAGES:
                seen.add(nxt)
                queue.append(nxt)
    unreachable = [p for p in PAGES if p not in seen]
    check(not unreachable, f"(a) index.html 可达全部页面（不可达：{unreachable or '无'}）")

    # (b) db-*.md 覆盖 §6 全部表名
    absent = {}
    for doc, tables in DB_TABLES.items():
        text = (ROOT / doc).read_text(encoding="utf-8") if (ROOT / doc).is_file() else ""
        miss = [t for t in tables if not re.search(rf"`?{t}`?", text)]
        if miss:
            absent[doc] = miss
    check(not absent, f"(b) db-*.md 覆盖 DESIGN.md §6 全部表名（缺失：{absent or '无'}）")

    # (c) api 文档端点数达标且 /api/v1 前缀
    for doc, minimum in API_DOCS.items():
        text = (ROOT / doc).read_text(encoding="utf-8") if (ROOT / doc).is_file() else ""
        rows = ROW.findall(text)
        ok_cnt = len(rows) >= minimum
        ok_prefix = all(u.startswith("/api/v1/") for _, u in rows)
        check(ok_cnt, f"(c) {doc} 端点数 {len(rows)} >= {minimum}")
        check(ok_prefix, f"(c) {doc} 所有端点均用 /api/v1 前缀")

    # (d) git ls-files 无 .env
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True
    ).stdout.splitlines()
    env_files = [p for p in tracked
                 if Path(p).name == ".env" or Path(p).name.startswith(".env.")]
    check(not env_files, f"(d) git 跟踪文件中无 .env（发现：{env_files or '无'}）")

    failed = [msg for ok, msg in results if not ok]
    print(f"\n共 {len(results)} 项检查，通过 {len(results) - len(failed)}，失败 {len(failed)}")
    if failed:
        print("未通过项：")
        for m in failed:
            print("  - " + m)
        return 1
    print("全部通过 ✔ 第二阶段测试全绿")
    return 0


if __name__ == "__main__":
    sys.exit(main())
