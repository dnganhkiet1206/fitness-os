"""Sinh migration: cột tên 3 thứ tiếng + nguồn cho food_items / exercises, rồi seed
món (USDA + món Việt ước tính) và bài tập (free-exercise-db). Chạy lại được: mỗi hàng
seed có khoá (source, source_ref) duy nhất, ON CONFLICT cập nhật.
"""
import json, re, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
OUT = Path(sys.argv[1])


def fold(s):
    s = s.lower().replace("đ", "d").replace("Đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def q(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def arr(xs):
    if not xs:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(q(x) for x in xs) + "]::text[]"


def num(x):
    return f"{x:.1f}"


foods = json.load(open(HERE / "foods_final.json", encoding="utf-8"))
ex = json.load(open(HERE / "dl/exercises.json", encoding="utf-8"))
tr = {}
for f in ["ex_tr_1.tsv", "ex_tr_2.tsv", "ex_tr_3.tsv", "ex_tr_4.tsv"]:
    for ln in open(HERE / f, encoding="utf-8"):
        ln = ln.rstrip("\n")
        if ln:
            i, vi, es = ln.split("\t")
            tr[int(i)] = (vi, es)

MUSCLE = {
    "quadriceps": "legs", "hamstrings": "legs", "adductors": "legs", "abductors": "legs", "glutes": "glutes",
    "calves": "calves", "abdominals": "abs", "chest": "chest", "shoulders": "shoulders", "traps": "shoulders",
    "neck": "shoulders", "triceps": "triceps", "biceps": "biceps", "forearms": "biceps", "lats": "back",
    "middle back": "back", "lower back": "back",
}
EQUIP = {
    "barbell": "barbell", "dumbbell": "dumbbell", "cable": "cable", "machine": "machine", "body only": "bodyweight",
    "kettlebells": "kettlebell", "bands": "band", "medicine ball": "medicine ball", "exercise ball": "exercise ball",
    "foam roll": "foam roll", "e-z curl bar": "ez bar", "other": "other", None: "other",
}
# Tên đã có trong 10 bài mẫu cũ — không thêm bản trùng, chỉ bổ sung tên 3 thứ tiếng.
OLD = {
    "Pull-up": ("Hít xà", "Dominadas"), "Barbell Squat": ("Squat tạ đòn", "Sentadilla con barra"),
    "Bench Press": ("Đẩy ngực tạ đòn", "Press de banca"), "Deadlift": ("Deadlift", "Peso muerto"),
    "Overhead Press": ("Đẩy vai qua đầu", "Press militar"), "Barbell Row": ("Chèo tạ đòn", "Remo con barra"),
    "Leg Press": ("Đạp đùi", "Prensa de piernas"), "Lat Pulldown": ("Kéo xà xuống", "Jalón al pecho"),
    "Romanian Deadlift": ("Deadlift kiểu Romania", "Peso muerto rumano"), "Dumbbell Curl": ("Cuốn tạ đơn", "Curl con mancuernas"),
}
OLD_FOLD = {fold(k) for k in OLD}

# Thuật ngữ phòng gym Việt vẫn gọi bằng tiếng Anh (chủ dự án, 18/10/2026): bài có
# một trong các từ này giữ nguyên tên tiếng Anh làm name_vi. Bản dịch vẫn nằm trong
# search_text, nên gõ tiếng Việt ("day nguc") vẫn tìm ra.
KEEP_EN = re.compile(r"\b(" + "|".join([
    r"squats?", r"deadlifts?", r"rdl", r"planks?", r"lunges?", r"burpees?", r"crunch(es)?", r"bench press",
    r"leg press", r"hip thrusts?", r"shrugs?", r"face pulls?", r"crossovers?", r"fl(y|ye|yes|ies)",
    r"cleans?", r"snatch(es)?", r"jerks?", r"swings?", r"russian twists?", r"mountain climbers?",
    r"jumping jacks?", r"good mornings?", r"skull ?crushers?", r"dips?", r"pullovers?", r"muscle[- ]ups?",
    r"thrusters?", r"box jumps?", r"glute bridges?", r"arnold", r"farmer'?s?", r"superman", r"push press",
    r"lat pulldowns?", r"curls?", r"t-bar row",
]) + r")\b", re.I)


def vi_name(en, vi):
    return en if KEEP_EN.search(en) else vi


def kind(x):
    if x["category"] == "stretching":
        return "timed"
    if x["equipment"] in ("body only", None) and x["category"] != "cardio":
        return "bodyweight"
    if x["mechanic"] in ("compound", "isolation"):
        return x["mechanic"]
    return None


L = []
w = L.append
w("-- Thư viện món ăn và bài tập (18/10/2026, chủ dự án duyệt): USDA FoodData Central")
w("-- SR Legacy (CC0) + món Việt tự soạn gắn nhãn ước tính + free-exercise-db (Unlicense).")
w("-- Tên 3 thứ tiếng, phần ăn 3 thứ tiếng, nguồn, chữ tìm (bỏ dấu, gộp 3 thứ tiếng).")
w("-- Chạy lại được: hàng seed có khoá (source, source_ref); ON CONFLICT cập nhật số.")
w("")
w("ALTER TABLE public.food_items")
for c in ["name_vi", "name_en", "name_es", "portion_vi", "portion_en", "portion_es", "source", "source_ref", "search_text"]:
    w(f"  ADD COLUMN IF NOT EXISTS {c} TEXT,")
w("  ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT false;")
w("")
w("ALTER TABLE public.exercises")
for c in ["name_vi", "name_en", "name_es", "source", "source_ref", "search_text"]:
    w(f"  ADD COLUMN IF NOT EXISTS {c} TEXT,")
w("  ADD COLUMN IF NOT EXISTS instructions_en TEXT[],")
w("  ADD COLUMN IF NOT EXISTS image_paths TEXT[];")
w("")
w("-- Một hàng seed cho mỗi (nguồn, mã nguồn). Hàng của người dùng không có nguồn.")
w("CREATE UNIQUE INDEX IF NOT EXISTS food_items_source_ref_key")
w("  ON public.food_items (source, source_ref) WHERE source IS NOT NULL;")
w("CREATE UNIQUE INDEX IF NOT EXISTS exercises_source_ref_key")
w("  ON public.exercises (source, source_ref) WHERE source IS NOT NULL;")
w("")
w("-- Hàng cũ (seed 10 món / 10 bài và hàng người dùng): chữ tìm = tên đã gập.")
w("-- Hàm gập dùng lại `public.community_fold` nếu có; không thì translate thủ công như")
w("-- 20260930170000_community_search_unaccent.sql (không giả định extension unaccent).")
w("")

# Seed 10 bài cũ: thêm tên 3 thứ tiếng.
for en, (vi, es) in OLD.items():
    st = fold(f"{en} {vi} {es}")
    w(f"UPDATE public.exercises SET name_en = {q(en)}, name_vi = {q(vi_name(en, vi))}, name_es = {q(es)}, search_text = {q(st)}")
    w(f"  WHERE user_id IS NULL AND name = {q(en)};")
w("")
OLD_FOODS = {
    "Ức gà": ("Chicken breast", "Pechuga de pollo"), "Cơm trắng": ("White rice", "Arroz blanco"),
    "Trứng gà": ("Egg", "Huevo"), "Chuối": ("Banana", "Plátano"), "Sữa chua Hy Lạp": ("Greek yogurt", "Yogur griego"),
    "Khoai lang": ("Sweet potato", "Batata"), "Cá hồi": ("Salmon", "Salmón"), "Bông cải xanh": ("Broccoli", "Brócoli"),
    "Yến mạch": ("Oats", "Avena"), "Whey Protein": ("Whey protein", "Proteína whey"),
}
for vi, (en, es) in OLD_FOODS.items():
    st = fold(f"{vi} {en} {es}")
    w(f"UPDATE public.food_items SET name_vi = {q(vi)}, name_en = {q(en)}, name_es = {q(es)}, search_text = {q(st)}")
    w(f"  WHERE user_id IS NULL AND name = {q(vi)} AND name_vi IS NULL;")
w("")

# Món
w("INSERT INTO public.food_items")
w("  (user_id, name, name_vi, name_en, name_es, portion_vi, portion_en, portion_es, serving_g,")
w("   kcal, protein_g, carbs_g, fat_g, fiber_g, tags, source, source_ref, is_estimate, search_text)")
w("VALUES")
rows = []
for f in foods:
    n = f["n"]
    tags = ["ước tính", "món Việt"] if f["estimate"] else ["usda"]
    st = fold(f"{f['vi']} {f['en']} {f['es']}")
    rows.append(
        f"  (NULL, {q(f['vi'])}, {q(f['vi'])}, {q(f['en'])}, {q(f['es'])}, {q(f['portion']['vi'])}, {q(f['portion']['en'])}, "
        f"{q(f['portion']['es'])}, {num(f['serving_g'])}, {num(n['kcal'])}, {num(n['protein'])}, {num(n['carbs'])}, "
        f"{num(n['fat'])}, {num(n['fiber'])}, {arr(tags)}, {q(f['source'])}, {q(f['source_ref'] if f['source'] == 'usda_sr_legacy' else f['key'])}, "
        f"{'true' if f['estimate'] else 'false'}, {q(st)})")
w(",\n".join(rows))
w("ON CONFLICT (source, source_ref) WHERE source IS NOT NULL DO UPDATE SET")
w("  name = EXCLUDED.name, name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en, name_es = EXCLUDED.name_es,")
w("  portion_vi = EXCLUDED.portion_vi, portion_en = EXCLUDED.portion_en, portion_es = EXCLUDED.portion_es,")
w("  serving_g = EXCLUDED.serving_g, kcal = EXCLUDED.kcal, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g,")
w("  fat_g = EXCLUDED.fat_g, fiber_g = EXCLUDED.fiber_g, tags = EXCLUDED.tags, is_estimate = EXCLUDED.is_estimate,")
w("  search_text = EXCLUDED.search_text, updated_at = now();")
w("")

# Bài tập
w("INSERT INTO public.exercises")
w("  (user_id, name, name_vi, name_en, name_es, muscle_group, equipment, exercise_kind, source, source_ref,")
w("   instructions_en, image_paths, search_text)")
w("VALUES")
rows = []
skipped = []
for i, x in enumerate(ex):
    if fold(x["name"]) in OLD_FOLD:
        skipped.append(x["name"])
        continue
    vi, es = tr[i]
    prim = x["primaryMuscles"][0] if x["primaryMuscles"] else None
    mg = "cardio" if x["category"] == "cardio" else MUSCLE.get(prim, "abs")
    st = fold(f"{x['name']} {vi} {es}")
    k = kind(x)
    rows.append(
        f"  (NULL, {q(x['name'])}, {q(vi_name(x['name'], vi))}, {q(x['name'])}, {q(es)}, {q(mg)}, {q(EQUIP[x['equipment']])}, {q(k)}, "
        f"'free_exercise_db', {q(x['id'])}, {arr(x['instructions'])}, {arr(x['images'])}, {q(st)})")
w(",\n".join(rows))
w("ON CONFLICT (source, source_ref) WHERE source IS NOT NULL DO UPDATE SET")
w("  name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en, name_es = EXCLUDED.name_es,")
w("  muscle_group = EXCLUDED.muscle_group, equipment = EXCLUDED.equipment, exercise_kind = EXCLUDED.exercise_kind,")
w("  instructions_en = EXCLUDED.instructions_en, image_paths = EXCLUDED.image_paths,")
w("  search_text = EXCLUDED.search_text, updated_at = now();")
OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print("foods", len(foods), "exercises", len(rows), "skipped (already seeded)", skipped)
