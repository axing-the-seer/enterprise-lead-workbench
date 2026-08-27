#!/usr/bin/env python3
import argparse
import json
import os
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    input_path = Path(args.input).expanduser().resolve()
    if not input_path.is_file() or input_path.stat().st_size > 2 * 1024 * 1024:
        raise SystemExit("报告响应文件不存在或超过 2 MiB。")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("structuredContent"), dict):
        payload = payload["structuredContent"]
    if not isinstance(payload, dict):
        raise SystemExit("报告响应必须是 JSON 对象。")
    html = payload.get("reportHtml")
    name = payload.get("reportFileName")
    if not isinstance(html, str) or not html.lstrip().lower().startswith("<!doctype html"):
        raise SystemExit("响应中没有有效的 reportHtml。")
    if len(html.encode("utf-8")) > 2 * 1024 * 1024:
        raise SystemExit("HTML 报告超过 2 MiB。")
    if re.search(r"<script\b|javascript\s*:|\son[a-z]+\s*=", html, re.I):
        raise SystemExit("HTML 报告包含不允许的可执行内容。")
    safe_name = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "-", str(name or "企业调研报告.html"))[:160]
    if not safe_name.lower().endswith(".html"):
        safe_name += ".html"
    output_dir = Path.cwd() / "outputs"
    if output_dir.is_symlink():
        raise SystemExit("输出目录不能是符号链接。")
    output_dir.mkdir(mode=0o700, exist_ok=True)
    if not output_dir.is_dir():
        raise SystemExit("输出目录无效。")
    report_id = re.sub(r"[^A-Za-z0-9_-]", "-", str(payload.get("reportId", "new")))[:80]
    base_path = output_dir / safe_name
    candidates = [
        base_path,
        output_dir / f"{base_path.stem}-{report_id or 'new'}{base_path.suffix}",
        *(
            output_dir / f"{base_path.stem}-{report_id or 'new'}-{index}{base_path.suffix}"
            for index in range(2, 101)
        ),
    ]
    output_path = None
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    encoded = html.encode("utf-8")
    for candidate in candidates:
        try:
            descriptor = os.open(candidate, flags, 0o600)
        except FileExistsError:
            continue
        try:
            with os.fdopen(descriptor, "wb") as output_file:
                output_file.write(encoded)
        except BaseException:
            candidate.unlink(missing_ok=True)
            raise
        output_path = candidate
        break
    if output_path is None:
        raise SystemExit("同名报告文件过多，请清理 outputs 目录后重试。")
    print(json.dumps({
        "type": "workbuddy_present_files",
        "version": "1.0",
        "ok": True,
        "markdown": f"已生成 {safe_name}。",
        "htmlFilePath": str(output_path.resolve()),
        "htmlFileName": output_path.name,
        "presentFilesInstruction": "调用 present_files 展示 htmlFilePath；如用户指定了收件人和渠道，再使用当前 Agent 已授权的通讯工具发送。"
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
