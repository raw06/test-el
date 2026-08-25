# Những lệnh bạn cần tự chạy (Task A10 — triển khai thật)

Tôi **không** tự chạy phần này: nó xoá sạch dữ liệu thật trên Supabase, và máy này chưa cài `supabase` CLI.

## ⚠️ Cảnh báo trước khi bắt đầu

`supabase/schema.sql` mở đầu bằng `drop table … cascade`. Chạy nó sẽ **xoá vĩnh viễn**:
- 51 câu hỏi hiện có trong DB thật,
- toàn bộ kết quả bài làm của học sinh.

Nếu muốn giữ, xuất kết quả ra Excel trước (nút "Tải Excel" ở `admin.html`, hoặc link `/functions/v1/export?token=…`).

## 1. Chạy test cục bộ lần cuối

```bash
cd /Users/dattm/Documents/Workspace/love-projects/test-12-07
bash tests/sql/run.sh && node --test 'tests/*.test.mjs'
```
Cần cả hai PASS. (Cần Docker đang chạy cho phần SQL.)

## 2. Nạp schema mới trên Supabase

Dashboard → SQL Editor:
1. Dán toàn bộ `supabase/schema.sql` → Run.
2. Dán toàn bộ `supabase/seed-demo.sql` → Run (hai đề mẫu `TAP8` và `GOLD8`).

## 3. Kiểm chứng

```sql
select code, title, is_published,
       (select count(*) from questions q where q.exam_id = e.id) as so_cau
from exams e order by code;
```
Mong đợi:
```
GOLD8 | FCE Test 3 — Gold      | t | 8
TAP8  | CAE Test 8 — Tap water | t | 8
```

## 4. Cài CLI (nếu chưa có) và deploy Edge Function

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <project-ref>

supabase functions deploy admin  --no-verify-jwt
supabase functions deploy export --no-verify-jwt
```

Secrets (chỉ cần set lại nếu chưa có):
```bash
supabase secrets set ADMIN_TOKEN="<mật khẩu giáo viên>"
supabase secrets set EXPORT_TOKEN="<chuỗi bí mật>"
```

## 5. Thử RPC bằng anon key (đáp án KHÔNG được lộ)

```bash
URL=$(grep -o 'https://[^"]*' config.js | head -1)
ANON=$(grep -o "SUPABASE_ANON_KEY *= *['\"][^'\"]*" config.js | sed "s/.*['\"]//")

# Chỉ trả meta đề, KHÔNG có câu hỏi
curl -s "$URL/rest/v1/rpc/exam_info" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"p_code":"GOLD8"}'

# Trả câu hỏi nhưng KHÔNG có accepted_answers / explanation
curl -s "$URL/rest/v1/rpc/start_exam" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"p_code":"GOLD8"}' | grep -c accepted_answers
```
Lệnh cuối phải in `0`. Nếu ra khác 0 thì dừng lại báo tôi ngay — đáp án đang lộ ra client.

## Ghi chú

`CLAUDE.md` đã được cập nhật trên đĩa nhưng nằm trong `.gitignore`, nên nó **không** đi theo branch. Nếu muốn nó vào repo thì phải bỏ khỏi `.gitignore` trước.
