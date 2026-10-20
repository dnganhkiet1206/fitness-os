# Thư viện món ăn và bài tập

Sinh `supabase/migrations/20261018120000_food_exercise_library.sql` (18/10/2026, chủ dự án duyệt).

## Nguồn

| Dữ liệu | Nguồn | Giấy phép |
|---|---|---|
| 233 món cơ bản | [USDA FoodData Central](https://fdc.nal.usda.gov/download-datasets), SR Legacy (2018-04) | Công cộng (CC0). USDA đề nghị ghi nguồn "USDA FoodData Central". |
| 180 món Việt | Tự soạn: công thức gram trong `vn_recipes.py`, dinh dưỡng cộng từ số USDA | Của ASCND. Gắn `is_estimate = true`, nhãn "ước tính". |
| 873 bài tập | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (`dist/exercises.json`) | The Unlicense (công cộng) |

Tên vi / es của món: viết tay trong `usda_spec.txt` / `vn_recipes.py`. Tên vi / es của bài tập: dịch tay trong `ex_tr_*.tsv` (chỉ số dòng = vị trí trong `exercises.json`). Bài có thuật ngữ phòng gym Việt vẫn gọi bằng tiếng Anh (Squat, Deadlift, Bench Press, Curl, Plank… — danh sách `KEEP_EN` trong `gen_migration.py`) giữ tên tiếng Anh làm `name_vi`; bản dịch vẫn nằm trong `search_text`.

## Chạy lại

```bash
mkdir -p dl && cd dl
curl -sSLO https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
unzip -q FoodData_Central_sr_legacy_food_csv_2018-04.zip -d sr
curl -sSL -o exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
cd ..
python3 pick.py usda_spec.txt usda_picked.json      # khớp món với mô tả USDA, báo món thiếu / trùng
python3 build_foods.py                               # tính món Việt, in bảng kcal để soát
python3 gen_migration.py ../../../../supabase/migrations/20261018120000_food_exercise_library.sql
```

`dl/`, `usda_picked.json`, `foods_final.json` là tệp sinh ra, không commit.

## Thêm món / sửa công thức

- Món USDA: thêm một dòng vào `usda_spec.txt` (từ khoá phải nằm trong mô tả USDA; `pick.py` chọn mô tả ngắn nhất khớp đủ).
- Món Việt: thêm một mục vào `R` trong `vn_recipes.py`; thành phần là tên tiếng Anh của món USDA đã chọn hoặc khoá trong `ING`.
- Migration chạy lại được: hàng seed khoá theo `(source, source_ref)`, `ON CONFLICT` cập nhật số.
