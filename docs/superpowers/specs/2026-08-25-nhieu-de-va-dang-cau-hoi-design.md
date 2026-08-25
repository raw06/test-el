# Thiết kế: Nhiều đề kiểm tra & nhiều dạng câu hỏi

Ngày: 2026-08-25

## 1. Mục tiêu

Mở rộng hệ thống từ **một đề trắc nghiệm A/B/C/D duy nhất** thành:

- **Nhiều đề kiểm tra**, mỗi đề có mã riêng, thời lượng riêng, hạn nộp riêng.
- **Ba dạng câu hỏi** trộn được trong cùng một đề:
  - `mcq` — trắc nghiệm A/B/C/D rời (dạng hiện có).
  - `open_cloze` — đoạn văn, điền một từ vào chỗ trống (CAE Use of English Part 2).
  - `mcq_cloze` — đoạn văn, chọn A/B/C/D cho chỗ trống (FCE Use of English Part 1).
- **Lời giải thích đáp án** hiện sau khi nộp, bật/tắt theo từng đề.
- Giáo viên **xem được bài làm** của từng học sinh, kèm lời giải và điểm từng phần.

Giữ nguyên kiến trúc: HTML/CSS/JS thuần + Supabase, không bundler, không build step,
deploy GitHub Pages. Đã cân nhắc và **loại bỏ** phương án chuyển sang Next.js —
Supabase đã là backend đầy đủ, rewrite không đổi lấy tính năng nào (xem §9).

## 2. Phạm vi

Schema DB **làm lại từ đầu**. Dữ liệu cũ (51 câu hỏi + kết quả đã nộp) bị xoá theo
quyết định của chủ dự án; giáo viên upload lại đề bằng CSV.

Không nằm trong phạm vi: tài khoản đăng nhập cho học sinh, chặn nộp trùng,
chống gian lận. Những việc này cần Supabase Auth — để dịp khác.

## 3. Schema DB

Cấu trúc `exams → sections → questions`, cộng `submissions`.
Bảng `settings` (một dòng `id = 1`) **biến mất**: tên bài, phụ đề, thời lượng giờ là
thuộc tính của từng đề.

### 3.1 `exams` — đề kiểm tra

```sql
create table public.exams (
  id                bigint generated always as identity primary key,
  code              text not null unique,
  title             text not null,
  subtitle          text not null default '',
  duration_min      int  not null default 60 check (duration_min between 1 and 600),
  opens_at          timestamptz,                     -- null = mở ngay
  expires_at        timestamptz,                     -- null = không hết hạn
  is_published      boolean not null default false,  -- nháp thì học sinh không vào được
  show_explanations boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint code_format  check (code ~ '^[A-Z0-9]{3,12}$'),
  constraint window_valid check (opens_at is null or expires_at is null
                                 or opens_at < expires_at)
);
```

Trạng thái đề **tính từ dữ liệu, không lưu cột riêng**:
`is_published = false` → Nháp; `now() < opens_at` → Chưa mở;
`now() > expires_at` → Hết hạn; còn lại → Đang mở.

### 3.2 `sections` — phần thi

Một phần = một dạng câu hỏi + (nếu là cloze) một đoạn văn.
Đề FCE mẫu = 1 exam có 1 section `mcq_cloze`. Đề trộn = 1 exam có nhiều sections khác dạng.

```sql
create table public.sections (
  id           bigint generated always as identity primary key,
  exam_id      bigint not null references public.exams(id) on delete cascade,
  position     int  not null,
  kind         text not null check (kind in ('mcq','open_cloze','mcq_cloze')),
  title        text not null default '',   -- 'Part 2'
  instructions text not null default '',   -- 'For questions 9-16, read the text below…'
  passage      text,                       -- chỉ dạng cloze; chứa {{9}} {{10}}…
  example      text,                       -- 'Example: (0) HOW'

  constraint passage_required check (
    (kind = 'mcq' and passage is null) or (kind <> 'mcq' and passage is not null)
  ),
  constraint sections_position_uniq unique (exam_id, position) deferrable initially deferred,
  constraint sections_id_exam_uniq  unique (id, exam_id),   -- cho FK ghép ở questions
  constraint sections_id_kind_uniq  unique (id, kind)       -- cho FK ghép ở questions
);
```

`unique (exam_id, position)` để **deferrable** — đổi thứ tự hai phần trong một
transaction không bị đụng khoá giữa chừng.

### 3.3 `questions` — câu hỏi

```sql
create table public.questions (
  id          bigint generated always as identity primary key,
  section_id  bigint not null,
  exam_id     bigint not null,   -- denormalize: đánh số liên tục toàn đề
  kind        text   not null,   -- bản sao của sections.kind, FK ghép ép khớp
  number      int    not null,
  content     jsonb  not null default '{}'::jsonb,
  accepted_answers text[] not null check (cardinality(accepted_answers) >= 1),
  explanation text,

  foreign key (section_id, exam_id) references public.sections(id, exam_id) on delete cascade,
  foreign key (section_id, kind)    references public.sections(id, kind)    on delete cascade,

  constraint content_shape check (
    case kind
      when 'mcq' then
        coalesce(jsonb_typeof(content->'stem'), '') = 'string'
        and coalesce(jsonb_typeof(content->'options'), '') = 'object'
        and coalesce(content->'options' ?& array['a','b','c','d'], false)
      when 'mcq_cloze' then
        coalesce(jsonb_typeof(content->'options'), '') = 'object'
        and coalesce(content->'options' ?& array['a','b','c','d'], false)
      when 'open_cloze' then
        not (content ? 'options') and not (content ? 'stem')
      else false
    end
  ),

  constraint mcq_answer_valid check (
    kind = 'open_cloze'
    or (cardinality(accepted_answers) = 1 and accepted_answers[1] in ('A','B','C','D'))
  ),

  constraint questions_number_uniq unique (exam_id, number) deferrable initially deferred
);
create index questions_exam_number_idx on public.questions (exam_id, number);
```

Mọi biểu thức trong `content_shape` bọc `coalesce` vì **check constraint trả NULL là
PASS** — thiếu `coalesce` thì `content = '{}'` lọt qua mọi nhánh.

#### Ba quyết định thiết kế

**a) `content` là `jsonb`, shape theo `kind`.**

```json
// mcq
{"stem": "He ___ to school every day.",
 "options": {"a": "go", "b": "goes", "c": "going", "d": "gone"}}

// mcq_cloze — đề nằm ở passage, câu chỉ mang 4 phương án
{"options": {"a": "greatly", "b": "mostly", "c": "highly", "d": "largely"}}

// open_cloze — học sinh tự điền
{}
```

`options` là **object khoá `a`/`b`/`c`/`d`**, không phải array — `accepted_answers`
lưu `{'C'}` nên khớp thẳng vào khoá, không phải quy đổi qua index. Cần 6 phương án
thì thêm `e`, `f`, không `ALTER TABLE`.

**b) Một cột đáp án cho cả ba dạng.** `accepted_answers` là `text[]`:
MCQ lưu `{'C'}`, open cloze lưu `{'conversely','contrastingly'}` (câu 16 đề CAE mẫu
chấp nhận hai cách viết). Hàm chấm điểm chỉ có **một** nhánh logic.

**c) `number` duy nhất trong cả đề, không phải từng phần** — đúng như đề thật
(Part 1 dùng 1–8, Part 2 dùng 9–16).

#### DB tự chặn dữ liệu sai

Cột `kind` là bản sao của `sections.kind`, nhưng FK ghép `(section_id, kind)`
khiến nó **không thể lệch**. Kết hợp với hai check constraint, ba thứ sau
không tạo ra được kể cả khi gọi thẳng bằng service-role key:

- Câu `mcq` thiếu `stem` hoặc thiếu phương án.
- Câu `open_cloze` lỡ mang `options`.
- Câu MCQ có `accepted_answers = {'Z'}` hoặc hai đáp án.

**Đánh đổi đã chấp nhận:** đổi `kind` của section khi đã có câu hỏi sẽ bị FK chặn
thay vì tự chuyển đổi. Admin phải xoá câu cũ trước — đúng, vì shape `content` khác
nhau hoàn toàn, chuyển ngầm chỉ tạo dữ liệu rác. UI nói rõ điều này (§5.2).

### 3.4 `submissions` — bài nộp

```sql
create table public.submissions (
  id         bigint generated always as identity primary key,
  exam_id    bigint not null references public.exams(id) on delete cascade,
  full_name  text not null,
  class_name text not null,
  score      int not null,
  total      int not null,
  answers    jsonb not null,   -- {"9": "at", "1": "C"}
  created_at timestamptz not null default now()
);
create index submissions_exam_idx on public.submissions (exam_id, id desc);
```

`answers` chứa text tự do lẫn chữ cái trong cùng object, khoá là `number` dạng chuỗi.

## 4. Bảo mật & RPC

### 4.1 Bỏ hẳn view công khai

Schema cũ grant `select` cho anon trên `questions_public` / `settings_public`.
Với mã đề thì view lại thành lỗ hổng: `select * from exams_public` là **lộ danh sách
mọi mã đề đang mở**. Nên bỏ view, thay bằng RPC.

```sql
alter table public.exams       enable row level security;
alter table public.sections    enable row level security;
alter table public.questions   enable row level security;
alter table public.submissions enable row level security;
-- Không policy nào cho anon trên cả 4 bảng.
```

Anon chỉ có `execute` trên ba hàm dưới. Chặt hơn schema hiện tại.

### 4.2 Hàm phụ trợ (không cấp cho anon)

```sql
-- So khớp đáp án: bỏ qua hoa/thường và khoảng trắng thừa
create or replace function public.is_correct(p_accepted text[], p_given text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(p_accepted) a
    where btrim(coalesce(p_given, '')) <> ''
      and lower(btrim(a)) = lower(btrim(p_given))
  );
$$;

-- Lấy đề theo mã + kiểm cửa sổ thời gian; ném lỗi tiếng Việt
create or replace function public.exam_by_code(p_code text)
returns public.exams
language plpgsql security definer set search_path = public as $$
declare e public.exams;
begin
  select * into e from public.exams where code = upper(btrim(coalesce(p_code, '')));
  -- Mã sai và đề chưa xuất bản trả CÙNG một lỗi: không để lộ đề nào tồn tại.
  if not found or not e.is_published then
    raise exception 'Không tìm thấy đề với mã này.';
  end if;
  if e.opens_at is not null and now() < e.opens_at then
    raise exception 'Đề chưa mở. Bắt đầu lúc %.',
      to_char(e.opens_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  end if;
  if e.expires_at is not null and now() > e.expires_at then
    raise exception 'Đề đã hết hạn lúc %.',
      to_char(e.expires_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  end if;
  return e;
end $$;
```

### 4.3 Ba RPC cho học sinh

**`exam_info(p_code)`** — sau khi nhập mã, trước khi bấm Bắt đầu.
Trả `{title, subtitle, duration_min, total, expires_at, show_explanations}`.
**Không trả câu hỏi nào.**

**`start_exam(p_code)`** — bấm Bắt đầu, đồng hồ chạy từ đây.
Trả meta của đề + mảng `sections` (kèm `passage`, `instructions`, `example`),
mỗi section kèm `questions` chỉ gồm `{number, content}` —
**`accepted_answers` và `explanation` không bao giờ được select**.

**`submit_quiz(p_code, p_full_name, p_class, p_answers)`** — chấm và ghi.

```sql
create or replace function public.submit_quiz(
  p_code text, p_full_name text, p_class text, p_answers jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.exams; v_score int; v_total int; v_review jsonb;
begin
  e := public.exam_by_code(p_code);   -- chặn CẢ khi nộp, không chỉ khi bắt đầu
  if coalesce(btrim(p_full_name), '') = '' or coalesce(btrim(p_class), '') = '' then
    raise exception 'Họ tên và lớp là bắt buộc.';
  end if;
  if jsonb_typeof(coalesce(p_answers, 'null'::jsonb)) <> 'object' then
    raise exception 'Dữ liệu bài làm không hợp lệ.';
  end if;

  select count(*),
         count(*) filter (
           where public.is_correct(q.accepted_answers, p_answers ->> q.number::text))
    into v_total, v_score
  from public.questions q where q.exam_id = e.id;

  insert into public.submissions(exam_id, full_name, class_name, score, total, answers)
  values (e.id, btrim(p_full_name), btrim(p_class), v_score, v_total, p_answers);

  -- Đáp án + lời giải chỉ rời khỏi DB SAU KHI bài đã được ghi.
  if e.show_explanations then
    select jsonb_agg(jsonb_build_object(
      'number', q.number, 'section_id', q.section_id,
      'chosen', p_answers ->> q.number::text,
      'is_correct', public.is_correct(q.accepted_answers, p_answers ->> q.number::text),
      'accepted', to_jsonb(q.accepted_answers),
      'explanation', q.explanation
    ) order by q.number) into v_review
    from public.questions q where q.exam_id = e.id;
  end if;

  return jsonb_build_object('score', v_score, 'total', v_total,
                            'review', coalesce(v_review, 'null'::jsonb));
end $$;
```

Hạn nộp kiểm **trong** `submit_quiz`, không chỉ ở `start_exam` — người mở đề trước
giờ hết hạn rồi ngồi lỳ vẫn bị chặn. Client không lách được vì kiểm nằm trong DB.

```sql
revoke all on function public.exam_info(text)                        from public;
revoke all on function public.start_exam(text)                       from public;
revoke all on function public.submit_quiz(text, text, text, jsonb)   from public;
revoke all on function public.exam_by_code(text)                     from public;
grant execute on function public.exam_info(text)                      to anon;
grant execute on function public.start_exam(text)                     to anon;
grant execute on function public.submit_quiz(text, text, text, jsonb) to anon;
-- exam_by_code KHÔNG cấp cho anon: hàm nội bộ.
```

`SUPABASE_SERVICE_ROLE_KEY` vẫn chỉ tồn tại trong Edge Functions.

## 5. Màn quản trị

### 5.1 Điều hướng hai tầng

Tab **📋 Đề kiểm tra** → danh sách đề (mã, tên, số câu, số phần, hạn, số lượt nộp,
badge trạng thái) → bấm **Soạn** vào màn soạn đề, breadcrumb `← Đề kiểm tra / GOLD8`.

Tab **Kết quả** giờ luôn thuộc về một đề cụ thể, không còn bảng gộp toàn hệ thống.

### 5.2 Màn soạn đề

**Thông tin đề** — mã (tự viết hoa khi gõ), tên, phụ đề, thời lượng,
mở lúc / hết hạn (`datetime-local`), cờ *Đã xuất bản*, cờ *Hiện lời giải sau khi nộp*.

`datetime-local` trả giờ local của máy và **không mang timezone**. Quy đổi tường minh
sang UTC theo `Asia/Ho_Chi_Minh` khi gửi lên và ngược lại khi tải về — không dựa vào
timezone của trình duyệt. Cạnh ô nhập hiện dòng xác nhận
*"Hết hạn: 20/08/2026 17:00 (giờ VN)"*.

**Các phần thi** — danh sách card đổi thứ tự được, mỗi card hiện dạng, số câu, dải số.
Thêm phần → chọn 1 trong 3 dạng. **Dạng chốt lúc tạo, không đổi được** (đúng ràng buộc
DB ở §3.3); UI nói rõ thay vì để giáo viên bấm rồi nhận lỗi Postgres.

### 5.3 Editor phần cloze

Giáo viên dán cả đoạn văn vào `<textarea>`, đánh dấu chỗ trống bằng `{{9}}`:

```
…one of the things on your mind should be {{0}} safe it is to drink water
straight from the tap. There are several factors {{9}} play here…
```

Chọn `{{n}}` thay vì `___` vì nó **mang sẵn số câu** — thứ tự trong văn bản không cần
khớp thứ tự trong DB, và giáo viên đọc bản thô vẫn hiểu.

Bên phải là ô **Xem trước** render giống màn học sinh. Bên dưới là **bảng câu tự sinh
từ chính đoạn văn**: mỗi lần rời `<textarea>`, quét regex `\{\{(\d+)\}\}` và đồng bộ —
thêm dòng cho số mới, **cảnh báo** dòng thừa nhưng **không tự xoá** (giáo viên có thể
đang sửa dở; mất công nhập đáp án là mất thật).

`{{0}}` được nhận là **câu ví dụ**: hiện sẵn trong passage, không tạo dòng, không tính điểm.

- `open_cloze`: mỗi câu có ô đáp án cho phép **thêm nhiều cách viết**
  (ca `Conversely/contrastingly` ở câu 16 đề CAE mẫu) + ô lời giải.
- `mcq_cloze`: 4 ô A/B/C/D + chọn đáp án đúng + ô lời giải.
- `mcq`: giữ nguyên UI hiện có (danh sách câu + modal + upload CSV), chỉ đổi chỗ ghi.

### 5.4 Xem bài làm học sinh

Mở rộng modal chi tiết hiện có ba chỗ:

- **Hiện đáp án học sinh gõ** cho `open_cloze`, so bên cạnh danh sách đáp án được
  chấp nhận, kèm badge Đúng/Sai/Bỏ trống.
- **Hiện `explanation`** dưới mỗi câu, để giáo viên soát chất lượng lời giải.
- **Nhóm theo phần thi**, kèm điểm từng phần (`Phần 1: 18/20 · Phần 2: 5/8`) —
  biết học sinh yếu dạng nào.

Bộ lọc *chỉ câu sai* giữ nguyên. Excel thêm cột `Mã đề` và điểm từng phần —
sửa **cả hai** đường tải (`downloadXlsx` trong `admin.js` và Edge Function `export`).

### 5.5 Edge Function `admin` — các action

Giữ nguyên kiểu `switch (action)` sau lớp kiểm `x-admin-token`.

| Nhóm | Action |
|---|---|
| Đề | `list_exams`, `get_exam`, `save_exam`, `delete_exam`, `duplicate_exam` |
| Phần | `save_section`, `delete_section`, `reorder_sections` |
| Câu | `save_questions`, `delete_question`, `import_csv` |
| Kết quả | `list_submissions(exam_id)`, `clear_submissions(exam_id)` |

`save_questions` ghi **theo lô** cả bảng câu của một phần trong một request, vì editor
cloze sửa cả bảng cùng lúc — một request thay vì tám.

`duplicate_exam` nhân bản đề cho lớp khác với mã mới; rẻ để làm, tiết kiệm nhiều công.

`delete_exam` xoá cascade cả sections/questions/submissions → **bắt gõ lại mã đề để
xác nhận**, không dùng `confirm()` thường. Xoá nhầm là mất bài làm của cả lớp.

Edge Function vẫn validate đầy đủ (trim, kiểm A/B/C/D, kiểm đáp án rỗng) — các
constraint DB ở §3.3 là lớp chặn cuối, không thay thế validate.

### 5.6 CSV

Giữ nguyên header `number, content, option_a, option_b, option_c, option_d, correct`
cho dạng `mcq` (không phá `mau-de.csv` đang dùng). Edge Function gói 4 cột option
thành `content.options` khi ghi. Cột thêm tuỳ chọn: `explanation`.

Hai dạng cloze **không nhập qua CSV** — CSV không hợp để chứa cả đoạn passage;
soạn qua form ở §5.3.

## 6. App học sinh

### 6.1 Màn 1 — nhập mã đề, hai nhịp

Ba trường: **Mã đề**, Họ tên, Lớp. Mã tự viết hoa khi gõ;
`?ma=GOLD8` trên URL thì điền sẵn.

- **Nhịp 1** — bấm *Kiểm tra* → `exam_info(code)`. Hiện tên đề, số câu, thời lượng,
  hạn nộp. Chưa có câu hỏi nào.
- **Nhịp 2** — bấm *Bắt đầu* → `start_exam(code)`, đồng hồ chạy.

Tách hai nhịp để học sinh xác nhận đúng đề trước khi mất thời gian, và để đề không
rời DB sớm hơn cần thiết.

Các chip `📝 … câu` / `⏱️ … phút` **bắt đầu ở trạng thái ẩn**, chỉ hiện sau nhịp 1 —
giá trị hardcode cũ (50 câu / 60 phút) giờ sai với mọi đề.

Lỗi từ RPC hiện ngay dưới ô mã, **mỗi ca một câu riêng**: không tìm thấy mã /
chưa mở kèm giờ / đã hết hạn kèm giờ. Học sinh gõ nhầm mã và học sinh đến muộn cần
biết hai chuyện khác nhau.

### 6.2 Màn 2 — làm bài

Sidebar (đồng hồ + lưới số câu) giữ nguyên. Nội dung lặp theo section: tiêu đề phần,
`instructions`, `example`, rồi đoạn văn hoặc danh sách câu.

**Ô điền nằm ngay trong dòng văn** — `input` inline, có số câu nhỏ phía trước.
Đọc liền mạch như đề giấy.

Với `mcq_cloze`, đoạn văn chỉ hiện ô trống đánh số; **bốn phương án nằm ở danh sách
bên dưới đoạn** (đúng bố cục đề FCE thật). Chọn A/B/C/D thì chữ tương ứng hiện luôn
vào ô trống trên đoạn — học sinh đọc lại được cả câu với từ mình chọn.

`mcq` giữ nguyên card như hiện tại.

**Render passage an toàn:** split theo regex `\{\{(\d+)\}\}`, `escapeHtml()` từng khúc
text rồi mới nối với HTML của ô trống. Không bao giờ đưa cả đoạn văn thô vào
`innerHTML` — đúng quy ước sẵn có.

Lưới số câu đánh dấu ranh giới phần (`1–20 | 21–28`); ô "đã làm" tính cả ô điền có chữ,
không chỉ radio.

### 6.3 Timer và localStorage

Cơ chế **deadline tuyệt đối giữ nguyên** — không đụng vào. Ba thay đổi:

- **Key theo mã đề:** `quiz_state_v2:GOLD8`. Làm hai đề khác nhau không đè state của
  nhau. Bump `v1 → v2` vì shape đổi.
- **Deadline lấy min của hai mốc:**
  `deadline = Math.min(Date.now() + durationSec * 1000, expiresAtMs)`.
  Đề còn 10 phút là hết hạn mà thời lượng 45 phút thì đồng hồ chạy 10 phút — không có
  mốc này thì học sinh làm xong bị RPC từ chối, mất trắng công.
- **`saveState()`** vẫn gọi mỗi `change` trên form; ô điền thêm `input` với debounce
  ~400ms để gõ dở cũng không mất. `clearState()` vẫn chỉ gọi sau khi RPC thành công.

`settingsReady` biến mất — không còn settings toàn cục. Cái bẫy "bấm Bắt đầu quá nhanh
nhận nhầm thời lượng" tự hết, vì Bắt đầu chỉ bấm được sau khi mã đã kiểm.

### 6.4 Màn 3 — kết quả kèm lời giải

Điểm số giữ nguyên (emoji, `celebrate()` khi ≥80%). Bên dưới, **nếu đề bật
`show_explanations`**, hiện phần ôn lại từ mảng `review`:

```
┌ Câu 1                                    ✗ Sai │
│ Bạn chọn: A. greatly    Đáp án: C. highly      │
│ 💡 This is the only adverb that collocates…    │
└────────────────────────────────────────────────┘
```

**Mặc định mở sẵn câu sai, thu gọn câu đúng** — cái cần học nằm ở câu sai, nhưng câu
đúng vẫn xem lại được. Có bộ lọc *Chỉ xem câu sai*. Với `open_cloze` hiện **đủ mọi
cách viết được chấp nhận** (`due / owing`), để học sinh biết mình sai vì từ khác hay
chỉ vì chính tả.

Đề tắt cờ → màn kết quả y hệt hiện nay, chỉ điểm.

Không có nút "làm lại": `clearState()` đã chạy, muốn làm lại thì tải lại trang và nhập
mã từ đầu.

## 7. Bố cục file

`admin.js` hiện 332 dòng; thêm ba dạng editor + quản lý đề sẽ vượt 1000. Tách theo
ES modules (trình duyệt hỗ trợ sẵn, **vẫn không cần build step**):

```
admin.js            — bootstrap, đăng nhập, điều hướng
admin-api.js        — api() + toast() + esc()  (dùng chung)
admin-exams.js      — danh sách đề, form thông tin đề
admin-sections.js   — CRUD phần thi, 3 editor theo dạng
admin-results.js    — bảng kết quả, modal chi tiết, xuất Excel

app.js              — bootstrap, timer, localStorage
app-render.js       — 3 hàm render theo kind + render passage
app-result.js       — màn kết quả + phần ôn lại
```

Đổi `<script src="…">` thành `<script type="module" src="…">`.

**Phải thêm cả 7 file vào `.github/workflows/deploy.yml`** — workflow `cp` từng file
theo tên, quên là deploy thiếu file và trang trắng.

## 8. Dọn dẹp & di trú

- `supabase/schema.sql` — viết lại hoàn toàn, mở đầu bằng khối `drop table … cascade`
  và `drop function …` cho schema cũ.
- Xoá `data/questions.json`, `scripts/gen-seed.mjs`, `supabase/seed.sql` — không nguồn
  nào còn khớp. Bỏ lệnh `node scripts/gen-seed.mjs` khỏi CLAUDE.md; sau thay đổi này
  **không còn file nào chạy được deploy cần Node** (deploy vẫn thuần copy tĩnh).
- Thêm `tests/` chạy bằng `node --test` (Node ≥ 18, không `package.json`, không cài gói)
  và `tests/sql/` chạy trên Docker Postgres — xem §11. Đây là công cụ **chỉ dùng lúc dev**,
  không tham gia build hay deploy.
- Thêm `supabase/seed-demo.sql` dựng lại đúng hai đề mẫu CAE "Tap water" và FCE "Gold"
  để test ngay sau khi chạy schema.
- Cập nhật CLAUDE.md: kiến trúc mới, bảng mới, RPC mới, danh sách file mới.
- `mau-de.csv` giữ nguyên (vẫn đúng cho dạng `mcq`).

## 9. Phương án đã cân nhắc và loại bỏ

**Chuyển sang Next.js.** Loại. Supabase đã là backend: chấm điểm nằm trong RPC
`security definer` (an toàn hơn API route vì chạy trong DB), chặn hết hạn cũng nằm
trong DB. Next.js không thêm năng lực nào đang thiếu, mà bắt phải rời GitHub Pages,
thêm build step, và viết lại toàn bộ frontend sang React — rewrite thuần tuý, đồng
thời là cơ hội làm hỏng mô hình bảo mật đang đúng. Điểm đau thật (file admin phình to)
giải quyết bằng tách ES modules ở §7.

Đáng xét lại **khi nào** cần tài khoản đăng nhập cho học sinh, chống gian lận nghiêm
túc, hoặc nhiều giáo viên phân quyền riêng.

**Editor cloze WYSIWYG** (bấm nút chèn ô trống thay vì gõ `{{n}}`). Loại: đẹp hơn
nhưng phức tạp gấp bội và dễ vỡ khi dán nội dung có định dạng. Cách hiện tại thô
nhưng dán đề từ PDF vào rồi thêm dấu là xong, và giáo viên **nhìn thấy đúng thứ được
lưu**.

**Giữ view công khai `questions_public`.** Loại: với mã đề, view là đường lộ danh sách
mọi mã đang mở (§4.1).

## 10. Kiểm chứng schema

Toàn bộ DDL ở §3 đã chạy thật trên **PostgreSQL 16** (container tạm) trước khi chốt
spec — không phải suy luận trên giấy.

**Tạo schema:** thành công, không cảnh báo.

**10 ca dữ liệu sai — DB chặn đủ cả 10:**

| Ca | Constraint chặn |
|---|---|
| `mcq` thiếu `stem` | `content_shape` |
| `content = '{}'` cho `mcq` | `content_shape` |
| `open_cloze` lỡ mang `options` | `content_shape` |
| MCQ đáp án `'Z'` | `mcq_answer_valid` |
| MCQ hai đáp án `{A,B}` | `mcq_answer_valid` |
| `kind` lệch với section | FK ghép `(section_id, kind)` |
| `exam_id` lệch với section | FK ghép `(section_id, exam_id)` |
| Mã đề `'gold-8'` sai định dạng | `code_format` |
| `expires_at` trước `opens_at` | `window_valid` |
| Section `mcq` mà có `passage` | `passage_required` |

**2 ca hợp lệ lọt qua đúng như mong đợi:** `mcq_cloze` đủ 4 phương án;
`open_cloze` với `accepted_answers = {conversely,contrastingly}`.

**Hàm `is_correct` — 9 ca đều đúng:** MCQ đúng/thường/sai; cloze viết hoa; cloze khớp
đáp án thứ hai; cloze thừa khoảng trắng; chuỗi rỗng → sai; `NULL` → sai; sai từ → sai.

**Ba thao tác vận hành chạy được:**

- Đảo thứ tự hai phần trong **một transaction** — cần `deferrable initially deferred`
  trên `sections_position_uniq`, nếu không sẽ đụng khoá giữa chừng.
- Đảo số câu 1 ↔ 9 trong một transaction — cần `deferrable` trên `questions_number_uniq`.
- `delete from exams` → cascade sạch cả `sections` và `questions`.

**Lưu ý cú pháp:** `deferrable` **không dùng được** với khai báo `unique (…)` inline;
phải viết đầy đủ dạng `constraint <tên> unique (…) deferrable initially deferred`
như trong §3.2 và §3.3.

Mọi biểu thức trong `content_shape` bọc `coalesce` vì check constraint **trả NULL là
PASS** — thiếu `coalesce` thì `content = '{}'` lọt qua mọi nhánh. Đây là ca đã test
(ca số 2 trong bảng trên).

## 11. Chiến lược kiểm thử

Repo hiện **không có test suite**. Lần làm lại này thêm hai lớp test, cả hai
**zero dependency** — không `package.json`, không `npm install`, không tham gia deploy.

### 11.1 Test SQL — `tests/sql/`

Chạy schema thật trên Docker Postgres 16, khẳng định constraint và hàm chấm điểm.
Đây là lớp quan trọng nhất: DB là nơi giữ đúng đắn của cả hệ thống (§3.3, §4).

```bash
tests/sql/run.sh          # dựng container, chạy schema, chạy assertion, dọn
```

Bao gồm các ca đã kiểm chứng ở §10, cộng test cho ba RPC ở §4.3:
`exam_info` / `start_exam` không rò `accepted_answers`; `submit_quiz` chặn đề hết hạn;
`review` chỉ trả khi `show_explanations = true`.

### 11.2 Test JS — `tests/*.test.mjs`

Chạy bằng `node --test tests/` (Node ≥ 18 có sẵn runner, không cài gì).
Chỉ test **logic thuần, không DOM, không mạng** — tách thành module nhập được:

| Module | Hàm được test |
|---|---|
| `lib-passage.js` | `splitPassage(text)` → tách `{{n}}`, giữ thứ tự, bỏ qua `{{0}}` |
| `lib-passage.js` | `scanBlanks(text)` → danh sách số câu, phát hiện trùng |
| `lib-time.js` | `toUtcIso(local)` / `toLocalInput(iso)` → quy đổi `Asia/Ho_Chi_Minh` |
| `lib-csv.js` | `parseCsv` / `csvToQuestions` → gói 4 cột option thành `content.options` |

`lib-csv.js` dùng chung giữa Edge Function `admin` (Deno) và test (Node) — cả hai đều
nhập ES module, không phải viết hai bản.

**Không test bằng công cụ tự động:** render DOM, gọi Supabase thật, giao diện. Những
phần này verify thủ công theo kịch bản ghi trong plan.
