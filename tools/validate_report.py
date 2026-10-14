#!/usr/bin/env python3
"""软件需求分析报告 · 阶段测试脚本（小组 · 组长张雨薇维护）

校验项：
  (a) 软件需求分析报告.md 索引里链接的每个 report/*.md 都存在
  (b) report/07-非功能性需求.md 中 `- [NFR-` 条目 >= 5
  (c) report/04、05、06 中 `- [` 开头且含"约束"的功能条目各 >= 6
  (d) report/09 含 Skill 清单 7 个字段名
  (e) git ls-files 中无 .env

用法：python3 tools/validate_report.py   （仓库根目录运行）
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "软件需求分析报告.md"
NFR_FILE = ROOT / "report" / "07-非功能性需求.md"
FUNC_FILES = [
    ROOT / "report" / "04-用户及权限模块需求.md",
    ROOT / "report" / "05-商品发布模块需求.md",
    ROOT / "report" / "06-购物交易模块需求.md",
]
SKILL_FILE = ROOT / "report" / "09-Agent-Skill-MCP专项.md"
SKILL_FIELDS = [
    "Skill 编号", "名称", "业务能力描述", "输入参数",
    "返回核心字段", "允许操作", "禁止操作",
]
MIN_NFR = 5
MIN_FUNC = 6

results: list[tuple[bool, str]] = []


def check(ok: bool, msg: str) -> None:
    results.append((ok, msg))
    print(("PASS  " if ok else "FAIL  ") + msg)


def main() -> int:
    # (a) 索引链接的 report/*.md 都存在
    linked = set(re.findall(r"report/[\w\-]+\.md", INDEX.read_text(encoding="utf-8")))
    missing = [p for p in sorted(linked) if not (ROOT / p).is_file()]
    check(bool(linked), f"(a) 索引引用 report/*.md 共 {len(linked)} 个文件")
    check(not missing, f"(a) 索引链接全部存在（缺失：{missing or '无'}）")

    # (b) NFR 条目 >= 5
    nfr_lines = [ln for ln in NFR_FILE.read_text(encoding="utf-8").splitlines()
                 if ln.lstrip().startswith("- [NFR-")]
    check(len(nfr_lines) >= MIN_NFR,
          f"(b) report/07 非功能条目 `- [NFR-` 数量 {len(nfr_lines)} >= {MIN_NFR}")

    # (c) 功能条目：`- [` 开头且含"约束"，各 >= 6
    for f in FUNC_FILES:
        lines = [ln for ln in f.read_text(encoding="utf-8").splitlines()
                 if ln.lstrip().startswith("- [") and "约束" in ln]
        check(len(lines) >= MIN_FUNC,
              f"(c) {f.name} 功能条目（`- [` 且含\"约束\"）数量 {len(lines)} >= {MIN_FUNC}")

    # (d) Skill 清单 7 字段名齐全
    skill_text = SKILL_FILE.read_text(encoding="utf-8")
    absent = [k for k in SKILL_FIELDS if k not in skill_text]
    check(not absent, f"(d) report/09 Skill 清单 7 字段齐全（缺失：{absent or '无'}）")

    # (e) git ls-files 无 .env
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True
    ).stdout.splitlines()
    env_files = [p for p in tracked
                 if Path(p).name == ".env" or Path(p).name.startswith(".env.")]
    check(not env_files, f"(e) git 跟踪文件中无 .env（发现：{env_files or '无'}）")

    failed = [msg for ok, msg in results if not ok]
    print(f"\n共 {len(results)} 项检查，通过 {len(results) - len(failed)}，失败 {len(failed)}")
    if failed:
        print("未通过项：")
        for m in failed:
            print("  - " + m)
        return 1
    print("全部通过 ✔ 阶段测试全绿")
    return 0


if __name__ == "__main__":
    sys.exit(main())
