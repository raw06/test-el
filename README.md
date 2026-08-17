# Website làm bài trắc nghiệm (50 câu)

## Kiến trúc
- Frontend static: GitHub Pages (`index.html` làm bài, `admin.html` giáo viên)
- DB + chấm điểm: Supabase (Postgres + RPC)
- API export + quản trị: Supabase Edge Functions (`export`, `admin`)

## Setup
1. Tạo project Supabase (free). Vào SQL Editor chạy `supabase/schema.sql` rồi `supabase/seed.sql`.
   (`schema.sql` dùng `if not exists` / `create or replace` nên chạy lại trên DB đã có dữ liệu là an toàn — không mất câu hỏi hay kết quả.)
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
- **Cài đặt:** đổi tên bài kiểm tra, phụ đề và thời lượng làm bài (phút).

### Cài đặt bài kiểm tra
Tab **⚙️ Cài đặt** ghi vào bảng `settings` (1 dòng, `id = 1`); trang làm bài đọc qua view `settings_public`.
- Tên + phụ đề hiện ở tiêu đề `index.html` và tên tab trình duyệt.
- Thời lượng điều khiển luôn đồng hồ đếm ngược, chỉ áp dụng cho học sinh **bắt đầu sau khi lưu** — em nào đang làm vẫn giữ đồng hồ cũ (deadline đã chốt trong `localStorage`).
- Số câu ở đầu trang tự đếm theo đề hiện có, không cần cấu hình.
- Nếu chưa chạy phần `settings` trong `schema.sql`, trang làm bài vẫn chạy bình thường với giá trị mặc định ghi sẵn trong `index.html` (60 phút).

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
