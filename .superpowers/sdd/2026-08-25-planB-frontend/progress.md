# SDD ledger — plan: docs/superpowers/plans/2026-08-25-planB-frontend.md

Plan A (backend) đã xong 9/9, HEAD `06a8764`. Plan B chạy tiếp trên cùng branch `feat/nhieu-de-va-dang-cau-hoi`.

## Quét tiền kiểm (trước khi dispatch Task 1)

### Cặp task dùng chung file / giao diện

| Cặp | Bên sản xuất → bên tiêu thụ | Kết quả |
|---|---|---|
| T1 → T9, T11 | `toUtcIso`/`toLocalInput`/`formatVn` → form hạn nộp + bảng kết quả | khớp, cả ba đều được import đúng tên |
| T2 → T4, T10 | `splitPassage` → `app-render.js`; `diffBlanks`/`scanBlanks` → `admin-sections.js` | khớp |
| T3 → T4, T5, T6 | 34 id trong `index.html` → mọi `$('…')` của app | **khớp tuyệt đối**: 30 id được dùng, 0 id thiếu |
| T8 → T9, T10, T11 | 48 id trong `admin.html` → 45 id được ba module admin dùng | **0 id thiếu** |
| T8 → T9, T10, T11 | `api`/`esc`/`toast`/token → cả ba module | khớp |
| T9 ↔ T10 | `openExam` ↔ `renderSectionsAdmin` — **phụ thuộc vòng tròn** | xem Finding B1 |
| T4 → T5 | `escapeHtml`, `allQuestions` | khớp |
| T1–T11 → T12 | 7 file mới → danh sách `cp` trong `deploy.yml` | khớp, T12 liệt kê đủ 7 file mới |

### Đối chiếu ngược với Plan A (đã deploy)

| Kiểm | Kết quả |
|---|---|
| 13 action Plan B gọi vs 14 action Edge Function có | **đủ cả 13**. `delete_question` backend có mà Plan B không dùng — xem Finding B2 |
| 3 RPC app.js gọi (`exam_info`, `start_exam`, `submit_quiz`) vs `grant execute … to anon` | khớp đúng 3, không thừa không thiếu |
| Field `exam_info` schema trả (`code,title,subtitle,duration_min,total,expires_at,show_explanations`) vs Task 6 đọc (`code,title,subtitle,duration_min,total,expires_at`) | khớp, T6 chỉ bỏ qua `show_explanations` (không cần, vì `review` tự là `null` khi tắt) |
| Field `review[]` schema trả (`number,section_id,chosen,is_correct,accepted,explanation`) vs Task 5 đọc (`number,chosen,is_correct,accepted,explanation`) | khớp |
| `submit_quiz` trả `{score,total,review}` vs Task 6 đọc `data.score/data.total/data.review` | khớp |

### Từng task tự nhất quán?

| Task | Kiểm | Kết quả |
|---|---|---|
| T1 | 10 test vs 3 hàm export | nhất quán |
| T2 | test vs 3 hàm export, có ca `{{0}}` là ví dụ mẫu | nhất quán |
| T3 | id khai báo vs id các task sau dùng | nhất quán (xem bảng trên) |
| T4–T7 | export vs nơi import | nhất quán |
| T8–T11 | export vs nơi import, id vs `admin.html` | nhất quán |
| T12 | `deploy.yml` liệt kê file vs file thật tạo ra | nhất quán |

**Finding B1 — phụ thuộc vòng tròn `admin-exams.js` ↔ `admin-sections.js`.**
T9 import tĩnh `renderSectionsAdmin` từ T10; T10 cần `openExam` từ T9. Plan đã tự giải: T10 dùng `const { openExam } = await import('./admin-exams.js')` (import động, trong hàm) thay vì import tĩnh. ES modules xử lý được vòng này vì cạnh động chỉ chạy lúc gọi hàm, không phải lúc nạp module.
Ruling: KHÔNG sửa plan. Giá nếu sai: `openExam is not a function` lúc bấm lưu ở màn soạn phần thi — lộ ngay lần thử đầu, sửa một dòng.

**Finding B2 — `delete_question` không có nơi gọi.**
Backend có action này (Task A8) nhưng Plan B xoá câu theo cách khác: `save_questions` ghi đè cả bảng câu của một phần, nên xoá một câu = gửi lại danh sách thiếu câu đó.
Ruling: giữ nguyên, KHÔNG thêm task gọi `delete_question`. Đó là một action dự phòng không hại gì. Giá nếu sai: một `case` chết trong Edge Function — vô hại.

**Finding B3 — thứ tự dispatch phải là T8 → T10 → T9.**
T9 import tĩnh từ T10, nên nếu làm T9 trước thì file `admin-sections.js` chưa tồn tại và không test thử được gì. Plan đánh số T9 trước T10 nhưng nội dung không phụ thuộc thứ tự viết.
Ruling: dispatch theo thứ tự **T10 trước T9**. Giá nếu sai: không có — chỉ là thứ tự thi công, kết quả cuối giống hệt.

### Song song hoá

- T1 ‖ T2 — hai file thuần, không đụng nhau, cùng thêm test riêng. Dispatch song song.
- T3 phải xong trước T4/T5/T6 (chúng bám id của nó).
- T4 → T5 → T6 nối tiếp (T5 import T4, T6 import cả hai).
- T7 độc lập sau T3.
- T8 trước T10/T9/T11.
- T12 cuối cùng, và **không dispatch cho subagent** — nó deploy thật lên GitHub Pages + Supabase.

---

## Task 1: complete

**Commit:** `dd7cf3d` — feat: lib-time đổi giờ giữa form và DB theo múi giờ Việt Nam (`lib-time.js` 34 dòng, `tests/lib-time.test.mjs` 52 dòng)

**Tự review (chạy thật bằng node):**

| Kiểm | Kết quả |
|---|---|
| `toUtcIso('2026-08-25T14:30')` | `2026-08-25T07:30:00.000Z` — đúng −7h |
| Qua ngày: `03:00` VN | `2026-08-24T20:00:00.000Z` — lùi sang hôm trước, đúng |
| Dạng có giây | `14:30:45` → `07:30:45.000Z` |
| Rác/rỗng/`null`/`undefined`/`'2026-13-45T99:99'` | đều trả `null`, không ném |
| Khứ hồi 3 mốc hiểm (`23:59` cuối năm, nửa đêm mùng 1, nửa đêm thường) | cả 3 **OK**, không lệch |
| `formatVn` | `14:30:00 25/8/2026`, rỗng/rác → `—` |

**Điểm tốt:** dùng `Intl.DateTimeFormat` với `timeZone: 'Asia/Ho_Chi_Minh'` + `hourCycle: 'h23'` thay vì cộng trừ tay — nửa đêm ra `00` chứ không phải `24`. Hằng số `VN_OFFSET = '+07:00'` cố định, không phụ thuộc múi giờ máy giáo viên (comment đã nói rõ lý do).

**Regression:** `node --test` 33/33 pass (10 lib-time + 10 lib-passage + 13 cũ), 0 fail.

Không có lo ngại nào từ implementer, tôi cũng không tìm thấy.

---

## Task 2: complete

**Commit:** `7b8be5f` — feat: lib-passage tách đoạn văn theo dấu {{n}} (`lib-passage.js` 36 dòng, `tests/lib-passage.test.mjs` 68 dòng)

**Tự review (chạy thật bằng node):**

| Kiểm | Kết quả |
|---|---|
| Giữ nguyên xuống dòng + khoảng trắng kép | ghép lại các mảnh == chuỗi gốc, `true` |
| Gọi `scanBlanks` 3 lần liên tiếp (bẫy `lastIndex` của regex `/g`) | `[9,10,11]` cả ba lần — implementer đã chủ động `GAP_RE.lastIndex = 0` |
| `{{ 12 }}` có khoảng trắng trong ngoặc | nhận đúng `[12,13]` |
| Rỗng / `null` | `[]`, không ném |
| Không có chỗ trống nào | trả một mảnh `text` duy nhất |
| `{{0}}` là ví dụ mẫu | `scanBlanks` vẫn liệt kê `0` (để render được), `diffBlanks` loại `0` ra — đúng ý đồ |
| Lệch đủ 3 kiểu: `{{9}} {{9}} {{10}} {{12}}` vs `[9,10,11]` | `duplicates:[9]`, `missingQuestions:[12]`, `orphanQuestions:[11]` — chính xác |
| `numbers` là chuỗi (`['9','10']`, dạng đến từ `dataset` HTML) | vẫn khớp nhờ `.map(Number)` |
| `numbers` là `null` | không ném, báo `missingQuestions` |

**Kiểm với dữ liệu THẬT** (dựng Postgres + nạp `schema.sql` + `seed-demo.sql`, đọc `passage` và số câu ra rồi chạy `diffBlanks`):

```
TAP8  | chỗ trống: 0,9,10,…,16 | câu: 9,…,16 | KHỚP ✓
GOLD8 | chỗ trống: 0,1,2,…,8   | câu: 1,…,8  | KHỚP ✓
```

Cả hai đề mẫu không báo lệch nào — nghĩa là `admin-sections.js` (Task 10) sẽ không bắn cảnh báo giả trên đề thật.

**Regression:** `node --test` 33/33 pass.

Không có lo ngại nào từ implementer, tôi cũng không tìm thấy.

---

## Task 3: complete

**Commit:** `14c225a` — feat(app): index.html thêm màn nhập mã đề và khối lời giải (+41 −13)

**Tự review:**

| Kiểm | Kết quả |
|---|---|
| 35 id khai báo vs brief yêu cầu | **khớp tuyệt đối** — 0 thiếu, 0 thừa |
| 30 id mà Task 4/5/6 sẽ dùng | **0 id thiếu** |
| Bốn màn `screen-code / screen-info / screen-quiz / screen-result` | đủ, ba màn sau có `hidden` sẵn |
| Nạp script | `supabase-js` + `config.js` thẻ thường, `app.js` là `type="module"` — đúng thứ tự |
| Cân thẻ đóng/mở | 64/64 ✓ |
| Fallback text (ràng buộc CLAUDE.md) | giữ đúng tinh thần: `📝 — câu`, `⏱️ — phút`, `⏳ Không giới hạn`, `<h1>` mặc định "Bài kiểm tra" |
| Khối lời giải | `review-wrap` có `hidden` sẵn + ô "Chỉ hiện câu sai" (`only-wrong-result`) |
| Ô nhập mã đề | `maxlength="12"`, `autocapitalize="characters"`, `spellcheck="false"`, placeholder `GOLD8` — hợp với ràng buộc mã đề `^[A-Z0-9]{3,12}$` của Plan A |

**Lo ngại của implementer — xác nhận đúng và KHÔNG chặn:** `app.js` hiện tại vẫn là bản cũ nên trang học sinh sẽ hỏng cho tới Task 6. Đây là trạng thái trung gian đã dự liệu khi tách task theo file. Ruling: tiếp tục. Giá nếu sai: không có — Task 6 viết lại toàn bộ `app.js`.

**Regression:** `node --test` 33/33 pass.

## Task 4: complete — `eb1c772` — app-render.js
Tự review (bash + node, không dùng subagent vì reviewer sonnet đã chết 429 từ Task A4):
- `diff` code trong brief với file thực tế → **khớp 100%**, không thêm bớt dòng nào.
- Chạy `renderSections` với dữ liệu ba dạng (mcq + open_cloze + mcq_cloze, có cả gap `{{0}}` ví dụ): **14/14 PASS**.
  - XSS: `<img src=x onerror=...>` trong `stem` và `<b>` trong `title` đều bị escape → không lọt thẻ thật nào.
  - `{{0}}` ra `.gap-example` (không sinh input) — đúng ý "ví dụ mẫu không phải câu cần làm".
  - Xuống dòng trong passage giữ nguyên (`quality.\nIn`) — ăn khớp `white-space: pre-wrap` của Task 7.
  - `mcq_cloze` chỉ sinh `.gap-ref` trong đoạn văn, không sinh `.gap-input` → không có ô nhập lạc chỗ.
  - `renderNav` sắp đúng 1,9,10,11 (liên tục toàn đề, không theo thứ tự phần).
- `node --test 'tests/*.test.mjs'` → 33/33 pass.

## Task 7: complete — `2fb37ed` — styles.css
Tự review:
- `diff` phần thêm với CSS trong brief → **khớp 100%**, chỉ append 94 dòng cuối file, không đụng CSS cũ.
- Đối chiếu mọi biến CSS dùng (`--brand-soft --warn-bg --warn-ink --ok --card --line --radius --shadow --ink --muted`) và `@keyframes fadeUp`: **tất cả đã tồn tại** trong `:root` → không có màu nào ra `unset`.
- Đối chiếu mọi class `app-render.js` sinh ra với selector trong `styles.css`: chỉ `.opt-text` không có rule riêng — **không phải lỗi mới**, `app.js` cũ cũng sinh class này và `styles.css` cũ cũng chưa bao giờ style nó (thừa hưởng font từ `.opt`). Ruling: bỏ qua, không phải regression.
- Lo ngại của implementer (chưa kiểm bằng mắt vì Task 4/5 chạy song song): ghi nhận, sẽ kiểm ở bước cuối sau Task 6.

**Ghi chú bàn giao cho Task 6:** `markAnswered()` chỉ toggle `.answered/.missing` trên phần tử có `data-num`. Ô `open_cloze` nằm trong `<span class="gap">` **không có** `data-num`, nên class `.gap-input.missing` (CSS Task 7 có định nghĩa) phải do Task 6 tự gắn khi đánh dấu câu chưa làm lúc nộp.
