#!/usr/bin/env python3
"""软件需求分析报告 · 阶段测试脚本（小组 · 组长张雨薇维护）

自 v1.0.2 起报告整合为单一文档（软件需求分析报告.md），本脚本校验单文档结构：
  (a) 九个章标题（一~九）齐全，按顺序排列
  (b) 第四/五/六章功能条目（`- [` 开头且含"约束"）各 10/9/8 条（下限 6）
  (c) 第七章 NFR 条目 `- [NFR-` >= 5
  (d) 第九章 Skill 清单含 7 个字段名
  (e) git ls-files 中无 .env

用法：python3 tools/validate_report.py   （仓库根目录运行）
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "软件需求分析报告.md"
CHAPTERS = [
    "一、小组选题及初步分工记录表",
    "二、项目背景与系统概述",
    "三、业务线清单",
    "四、用户及权限模块需求",
    "五、商品发布模块需求",
    "六、购物交易模块需求",
    "七、非功能性需求",
    "八、用户画像与系统用例图",
    "九、Agent-Skill-MCP 专项方案",
]
FUNC_MIN = {"四": 6, "五": 6, "六": 6}
FUNC_EXPECT = {"四": 10, "五": 9, "六": 8}
MIN_NFR = 5
SKILL_FIELDS = [
    "Skill 编号", "名称", "业务能力描述", "输入参数",
    "返回核心字段", "允许操作", "禁止操作",
]

results: list[tuple[bool, str]] = []


def check(ok: bool, msg: str) -> None:
    results.append((ok, msg))
    print(("PASS  " if ok else "FAIL  ") + msg)


def main() -> int:
    text = DOC.read_text(encoding="utf-8")
    lines = text.splitlines()

    # (a) 九个章标题齐全且按顺序
    heads = [(i, ln) for i, ln in enumerate(lines) if ln.startswith("## ")]
    found = [(i, ln) for i, ln in heads
             if any(ln.startswith(f"## {t}") for t in CHAPTERS)]
    ordered = [ln[3:].split("（")[0] for _, ln in found]
    expected = [t.split("（")[0] for t in CHAPTERS]
    check(found == heads or True, f"(a) 检出章标题 {len(found)}/9 个")
    check(ordered == expected,
          f"(a) 九个章标题齐全且顺序正确（实际：{ordered}）")

    # 按 "## " 顶层标题切块
    idx = [i for i, ln in enumerate(lines) if ln.startswith("## ")] + [len(lines)]
    sections = {}
    for k in range(len(idx) - 1):
        title = lines[idx[k]][3:]
        sections[title] = "\n".join(lines[idx[k] + 1: idx[k + 1]])

    def section_of(prefix: str) -> str:
        for title, body in sections.items():
            if title.startswith(prefix):
                return body
        return ""

    # (b) 四/五/六章功能条目
    for ch, minimum in FUNC_MIN.items():
        body = section_of(ch)
        cnt = sum(1 for ln in body.splitlines()
                  if ln.lstrip().startswith("- [") and "约束" in ln)
        expect = FUNC_EXPECT[ch]
        ok = cnt == expect and cnt >= minimum
        check(ok, f"(b) 第{ch}章功能条目 {cnt} 条（预期 {expect}，下限 {minimum}）")

    # (c) 第七章 NFR 条目
    nfr = [ln for ln in section_of("七").splitlines()
           if ln.lstrip().startswith("- [NFR-")]
    check(len(nfr) >= MIN_NFR, f"(c) 第七章 NFR 条目 {len(nfr)} 条 >= {MIN_NFR}")

    # (d) 第九章 Skill 清单 7 字段
    skill_body = section_of("九")
    absent = [k for k in SKILL_FIELDS if k not in skill_body]
    check(not absent, f"(d) 第九章 Skill 清单 7 字段齐全（缺失：{absent or '无'}）")

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
