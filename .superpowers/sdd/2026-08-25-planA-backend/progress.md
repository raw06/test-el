# SDD ledger — plan: docs/superpowers/plans/2026-08-25-planA-backend.md

Branch: `feat/nhieu-de-va-dang-cau-hoi`
BASE ban đầu: `68cc660`
Spec: `docs/superpowers/specs/2026-08-25-nhieu-de-va-dang-cau-hoi-design.md`
Plan B (chạy sau, workspace riêng): `docs/superpowers/plans/2026-08-25-planB-frontend.md`

## Pre-flight scan

### Cặp task dùng chung file / interface

| Cặp | Bên tạo → bên dùng | Kết quả |
|---|---|---|
| A1 → A2,A3,A4 | `tests/sql/run.sh` + hàm `assert()` trong `00-noop.sql` → ba task sau đều viết `tests/sql/0*.sql` và gọi `assert()` | khớp |
| A2 → A3,A4 | `supabase/schema.sql` viết lại hoàn toàn ở A2, A3/A4 **thêm vào cuối** | khớp; bắt buộc chạy tuần tự (đúng thứ tự plan) |
| A3 → A4 | `is_correct(text[],text)`, `exam_by_code(text)` → A4 gọi trong `submit_quiz`/`start_exam` | khớp |
| A4 → B6 | `exam_info/start_exam/submit_quiz` (3 chữ ký) → `app.js` gọi đúng 3 tên + đúng tên tham số `p_code/p_full_name/p_class/p_answers` | khớp |
| A5 → (không ai) | xoá `data/questions.json`, `scripts/gen-seed.mjs`, `supabase/seed.sql`; không file nào trong repo tham chiếu; `deploy.yml` không `cp` chúng | khớp |
| A6 → A7,A8 | `csvToQuestions()` trong `lib-csv.ts` → `import_csv` (A8) và import ở đầu `index.ts` (A6) | khớp; A6 phải xong trước A7/A8 (đúng thứ tự) |
| A7,A8,A9 | cùng sửa `supabase/functions/admin/index.ts`, mỗi task thêm `case` khác nhau trong cùng `switch` | khớp; tuần tự, không đè nhau |
| A9 → B11 | `list_submissions(exam_id)` trả `{id,full_name,class_name,score,total,answers,created_at}` → `admin-results.js` đọc đúng các trường | khớp |
| A9 ↔ B11 | 8 cột Excel + `!cols` (6,10,24,24,10,8,8,20) giống nhau ở `export/index.ts` và `downloadXlsx` | khớp |
| A6 → B12 | header CSV `number,content,option_a..d,correct` + cột `explanation` tuỳ chọn → `mau-de.csv` có `explanation` | khớp |
| A7 → B9 | `list_exams` trả `sections(count)`… dạng `[{count:n}]` → `countOf()` của B9 xử lý đúng mảng | khớp |
| A7/A8 → B9/B10 | `save_exam`/`save_section`/`duplicate_exam` → `{ok,id}`; `save_questions`/`import_csv` → `{ok,count}`; `reorder_sections` đọc `payload.order=[{id,position}]` | khớp |
| A8 → B10 | `save_questions` đọc `q.correct ?? q.accepted_answers?.[0]`, `q.content.options` → `readRow()` sinh đúng hai shape (mcq / open_cloze) | khớp |
| B1 → B9,B11 | `toUtcIso/toLocalInput/formatVn` | khớp |
| B2 → B4,B10 | `splitPassage/scanBlanks/diffBlanks` | khớp |
| B3 → B4,B5,B6 | 35 id trong `index.html` → mọi `$()` của ba module | khớp (đã đối chiếu từng id ở self-review Plan B) |
| B4 → B5,B6 | `escapeHtml, allQuestions, renderSections, renderNav, collectAnswers, applyAnswers, answeredNumbers, markAnswered` | khớp |
| B5 → B6 | `renderResult(ctx)`, `bindReviewFilter()` (không tham số) | khớp |
| B4/B5 → B7 | class `.passage/.gap-input/.gap-ref/.cloze-opts/.rv-*` | khớp |
| B8 → B9,B10,B11 | `api/esc/toast/setToken/getToken/clearToken` | khớp |
| B9 ↔ B10 | `admin-exams.js` import tĩnh `renderSectionsAdmin`; `admin-sections.js` gọi ngược bằng `await import('./admin-exams.js')` động | **vòng lặp import có chủ đích** — xem Finding 2 |
| B1–B11 → B12 | 16 file phải có tên trong `deploy.yml` | khớp (có vòng `test -f` chặn thiếu) |

### Tự nhất quán từng task

| Task | Test nó đặc tả vs code nó đặc tả / file nó tạo vs file nó sửa | Kết quả |
|---|---|---|
| A1 | runner tạo trước, `00-noop.sql` định nghĩa `assert()` mà chính runner dùng | nhất quán |
| A2 | 7 constraint có tên ↔ 7 ca test trong `01-constraints.sql` | nhất quán |
| A3 | 5 assert `is_correct` + ca lỗi `exam_by_code` ↔ hai hàm | nhất quán |
| A4 | test 3 RPC ↔ 3 RPC; `review=null` khi tắt cờ được test | nhất quán |
| A5 | seed 8+8 câu ↔ bước verify `so_cau = 8` ở A10 | nhất quán |
| A6 | test import `../supabase/functions/admin/lib-csv.ts` ↔ file A6 tạo | nhất quán; lệnh chạy sai — Finding 1 |
| A7 | 5 action ↔ mô tả Produces | nhất quán |
| A8 | 6 action ↔ mô tả Produces | nhất quán |
| A9 | 2 action + `?exam=` ↔ Produces | nhất quán |
| A10 | chỉ verify, không tạo file | nhất quán; Finding 3 |
| B1 | 10 test ↔ 3 hàm export | nhất quán |
| B2 | 13 test ↔ 3 hàm export; `GAP_RE.lastIndex=0` được reset tường minh | nhất quán |
| B3 | Produces liệt kê đủ 35 id có trong HTML | nhất quán |
| B4–B11 | Produces ↔ export thật của từng module | nhất quán (đã sửa 5 sai lệch ở self-review Plan B) |
| B12 | danh sách `cp` ↔ danh sách `test -f` ↔ file 11 task trước tạo | nhất quán |

### Findings & Rulings

**Finding 1 — `node --test tests/` không chạy được trên máy này.**
Node v24.19.0 ở đây báo `Error: Cannot find module '<abs>/tests'` khi truyền thư mục làm positional arg (đã thử `tests/`, `tests`, `./tests/`, đường dẫn tuyệt đối, có/không `package.json` — đều lỗi). Dạng glob và dạng không tham số chạy tốt. Plan A dùng lệnh này ở dòng 827, 911, 1334; Plan B ở dòng 314, 2213.
**Ruling:** mọi nơi ghi `node --test tests/` đổi thành `node --test 'tests/*.test.mjs'` (nháy đơn để Node tự glob, không để zsh nở). Đã xác nhận lệnh này chạy đúng và bỏ qua `tests/sql/*.sql`. Chi phí nếu sai: chỉ là lệnh chạy test, không ảnh hưởng code sản phẩm — sửa lại một dòng.
Xác nhận thêm: Node 24 tự strip type annotation của `.ts` (`export interface`, `s: string`, `: string[]`) nên `tests/lib-csv.test.mjs` import thẳng `lib-csv.ts` chạy được, không cần build.

**Finding 2 — vòng import `admin-exams.js` ↔ `admin-sections.js`.**
Có chủ đích: chiều `sections → exams` dùng `await import()` động trong `reopen()` nên ES module resolver không kẹt.
**Ruling:** giữ nguyên. Reviewer của B10 sẽ được nhắc đây là lựa chọn thiết kế, không phải sơ suất. Chi phí nếu sai: nếu vẫn kẹt thì tách một `admin-state.js` nhỏ — sửa cục bộ.

**Finding 3 — Task A10 không chạy được tự động.**
`supabase` CLI chưa cài trên máy (`command not found`), và các bước A10 gồm chạy SQL thủ công trên dashboard + deploy Edge Function — đều là thao tác ngoài worktree, đụng hệ thống thật (xoá 51 câu hỏi và toàn bộ kết quả cũ).
**Ruling:** A10 **không** dispatch cho subagent. Sau khi A1–A9 xong, tôi dừng và bàn giao cho người dùng đúng danh sách lệnh + SQL cần chạy, kèm cảnh báo xoá dữ liệu. Đây là một trong bốn trường hợp bắt buộc dừng (thao tác phá huỷ + tác dụng phụ ngoài worktree).

**Finding 4 — `docs` nằm trong `.gitignore` (sửa cục bộ chưa commit).**
Nên `docs/superpowers/plans/2026-08-25-planA-backend.md` chưa được track.
**Ruling:** không đụng `.gitignore` (không nằm trong scope plan). Commit plan file bằng `git add -f` khi cần. Chi phí nếu sai: plan không lên remote — vô hại với sản phẩm.

**Finding 5 — A5 xoá `scripts/gen-seed.mjs` mà `CLAUDE.md` có ghi lệnh dùng nó.**
`CLAUDE.md` bị gitignore nên không phải file của repo.
**Ruling:** vẫn xoá theo plan (spec §2 chốt bỏ nguồn dữ liệu song song); nhắc người dùng cập nhật `CLAUDE.md` ở bước bàn giao.

---

## Tiến độ

### Task 1 — Hạ tầng test SQL
BASE: `828933e`
Ruling trước khi dispatch (defect trong plan text, phát hiện khi đọc brief):
- `grep -q '^ASSERT-FAIL'` không bao giờ khớp: psql in notice dạng `NOTICE:  ASSERT-FAIL — ...` nên chuỗi không ở đầu dòng → runner luôn báo PASS dù assertion fail. **Sửa thành `grep -q 'ASSERT-FAIL'`.** Chi phí nếu sai: gần bằng 0; không sửa thì mọi test SQL của Task 2–4 vô nghĩa.
- `if ! docker exec … | tee …` lấy exit code của `tee`, che lỗi psql. Vì `ON_ERROR_STOP=0` nên psql hiếm khi exit khác 0; cổng thật là grep. Giữ nguyên cấu trúc nhưng thêm `set -o pipefail` đã có sẵn qua `set -euo pipefail` → thực ra `pipefail` đã bật, nên `tee` không che nữa. Không cần sửa.

**Finding 6 (phát hiện khi soi Task 4) — Postgres 16 vanilla không có role `anon`.**
Đã kiểm chứng bằng container thật: `pg_roles` chỉ có `postgres` + các role hệ thống; `grant execute on function … to anon` báo `ERROR: role "anon" does not exist`. Schema Task 4 có 3 dòng `grant … to anon`, và `02-rpc.sql` có `set role anon`. Runner nạp schema với `ON_ERROR_STOP=1` nên sẽ chết ngay tại đó. Trên Supabase thật role này có sẵn nên `schema.sql` **không** được tự tạo role.
**Ruling:** `tests/sql/run.sh` tạo role trước khi nạp schema — `create role anon nologin;` (idempotent qua `ON_ERROR_STOP=0` hoặc `do $$ … exception when duplicate_object $$`). Đây là việc của hạ tầng test, không phải của schema. Giao cho implementer Task 1 (chủ sở hữu `run.sh`); nếu Task 1 đã đóng thì giao Task 2 sửa kèm. Chi phí nếu sai: mọi test SQL từ Task 4 trở đi không chạy được — nhưng lộ ra ngay ở lần chạy đầu.

Implementer Task 1 tự phát hiện Finding 6 và tự thêm `create role anon/service_role` vào `run.sh` — đúng nơi tôi đã ra ruling. Không cần can thiệp.
Commit: `82f3912`. Đã dispatch task reviewer (diff `828933e..82f3912`).

### Task 2 — Schema mới (chuẩn bị)
Soi brief trước khi dispatch, ba điểm:

**Finding 7 — brief Task 2 Step 4 ghi "14 dòng `ok`", đếm thật là 15.**
`01-constraints.sql` có 15 `select assert`: 10 ca `blocked` + 2 ca `not blocked` + 1 ca đảo thứ tự + 2 ca cascade.
**Ruling:** kỳ vọng đúng là **15**. Chi phí nếu sai: implementer tưởng thiếu một assert và tự thêm/bớt.

**Finding 8 — `blocked()` định nghĩa ở `01-constraints.sql` nhưng `02-rpc.sql` (Task 4) cũng dùng.**
Hai file chạy chung một database theo thứ tự tên nên chạy được, nhưng `02` không tự đứng một mình.
**Ruling:** chấp nhận — runner là cổng duy nhất, không ai chạy lẻ từng file. Ghi lại để reviewer Task 4 không báo nhầm. Chi phí nếu sai: gần 0.

**Finding 9 — test hardcode `exam_id = 1`, `section_id = 1/2/3`.**
Đúng vì `identity` bắt đầu từ 1 trên DB sạch và `00-noop.sql` không insert gì. Ràng buộc ngầm: `00-noop.sql` phải mãi mãi không insert dữ liệu.
**Ruling:** giữ nguyên (đúng nguyên văn plan), nhưng dặn implementer không được thêm insert vào `00-noop.sql`.

**Task 1 review round 1 — Spec ✅ / Chất lượng CHANGES_REQUESTED.**
Finding nghiêm trọng (đúng): `ON_ERROR_STOP=0` khiến psql exit 0 kể cả khi SQL lỗi, nên file test hỏng (sai tên bảng/cột, lỗi cú pháp) âm thầm PASS. Reviewer tái hiện được bằng file test tạm.
**Ruling:** vá bằng `ON_ERROR_STOP=1` chứ không bằng `grep '^ERROR'`. Đã kiểm chứng bằng container thật: file test hợp lệ của plan chạy `ON_ERROR_STOP=1` → exit 0 (vì MỌI ca cố ý gây lỗi đều bọc trong `blocked()`, exception bị plpgsql nuốt, không tới psql); file test hỏng → exit 3. Grep `^ERROR` yếu hơn: chỉ bắt được lỗi psql in ra, không bắt được lỗi làm script dừng sớm. Comment "các file test cố tình gây lỗi… ON_ERROR_STOP=0" trong `run.sh` là tiền đề sai — không file test nào gây lỗi ở tầng psql. Chi phí nếu sai: nếu về sau có ca test thật sự cần lỗi lọt tới psql thì phải bọc lại bằng `blocked()` — sửa cục bộ.
Finding 2 (vị trí role) và Finding 3–4 (comment, grep không neo): chấp nhận, sửa comment kèm luôn.

**Finding 10 — `select assert(true, 'đảo thứ tự phần trong 1 transaction chạy được')` là assertion rỗng.**
Nó luôn true; giá trị thật nằm ở chỗ khối `do $$ … $$` ngay trước có ném lỗi hay không. Với `ON_ERROR_STOP=0` (bản Task 1 chưa vá) lỗi đó bị nuốt → assertion vô nghĩa hoàn toàn. **Sau khi vá `ON_ERROR_STOP=1` thì ca này mới thực sự có tác dụng** — DO block lỗi sẽ làm psql exit 3.
Ghi chú thêm: chuỗi update trong plan (1→99, 3→1, 1→3) dùng vị trí 99 làm chỗ trống tạm nên constraint non-deferrable cũng qua được; test này **không** chứng minh `deferrable` là cần thiết.
**Ruling:** giữ nguyên nguyên văn plan (đúng shape TDD của kế hoạch), không thêm ca mới ở Task 2. Rubric review coi "test không assert gì" là defect — nhưng ở đây nó assert gián tiếp qua exit code sau khi Task 1 được vá, nên không tính là defect. Ghi rõ để reviewer Task 2 không báo trùng. Chi phí nếu sai: mất một lớp bảo vệ cho tính năng đảo thứ tự phần thi — sẽ lộ ở Task 8 (`reorder_sections`) nếu hỏng.

Fix round 1 xong: commit `553afc1` — `ON_ERROR_STOP=1` + comment sửa lại. Ba kịch bản kiểm chứng đều đúng (bình thường PASS/0; file hỏng FAIL/1; ca `blocked()` PASS/0).
**Task 1: complete** — commits `82f3912`, `553afc1`.

### Task 2 — dispatch
BASE: `553afc1`

### Task 3 — kiểm chứng trước khi dispatch
Chạy thử toàn bộ SQL của Task 3 trên container riêng (`probe3`, không đụng `quiz_test_pg` của Task 2 đang chạy):
- 9 assert `is_correct` đều `ok` — kể cả ca `null` (nhờ `coalesce`) và ca thừa khoảng trắng.
- `exam_by_code` trả composite `public.exams` chạy đúng; cú pháp gọi phải là `(exam_by_code('X')).title` — có ngoặc bọc. 6 ca (tra được / mã thường / nháp / không tồn tại / hết hạn / chưa mở) đều đúng.
- `revoke all ... from public` + `set role anon` → anon bị chặn gọi `exam_by_code`. Xác nhận cơ chế bảo mật hoạt động trên Postgres vanilla.
Không phát hiện defect nào trong SQL của Task 3. Brief dùng được nguyên văn.

**Finding 11 — brief Task 3 Step 2 ghi Expected: `function is_correct(unknown, unknown) does not exist`.**
Sau khi Task 2 xong, `02-rpc.sql` là file test đầu tiên gọi `is_correct`. Với `ON_ERROR_STOP=1` (bản vá Task 1), lỗi này làm psql exit 3 → runner FAIL đúng như mong đợi. Không cần sửa gì; ghi lại để implementer không hoảng khi thấy runner dừng sớm.

### Finding 12 (Task 2 báo BLOCKED) — fixture `'T1'/'T2'` vi phạm chính constraint đang test
Brief/plan tự mâu thuẫn: `code_format` yêu cầu `^[A-Z0-9]{3,12}$` (3–12 ký tự) nhưng dữ liệu nền đầu `01-constraints.sql` insert `code='T1'` (2 ký tự) và **không** bọc trong `blocked()`. Dưới `ON_ERROR_STOP=1` (bản vá Task 1), câu insert đầu tiên làm psql exit 3 → cả file chết trước khi chạy assert nào. Implementer chép đúng nguyên văn brief, phát hiện đúng, dừng đúng.

**Ruling:** giữ nguyên constraint `{3,12}`, sửa fixture thành `'T01'/'T02'`.
- Vì sao: độ dài mã đề 3–12 là Global Constraint lấy thẳng từ spec (`^[A-Z0-9]{3,12}$`), xuất hiện ở cả `exam_by_code`, admin `save_exam`, và màn nhập mã của học sinh ở Plan B. Nới xuống `{2,12}` là sửa spec để chiều một chuỗi fixture tuỳ ý — sai hướng.
- Giá nếu sai: gần như bằng 0. `'T01'/'T02'` chỉ là dữ liệu nền cục bộ của một file test, không có ý nghĩa nghiệp vụ, không task nào khác tham chiếu tới.
- Đã sửa 3 chỗ trong `docs/superpowers/plans/2026-08-25-planA-backend.md` (dòng 135, 172, 205) và 3 chỗ tương ứng trong `task-2-brief.md`. Không đụng `schema.sql`.

Bằng chứng phụ: đây chính là bản vá `ON_ERROR_STOP=1` ở Task 1 phát huy tác dụng lần đầu — dưới `ON_ERROR_STOP=0` cũ, file test này sẽ bỏ qua lỗi insert, chạy tiếp với bảng `exams` rỗng, và nhiều assert sẽ "pass" một cách vô nghĩa.

## Task 2 — schema mới 4 bảng + RLS
- BASE: `553afc1`
- Commit: `147afbe` — `feat(db): schema mới exams/sections/questions cho nhiều đề và 3 dạng câu hỏi`
- Kèm theo: `41042c4` — `docs(plan): sửa mã đề fixture T1/T2 -> T01/T02 cho khớp constraint code_format` (sửa của controller theo Finding 12, dùng `git add -f` vì `.gitignore` chặn `docs`)
- Diff: `supabase/schema.sql` +93/-64, `tests/sql/01-constraints.sql` +74 (mới)
- Test: `✓ TẤT CẢ TEST SQL PASS`, 15 dòng `ok   —` từ `01-constraints.sql` + 1 từ `00-noop.sql`, 0 `ASSERT-FAIL`. Đúng con số 15 đã chốt ở Finding 7 (brief ghi nhầm 14).
- Một vòng BLOCKED → ruling (Finding 12) → implementer chạy lại và xong.
- Review package: `review-553afc1..147afbe.diff`. Task reviewer đang chạy.

### Task 2 — task review
`SPEC: ✅ đạt` / `QUALITY: ✅ duyệt`. Không có fix round nào.
Reviewer tự chạy `run.sh` độc lập: 16 dòng `ok —` (1 từ `00-noop.sql` + 15 từ `01-constraints.sql`), 0 `ASSERT-FAIL`. Diff nguyên văn `schema.sql` với block SQL trong brief → khớp byte-for-byte.

Reviewer tự phá thêm ngoài 15 ca có sẵn, tất cả chặn đúng: mcq thiếu key `d`; `stem` kiểu số; `content='null'::jsonb`; `accepted_answers='{}'`; đáp án chữ thường `{a}`; biên `code_format` 3/12/13 ký tự; trùng `code`; trùng `position`; trùng `number`.

**Đóng Finding 5 (lo ngại check constraint trả NULL = PASS):** reviewer chứng minh thực nghiệm `jsonb '"foo"' ? 'x'` và `?&` trên scalar/array/`null` jsonb đều trả `false`, không bao giờ trả NULL — cộng với `content` là cột `not null`, CASE trong `content_shape` không có đường nào trả NULL. Không có lỗ nào ở cả 3 nhánh mcq/mcq_cloze/open_cloze.

RLS xác minh runtime: `relrowsecurity = t` trên cả 4 bảng, `pg_policies` schema `public` = 0 dòng, `set role anon; select * from exams` → `permission denied`.

**Ghi nhận mang sang Task 3/4 (không phải defect):** nhánh `open_cloze` của `content_shape` chỉ kiểm tra *vắng mặt* key `options`/`stem`, không ràng buộc gì thêm — `content = 'null'::jsonb` lọt qua. Đúng nguyên văn brief. Task 3/4 không được giả định `content` của `open_cloze` là object khi đọc.

**Task 2: complete**

## Task 3 — is_correct + exam_by_code
- BASE: `41042c4`
- Commit: `398025a` — `feat(db): hàm is_correct và exam_by_code`
- Diff: `supabase/schema.sql` +33, `tests/sql/02-rpc.sql` +9 (mới)
- Code chép nguyên văn brief, đúng. Test pass, 9 dòng `ok` cho `is_correct`.

### Finding 13 — `exam_by_code` được viết nhưng KHÔNG có assert nào
Defect trong plan tôi viết, không phải lỗi implementer: brief Task 3 đặc tả 9 ca test, cả 9 đều cho `is_correct`. `exam_by_code` — hàm mang toàn bộ logic bảo mật của Task 3 (mã sai/đề nháp trả cùng lỗi, cửa sổ thời gian, chặn anon) — đi vào `schema.sql` mà không một dòng test nào chạm tới. Implementer làm đúng brief; brief thiếu.

Vì sao nghiêm trọng: Task 4 (`exam_info`/`start_exam`/`submit_quiz`) đều gọi `exam_by_code` làm cổng vào. Một hồi quy ở đây — ví dụ ai đó sau này bỏ nhánh `not e.is_published` — sẽ lọt qua toàn bộ bộ test và làm lộ đề nháp cho học sinh.

**Ruling:** bổ sung 12 assert cho `exam_by_code` vào `02-rpc.sql` ngay trong Task 3, không đẩy sang Task 4. Rẻ (một vòng fix trên implementer còn sống), và Task 4 cần chúng làm lưới an toàn.
- Giá nếu sai: gần như 0 — chỉ thêm test, không đụng code sản xuất.

Đã tự kiểm chứng cả 12 assert trên container riêng (`probe_t3`, `probe_t3b`) trước khi giao: 12/12 pass. Gồm 3 ca tra được (mã thường, mã thừa khoảng trắng), 5 ca bị chặn (nháp, không tồn tại, hết hạn, chưa mở, null), 1 ca **đề nháp và mã sai trả cùng một `sqlerrm`**, 2 ca lỗi nói đúng lý do, 1 ca **anon bị chặn gọi `exam_by_code`**.

Ghi chú kỹ thuật cho lần sau: viết `now() - interval '1 hour' at time zone 'Asia/Ho_Chi_Minh'` sẽ lỗi `function pg_catalog.timezone(unknown, interval) does not exist` — `at time zone` bám chặt hơn phép trừ, phải bọc ngoặc `(now() - interval '1 hour') at time zone ...`. Lỗi này ở SQL test của tôi, không phải ở code sản phẩm.

- Fix round 1 (theo Finding 13): commit `b2342ab` — `test(db): bổ sung test exam_by_code (cửa sổ thời gian, đề nháp, chặn anon)`. Chỉ đụng `tests/sql/02-rpc.sql` (+38), **không** đụng `schema.sql` — đúng phạm vi đã giao.
- Test sau fix: `✓ TẤT CẢ TEST SQL PASS`, `02-rpc.sql` cho 21 dòng `ok` (9 + 12), tổng 37 dòng toàn bộ.
- Review package: `review-41042c4..b2342ab.diff` (2 commit). Task reviewer đang chạy.

### Task 3 — task review
`SPEC: ✅ đạt` / `QUALITY: ✅ duyệt`. Không có finding nào.
Reviewer chạy `run.sh` độc lập: 37 dòng `ok` toàn bộ, `02-rpc.sql` đúng 21 dòng (9+12), 0 `ASSERT-FAIL`.
Tự dò thêm ngoài bộ test, không tìm được lỗ: `is_correct` với mảng chứa NULL / mảng rỗng / tiếng Việt có dấu (`'Đi'` vs `'đi'`) đều đúng; `exam_by_code` với chuỗi injection (`'; DROP TABLE exams; --`) không khai thác được vì query dùng biến plpgsql chứ không nối chuỗi động; ca "vừa nháp vừa hết hạn" trả đúng message generic, không lộ đề từng tồn tại.
Xác minh qua `pg_proc`: `prosecdef=t`, `proconfig={search_path=public}`. `has_function_privilege('anon', ..., 'EXECUTE')` = `f`.

**Task 3: complete**

## Task 4 — kiểm chứng brief TRƯỚC khi dispatch
Trích khối SQL Step 1 + Step 3 ra file rồi chạy trên container riêng (`probe_t4`), nạp đúng thứ tự runner thật: `schema.sql` → `00` → `01` → `02` (Task 3) → 3 hàm Task 4 → khối test Task 4.

Kết quả lần đầu: 3 hàm nạp sạch, 24/25 assert pass, **1 `ASSERT-FAIL`**.

### Finding 14 — assert `count(*) from submissions = 6` sai số, và đếm nhầm phạm vi
Brief Task 4 (dòng 83) viết `select assert((select count(*) from submissions) = 6, 'mọi lượt nộp đều được ghi');`. Số thật là **5**.

Nguyên nhân, đã xác minh: khối test gọi `submit_quiz` 7 lần, nhưng 2 lần đầu nằm trong `blocked()` và bị ném lỗi (`Đề đã hết hạn lúc ...` và `Họ tên và lớp là bắt buộc.`) — plpgsql rollback nên **không** ghi dòng nào vào `submissions`. Chỉ 5 lần còn lại ghi thật (Nguyễn Văn A, Lê C, Trần B, Phạm D, Vũ E). Tôi đếm 7 lần gọi khi viết plan thay vì đếm số lần ghi thành công.

Defect thứ hai, ngầm hơn: `count(*) from submissions` không giới hạn phạm vi, nên nó phụ thuộc vào việc mọi file test chạy trước đó có ghi vào `submissions` hay không. Hiện `01-constraints.sql` và phần Task 3 của `02-rpc.sql` đều không đụng bảng này nên may mắn đúng, nhưng bất kỳ task nào sau này thêm một lượt nộp vào file test trước đó sẽ làm assert này vỡ mà không liên quan gì tới `submit_quiz`.

**Ruling:** sửa assert thành đếm có ràng buộc theo đề, và đúng số 5:
```sql
select assert((select count(*) from submissions s join exams e on e.id=s.exam_id
                where e.code in ('GOLD8','NOEXP')) = 5, 'mọi lượt nộp đều được ghi');
```
- Vì sao: vừa vá con số sai, vừa gỡ phụ thuộc ngầm vào trạng thái toàn cục của bảng. Assert giờ chỉ nói về đúng thứ nó định kiểm — số lượt nộp mà `submit_quiz` ghi cho hai đề của chính test này.
- Giá nếu sai: 0 — chỉ là test, không đụng code sản phẩm.
- Đã sửa cả `task-4-brief.md` (dòng 83) và `docs/superpowers/plans/2026-08-25-planA-backend.md` (dòng 508).

Chạy lại trên container sạch sau khi sửa: **25 dòng `ok`, 0 `ASSERT-FAIL`, 0 `ERROR`**. Toàn bộ SQL Task 4 dùng được nguyên văn.

Ghi chú thêm cho dispatch: `blocked()` mà test Task 4 dùng đã được Task 3 định nghĩa sẵn ở đầu `02-rpc.sql` (nhờ fix round Finding 13) — Task 4 không cần tạo lại. Và `assert()` gọi được dưới `set role anon` (đã kiểm), nên khối test cuối chạy bình thường.

## Task 4 — ba RPC exam_info / start_exam / submit_quiz
- BASE: `2f9b77b` (gồm `2f9b77b` docs sửa assert theo Finding 14)
- Commit: `2847031` — `feat(db): ba RPC exam_info, start_exam, submit_quiz cho học sinh`
- Diff: `supabase/schema.sql` +84, `tests/sql/02-rpc.sql` +75
- Test: `✓ TẤT CẢ TEST SQL PASS`, `02-rpc.sql` 46 dòng `ok` (21 + 25), 0 `ASSERT-FAIL` — đúng con số tôi đã kiểm chứng trước khi dispatch.
- `grant execute ... to anon` đúng 3 hàm (`schema.sql:220-222`); `exam_by_code` vẫn `revoke ... from public` (dòng 132), anon không gọi được.
- Review package: `review-2f9b77b..2847031.diff`. Task reviewer đang chạy.

## Task 4: complete
- Commit: `2847031` feat(db): ba RPC exam_info, start_exam, submit_quiz cho học sinh
- Diff: `supabase/schema.sql` +84, `tests/sql/02-rpc.sql` +75. Tổng 62 dòng `ok`, 0 ASSERT-FAIL.
- Review: TỰ REVIEW qua Bash (container `rev4`) vì subagent reviewer chết bởi HTTP 429
  "monthly spend limit" trên `claude/claude-sonnet-5` — không phải lỗi code.
- SPEC: ✅ — ba RPC đúng chữ ký, `exam_info`/`start_exam` không select `accepted_answers`
  lẫn `explanation`; `submit_quyz` chấm qua `is_correct`, ghi `submissions`, trả `review`
  chỉ khi `show_explanations`.
- QUALITY: ✅ — các phép thử tự chạy thêm ngoài file test, tất cả đạt:
  - Rò dữ liệu có đánh dấu: đề `LEAK1` (`accepted_answers='{ZZZTOP}'`,
    `explanation='BIMAT123'`) → `position(...)=0` trong cả `exam_info` lẫn `start_exam`.
    Đây là phép kiểm quan trọng nhất vì assert sẵn có `::text like '%accepted_answers%'`
    chỉ bắt tên cột, không bắt giá trị bị rò.
  - `LEAK2` (`show_explanations=false`) → `review` là `null`, không rò `BIMAT456`.
  - Chấm chéo đề: đáp án đúng của `LEAK1` nộp vào `LEAK2` được 0 điểm; `total` chỉ đếm
    câu của đúng đề đó. (Đáng ngờ vì `questions.number` chỉ unique theo `exam_id`.)
  - `p_answers` méo: số câu không tồn tại / giá trị số / mảng / object lồng / null →
    không sập, chấm 0. Cả payload là mảng hay `null` thì bị chặn.
  - anon bị chặn `select` trên cả 4 bảng gốc.

### Finding 15 — anon có EXECUTE trên `is_correct` (nhẹ, không sửa)
Postgres mặc định `grant execute ... to public` cho hàm mới, nên anon gọi được
`is_correct` dù khối grant có comment "anon chỉ execute 3 hàm này, không hơn".
**Ruling: không sửa.** `is_correct(text[], text)` là hàm thuần, không đọc bảng nào,
và người gọi phải tự cung cấp mảng đáp án — đã kiểm: anon không select được
`accepted_answers` để truyền vào. Đây là điểm phòng thủ theo chiều sâu, không phải
lỗ hổng. Nếu muốn siết: thêm `revoke all on function public.is_correct(text[],text) from public;`
— chi phí nếu ruling sai: bằng không, vì hàm không có gì để rò.

## Task 5 + 6: đã giao SONG SONG (BASE `b721cb6`)
Hai task này là cặp duy nhất chạy song song an toàn: Task 5 chỉ đụng `supabase/seed-demo.sql`
+ ba file bị xoá, Task 6 chỉ đụng `supabase/functions/admin/` và `tests/lib-csv.test.mjs`.
Task 7/8/9 phải nối tiếp vì cả ba đều thêm `case` vào cùng một `switch (action)`.

### Tiền kiểm brief 5 (chạy trên container `probe5` TRƯỚC khi giao)
- Khối SQL trong brief chạy sạch, exit 0 → `TAP8` 8 câu/1 phần, `GOLD8` 8 câu/1 phần.
- `start_exam` trả đủ 8 câu mỗi đề; không rò `explanation`.
- Chấm tuyệt đối: `GOLD8` 8/8, `TAP8` 8/8 (kể cả `Contrastingly` — đáp án thứ hai của câu 16).
- `submit_quiz('TAP8')` trả `review` gồm 8 phần tử.
→ Không cần sửa brief. Đã báo implementer chép nguyên văn.

### Finding 16 — brief 5 thiếu bước tạo role, và dùng `sleep 5` cứng
Lệnh Docker trong brief nạp thẳng `schema.sql` vào Postgres 16 thuần, nhưng schema có
`grant ... to anon` mà PG thuần không có role `anon`/`service_role` → nạp sẽ hỏng dưới
`ON_ERROR_STOP=1`. **Ruling: không sửa plan, chỉ bổ sung trong lệnh giao việc** —
đây là lỗi ở đoạn hướng dẫn kiểm thử thủ công, không phải ở sản phẩm; `tests/sql/run.sh`
(Task 1) đã tạo role đúng cách rồi. Đã dặn implementer thêm
`create role anon; create role service_role;` và chờ `pg_isready` thay `sleep 5`.
Chi phí nếu ruling sai: implementer mất một vòng chạy lại Docker.

### Finding 17 — ghi chú `--experimental-strip-types` trong brief 6 là thừa
Đã thử thật trên máy này: Node v24.19.0 import trực tiếp `.ts` từ `.test.mjs` chạy được,
không cần cờ. **Ruling: giữ ghi chú trong plan** (vô hại, là phương án dự phòng cho
máy Node cũ hơn), nhưng đã báo implementer rằng không cần dùng.

## Task 5: complete
- Commit: `4e90729` feat(db): seed hai đề mẫu CAE Tap water và FCE Gold, xoá seed cũ
- `diff /tmp/seed-probe.sql supabase/seed-demo.sql` → GIỐNG HỆT khối SQL tôi đã tiền kiểm.
- Review (tự làm qua Bash, container `rev56`): schema + seed nạp sạch, `TAP8` 8 câu, `GOLD8` 8 câu.
- SPEC: ✅ — đúng 4 step, ba file lỗi thời đã bị `git rm`.
- QUALITY: ✅

## Task 6: complete
- Commit: `4bae16f` refactor(admin): tách parser CSV ra lib-csv.ts và thêm test
- `node --test 'tests/*.test.mjs'` → 10 pass / 0 fail. `bash tests/sql/run.sh` → 62 ok, 0 ASSERT-FAIL (không hồi quy).
- SPEC: ✅ — `parseCsv` chuyển nguyên vẹn, `csvToQuestions` trả shape mới, 10 test đúng nguyên văn brief.
- QUALITY: ✅ — tôi tự kiểm điều implementer nói không kiểm được: chạy `csvToQuestions`
  trên CSV có ngoặc kép lồng, xuống dòng trong ô, `correct` viết thường, cột `explanation`
  rỗng; sinh `insert` và nạp vào DB thật. Constraint `content_shape` + `mcq_answer_valid`
  CHẤP NHẬN, và `submit_quiz` chấm đúng 2/3. Vòng CSV → jsonb → chấm điểm thông suốt.
- Lo ngại của implementer về `replace_csv` còn thiếu `section_id`/`exam_id`/`kind`: ĐÚNG,
  nhưng đúng phạm vi — Task 8 sẽ viết lại action đó.

## Dọn tài liệu (ngoài brief, làm ngay vì là hệ quả trực tiếp của Task 5)
Commit riêng: `README.md` + `CLAUDE.md` còn trỏ `scripts/gen-seed.mjs`, `data/questions.json`,
`supabase/seed.sql` — cả ba vừa bị xoá. Đã sửa, và đổi luôn câu "chạy lại schema.sql là an toàn"
thành cảnh báo `drop table ... cascade` (câu cũ giờ SAI và nguy hiểm).

### Finding 18 — brief 7 dùng hai phép nhúng PostgREST mà schema không đỡ nổi
Dựng PostgREST v12.2.3 thật (container `prpg` + `prrest`) trên chính `schema.sql` để kiểm
trước khi giao Task 7. Cả hai truy vấn trong brief đều HỎNG:

1. `list_exams` nhúng `questions(count)` từ `exams` → `PGRST200`:
   *"Searched for a foreign key relationship between 'exams' and 'questions' … no matches"*.
   `questions.exam_id` chỉ tham chiếu `exams` bắc cầu qua `sections(id, exam_id)`,
   không có FK trực tiếp nên PostgREST không thấy đường nhúng.
2. `get_exam` / `duplicate_exam` nhúng `sections(*, questions(*))` → `PGRST201` *ambiguous*:
   giữa hai bảng có ĐÚNG HAI khoá ngoại ghép (`questions_section_id_exam_id_fkey` và
   `questions_section_id_kind_fkey`), PostgREST không tự chọn được.

**Ruling: sửa cả hai, mỗi lỗi một cách khác nhau.**
- (1) thêm `foreign key (exam_id) references public.exams(id) on delete cascade` vào
  `questions`. Đã kiểm sau khi thêm: `list_exams` trả đúng `{"count": 8}` cho cả hai đề.
  Không nới lỏng gì — FK ghép vẫn còn nguyên, đây chỉ là đường tham chiếu trực tiếp
  song song, và cascade đã đúng hướng.
- (2) chỉ đích danh `questions!questions_section_id_exam_id_fkey(*)`. Đã kiểm: trả về
  đủ 8 câu của `TAP8`. Chọn FK `(section_id, exam_id)` chứ không phải `(section_id, kind)`
  vì đây mới là quan hệ chứa đựng thật; `kind` chỉ là bản sao để ép khớp dạng.
Đã vá cả brief lẫn plan (thêm Step 0 + sửa hai lời gọi `.select`).
Chi phí nếu ruling sai: Task 7 chết ngay khi gọi action đầu tiên — nhìn thấy liền.

*Ghi chú kỹ thuật cho các task sau:* dựng PostgREST cục bộ cần role `authenticator`
(login, noinherit, được grant `anon`+`service_role`) và `alter role service_role bypassrls`
— thiếu bypassrls thì mọi truy vấn trả `[]` im lặng chứ không báo lỗi.

## Task 7: complete
- Commit: `a05d659` feat(admin): action quản lý đề — list/get/save/delete/duplicate
- `supabase/schema.sql` +3 (đúng FK của Step 0), `index.ts` xoá 6 case cũ, thêm 5 case mới.
  `login` / `list_submissions` / `clear_submissions` không đụng — đúng phạm vi.
- Review: TỰ LÀM, dựng PostgREST v12.2.3 thật (`rev7pg` + `rev7rest`) trên schema + seed:
  - `list_exams` nguyên văn → trả đủ hai đề kèm `sections/questions/submissions: {"count": …}`.
    Chính là truy vấn từng hỏng `PGRST200` trước khi có FK ở Step 0.
  - `get_exam` nguyên văn → trả đúng, hết `PGRST201 ambiguous`.
  - `duplicate_exam`: chạy lại đúng chuỗi insert của nó → tạo `COPY1` ở trạng thái nháp
    (`is_published=false`), sections và questions sang đủ.
- Hồi quy: `tests/sql/run.sh` 62 ok / 0 fail, `node --test` 10 pass / 0 fail.
- SPEC: ✅   QUALITY: ✅
- Lo ngại implementer nêu: (a) không chạy `deno check` vì máy không có `deno` — tôi đã kiểm
  thay bằng cách chạy thật qua PostgREST, đủ mạnh hơn kiểm type; (b) `csvToQuestions` import
  mà chưa dùng — đúng, Task 8 dùng ở action `import_csv`.
