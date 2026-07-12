# Website làm bài trắc nghiệm (50 câu)

## Kiến trúc
- Frontend static: GitHub Pages (`index.html` làm bài, `admin.html` giáo viên)
- DB + chấm điểm: Supabase (Postgres + RPC)
- API export + quản trị: Supabase Edge Functions (`export`, `admin`)

## Setup
1. Tạo project Supabase (free). Vào SQL Editor chạy `supabase/schema.sql` rồi `supabase/seed.sql`.
2. Điền `SUPABASE_URL` + anon key vào `config.js`.
3. Deploy Edge Functions + đặt secret:
   ```
   supabase functions deploy export --no-verify-jwt
   supabase functions deploy admin  --no-verify-jwt
   supabase secrets set EXPORT_TOKEN="<chuỗi bí mật 1>"
   supabase secrets set ADMIN_TOKEN="<mật khẩu giáo viên>"
   ```
4. Push lên GitHub, bật Pages (Source: GitHub Actions).

## Màn giáo viên (admin.html)
Mở `https://<user>.github.io/<repo>/admin.html` → nhập **ADMIN_TOKEN** để:
- **Câu hỏi:** thêm / sửa / xoá từng câu, hoặc **upload CSV thay toàn bộ đề** (không cần chạy script).
- **Kết quả:** xem bảng điểm tất cả học sinh, tải Excel, xoá kết quả.

Định dạng CSV (xem `mau-de.csv`): cột `number, content, option_a, option_b, option_c, option_d, correct` (correct = A/B/C/D).

## Link tải kết quả trực tiếp (tuỳ chọn)
`https://<project>.supabase.co/functions/v1/export?token=<EXPORT_TOKEN>`

## Cập nhật đề
Cách nhanh: dùng màn **admin.html** (thêm/sửa hoặc upload CSV).
Cách thủ công: sửa `data/questions.json` → `node scripts/gen-seed.mjs` → chạy lại `supabase/seed.sql`.

## Bảo mật
- Đáp án chỉ nằm trong DB, chấm ở server (RPC), không gửi ra client.
- Service key chỉ nằm trong Edge Function (`export`, `admin`), **không bao giờ** ở client.
- Màn giáo viên bảo vệ bằng `ADMIN_TOKEN` (gửi qua header, kiểm tra server-side).
- Link export bảo vệ bằng `EXPORT_TOKEN`; đừng chia sẻ công khai.
- `mau-de.csv` deploy công khai chỉ là mẫu 3 dòng, KHÔNG chứa đề thật.
- Nếu muốn giấu đáp án khỏi mã nguồn công khai, để repo ở chế độ private.
