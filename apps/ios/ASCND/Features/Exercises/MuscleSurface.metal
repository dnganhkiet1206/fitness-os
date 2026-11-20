// Tô cơ trên GPU (17/11, Kiệt cho tải Metal Toolchain). Cùng phép pha với `MuscleShader.compose`
// (đường CPU, giữ làm đường lùi), trong không gian tuyến tính:
//   a        = độ phủ · hệ số                          (chỉ phần cơ có vai trò)
//   albedo   = (nền·(1−a) + màu·a) · shade
//   emission = màu·a·shade·0,24 + (màu·a·0,55 + 0,45)·viền·0,95
//   normal   = thớ cơ trên phần cơ có vai trò, khối cơ ở chỗ khác (chỉ thân)
//
// Ô texture của CustomMaterial (đều nạp dạng raw, không đổi màu):
//   custom            = muscle_ids: R = phần cơ + 1, G = độ phủ, B = viền
//   emissive_color    = bảng 64×2: hàng 0 rgb = màu vai trò (tuyến tính), hàng 1 r = hạng vai trò / 3
//                       (0 = không tô). Không dùng kênh alpha: ảnh có alpha bị nhân sẵn khi nạp.
//   base_color        = shade (thớ cơ, 1 = không đổi)
//   roughness         = muscle_ids2: phần cơ thứ hai nằm dưới (độ nhám lấy từ hằng số, không từ ô này)
//   normal            = normal khối cơ
//   ambient_occlusion = normal có thớ của mọi phần cơ
//   custom_parameter  = (nền tuyến tính rgb, hệ số độ phủ)
#include <metal_stdlib>
#include <RealityKit/RealityKit.h>
using namespace metal;

namespace {
struct Paint {
    half3 albedo;
    half3 emission;
    bool on;
};

Paint paint(realitykit::surface_parameters params, float2 uv)
{
    constexpr sampler smooth(coord::normalized, address::clamp_to_edge, filter::linear, mip_filter::linear);
    auto tex = params.textures();
    float4 constants = params.uniforms().custom_parameter();
    half3 base = half3(constants.xyz);

    // Nhãn đọc đúng điểm ảnh: nội suy ở mép hai phần cơ sẽ ra số của phần cơ khác.
    texture2d<half> ids = tex.custom();
    uint2 size = uint2(ids.get_width(), ids.get_height());
    uint2 px = min(uint2(uv * float2(size)), size - 1);
    half4 id = ids.read(px);
    uint first = min(uint(round(float(id.r) * 255.0)), 63u);
    uint second = min(uint(round(float(tex.roughness().read(px).r) * 255.0)), 63u);
    texture2d<half> palette = tex.emissive_color();
    half r1 = palette.read(uint2(first, 1)).r;
    half r2 = palette.read(uint2(second, 1)).r;
    // Hai nhãn chồng nhau (cơ trám dưới cơ thang): lấy vai trò cao hơn.
    half3 color = palette.read(uint2(r2 > r1 ? second : first, 0)).rgb;
    half rank = max(r1, r2);

    Paint out;
    out.on = rank > 0.0h;
    if (!out.on) {
        out.albedo = base;
        out.emission = half3(0);
        return out;
    }
    half a = clamp(id.g * half(constants.w), 0.0h, 1.0h);
    half shade = tex.base_color().sample(smooth, uv).r;
    out.albedo = (base * (1.0h - a) + color * a) * shade;
    half w = a > 0.0h ? 0.45h : 0.0h;
    out.emission = color * a * shade * 0.24h + (color * a * 0.55h + w) * id.b * 0.95h;
    return out;
}

float2 textureUV(realitykit::surface_parameters params)
{
    // Ảnh lưu hàng trên = v 1 (như mọi texture USD); Metal đọc hàng trên = 0.
    float2 uv = params.geometry().uv0();
    uv.y = 1.0 - uv.y;
    return uv;
}

void finish(realitykit::surface_parameters params, Paint p)
{
    auto surface = params.surface();
    surface.set_base_color(p.albedo);
    surface.set_emissive_color(p.emission);
    surface.set_roughness(half(params.material_constants().roughness_scale()));
    surface.set_metallic(half(params.material_constants().metallic_scale()));
}
} // namespace

[[visible]]
void ascndMuscleBody(realitykit::surface_parameters params)
{
    constexpr sampler smooth(coord::normalized, address::clamp_to_edge, filter::linear, mip_filter::linear);
    float2 uv = textureUV(params);
    Paint p = paint(params, uv);
    finish(params, p);
    auto tex = params.textures();
    half3 packed = p.on ? tex.ambient_occlusion().sample(smooth, uv).rgb : tex.normal().sample(smooth, uv).rgb;
    params.surface().set_normal(float3(realitykit::unpack_normal(packed)));
}

[[visible]]
void ascndMuscleApparel(realitykit::surface_parameters params)
{
    finish(params, paint(params, textureUV(params)));
}
