# Website làm bài trắc nghiệm (50 câu)

## Kiến trúc
- Frontend static: GitHub Pages
- DB + chấm điểm: Supabase (Postgres + RPC)
- Export .xlsx: Supabase Edge Function

## Setup
1. Tạo project Supabase (free). Vào SQL Editor chạy `supabase/schema.sql` rồi `supabase/seed.sql`.
2. Điền `SUPABASE_URL` + anon key vào `config.js`.
3. Deploy Edge Function export:
   `supabase functions deploy export --no-verify-jwt`
   `supabase secrets set EXPORT_TOKEN="<chuỗi bí mật>"`
4. Push lên GitHub, bật Pages (Source: GitHub Actions).

## Link tải kết quả (giáo viên giữ bí mật)
`https://<project>.supabase.co/functions/v1/export?token=<EXPORT_TOKEN>`

## Cập nhật đề
Sửa `data/questions.json` → chạy `node scripts/gen-seed.mjs` → chạy lại `supabase/seed.sql`.

## Bảo mật
- Đáp án chỉ nằm trong DB, chấm ở server (RPC), không gửi ra client.
- Link export bảo vệ bằng token bí mật; đừng chia sẻ công khai.
- Nếu muốn giấu đáp án khỏi mã nguồn công khai, để repo ở chế độ private.
