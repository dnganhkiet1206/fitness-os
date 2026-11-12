"""Rendering and encoding. Every camera renders the SAME scene on the SAME
timeline; only ``scene.camera`` changes between passes. Frames are written as
PNG and encoded with the system ffmpeg, so a crash never costs more than the
frame in progress and the brand overlay is applied without re-rendering."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import bpy
from mathutils import Vector

from . import config, studio


def camera_objects(scene: bpy.types.Scene, exercise: dict) -> dict:
    out = {}
    for key in exercise["camera_presets"]:
        cam = bpy.data.objects.get("CAM_" + key)
        if cam is not None:
            out[key] = cam
    return out


def _activate(scene: bpy.types.Scene, camera: bpy.types.Object) -> None:
    scene.camera = camera
    bpy.context.view_layer.update()
    focus = Vector(scene["evs_light_focus"])
    studio.aim_light_rig(camera, focus)


def render_frames(scene: bpy.types.Scene, camera: bpy.types.Object, frames: list[int], out_dir: Path) -> dict:
    """Renders the listed frames to out_dir/NNNN.png. Returns timing."""
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for f in frames:
        scene.frame_set(f)
        _activate(scene, camera)  # after frame_set: a following camera has moved
        scene.render.filepath = str(out_dir / f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    return {"frames": len(frames), "seconds": round(time.time() - t0, 2)}


def ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def encode_mp4(frames_dir: Path, first_frame: int, frame_count: int, fps: int, out_path: Path, video: dict,
               brand: dict | None = None) -> None:
    """H.264 in MP4, yuv420p and faststart so it plays in AVPlayer and in
    browsers. The watermark, when the brand profile enables one, is burnt in
    here and nowhere else."""
    args = ["-framerate", str(fps), "-start_number", str(first_frame), "-i", str(frames_dir / "%04d.png")]
    filters = None
    wm = (brand or {}).get("watermark", {})
    if wm.get("enabled") and wm.get("image_path"):
        logo = Path(wm["image_path"])
        if not logo.is_absolute():
            logo = config.CONFIG_DIR / logo
        if not logo.exists():
            raise FileNotFoundError(f"watermark image {logo} does not exist")
        args += ["-i", str(logo)]
        m = int(wm.get("margin_px", 24))
        pos = {"bottom_right": f"W-w-{m}:H-h-{m}", "bottom_left": f"{m}:H-h-{m}", "top_right": f"W-w-{m}:{m}", "top_left": f"{m}:{m}"}[wm.get("position", "bottom_right")]
        filters = (f"[1:v]format=rgba,colorchannelmixer=aa={wm.get('opacity', 0.7)}[wm0];"
                   f"[wm0][0:v]scale2ref=w=main_w*{wm.get('width_fraction', 0.12)}:h=ow/mdar[wm][base];[base][wm]overlay={pos}[out]")
    args += ["-frames:v", str(frame_count)]
    if filters:
        args += ["-filter_complex", filters, "-map", "[out]"]
    args += ["-c:v", video["codec"], "-preset", video["preset"], "-crf", str(video["crf"]), "-pix_fmt", video["pixel_format"],
             "-profile:v", video["profile"], "-level", video["level"], "-color_primaries", "bt709", "-color_trc", "bt709",
             "-colorspace", "bt709", "-movflags", "+faststart", "-an", str(out_path)]
    ffmpeg(args)


def contact_sheet(rows: list[list[Path]], out_path: Path, tile_width: int = 640) -> None:
    """Grid image: one row per camera, one column per frame."""
    args = []
    for row in rows:
        for p in row:
            args += ["-i", str(p)]
    cols = len(rows[0])
    n = len(rows) * cols
    scaled = "".join(f"[{i}:v]scale={tile_width}:-2[s{i}];" for i in range(n))
    layout = "|".join(f"{c * tile_width}_{'0' if r == 0 else '+'.join(f'h{k * cols}' for k in range(r))}" for r in range(len(rows)) for c in range(cols))
    graph = scaled + "".join(f"[s{i}]" for i in range(n)) + f"xstack=inputs={n}:layout={layout}[out]"
    ffmpeg([*args, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", str(out_path)])


def probe(path: Path) -> dict:
    """What ffprobe says about a video file (decoded frame count included)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
         "stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,duration,bit_rate",
         "-show_entries", "format=duration,size,format_name", "-of", "json", str(path)],
        check=True, capture_output=True, text=True)
    data = json.loads(out.stdout)
    stream = data["streams"][0]
    num, den = stream["r_frame_rate"].split("/")
    return {
        "codec": stream["codec_name"],
        "profile": stream.get("profile"),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "pixel_format": stream["pix_fmt"],
        "frame_rate": round(float(num) / float(den), 4),
        "frames_decoded": int(stream["nb_read_frames"]),
        "duration_s": round(float(data["format"]["duration"]), 4),
        "size_bytes": int(data["format"]["size"]),
    }


def work_dir(exercise_id: str) -> Path:
    """Frames are large and temporary: they go outside the repository."""
    base = os.environ.get("EVS_WORK_DIR") or os.path.join(os.environ.get("TMPDIR", "/tmp"), "evs-work")
    path = Path(base) / exercise_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def remove_dir(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
