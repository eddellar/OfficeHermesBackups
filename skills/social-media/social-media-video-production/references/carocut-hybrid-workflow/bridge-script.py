#!/usr/bin/env python3
"""
carocut-bridge: carocut 策划 → ComfyUI 生图 → FFmpeg 合成

工作流：
1. 读取 storyboard.yaml
2. 将 visual_description 翻译增强为英文写实 prompt
3. 调用 ComfyUI API 生图（每个 shot 生成一张关键图）
4. FFmpeg 合成视频（图片 → 帧序列 → 视频 + 混音）
5. 输出最终视频

依赖：
    pip install pyyaml requests pillow

用法：
    python carocut-bridge.py --storyboard manifests/storyboard.yaml --output output.mp4
"""

import argparse
import json
import os
import sys
import time
import yaml
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

# ========== 配置 ==========
COMFYUI_URL = "http://localhost:8188"
DEFAULT_OUTPUT = "output.mp4"

# ========== 数据结构 ==========
@dataclass
class Shot:
    shot_id: str
    chapter: str
    duration_ms: int
    visual_description: str
    framing: str
    camera_movement: str
    pacing: str
    visual_tension: float
    transition_in: dict
    breathing: bool
    voiceover_refs: list = field(default_factory=list)
    resource_refs: list = field(default_factory=list)

    @property
    def duration_sec(self) -> float:
        return self.duration_ms / 1000.0

    @property
    def frames(self) -> int:
        return int(self.duration_ms * 24 / 1000)


@dataclass
class Storyboard:
    shots: list[Shot]

    @classmethod
    def from_yaml(cls, path: str) -> "Storyboard":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        shots_data = data.get("shots", data) if isinstance(data, dict) else data
        shots = []
        for s in shots_data:
            shots.append(Shot(
                shot_id=s["shot_id"],
                chapter=s.get("chapter", ""),
                duration_ms=s["duration_ms"],
                visual_description=s["visual_description"],
                framing=s.get("framing", "MS"),
                camera_movement=s.get("camera_movement", "static"),
                pacing=s.get("pacing", "medium"),
                visual_tension=s.get("visual_tension", 0.5),
                transition_in=s.get("transition_in", {"type": "cut", "duration_ms": 0}),
                breathing=s.get("breathing", False),
                voiceover_refs=s.get("voiceover_refs", []),
                resource_refs=s.get("resource_refs", []),
            ))
        return cls(shots=shots)

    def total_duration_ms(self) -> int:
        return sum(s.duration_ms for s in self.shots)


def enhance_prompt(shot: Shot) -> str:
    """将 carocut visual_description 转换为 ComfyUI 英文写实 prompt"""
    desc = shot.visual_description
    quality_tags = "photorealistic, 8k, highly detailed, soft natural lighting, cinematic composition"
    framing_map = {
        "ECU": "extreme close-up shot, ",
        "CU": "close-up shot, ",
        "MCU": "medium close-up shot, ",
        "MS": "medium shot, ",
        "MLS": "medium long shot, ",
        "LS": "long shot, wide angle, ",
        "ELS": "extreme long shot, establishing shot, ",
    }
    pacing_map = {
        "slow": "slow motion feeling, contemplative mood, ",
        "medium": "natural pace, balanced composition, ",
        "fast": "dynamic energy, brisk composition, ",
        "pause": "stillness, contemplative pause, ",
    }
    framing_prefix = framing_map.get(shot.framing, "")
    pacing_prefix = pacing_map.get(shot.pacing, "")
    return f"{framing_prefix}{pacing_prefix}{desc}, {quality_tags}"


# ========== ComfyUI API ==========
def comfyui_check_health() -> bool:
    try:
        r = requests.get(f"{COMFYUI_URL}/system_stats", timeout=5)
        return r.status_code == 200
    except:
        return False


def comfyui_get_history(prompt_id: str) -> dict:
    r = requests.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10)
    return r.json()


def comfyui_wait_for_completion(prompt_id: str, timeout: int = 300) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        history = comfyui_get_history(prompt_id)
        if prompt_id in history:
            status = history[prompt_id].get("status", {})
            if status.get("state") == "completed":
                return history[prompt_id]
            elif status.get("state") == "failed":
                raise RuntimeError(f"ComfyUI task failed: {status.get('errors')}")
        time.sleep(3)
    raise TimeoutError(f"ComfyUI task timeout after {timeout}s")


def comfyui_dispatch_workflow(workflow: dict) -> str:
    r = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow}, timeout=10)
    if r.status_code != 200:
        raise RuntimeError(f"ComfyUI dispatch failed: {r.status_code} {r.text}")
    return r.json().get("prompt_id", "")


def comfyui_get_output_files(history_entry: dict) -> list[str]:
    outputs = []
    for node_id, node_data in history_entry.get("outputs", {}).items():
        if "images" in node_data:
            for img in node_data["images"]:
                filename = img["filename"]
                subfolder = img.get("subfolder", "")
                for base in [
                    f"/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/{subfolder}/{filename}",
                    f"/mnt/e/ComfyUI/output/{filename}",
                ]:
                    if os.path.exists(base):
                        outputs.append(base)
                        break
    return outputs


# ========== 单 shot 生图 ==========
def generate_shot_image(
    shot: Shot,
    workflow_path: str,
    output_dir: str,
    negative_prompt: str = "text, watermark, signature, logo, blurry, low quality, deformed, ugly, oversaturated"
) -> Optional[str]:
    if shot.breathing:
        print(f"  [BREATHING] {shot.shot_id} - 跳过图像生成")
        return None

    prompt = enhance_prompt(shot)
    print(f"  Shot: {shot.shot_id}")
    print(f"    Prompt: {prompt[:80]}...")

    with open(workflow_path, "r") as f:
        workflow = json.load(f)

    # 修改 prompt 节点（根据实际 workflow 结构调整）
    for node_id, node in workflow.items():
        if isinstance(node, dict):
            if node.get("class_type") in ("CLIPTextEncode", "CLIPTextEncodeSD3"):
                inputs = node.get("inputs", {})
                if "text" in inputs:
                    if "positive" in str(inputs.get("text", "")).lower():
                        node["inputs"]["text"] = prompt
                    elif "negative" in str(inputs.get("text", "")).lower():
                        node["inputs"]["text"] = negative_prompt

    output_filename = f"{shot.shot_id}.png"
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") == "SaveImage":
            node["inputs"]["filename"] = output_filename

    prompt_id = comfyui_dispatch_workflow(workflow)
    print(f"    Prompt ID: {prompt_id}")
    result = comfyui_wait_for_completion(prompt_id, timeout=300)
    files = comfyui_get_output_files(result)
    return files[0] if files else None


def generate_all_shots(
    storyboard: Storyboard,
    workflow_path: str,
    output_dir: str,
    max_workers: int = 2
) -> dict[str, Optional[str]]:
    os.makedirs(output_dir, exist_ok=True)
    results = {}

    def gen_one(shot: Shot) -> tuple[str, Optional[str]]:
        try:
            path = generate_shot_image(shot, workflow_path, output_dir)
            return shot.shot_id, path
        except Exception as e:
            print(f"  ERROR: {shot.shot_id} - {e}")
            return shot.shot_id, None

    print(f"\n开始生成 {len(storyboard.shots)} 个 shot 图片...")
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(gen_one, shot): shot for shot in storyboard.shots}
        for future in as_completed(futures):
            shot_id, path = future.result()
            results[shot_id] = path
    return results


# ========== FFmpeg ==========
def ffmpeg_build_frame_sequence(
    shot_images: dict[str, str],
    storyboard: Storyboard,
    output_dir: str,
    fps: int = 24
) -> list[str]:
    from PIL import Image
    import shutil

    sequence_dir = os.path.join(output_dir, "sequences")
    os.makedirs(sequence_dir, exist_ok=True)
    frame_files = []
    frame_idx = 0

    for shot in storyboard.shots:
        img_path = shot_images.get(shot.shot_id)

        if shot.breathing:
            img = Image.new("RGB", (720, 1280), color=(255, 245, 230))
            breath_path = os.path.join(sequence_dir, f"breath_{shot.shot_id}.png")
            img.save(breath_path)
            img_path = breath_path

        if not img_path or not os.path.exists(img_path):
            img = Image.new("RGB", (720, 1280), color=(200, 200, 200))
            placeholder = os.path.join(sequence_dir, f"placeholder_{shot.shot_id}.png")
            img.save(placeholder)
            img_path = placeholder

        n_frames = shot.frames
        for f in range(n_frames):
            frame_name = f"frame_{frame_idx:05d}.png"
            frame_path = os.path.join(sequence_dir, frame_name)
            shutil.copy(img_path, frame_path)
            frame_files.append(frame_path)
            frame_idx += 1

    return frame_files


def ffmpeg_concat_images_to_video(
    frame_files: list[str],
    output_path: str,
    fps: int = 24,
    crf: int = 18
) -> str:
    list_file = os.path.join(os.path.dirname(output_path) or ".", "frames.txt")
    with open(list_file, "w") as f:
        for frame in frame_files:
            abs_frame = os.path.abspath(frame)
            f.write(f"file '{abs_frame}'\n")
            f.write(f"duration {1.0/fps}\n")
    with open(list_file, "a") as f:
        f.write(f"file '{os.path.abspath(frame_files[-1])}'\n")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", list_file,
        "-vf", f"fps={fps},scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-an", output_path
    ]
    import subprocess
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg 合成失败: {result.stderr[-500:]}")
    os.remove(list_file)
    return output_path


def ffmpeg_add_audio(
    video_path: str,
    audio_dir: str,
    storyboard: Storyboard,
    output_path: str
) -> str:
    import shutil
    vo_dir = os.path.join(audio_dir, "vo")
    bgm_file = os.path.join(audio_dir, "bgm", "main.mp3")

    vo_files = []
    for shot in storyboard.shots:
        for vo_ref in shot.voiceover_refs:
            vo_file = os.path.join(vo_dir, f"{vo_ref}.wav")
            if os.path.exists(vo_file):
                vo_files.append(vo_file)

    if not vo_files:
        shutil.copy(video_path, output_path)
        return output_path

    concat_file = os.path.join(os.path.dirname(video_path) or ".", "vo_concat.txt")
    with open(concat_file, "w") as f:
        for vo in vo_files:
            f.write(f"file '{vo}'\n")

    vo_merged = os.path.join(os.path.dirname(video_path) or ".", "vo_merged.wav")
    import subprocess
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                    "-i", concat_file, "-c", "copy", vo_merged],
                   capture_output=True)

    base_dir = os.path.dirname(video_path) or "."
    if os.path.exists(bgm_file):
        mixed_audio = os.path.join(base_dir, "audio_mixed.wav")
        subprocess.run(["ffmpeg", "-y", "-i", vo_merged, "-i", bgm_file,
                        "-filter_complex", "[1:a]volume=0.3[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]",
                        "-map", "[aout]", "-ar", "44100", mixed_audio],
                       capture_output=True)
        final_audio = mixed_audio
    else:
        final_audio = vo_merged

    subprocess.run(["ffmpeg", "-y", "-i", video_path, "-i", final_audio,
                    "-c:v", "copy", "-c:a", "aac", "-shortest", output_path],
                   capture_output=True)
    os.remove(concat_file)
    return output_path


# ========== 主流程 ==========
def main():
    parser = argparse.ArgumentParser(description="carocut-bridge")
    parser.add_argument("--storyboard", required=True)
    parser.add_argument("--workflow", default="workflows/img_gen_zimage_turbo.json")
    parser.add_argument("--output", default="output.mp4")
    parser.add_argument("--shots-dir", default="shots")
    parser.add_argument("--audio-dir", default="audio")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--skip-comfy", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("carocut-bridge: carocut → ComfyUI → FFmpeg")
    print("=" * 60)

    print(f"\n[1] 读取分镜: {args.storyboard}")
    storyboard = Storyboard.from_yaml(args.storyboard)
    print(f"    总计 {len(storyboard.shots)} 个 shot, {storyboard.total_duration_ms()/1000:.1f} 秒")
    for shot in storyboard.shots:
        print(f"    - {shot.shot_id}: {shot.duration_ms}ms, {shot.framing}, breathing={shot.breathing}")

    if args.skip_comfy:
        print("\n[2] 跳过 ComfyUI 生图（--skip-comfy）")
        shot_images = {s.shot_id: None for s in storyboard.shots}
    else:
        print(f"\n[2] 检查 ComfyUI: {COMFYUI_URL}")
        if not comfyui_check_health():
            print("  警告: ComfyUI 未运行，跳过生图")
            shot_images = {s.shot_id: None for s in storyboard.shots}
        else:
            print("  ComfyUI 运行正常")
            print(f"\n[3] 生成 shot 图片...")
            shot_images = generate_all_shots(
                storyboard, args.workflow, args.shots_dir, max_workers=args.workers
            )

    print(f"\n[4] 构建帧序列...")
    output_dir = os.path.dirname(args.output) or "."
    frame_files = ffmpeg_build_frame_sequence(shot_images, storyboard, output_dir)
    print(f"    生成 {len(frame_files)} 帧")

    print(f"\n[5] FFmpeg 合成视频...")
    video_no_audio = os.path.join(output_dir, "video_no_audio.mp4")
    ffmpeg_concat_images_to_video(frame_files, video_no_audio)
    print(f"    视频: {video_no_audio}")

    print(f"\n[6] 添加音频...")
    ffmpeg_add_audio(video_no_audio, args.audio_dir, storyboard, args.output)
    print(f"    最终输出: {args.output}")

    print("\n完成!")


if __name__ == "__main__":
    main()
