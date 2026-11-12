"""Reads, inspects and extends binary glTF (.glb) files. Plain Python, so the
checks run without Blender and are unit-tested.

Used for two things the Blender exporter does not do for us: verifying what
really ended up in the file, and adding KHR_materials_variants (a neutral
look and a muscle-highlight look in one file)."""

from __future__ import annotations

import json
import struct
from pathlib import Path

MAGIC = 0x46546C67  # 'glTF'
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def read_glb(path) -> tuple[dict, bytearray]:
    data = Path(path).read_bytes()
    if len(data) < 20:
        raise ValueError("file too small to be a GLB")
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != MAGIC or version != 2:
        raise ValueError("not a glTF 2.0 binary file")
    if length != len(data):
        raise ValueError(f"header says {length} bytes, file has {len(data)}")
    pos, doc, blob = 12, None, bytearray()
    while pos < length:
        chunk_len, chunk_type = struct.unpack_from("<II", data, pos)
        body = data[pos + 8 : pos + 8 + chunk_len]
        if chunk_type == JSON_CHUNK:
            doc = json.loads(body.decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            blob = bytearray(body)
        pos += 8 + chunk_len
    if doc is None:
        raise ValueError("GLB has no JSON chunk")
    return doc, blob


def write_glb(path, doc: dict, blob: bytes) -> None:
    blob = bytes(blob) + b"\x00" * ((4 - len(blob) % 4) % 4)
    if doc.get("buffers"):
        doc["buffers"][0]["byteLength"] = len(blob)
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    text += b" " * ((4 - len(text) % 4) % 4)
    total = 12 + 8 + len(text) + (8 + len(blob) if blob else 0)
    out = struct.pack("<III", MAGIC, 2, total) + struct.pack("<II", len(text), JSON_CHUNK) + text
    if blob:
        out += struct.pack("<II", len(blob), BIN_CHUNK) + blob
    Path(path).write_bytes(out)


def summarize(path) -> dict:
    """Facts about a GLB, including consistency errors found while reading."""
    doc, blob = read_glb(path)
    errors = []
    accessors = doc.get("accessors", [])
    views = doc.get("bufferViews", [])
    for i, view in enumerate(views):
        if view.get("byteOffset", 0) + view["byteLength"] > len(blob):
            errors.append(f"bufferView {i} runs past the binary chunk")
    for i, acc in enumerate(accessors):
        if "bufferView" not in acc:
            continue
        view = views[acc["bufferView"]]
        size = COMPONENT_BYTES[acc["componentType"]] * TYPE_COUNT[acc["type"]]
        stride = view.get("byteStride", size)
        need = acc.get("byteOffset", 0) + (acc["count"] - 1) * stride + size if acc["count"] else 0
        if need > view["byteLength"]:
            errors.append(f"accessor {i} runs past bufferView {acc['bufferView']}")

    vertices = triangles = primitives = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            primitives += 1
            vertices += accessors[prim["attributes"]["POSITION"]]["count"]
            if "indices" in prim:
                triangles += accessors[prim["indices"]]["count"] // 3
    animations = []
    for anim in doc.get("animations", []):
        duration = 0.0
        frames = 0
        for sampler in anim["samplers"]:
            acc = accessors[sampler["input"]]
            duration = max(duration, float(acc.get("max", [0.0])[0]))
            frames = max(frames, acc["count"])
        targets = {ch["target"]["node"] for ch in anim["channels"] if "node" in ch["target"]}
        animations.append({"name": anim.get("name", ""), "channels": len(anim["channels"]), "animated_nodes": len(targets),
                           "duration_s": round(duration, 4), "max_keys": frames})
    skins = [{"name": s.get("name", ""), "joints": len(s["joints"])} for s in doc.get("skins", [])]
    variants = [v["name"] for v in doc.get("extensions", {}).get("KHR_materials_variants", {}).get("variants", [])]
    image_bytes = sum(views[img["bufferView"]]["byteLength"] for img in doc.get("images", []) if "bufferView" in img)
    return {
        "file": Path(path).name,
        "size_bytes": Path(path).stat().st_size,
        "generator": doc.get("asset", {}).get("generator", ""),
        "nodes": len(doc.get("nodes", [])),
        "node_names": sorted(n.get("name", "") for n in doc.get("nodes", [])),
        "meshes": len(doc.get("meshes", [])),
        "primitives": primitives,
        "vertices": vertices,
        "triangles": triangles,
        "materials": [m.get("name", "") for m in doc.get("materials", [])],
        "textures": len(doc.get("textures", [])),
        "images": len(doc.get("images", [])),
        "image_bytes": image_bytes,
        "skins": skins,
        "animations": animations,
        "material_variants": variants,
        "extensions_used": doc.get("extensionsUsed", []),
        "errors": errors,
    }


def _add_image(doc: dict, blob: bytearray, png: bytes, name: str) -> int:
    """Embeds a PNG and returns the index of a texture that uses it."""
    blob.extend(b"\x00" * ((4 - len(blob) % 4) % 4))
    offset = len(blob)
    blob.extend(png)
    doc.setdefault("bufferViews", []).append({"buffer": 0, "byteOffset": offset, "byteLength": len(png)})
    doc.setdefault("images", []).append({"bufferView": len(doc["bufferViews"]) - 1, "mimeType": "image/png", "name": name})
    if not doc.get("samplers"):
        doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
    doc.setdefault("textures", []).append({"sampler": 0, "source": len(doc["images"]) - 1, "name": name})
    return len(doc["textures"]) - 1


def add_material_variants(path, out_path, looks: dict[str, dict[str, dict]]) -> list[str]:
    """Adds KHR_materials_variants to a GLB.

    ``looks`` maps a variant name to {existing material name: replacement},
    where a replacement is either {"same": True} (keep the exported material)
    or {"base_color": [r, g, b, a], "texture_png": bytes or None}. Replacement
    materials copy the roughness and metallic values of the one they replace.
    A viewer that ignores the extension shows the file as exported."""
    doc, blob = read_glb(path)
    materials = doc.setdefault("materials", [])
    index = {m.get("name", ""): i for i, m in enumerate(materials)}
    variant_names = list(looks.keys())
    mapping: dict[int, list[tuple[int, int]]] = {}
    for v, (variant, replacements) in enumerate(looks.items()):
        for mat_name, spec in replacements.items():
            if mat_name not in index:
                raise KeyError(f"GLB has no material named {mat_name!r}")
            src = index[mat_name]
            if spec.get("same"):
                target = src
            else:
                new = json.loads(json.dumps(materials[src]))
                new["name"] = f"{mat_name}_{variant}"
                pbr = new.setdefault("pbrMetallicRoughness", {})
                pbr["baseColorFactor"] = list(spec.get("base_color", [1, 1, 1, 1]))
                pbr.pop("baseColorTexture", None)
                new.pop("emissiveTexture", None)
                new.pop("emissiveFactor", None)
                if spec.get("texture_png"):
                    pbr["baseColorTexture"] = {"index": _add_image(doc, blob, spec["texture_png"], new["name"])}
                materials.append(new)
                target = len(materials) - 1
            mapping.setdefault(src, []).append((v, target))
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            src = prim.get("material")
            if src in mapping:
                prim.setdefault("extensions", {})["KHR_materials_variants"] = {
                    "mappings": [{"material": target, "variants": [v]} for v, target in mapping[src]]}
    doc.setdefault("extensions", {})["KHR_materials_variants"] = {"variants": [{"name": n} for n in variant_names]}
    used = doc.setdefault("extensionsUsed", [])
    if "KHR_materials_variants" not in used:
        used.append("KHR_materials_variants")
    write_glb(out_path, doc, blob)
    return variant_names
