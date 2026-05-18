# comfyui-skill Subprocess Invocation Pattern

**问题：** 从 Python subprocess 直接调用 `comfyui-skill` 时，venv 的 `python3` ELF 二进制优先于 shell script wrapper，导致 `comfyui-skill` 返回 `INVALID_PARAM`。

**根因：** venv 的 `python3` (3.11.15 ELF) 在 PATH 中优先于 shell scripts，comfyui-skill wrapper 无法正确执行。

**解决方案：** 用 `bash -lc` 强制加载 login shell 完整 PATH，再用 `shell=False` 避免引号嵌套解析错误。

## 正确写法

```python
import subprocess
from pathlib import Path

SKILL_BIN = "/home/eddellar/.local/bin/comfyui-skill"
SHOTS_DIR = Path("/mnt/e/carocut-test/shots")
VIDEOS_DIR = Path("/mnt/e/carocut-test/videos")

def generate_image(prompt: str, output_path: str) -> bool:
    # --output 是目录，文件输出为 output_dir/z_XXXXX_.png
    inner_cmd = f'{SKILL_BIN} generate -p "{prompt}" --output "{SHOTS_DIR}"'
    result = subprocess.run(
        ["bash", "-lc", inner_cmd],
        shell=False,          # 必须 False，否则引号嵌套被 Python 的 sh -c 破坏
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        print(f"FAILED: {result.stderr[:200]}")
        return False
    # 从输出目录找最新文件
    pngs = sorted(SHOTS_DIR.glob("z_*.png"), key=lambda p: p.stat().st_mtime)
    if pngs:
        import shutil
        shutil.copy2(pngs[-1], output_path)
    return True
```

## 错误写法

```python
# 错误1：直接 shell=True（venv PATH 冲突）
subprocess.run(f"{SKILL_BIN} generate -p ...", shell=True, ...)

# 错误2：shell=True + bash -lc（Python 额外套 sh -c，引号解析出错）
subprocess.run(f"bash -lc '{SKILL_BIN} generate ...'", shell=True, ...)

# 错误3：用 -o 短选项（不存在，只有 --output）
subprocess.run([SKILL_BIN, "generate", "-p", prompt, "-o", output_dir], ...)
```

## 输出文件命名规则

| Workflow | 输出文件名 | 查找方式 |
|----------|-----------|---------|
| `z_image_turbo` | `z_XXXXX_.png` | `sorted(glob("z_*.png"), key=mtime)[-1]` |
| `ltx_23_i2v_distilled` | `i2v_XXXXX-audio.mp4` | `sorted(glob("i2v_*-audio.mp4"), key=mtime)[-1]` |
| `ace_step_15_music` | `music_XXXXX.mp3` | `sorted(glob("music_*.mp3"), key=mtime)[-1]` |
| `qwen3_tts` | `tts_XXXXX.wav` | `sorted(glob("tts_*.wav"), key=mtime)[-1]` |
