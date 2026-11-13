"""Materials. Every colour comes from the brand profile; nothing brand
specific is stored in the character or equipment geometry."""

from __future__ import annotations

import bpy

from .config import hex_to_linear_rgb

HIGHLIGHT_IMAGE_NODE = "EVS Highlight Map"
HIGHLIGHT_STRENGTH_NODE = "EVS Highlight Strength"


def _rgba(hex_value: str) -> tuple[float, float, float, float]:
    r, g, b = hex_to_linear_rgb(hex_value)
    return r, g, b, 1.0


def _new(name: str) -> tuple[bpy.types.Material, bpy.types.NodeTree, bpy.types.Node, bpy.types.Node]:
    old = bpy.data.materials.get(name)
    if old is not None:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, tree, bsdf, out


def _socket(sockets, name: str):
    """First enabled socket with this name (Mix nodes reuse names per type)."""
    for s in sockets:
        if s.name == name and s.enabled:
            return s
    raise KeyError(name)


def _mix_color(tree: bpy.types.NodeTree, x: float, y: float) -> bpy.types.Node:
    node = tree.nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    node.blend_type = "MIX"
    node.clamp_factor = True
    node.location = (x, y)
    return node


def surface_material(name: str, base_hex: str, brand: dict, roughness: float, highlight_gain: float = 1.0) -> bpy.types.Material:
    """Body or apparel surface with the muscle highlight overlay.

    The overlay reads one RGB image: red = primary muscles, green = secondary,
    blue = stabilisers (see evs/muscles.py). Until an exercise assigns an
    image the node has none and Blender returns black, so nothing is tinted.
    ``EVS Highlight Strength`` (0..1) can be keyed to fade the overlay."""
    colors = brand["colors"]
    mat, tree, bsdf, _ = _new(name)
    nodes, links = tree.nodes, tree.links

    tex = nodes.new("ShaderNodeTexImage")
    tex.name = tex.label = HIGHLIGHT_IMAGE_NODE
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    tex.location = (-900, 100)
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-620, 100)
    links.new(tex.outputs["Color"], sep.inputs["Color"])

    strength = nodes.new("ShaderNodeValue")
    strength.name = strength.label = HIGHLIGHT_STRENGTH_NODE
    strength.outputs[0].default_value = 1.0
    strength.location = (-620, -160)

    previous = None
    emission_sum = None
    x = -380
    for channel, key in (("Blue", "muscle_stabilizer"), ("Green", "muscle_secondary"), ("Red", "muscle_primary")):
        factor = nodes.new("ShaderNodeMath")
        factor.operation = "MULTIPLY"
        factor.use_clamp = True
        factor.location = (x, 320)
        links.new(sep.outputs[channel], factor.inputs[0])
        links.new(strength.outputs[0], factor.inputs[1])
        if highlight_gain != 1.0:
            gain = nodes.new("ShaderNodeMath")
            gain.operation = "MULTIPLY"
            gain.use_clamp = True
            gain.inputs[1].default_value = highlight_gain
            gain.location = (x, 480)
            links.new(factor.outputs[0], gain.inputs[0])
            factor = gain
        mix = _mix_color(tree, x + 180, 100)
        if previous is None:
            _socket(mix.inputs, "A").default_value = _rgba(base_hex)
        else:
            links.new(_socket(previous.outputs, "Result"), _socket(mix.inputs, "A"))
        _socket(mix.inputs, "B").default_value = _rgba(colors[key])
        links.new(factor.outputs[0], _socket(mix.inputs, "Factor"))
        previous = mix

        glow = _mix_color(tree, x + 180, -260)
        if emission_sum is None:
            _socket(glow.inputs, "A").default_value = (0.0, 0.0, 0.0, 1.0)
        else:
            links.new(_socket(emission_sum.outputs, "Result"), _socket(glow.inputs, "A"))
        _socket(glow.inputs, "B").default_value = _rgba(colors[key])
        links.new(factor.outputs[0], _socket(glow.inputs, "Factor"))
        emission_sum = glow
        x += 240

    bsdf.location = (x + 260, 0)
    links.new(_socket(previous.outputs, "Result"), bsdf.inputs["Base Color"])
    links.new(_socket(emission_sum.outputs, "Result"), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.35
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    mat["evs_role"] = name
    return mat


def set_highlight_image(mat: bpy.types.Material, image: bpy.types.Image | None) -> None:
    node = mat.node_tree.nodes.get(HIGHLIGHT_IMAGE_NODE)
    if node is None:
        raise KeyError(f"{mat.name} has no highlight node")
    node.image = image
    if image is not None:
        image.colorspace_settings.name = "Non-Color"


def plain_material(name: str, base_hex: str, roughness: float, metallic: float = 0.0, coat: float = 0.0) -> bpy.types.Material:
    mat, _tree, bsdf, _ = _new(name)
    bsdf.inputs["Base Color"].default_value = _rgba(base_hex)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.2
    mat["evs_role"] = name
    return mat


def character_materials(brand: dict) -> dict[str, bpy.types.Material]:
    colors = brand["colors"]
    return {
        "body": surface_material("EVS_Body", colors["character_body"], brand, roughness=0.5),
        "apparel": surface_material("EVS_Apparel", colors["character_apparel"], brand, roughness=0.72, highlight_gain=0.8),
    }


def equipment_materials(brand: dict) -> dict[str, bpy.types.Material]:
    colors = brand["colors"]
    return {
        "metal": plain_material("EVS_Metal", colors["equipment_metal"], roughness=0.28, metallic=1.0),
        "knurl": plain_material("EVS_Knurl", colors["equipment_metal"], roughness=0.55, metallic=1.0),
        "frame": plain_material("EVS_Frame", colors["equipment_dark"], roughness=0.45, metallic=0.0, coat=0.3),
        "pad": plain_material("EVS_Pad", colors["equipment_pad"], roughness=0.62),
        "plate": plain_material("EVS_Plate", colors["equipment_dark"], roughness=0.7),
        "plate_accent": plain_material("EVS_PlateAccent", colors["primary"], roughness=0.6),
    }
