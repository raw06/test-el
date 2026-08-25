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
