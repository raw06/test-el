# Task 8 — báo cáo triển khai

## Những gì đã làm

### Step 0 — `supabase/schema.sql`

Chèn nguyên văn hai hàm `reorder_sections(bigint, jsonb)` và `save_questions(bigint, jsonb)`
từ brief, đặt đúng vị trí yêu cầu: ngay sau hàm `is_correct`, trước comment
"Tra đề theo mã..." dẫn vào `exam_by_code`. Kèm hai dòng `revoke all on function ... from public`
ngay sau, không thêm `grant execute ... to anon`.

Không thêm `drop function if exists` cho hai hàm mới ở đầu file (nhóm drop ở đầu file chỉ
có 5 hàm cũ) — brief không yêu cầu, và vì dùng `create or replace function` nên không bắt buộc
để script chạy lại được. Không tự ý mở rộng phạm vi.

### Step 1 — `supabase/functions/admin/index.ts`

Chép nguyên văn 6 case từ brief (`save_section`, `delete_section`, `reorder_sections`,
`save_questions`, `delete_question`, `import_csv`), chèn vào giữa `duplicate_exam` (Task 7)
và `list_submissions` (không đụng) — nằm sau lớp kiểm `x-admin-token` ở đầu handler,
không sửa lớp kiểm đó. `csvToQuestions` đã được import sẵn ở đầu file từ trước (dùng cho
`import_csv`), không cần thêm import.

Không sửa bất kỳ case nào Task 7 đã viết (`login`, `list_exams`, `get_exam`, `save_exam`,
`delete_exam`, `duplicate_exam`) và không đụng `list_submissions` / `clear_submissions`
(để Task 9 xử lý).

## Output thật của lệnh kiểm tra

### `deno check` (Step 2) — BỎ QUA theo chỉ dẫn

Máy này không có `deno`:
```
$ which deno
(không có output, exit code 1)
$ deno check ...
zsh: command not found: deno
```
Không cài `deno` theo đúng chỉ dẫn (không `brew install`). Đã kiểm tra thay thế:
- Cân bằng ngoặc `{}`/`()` toàn file bằng script Node đếm ký tự — kết quả `brace depth 0, paren depth 0`.
- Đọc lại toàn bộ diff bằng mắt, đối chiếu từng ký tự với nội dung brief — khớp nguyên văn.

### Kiểm SQL thật bằng Docker Postgres (tự nguyện, theo gợi ý trong task)

```
docker run -d --rm --name task8pg -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16-alpine
docker exec task8pg pg_isready -U postgres   # -> accepting connections
docker exec task8pg psql -U postgres -c "create role anon; create role service_role;"
docker cp supabase/schema.sql task8pg:/schema.sql
docker exec task8pg psql -U postgres -f /schema.sql
```
Kết quả: toàn bộ script chạy sạch, không có dòng `ERROR`. Các câu lệnh liên quan hàm mới:
`CREATE FUNCTION` × 2 (reorder_sections, save_questions), `REVOKE` × 2 tương ứng — đều thành công.

Test chức năng:

1. Tạo 1 đề (`exams`, id=1), 2 phần `mcq` (`sections` id=1 position=1, id=2 position=2).
2. Gọi `reorder_sections(1, '[{"id":1,"position":2},{"id":2,"position":1}]')` — **hoán vị
   trực tiếp qua RPC, không lỗi `sections_position_uniq`** (đây chính là kịch bản REST update
   từng dòng sẽ đụng khoá). Kết quả sau gọi: section 1 → position 2, section 2 → position 1.
3. Gọi `save_questions(1, [...2 câu mcq hợp lệ...])` → trả `2`, `questions` có đúng 2 dòng
   với `accepted_answers`/`explanation` đúng như payload.
4. Test rollback: gọi `save_questions(2, [{"number":1, ...}])` — cố tình trùng `number=1` với
   câu đã có ở section 1 (cùng `exam_id`, vi phạm `questions_number_uniq (exam_id, number)`).
   Kết quả: `ERROR: duplicate key value violates unique constraint "questions_number_uniq"`,
   và **`questions` sau đó vẫn còn nguyên 2 dòng của section 1** (id=1,2) — không bị xoá,
   không có trạng thái rỗng nửa vời. Xác nhận đúng như brief mô tả: gói trong RPC (một
   transaction) nên delete+insert hỏng thì rollback toàn bộ, không mất dữ liệu — khác với
   đường REST `delete()` rồi `insert()` cũ.
5. Test dạng `open_cloze`: tạo section id=3 kind='open_cloze', gọi
   `save_questions(3, [{"number":10,"accepted_answers":["went","go"]}])` → trả `1`,
   `questions` có `content='{}'`, `accepted_answers='{went,go}'` đúng như hàm SQL xử lý
   (`content` rỗng cho open_cloze).

Dọn dẹp: `docker rm -f task8pg` — đã xoá container, không để lại tài nguyên.

### Kiểm phạm vi git

```
$ git status --porcelain   (trước khi add)
 M supabase/functions/admin/index.ts
 M supabase/schema.sql
```
Chỉ đúng 2 file bị sửa đổi trong toàn repo (không có file nào khác dính, `.gitignore`/`CLAUDE.md`/`docs`
không xuất hiện — đúng như được báo trước là đã nằm trong `.gitignore` hoặc đã ở trạng thái sạch).

`git add supabase/schema.sql supabase/functions/admin/index.ts` rồi commit — không dùng `git add -A`.

## Sai lệch so với brief

Không có sai lệch nội dung. Hai điểm ngoài phạm vi brief nhưng không đổi hành vi:
- Bỏ qua `deno check` (Step 2) theo đúng yêu cầu của người giao việc (máy không có `deno`,
  không được cài) — thay bằng kiểm cân bằng ngoặc + đối chiếu thủ công + test SQL runtime thật.
- Không thêm `drop function if exists` cho 2 hàm mới ở đầu `schema.sql` — brief không yêu cầu
  và không cần thiết vì dùng `create or replace function`.

## Lo ngại

- `deno check` thật (kiểm kiểu TypeScript, ví dụ khớp interface `CsvQuestion` từ `lib-csv.ts`
  với cách dùng `q.number/q.content/q.accepted_answers/q.explanation` trong `import_csv`) chưa
  được chạy trên máy này. Đã đối chiếu thủ công: `CsvQuestion` có đúng 4 field đó với kiểu khớp
  cách dùng trong case `import_csv`, nên rủi ro lỗi kiểu thấp, nhưng đây vẫn là suy luận thủ công
  chứ không phải kết quả `deno check` thật — người giao việc đã báo sẽ tự kiểm việc này.
- Chưa test case `save_section` / `delete_section` / `delete_question` / `import_csv` bằng
  Postgres thật qua đường Edge Function thực sự (vì không có Deno runtime ở đây để chạy
  `Deno.serve` cục bộ) — các case này là REST đơn giản (`update`/`insert`/`delete` một bảng),
  rủi ro thấp hơn nhiều so với hai RPC transaction đã được kiểm kỹ ở trên, nhưng vẫn là suy luận
  từ đọc code chứ chưa chạy end-to-end qua Edge Function.
- Chưa kiểm case va chạm FK khi `save_section` update mà đổi `kind` — brief đã cố tình bỏ `kind`
  khỏi update (`const { kind: _drop, ...upd } = row`) nên trường hợp này không thể xảy ra qua
  action này; không kiểm thêm vì brief đã tự chặn ở logic, không phải ở DB constraint.
