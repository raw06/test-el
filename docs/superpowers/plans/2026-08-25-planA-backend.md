# Plan A — Backend: Schema, RPC, Edge Function admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay toàn bộ schema cũ bằng mô hình `exams → sections → questions` hỗ trợ nhiều đề và ba dạng câu hỏi, kèm ba RPC cho học sinh và Edge Function `admin` quản lý đề.

**Architecture:** Postgres giữ toàn bộ tính đúng đắn — constraint chặn dữ liệu sai shape, RPC `security definer` là cửa duy nhất anon chạm tới dữ liệu (không còn view công khai). Edge Function `admin` dùng service-role key sau lớp kiểm `x-admin-token`. Frontend hoàn toàn không đụng tới trong plan này.

**Tech Stack:** PostgreSQL 16 (Supabase), Deno (Edge Functions), Docker (chỉ để chạy test), `node --test` (Node ≥ 18, không cài gói).

**Spec:** `docs/superpowers/specs/2026-08-25-nhieu-de-va-dang-cau-hoi-design.md`

## Global Constraints

- Toàn bộ UI text, comment, commit message dùng **tiếng Việt** có dấu đầy đủ.
- Thời gian hiển thị format `'vi-VN'`, timezone `'Asia/Ho_Chi_Minh'`.
- `SUPABASE_SERVICE_ROLE_KEY` **chỉ** tồn tại trong Edge Functions, không bao giờ vào client.
- Đáp án (`accepted_answers`) và `explanation` **không bao giờ** được select trong `exam_info` / `start_exam`.
- Mã đề khớp `^[A-Z0-9]{3,12}$`, luôn `upper(btrim(...))` trước khi so.
- Edge Function `admin` deploy `--no-verify-jwt` → **mọi** action mới phải nằm sau lớp kiểm `x-admin-token` ở đầu handler.
- Không thêm `package.json`, không `npm install`. Test chạy bằng `node --test` và Docker.
- SQL chạy thủ công qua SQL Editor trên dashboard Supabase — không dùng migration tool.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/schema.sql` | **Viết lại toàn bộ** — drop schema cũ, tạo 4 bảng, RLS, 5 hàm |
| `supabase/seed-demo.sql` | Hai đề mẫu CAE "Tap water" + FCE "Gold" để test ngay |
| `tests/sql/run.sh` | Dựng Docker Postgres, chạy schema + assertion, dọn |
| `tests/sql/01-constraints.sql` | 10 ca dữ liệu sai phải bị chặn + 2 ca hợp lệ |
| `tests/sql/02-rpc.sql` | RLS, 3 RPC, không rò đáp án, chấm điểm |
| `supabase/functions/admin/index.ts` | Thêm action cho exams/sections/questions |
| `supabase/functions/admin/lib-csv.ts` | Tách parser CSV ra để test được |
| `tests/lib-csv.test.mjs` | Test parser CSV bằng `node --test` |

Xoá: `data/questions.json`, `scripts/gen-seed.mjs`, `supabase/seed.sql`.

---

### Task 1: Hạ tầng test SQL

**Files:**
- Create: `tests/sql/run.sh`, `tests/sql/00-noop.sql`

**Interfaces:**
- Produces: `tests/sql/run.sh` — chạy mọi file `tests/sql/[0-9]*.sql` theo thứ tự tên trên một Postgres 16 sạch, exit code khác 0 nếu bất kỳ assertion nào fail.

- [ ] **Step 1: Viết runner**

```bash
#!/usr/bin/env bash
# Chạy test schema trên Postgres 16 trong Docker. Không cần cài psql trên máy.
set -euo pipefail
cd "$(dirname "$0")/../.."
C=quiz_test_pg

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ Dựng Postgres 16…"
docker run -d --rm --name "$C" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "→ Nạp schema.sql…"
docker exec -i "$C" psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/schema.sql

fail=0
for f in tests/sql/[0-9]*.sql; do
  echo "→ $f"
  # ON_ERROR_STOP=0: các file test cố tình gây lỗi để kiểm chứng constraint.
  # Assertion thật dùng hàm assert_* nên lỗi thật vẫn bị bắt.
  if ! docker exec -i "$C" psql -U postgres -q -v ON_ERROR_STOP=0 < "$f" 2>&1 | tee /tmp/quiz_test_out; then
    fail=1
  fi
  if grep -q '^ASSERT-FAIL' /tmp/quiz_test_out; then
    echo "  ✗ có assertion thất bại"; fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "✓ TẤT CẢ TEST SQL PASS" || { echo "✗ CÓ TEST FAIL"; exit 1; }
```

- [ ] **Step 2: Viết file test rỗng để kiểm runner**

`tests/sql/00-noop.sql`:
```sql
-- Kiểm chính runner: hàm assert dùng chung cho mọi file test sau.
create or replace function assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok   — %', p_label;
  else raise notice 'ASSERT-FAIL — %', p_label;
  end if;
end $$;

select assert(true, 'runner chạy được');
```

- [ ] **Step 3: Chạy để xác nhận runner hoạt động**

Run: `chmod +x tests/sql/run.sh && ./tests/sql/run.sh`
Expected: FAIL — `supabase/schema.sql` vẫn là schema cũ nên bước nạp có thể qua, nhưng đây là baseline. Ghi lại output.

- [ ] **Step 4: Commit**

```bash
git add tests/sql/run.sh tests/sql/00-noop.sql
git commit -m "test: thêm runner test SQL trên Docker Postgres"
```

---

### Task 2: Schema mới — 4 bảng + RLS

**Files:**
- Modify: `supabase/schema.sql` (viết lại hoàn toàn)
- Create: `tests/sql/01-constraints.sql`

**Interfaces:**
- Produces: bảng `exams`, `sections`, `questions`, `submissions` với các constraint tên `code_format`, `window_valid`, `passage_required`, `content_shape`, `mcq_answer_valid`, `sections_position_uniq`, `questions_number_uniq`.

- [ ] **Step 1: Viết test constraint TRƯỚC**

`tests/sql/01-constraints.sql` — mỗi ca sai bọc trong block bắt lỗi, dùng `assert` từ `00-noop.sql`:

```sql
-- Dữ liệu nền
insert into exams(code,title,is_published) values ('T01','Đề test',true);
insert into sections(exam_id,position,kind,passage) values (1,1,'mcq_cloze','Gold is {{1}} metal');
insert into sections(exam_id,position,kind) values (1,2,'mcq');
insert into sections(exam_id,position,kind,passage) values (1,3,'open_cloze','factors {{9}} play');

-- Helper: chạy SQL, trả true nếu BỊ CHẶN (đúng như mong đợi)
create or replace function blocked(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql; return false;   -- chạy lọt = KHÔNG bị chặn
exception when others then return true;
end $$;

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (2,1,'mcq',20,'{"options":{"a":"1","b":"2","c":"3","d":"4"}}','{A}')$$),
  'mcq thiếu stem bị chặn');

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (2,1,'mcq',21,'{}','{A}')$$),
  'mcq content rỗng bị chặn');

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (3,1,'open_cloze',10,'{"options":{"a":"x","b":"y","c":"z","d":"w"}}','{at}')$$),
  'open_cloze mang options bị chặn');

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (1,1,'mcq_cloze',2,'{"options":{"a":"1","b":"2","c":"3","d":"4"}}','{Z}')$$),
  'MCQ đáp án Z bị chặn');

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (1,1,'mcq_cloze',3,'{"options":{"a":"1","b":"2","c":"3","d":"4"}}','{A,B}')$$),
  'MCQ hai đáp án bị chặn');

select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (1,1,'mcq',4,'{"stem":"x","options":{"a":"1","b":"2","c":"3","d":"4"}}','{A}')$$),
  'kind lệch section bị chặn');

insert into exams(code,title,is_published) values ('T02','Đề hai',true);
select assert(blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (1,2,'mcq_cloze',5,'{"options":{"a":"1","b":"2","c":"3","d":"4"}}','{A}')$$),
  'exam_id lệch section bị chặn');

select assert(blocked($$insert into exams(code,title) values ('gold-8','x')$$),
  'mã đề sai định dạng bị chặn');

select assert(blocked($$insert into exams(code,title,opens_at,expires_at)
  values ('ZZZ9','x', now()+interval '2h', now())$$),
  'hết hạn trước khi mở bị chặn');

select assert(blocked($$insert into sections(exam_id,position,kind,passage)
  values (1,9,'mcq','abc')$$),
  'section mcq có passage bị chặn');

-- HAI CA HỢP LỆ phải lọt qua
select assert(not blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (1,1,'mcq_cloze',1,'{"options":{"a":"greatly","b":"mostly","c":"highly","d":"largely"}}','{C}')$$),
  'mcq_cloze hợp lệ lọt qua');

select assert(not blocked($$insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
  values (3,1,'open_cloze',9,'{}','{conversely,contrastingly}')$$),
  'open_cloze nhiều đáp án lọt qua');

-- Thao tác vận hành cần deferrable
do $$ begin
  update sections set position = 99 where id = 1;
  update sections set position = 1  where id = 3;
  update sections set position = 3  where id = 1;
end $$;
select assert(true, 'đảo thứ tự phần trong 1 transaction chạy được');

delete from exams where code='T01';
select assert((select count(*) from questions) = 0, 'xoá đề cascade sạch questions');
select assert((select count(*) from sections)  = 0, 'xoá đề cascade sạch sections');
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `./tests/sql/run.sh`
Expected: FAIL ở bước nạp schema — bảng `exams` chưa tồn tại.

- [ ] **Step 3: Viết schema mới**

Thay **toàn bộ** `supabase/schema.sql`. Mở đầu bằng khối drop, rồi 4 bảng:

```sql
-- ⚠️ Chạy file này sẽ XOÁ SẠCH dữ liệu cũ (đề và kết quả đã nộp).

drop function if exists public.submit_quiz(text,text,text,jsonb) cascade;
drop function if exists public.submit_quiz(text,text,jsonb)      cascade;
drop function if exists public.start_exam(text)                  cascade;
drop function if exists public.exam_info(text)                   cascade;
drop function if exists public.exam_by_code(text)                cascade;
drop function if exists public.is_correct(text[],text)           cascade;
drop view  if exists public.questions_public cascade;
drop view  if exists public.settings_public  cascade;
drop table if exists public.submissions cascade;
drop table if exists public.questions   cascade;
drop table if exists public.sections    cascade;
drop table if exists public.exams       cascade;
drop table if exists public.settings    cascade;

-- ===== Đề kiểm tra =====
create table public.exams (
  id                bigint generated always as identity primary key,
  code              text not null unique,
  title             text not null,
  subtitle          text not null default '',
  duration_min      int  not null default 60 check (duration_min between 1 and 600),
  opens_at          timestamptz,
  expires_at        timestamptz,
  is_published      boolean not null default false,
  show_explanations boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint code_format  check (code ~ '^[A-Z0-9]{3,12}$'),
  constraint window_valid check (opens_at is null or expires_at is null or opens_at < expires_at)
);

-- ===== Phần thi: một dạng câu hỏi + (nếu cloze) một đoạn văn =====
create table public.sections (
  id           bigint generated always as identity primary key,
  exam_id      bigint not null references public.exams(id) on delete cascade,
  position     int  not null,
  kind         text not null check (kind in ('mcq','open_cloze','mcq_cloze')),
  title        text not null default '',
  instructions text not null default '',
  passage      text,   -- chứa {{9}} {{10}}… đánh dấu chỗ trống
  example      text,
  constraint passage_required check (
    (kind = 'mcq' and passage is null) or (kind <> 'mcq' and passage is not null)),
  -- deferrable: đổi thứ tự hai phần trong một transaction không đụng khoá giữa chừng
  constraint sections_position_uniq unique (exam_id, position) deferrable initially deferred,
  constraint sections_id_exam_uniq  unique (id, exam_id),  -- cho FK ghép ở questions
  constraint sections_id_kind_uniq  unique (id, kind)      -- cho FK ghép ở questions
);

-- ===== Câu hỏi =====
create table public.questions (
  id          bigint generated always as identity primary key,
  section_id  bigint not null,
  exam_id     bigint not null,  -- denormalize: number đánh liên tục toàn đề
  kind        text   not null,  -- bản sao sections.kind; FK ghép ép luôn khớp
  number      int    not null,
  content     jsonb  not null default '{}'::jsonb,
  accepted_answers text[] not null check (cardinality(accepted_answers) >= 1),
  explanation text,

  foreign key (section_id, exam_id) references public.sections(id, exam_id) on delete cascade,
  foreign key (section_id, kind)    references public.sections(id, kind)    on delete cascade,

  -- coalesce ở mọi vế: check constraint trả NULL là PASS, thiếu coalesce thì '{}' lọt hết.
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
    end),

  constraint mcq_answer_valid check (
    kind = 'open_cloze'
    or (cardinality(accepted_answers) = 1 and accepted_answers[1] in ('A','B','C','D'))),

  constraint questions_number_uniq unique (exam_id, number) deferrable initially deferred
);
create index questions_exam_number_idx on public.questions (exam_id, number);

-- ===== Bài nộp =====
create table public.submissions (
  id         bigint generated always as identity primary key,
  exam_id    bigint not null references public.exams(id) on delete cascade,
  full_name  text not null,
  class_name text not null,
  score      int not null,
  total      int not null,
  answers    jsonb not null,   -- {"9":"at", "1":"C"}
  created_at timestamptz not null default now()
);
create index submissions_exam_idx on public.submissions (exam_id, id desc);

-- ===== RLS: KHÔNG policy nào cho anon trên cả 4 bảng =====
alter table public.exams       enable row level security;
alter table public.sections    enable row level security;
alter table public.questions   enable row level security;
alter table public.submissions enable row level security;
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `./tests/sql/run.sh`
Expected: `✓ TẤT CẢ TEST SQL PASS`, 14 dòng `ok   —`, không dòng nào `ASSERT-FAIL`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql tests/sql/01-constraints.sql
git commit -m "feat(db): schema mới exams/sections/questions cho nhiều đề và 3 dạng câu hỏi"
```

---

### Task 3: Hàm chấm điểm và tra đề

**Files:**
- Modify: `supabase/schema.sql` (thêm vào cuối)
- Create: `tests/sql/02-rpc.sql`

**Interfaces:**
- Produces:
  - `is_correct(p_accepted text[], p_given text) → boolean` — so khớp bỏ qua hoa/thường và khoảng trắng thừa; chuỗi rỗng và NULL đều trả `false`.
  - `exam_by_code(p_code text) → public.exams` — hàm **nội bộ**, không cấp cho anon; ném lỗi tiếng Việt khi mã sai / chưa mở / hết hạn.

- [ ] **Step 1: Viết test hàm TRƯỚC**

Thêm vào đầu `tests/sql/02-rpc.sql`:

```sql
select assert(is_correct('{C}','C'),                                 'MCQ đúng');
select assert(is_correct('{C}','c'),                                 'MCQ viết thường vẫn đúng');
select assert(not is_correct('{C}','A'),                             'MCQ sai');
select assert(is_correct('{conversely,contrastingly}','Conversely'), 'cloze viết hoa vẫn đúng');
select assert(is_correct('{conversely,contrastingly}','contrastingly'),'cloze khớp đáp án thứ hai');
select assert(is_correct('{at}','  At  '),                           'cloze thừa khoảng trắng vẫn đúng');
select assert(not is_correct('{at}',''),                             'chuỗi rỗng là sai');
select assert(not is_correct('{at}',null),                           'không nộp là sai');
select assert(not is_correct('{at}','the'),                          'sai từ là sai');
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `./tests/sql/run.sh`
Expected: lỗi `function is_correct(unknown, unknown) does not exist`.

- [ ] **Step 3: Viết hai hàm**

Thêm vào cuối `supabase/schema.sql`:

```sql
-- ===== So khớp đáp án: bỏ qua hoa/thường và khoảng trắng thừa =====
create or replace function public.is_correct(p_accepted text[], p_given text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(p_accepted) a
    where btrim(coalesce(p_given, '')) <> ''
      and lower(btrim(a)) = lower(btrim(p_given)));
$$;

-- ===== Tra đề theo mã + kiểm cửa sổ thời gian. Hàm NỘI BỘ, không cấp cho anon. =====
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

revoke all on function public.exam_by_code(text) from public;
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `./tests/sql/run.sh`
Expected: 9 dòng `ok   —` cho `is_correct`, không `ASSERT-FAIL`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql tests/sql/02-rpc.sql
git commit -m "feat(db): hàm is_correct và exam_by_code"
```

---

### Task 4: Ba RPC cho học sinh

**Files:**
- Modify: `supabase/schema.sql` (thêm vào cuối)
- Modify: `tests/sql/02-rpc.sql` (thêm test)

**Interfaces:**
- Consumes: `exam_by_code`, `is_correct` (Task 3).
- Produces:
  - `exam_info(p_code text) → jsonb` — `{code, title, subtitle, duration_min, total, expires_at, show_explanations}`.
  - `start_exam(p_code text) → jsonb` — `{code, title, subtitle, duration_min, expires_at, sections:[{id, position, kind, title, instructions, passage, example, questions:[{number, content}]}]}`.
  - `submit_quiz(p_code text, p_full_name text, p_class text, p_answers jsonb) → jsonb` — `{score, total, review}` với `review` là `null` khi đề tắt cờ, ngược lại là mảng `{number, section_id, chosen, is_correct, accepted, explanation}`.

- [ ] **Step 1: Viết test RPC TRƯỚC**

Thêm vào `tests/sql/02-rpc.sql`:

```sql
-- Dữ liệu nền cho phần RPC
insert into exams(code,title,subtitle,duration_min,is_published,show_explanations)
values ('GOLD8','FCE Gold','Part 1',45,true,true);
insert into sections(exam_id,position,kind,title,instructions,passage,example)
values ((select id from exams where code='GOLD8'),1,'mcq_cloze','Part 1',
  'For questions 1-8, decide which answer best fits each gap.',
  'Gold has remained a {{1}} desirable possession. Its history {{2}} back to Egypt.',
  'Example: (0) B change');
insert into questions(section_id,exam_id,kind,number,content,accepted_answers,explanation)
select s.id, s.exam_id, 'mcq_cloze', 1,
  '{"options":{"a":"greatly","b":"mostly","c":"highly","d":"largely"}}','{C}',
  'highly collocates with "desirable".'
from sections s join exams e on e.id=s.exam_id where e.code='GOLD8';

insert into exams(code,title,is_published,show_explanations) values ('NOEXP','Tắt lời giải',true,false);
insert into sections(exam_id,position,kind) values ((select id from exams where code='NOEXP'),1,'mcq');
insert into questions(section_id,exam_id,kind,number,content,accepted_answers)
select s.id, s.exam_id, 'mcq', 1,
  '{"stem":"He ___ to school.","options":{"a":"go","b":"goes","c":"going","d":"gone"}}','{B}'
from sections s join exams e on e.id=s.exam_id where e.code='NOEXP';

insert into exams(code,title,is_published) values ('DRAFT1','Đề nháp',false);
insert into exams(code,title,is_published,expires_at) values ('OLD1','Hết hạn',true, now()-interval '1 day');
insert into exams(code,title,is_published,opens_at)   values ('SOON1','Chưa mở',true, now()+interval '1 day');

-- Không rò đáp án
select assert(not (start_exam('GOLD8')::text like '%accepted_answers%'),
  'start_exam KHÔNG rò accepted_answers');
select assert(not (start_exam('GOLD8')::text like '%explanation%'),
  'start_exam KHÔNG rò explanation');
select assert(not (start_exam('GOLD8')::text like '%collocates%'),
  'start_exam KHÔNG rò nội dung lời giải');
select assert(not (exam_info('GOLD8')::text like '%options%'),
  'exam_info KHÔNG trả câu hỏi');

-- Trả đúng dữ liệu
select assert(exam_info('GOLD8')->>'title' = 'FCE Gold',        'exam_info trả tên đề');
select assert((exam_info('GOLD8')->>'total')::int = 1,          'exam_info đếm đúng số câu');
select assert(exam_info('gold8')->>'code' = 'GOLD8',            'mã viết thường vẫn tra được');
select assert(jsonb_array_length(start_exam('GOLD8')->'sections') = 1, 'start_exam trả 1 phần');
select assert(start_exam('GOLD8')->'sections'->0->>'passage' like '%{{1}}%',
  'start_exam giữ nguyên dấu {{n}} trong passage');

-- Các ca phải bị chặn
select assert(blocked($$select exam_info('DRAFT1')$$), 'đề nháp bị chặn');
select assert(blocked($$select exam_info('NOPE9')$$),  'mã không tồn tại bị chặn');
select assert(blocked($$select exam_info('OLD1')$$),   'đề hết hạn bị chặn');
select assert(blocked($$select exam_info('SOON1')$$),  'đề chưa mở bị chặn');
select assert(blocked($$select submit_quiz('OLD1','A','12A1','{"1":"B"}')$$),
  'nộp bài vào đề hết hạn bị chặn');
select assert(blocked($$select submit_quiz('GOLD8','   ','12A1','{"1":"C"}')$$),
  'thiếu họ tên bị chặn');

-- Chấm điểm
select assert((submit_quiz('GOLD8','Nguyễn Văn A','12A1','{"1":"C"}')->>'score')::int = 1,
  'chấm đúng câu MCQ');
select assert((submit_quiz('GOLD8','Lê C','12A3','{"1":"A"}')->>'score')::int = 0,
  'chấm sai câu MCQ');
select assert(submit_quiz('NOEXP','Trần B','12A2','{"1":"B"}')->'review' = 'null'::jsonb,
  'đề tắt cờ thì review là null');
select assert(jsonb_array_length(submit_quiz('GOLD8','Phạm D','12A4','{"1":"C"}')->'review') = 1,
  'đề bật cờ thì review có dữ liệu');
select assert(submit_quiz('GOLD8','Vũ E','12A5','{}')->'review'->0->>'chosen' is null,
  'câu bỏ trống có chosen = null');
select assert((select count(*) from submissions s join exams e on e.id=s.exam_id
                    where e.code in ('GOLD8','NOEXP')) = 5, 'mọi lượt nộp đều được ghi');

-- anon không đọc được bảng gốc
set role anon;
select assert(blocked($$select count(*) from questions$$), 'anon KHÔNG select được questions');
select assert(blocked($$select count(*) from exams$$),     'anon KHÔNG select được exams');
select assert(blocked($$select exam_by_code('GOLD8')$$),   'anon KHÔNG gọi được exam_by_code');
select assert(exam_info('GOLD8')->>'code' = 'GOLD8',       'anon GỌI ĐƯỢC exam_info');
reset role;
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `./tests/sql/run.sh`
Expected: lỗi `function start_exam(unknown) does not exist`.

- [ ] **Step 3: Viết ba RPC**

Thêm vào cuối `supabase/schema.sql`. **Chú ý `start_exam`**: subquery phải đặt tên alias và `order by t.position` — viết `order by s.position` khi `s` là cột jsonb sẽ lỗi `missing FROM-clause entry`.

```sql
-- ===== Sau khi nhập mã, TRƯỚC khi bắt đầu: chỉ meta, không câu hỏi nào =====
create or replace function public.exam_info(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.exams; v_total int;
begin
  e := public.exam_by_code(p_code);
  select count(*) into v_total from public.questions q where q.exam_id = e.id;
  return jsonb_build_object(
    'code', e.code, 'title', e.title, 'subtitle', e.subtitle,
    'duration_min', e.duration_min, 'total', v_total,
    'expires_at', e.expires_at, 'show_explanations', e.show_explanations);
end $$;

-- ===== Bấm Bắt đầu: trả cả đề, KHÔNG kèm accepted_answers/explanation =====
create or replace function public.start_exam(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.exams; v_sections jsonb;
begin
  e := public.exam_by_code(p_code);
  select coalesce(jsonb_agg(t.obj order by t.position), '[]'::jsonb) into v_sections
  from (
    select sec.position,
           jsonb_build_object(
             'id', sec.id, 'position', sec.position, 'kind', sec.kind,
             'title', sec.title, 'instructions', sec.instructions,
             'passage', sec.passage, 'example', sec.example,
             'questions', coalesce((
               select jsonb_agg(jsonb_build_object('number', q.number, 'content', q.content)
                                order by q.number)
               from public.questions q where q.section_id = sec.id), '[]'::jsonb)
           ) as obj
    from public.sections sec where sec.exam_id = e.id
  ) t;
  return jsonb_build_object(
    'code', e.code, 'title', e.title, 'subtitle', e.subtitle,
    'duration_min', e.duration_min, 'expires_at', e.expires_at, 'sections', v_sections);
end $$;

-- ===== Chấm và ghi. Đáp án chỉ rời DB SAU KHI bài đã được lưu. =====
create or replace function public.submit_quiz(
  p_code text, p_full_name text, p_class text, p_answers jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.exams; v_score int; v_total int; v_review jsonb;
begin
  -- Kiểm hạn CẢ khi nộp, không chỉ khi bắt đầu: mở đề sớm rồi ngồi lỳ vẫn bị chặn.
  e := public.exam_by_code(p_code);
  if coalesce(btrim(p_full_name), '') = '' or coalesce(btrim(p_class), '') = '' then
    raise exception 'Họ tên và lớp là bắt buộc.';
  end if;
  if jsonb_typeof(coalesce(p_answers, 'null'::jsonb)) <> 'object' then
    raise exception 'Dữ liệu bài làm không hợp lệ.';
  end if;

  select count(*),
         count(*) filter (where public.is_correct(q.accepted_answers, p_answers ->> q.number::text))
    into v_total, v_score
  from public.questions q where q.exam_id = e.id;

  insert into public.submissions(exam_id, full_name, class_name, score, total, answers)
  values (e.id, btrim(p_full_name), btrim(p_class), v_score, v_total, p_answers);

  if e.show_explanations then
    select jsonb_agg(jsonb_build_object(
      'number', q.number, 'section_id', q.section_id,
      'chosen', p_answers ->> q.number::text,
      'is_correct', public.is_correct(q.accepted_answers, p_answers ->> q.number::text),
      'accepted', to_jsonb(q.accepted_answers),
      'explanation', q.explanation) order by q.number)
      into v_review
    from public.questions q where q.exam_id = e.id;
  end if;

  return jsonb_build_object('score', v_score, 'total', v_total,
                            'review', coalesce(v_review, 'null'::jsonb));
end $$;

-- ===== Quyền: anon chỉ execute 3 hàm này, không hơn =====
revoke all on function public.exam_info(text)                      from public;
revoke all on function public.start_exam(text)                     from public;
revoke all on function public.submit_quiz(text,text,text,jsonb)    from public;
grant execute on function public.exam_info(text)                      to anon;
grant execute on function public.start_exam(text)                     to anon;
grant execute on function public.submit_quiz(text,text,text,jsonb)    to anon;
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `./tests/sql/run.sh`
Expected: `✓ TẤT CẢ TEST SQL PASS`. Đặc biệt phải thấy 4 dòng `ok — start_exam KHÔNG rò …` và `ok — anon KHÔNG select được questions`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql tests/sql/02-rpc.sql
git commit -m "feat(db): ba RPC exam_info, start_exam, submit_quiz cho học sinh"
```

---

### Task 5: Seed hai đề mẫu

**Files:**
- Create: `supabase/seed-demo.sql`
- Delete: `data/questions.json`, `scripts/gen-seed.mjs`, `supabase/seed.sql`

**Interfaces:**
- Produces: hai đề `TAP8` (open_cloze, 8 câu 9–16) và `GOLD8` (mcq_cloze, 8 câu 1–8) dựng từ đúng nội dung hai file PDF gốc.

- [ ] **Step 1: Viết seed**

`supabase/seed-demo.sql` — nội dung lấy nguyên văn từ hai đề gốc:

```sql
-- Hai đề mẫu để test ngay sau khi chạy schema.sql.
-- Nguồn: engexam.info — CAE Use of English Part 2 Test 8, FCE Use of English Part 1 Test 3.

-- ===== Đề 1: CAE Part 2 — điền từ =====
insert into public.exams(code, title, subtitle, duration_min, is_published, show_explanations)
values ('TAP8', 'CAE Test 8 — Tap water', 'Use of English Part 2', 30, true, true);

insert into public.sections(exam_id, position, kind, title, instructions, passage, example)
select id, 1, 'open_cloze', 'Part 2',
  'For questions 9-16, read the text below and think of the word which best fits each gap. Use only one word in each gap. There is an example at the beginning (0).',
  'Tap water

Whenever you visit a foreign country for the first time, one of the things on your mind should be {{0}} safe it is to drink water straight from the tap. There are several factors {{9}} play here, two of them are particularly notable.

One of the reasons it might not be a good idea to drink water, especially in older areas of cities, is {{10}} to its high lead content. The lead itself comes from old pipes as they get increasingly corroded {{11}} the years. This, of course, gets worse if you take into account all the deposits that accumulate inside the pipes over decades. All this gunk then finds {{12}} way to people''s kitchens and bathrooms. Needless to say, a separate filtration system is obligatory if you are planning to drink or cook {{13}} that water.

In {{14}} to safeguard people from contracting water-bourne diseases and viruses, the process of chlorination is used. Essentially, it is the same thing they put in pools, but in much smaller quantities. While ensuring that the water is germ-free, it also alters its taste, sometimes rendering water undrinkable.

Cities in Canada, the USA as well as in most European countries boast tap water that requires {{15}} additional filtration, meaning that you can drink it right from the tap. {{16}}, people are dissuaded from drinking tap water in almost every country of the African continent.',
  'Example: (0) HOW'
from public.exams where code = 'TAP8';

insert into public.questions(section_id, exam_id, kind, number, content, accepted_answers, explanation)
select s.id, s.exam_id, 'open_cloze', v.number, '{}'::jsonb, v.answers, v.explanation
from public.sections s
join public.exams e on e.id = s.exam_id
cross join (values
  (9,  '{at}'::text[],   'A factor at play is one that affects the condition or the outcome of something.'),
  (10, '{due}',          'We commonly use "owing" with positive influences or conditions, and "due" with something negative or undesirable.'),
  (11, '{over}',         'The focus here is that the process of corrosion is gradual, happening over many years.'),
  (12, '{its}',          'A possessive pronoun here that refers to gunk — something unpleasant and sticky.'),
  (13, '{with}',         'If you cook with something, you use it as an ingredient in cooking.'),
  (14, '{order}',        '"In order to do something" means to do it with the purpose of achieving something.'),
  (15, '{no}',           '"Little" is not a good answer contextually — this water needs no additional filtration at all.'),
  (16, '{conversely,contrastingly}', 'Both introductory words add contrast to the two parts of the sentence.')
) as v(number, answers, explanation)
where e.code = 'TAP8';

-- ===== Đề 2: FCE Part 1 — trắc nghiệm trong đoạn văn =====
insert into public.exams(code, title, subtitle, duration_min, is_published, show_explanations)
values ('GOLD8', 'FCE Test 3 — Gold', 'Use of English Part 1', 20, true, true);

insert into public.sections(exam_id, position, kind, title, instructions, passage, example)
select id, 1, 'mcq_cloze', 'Part 1',
  'For questions 1-8, read the text below and decide which answer (A, B, C or D) best fits each gap. There is an example at the beginning (0).',
  'Gold

Gold is a metal that can {{0}} in colour from bright yellow to white, to even copper red. Throughout human history gold has remained a {{1}} desirable possession.

The history of gold in human culture {{2}} back to Ancient Egypt. Egyptians used it to create tools as well as jewellery and associated the glitter of gold {{3}} the Sun. Later gold found its use in money in the {{4}} of coins. This ensured that coins keep their value as they are made from the {{5}} metal.

Until recently, gold has mostly been used because of its attractive, shiny texture. Nowadays, it has found {{6}} in electronics thanks to its great conductive {{7}}. Surprisingly, it is even used in culinary art, however only for the most expensive of {{8}}.',
  'Example: (0) B change'
from public.exams where code = 'GOLD8';

insert into public.questions(section_id, exam_id, kind, number, content, accepted_answers, explanation)
select s.id, s.exam_id, 'mcq_cloze', v.number, v.content::jsonb, v.answer, v.explanation
from public.sections s
join public.exams e on e.id = s.exam_id
cross join (values
  (1, '{"options":{"a":"greatly","b":"mostly","c":"highly","d":"largely"}}', '{C}'::text[],
      'highly. This is the only adverb that collocates with "desirable" to convey "very or extremely desirable". "Largely" and "mostly" mean "more often than not".'),
  (2, '{"options":{"a":"travels","b":"takes","c":"dates","d":"leads"}}', '{C}',
      'dates. To date back is to exist from some particular time in the past. To take back means to take somebody into the past, figuratively.'),
  (3, '{"options":{"a":"as","b":"with","c":"of","d":"on"}}', '{B}',
      'with. "To associate with" is to make a mental connection, e.g. "Expensive cars are often associated with wealth and speed".'),
  (4, '{"options":{"a":"form","b":"way","c":"size","d":"item"}}', '{A}',
      'form. "In the form of" means money was one of the many ways to use gold. "Way" does not have this meaning in the given phrasing.'),
  (5, '{"options":{"a":"costly","b":"luxurious","c":"expensive","d":"precious"}}', '{D}',
      'precious. Another collocation is "precious metal". All the other adjectives work here, but "precious" is preferable.'),
  (6, '{"options":{"a":"usefulness","b":"aim","c":"application","d":"purpose"}}', '{C}',
      'application. "To find application" means to discover a way to be useful. "To find purpose" is normally used about people, not inanimate objects.'),
  (7, '{"options":{"a":"properties","b":"means","c":"peculiarities","d":"tendencies"}}', '{A}',
      'properties. A property is the ability of something to do something. Conductive property is the ability to conduct electricity.'),
  (8, '{"options":{"a":"foods","b":"portions","c":"servings","d":"dishes"}}', '{D}',
      'dishes. "Foods" refers to different kinds of food. "Portions" and "servings" refer to the amount of food served.')
) as v(number, content, answer, explanation)
where e.code = 'GOLD8';
```

- [ ] **Step 2: Chạy seed trên container test để xác nhận không lỗi**

```bash
docker run -d --rm --name seedtest -e POSTGRES_PASSWORD=x postgres:16-alpine
sleep 5
docker exec -i seedtest psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/schema.sql
docker exec -i seedtest psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/seed-demo.sql
docker exec -i seedtest psql -U postgres -c \
  "select code, (select count(*) from questions q where q.exam_id=e.id) as so_cau from exams e;"
docker rm -f seedtest
```
Expected: `TAP8 | 8` và `GOLD8 | 8`.

- [ ] **Step 3: Xoá ba file lỗi thời**

```bash
git rm data/questions.json scripts/gen-seed.mjs supabase/seed.sql
rmdir data scripts 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/seed-demo.sql
git commit -m "feat(db): seed hai đề mẫu CAE Tap water và FCE Gold, xoá seed cũ"
```

---

### Task 6: Tách và test parser CSV

**Files:**
- Create: `supabase/functions/admin/lib-csv.ts`, `tests/lib-csv.test.mjs`
- Modify: `supabase/functions/admin/index.ts:15-67` (bỏ parser, import từ lib)

**Interfaces:**
- Produces:
  - `parseCsv(text: string) → string[][]` — giữ nguyên hành vi hiện tại (hỗ trợ ngoặc kép, xuống dòng trong ô, bỏ BOM).
  - `csvToQuestions(text: string) → Array<{number, content, accepted_answers, explanation}>` — gói 4 cột `option_*` thành `content.options`, `correct` thành `accepted_answers`.

- [ ] **Step 1: Viết test TRƯỚC**

`tests/lib-csv.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, csvToQuestions } from '../supabase/functions/admin/lib-csv.ts';

const HEADER = 'number,content,option_a,option_b,option_c,option_d,correct';

test('parseCsv: bỏ BOM và tách dòng', () => {
  const rows = parseCsv('﻿a,b\n1,2\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: ô có ngoặc kép chứa dấu phẩy', () => {
  const rows = parseCsv('a,b\n"x, y",z\n');
  assert.deepEqual(rows[1], ['x, y', 'z']);
});

test('parseCsv: ngoặc kép lồng bên trong ô', () => {
  const rows = parseCsv('a\n"nói ""xin chào"""\n');
  assert.equal(rows[1][0], 'nói "xin chào"');
});

test('csvToQuestions: gói option thành content.options', () => {
  const [q] = csvToQuestions(`${HEADER}\n1,He ___ home.,go,goes,going,gone,B`);
  assert.equal(q.number, 1);
  assert.equal(q.content.stem, 'He ___ home.');
  assert.deepEqual(q.content.options, { a: 'go', b: 'goes', c: 'going', d: 'gone' });
  assert.deepEqual(q.accepted_answers, ['B']);
});

test('csvToQuestions: correct viết thường vẫn nhận', () => {
  const [q] = csvToQuestions(`${HEADER}\n1,x,a,b,c,d,b`);
  assert.deepEqual(q.accepted_answers, ['B']);
});

test('csvToQuestions: cột explanation là tuỳ chọn', () => {
  const [q1] = csvToQuestions(`${HEADER}\n1,x,a,b,c,d,A`);
  assert.equal(q1.explanation, null);
  const [q2] = csvToQuestions(`${HEADER},explanation\n1,x,a,b,c,d,A,Vì thế này.`);
  assert.equal(q2.explanation, 'Vì thế này.');
});

test('csvToQuestions: thiếu cột bắt buộc thì báo lỗi tiếng Việt', () => {
  assert.throws(() => csvToQuestions('number,content\n1,x'), /thiếu cột bắt buộc/i);
});

test('csvToQuestions: correct không phải A-D thì báo lỗi kèm số dòng', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,x,a,b,c,d,Z`), /Dòng 2.*A\/B\/C\/D/);
});

test('csvToQuestions: number trùng thì báo lỗi', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,x,a,b,c,d,A\n1,y,a,b,c,d,B`), /trùng/i);
});

test('csvToQuestions: thiếu nội dung ô thì báo lỗi kèm số dòng', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,,a,b,c,d,A`), /Dòng 2.*content/);
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `node --test 'tests/*.test.mjs'`
Expected: FAIL — `Cannot find module '../supabase/functions/admin/lib-csv.ts'`.

*Ghi chú:* Node 24 chạy được `.ts` nhờ type-stripping sẵn có. Nếu môi trường báo lỗi cú pháp TypeScript, chạy `node --experimental-strip-types --test tests/`.

- [ ] **Step 3: Tách parser ra module**

`supabase/functions/admin/lib-csv.ts` — chuyển `parseCsv` từ `index.ts:16-34` sang nguyên vẹn, sửa `csvToQuestions` để trả shape mới:

```typescript
// Parser CSV tối giản: hỗ trợ dấu phẩy, ô có ngoặc kép, xuống dòng trong ô.
// Tách khỏi index.ts để test được bằng `node --test`.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"); // bỏ BOM, chuẩn hoá newline
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface CsvQuestion {
  number: number;
  content: { stem: string; options: { a: string; b: string; c: string; d: string } };
  accepted_answers: string[];
  explanation: string | null;
}

// CSV -> mảng câu hỏi dạng 'mcq' đã kiểm hợp lệ.
// Cột 'correct' trong CSV tương ứng accepted_answers trong DB.
export function csvToQuestions(text: string): CsvQuestion[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV rỗng hoặc thiếu dòng dữ liệu.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const need = ["number", "content", "option_a", "option_b", "option_c", "option_d", "correct"];
  const idx: Record<string, number> = {};
  for (const key of need) {
    const at = header.indexOf(key);
    if (at === -1) throw new Error(`CSV thiếu cột bắt buộc: ${key}`);
    idx[key] = at;
  }
  const expIdx = header.indexOf("explanation"); // tuỳ chọn

  const out = rows.slice(1).map((r, i) => {
    const get = (k: string) => (r[idx[k]] || "").trim();
    const num = parseInt(get("number"), 10);
    const correct = get("correct").toUpperCase();
    if (!Number.isInteger(num)) throw new Error(`Dòng ${i + 2}: 'number' không hợp lệ.`);
    if (!["A", "B", "C", "D"].includes(correct)) {
      throw new Error(`Dòng ${i + 2}: 'correct' phải là A/B/C/D.`);
    }
    for (const k of ["content", "option_a", "option_b", "option_c", "option_d"]) {
      if (!get(k)) throw new Error(`Dòng ${i + 2}: thiếu '${k}'.`);
    }
    const exp = expIdx === -1 ? "" : (r[expIdx] || "").trim();
    return {
      number: num,
      content: {
        stem: get("content"),
        options: { a: get("option_a"), b: get("option_b"), c: get("option_c"), d: get("option_d") },
      },
      accepted_answers: [correct],
      explanation: exp || null,
    };
  });
  const nums = new Set(out.map((q) => q.number));
  if (nums.size !== out.length) throw new Error("Cột 'number' bị trùng.");
  return out;
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `node --test 'tests/*.test.mjs'`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Bỏ parser cũ khỏi `index.ts`**

Xoá dòng 15–67 của `supabase/functions/admin/index.ts` (hai hàm `parseCsv` và `csvToQuestions`), thêm import ở đầu file:

```typescript
import { csvToQuestions } from "./lib-csv.ts";
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin/lib-csv.ts tests/lib-csv.test.mjs supabase/functions/admin/index.ts
git commit -m "refactor(admin): tách parser CSV ra lib-csv.ts và thêm test"
```

---

### Task 7: Edge Function admin — action quản lý đề

**Files:**
- Modify: `supabase/functions/admin/index.ts`

**Interfaces:**
- Consumes: `csvToQuestions` (Task 6), schema (Task 2–4).
- Produces: các action `list_exams`, `get_exam`, `save_exam`, `delete_exam`, `duplicate_exam` — tất cả nằm sau lớp kiểm `x-admin-token` sẵn có ở dòng 73–75.

- [ ] **Step 1: Thay các action cũ bằng action quản lý đề**

Trong `switch (action)`, **xoá** `list_questions`, `save_question`, `delete_question`, `replace_csv`, `get_settings`, `save_settings` (bảng cũ không còn). Giữ `login`. Thêm:

```typescript
      case "list_exams": {
        const { data, error } = await sb.from("exams")
          .select("id, code, title, subtitle, duration_min, opens_at, expires_at, " +
                  "is_published, show_explanations, created_at, " +
                  "sections(count), questions(count), submissions(count)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json({ exams: data });
      }

      case "get_exam": {
        const id = parseInt(payload.exam_id, 10);
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        const { data, error } = await sb.from("exams")
          .select("*, sections(*, questions(*))")
          .eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Không tìm thấy đề.");
        return json({ exam: data });
      }

      case "save_exam": {
        const e = payload.exam ?? {};
        const code = String(e.code ?? "").trim().toUpperCase();
        const title = String(e.title ?? "").trim();
        const duration = parseInt(e.duration_min, 10);
        if (!/^[A-Z0-9]{3,12}$/.test(code)) {
          throw new Error("Mã đề phải gồm 3–12 ký tự chữ HOA hoặc số.");
        }
        if (!title) throw new Error("Tên đề không được để trống.");
        if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
          throw new Error("Thời lượng phải là số nguyên từ 1 đến 600 phút.");
        }
        const opens = e.opens_at ? new Date(e.opens_at) : null;
        const expires = e.expires_at ? new Date(e.expires_at) : null;
        if (opens && expires && opens >= expires) {
          throw new Error("Thời điểm mở phải trước thời điểm hết hạn.");
        }
        const row = {
          code, title,
          subtitle: String(e.subtitle ?? "").trim(),
          duration_min: duration,
          opens_at: opens ? opens.toISOString() : null,
          expires_at: expires ? expires.toISOString() : null,
          is_published: !!e.is_published,
          show_explanations: e.show_explanations !== false,
        };
        if (e.id) {
          const { error } = await sb.from("exams").update(row).eq("id", parseInt(e.id, 10));
          if (error) throw error;
          return json({ ok: true, id: parseInt(e.id, 10) });
        }
        const { data, error } = await sb.from("exams").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: data.id });
      }

      case "delete_exam": {
        const id = parseInt(payload.exam_id, 10);
        const confirmCode = String(payload.confirm_code ?? "").trim().toUpperCase();
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        const { data: ex, error: exErr } = await sb.from("exams")
          .select("code").eq("id", id).maybeSingle();
        if (exErr) throw exErr;
        if (!ex) throw new Error("Không tìm thấy đề.");
        // Xoá cascade cả bài làm của học sinh -> bắt gõ lại mã để xác nhận.
        if (confirmCode !== ex.code) throw new Error("Mã xác nhận không khớp. Chưa xoá gì cả.");
        const { error } = await sb.from("exams").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "duplicate_exam": {
        const id = parseInt(payload.exam_id, 10);
        const newCode = String(payload.new_code ?? "").trim().toUpperCase();
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        if (!/^[A-Z0-9]{3,12}$/.test(newCode)) {
          throw new Error("Mã đề mới phải gồm 3–12 ký tự chữ HOA hoặc số.");
        }
        const { data: src, error: srcErr } = await sb.from("exams")
          .select("*, sections(*, questions(*))").eq("id", id).maybeSingle();
        if (srcErr) throw srcErr;
        if (!src) throw new Error("Không tìm thấy đề nguồn.");

        // Bản sao luôn ở trạng thái nháp: tránh vô tình mở đề chưa soát.
        const { data: ne, error: neErr } = await sb.from("exams").insert({
          code: newCode, title: src.title + " (bản sao)", subtitle: src.subtitle,
          duration_min: src.duration_min, opens_at: null, expires_at: null,
          is_published: false, show_explanations: src.show_explanations,
        }).select("id").single();
        if (neErr) throw neErr;

        for (const sec of (src.sections ?? [])) {
          const { data: ns, error: nsErr } = await sb.from("sections").insert({
            exam_id: ne.id, position: sec.position, kind: sec.kind, title: sec.title,
            instructions: sec.instructions, passage: sec.passage, example: sec.example,
          }).select("id").single();
          if (nsErr) throw nsErr;
          const qs = (sec.questions ?? []).map((q: any) => ({
            section_id: ns.id, exam_id: ne.id, kind: sec.kind, number: q.number,
            content: q.content, accepted_answers: q.accepted_answers, explanation: q.explanation,
          }));
          if (qs.length) {
            const { error } = await sb.from("questions").insert(qs);
            if (error) throw error;
          }
        }
        return json({ ok: true, id: ne.id, code: newCode });
      }
```

- [ ] **Step 2: Kiểm cú pháp bằng Deno**

Run: `deno check supabase/functions/admin/index.ts`
Expected: không lỗi. Nếu chưa có Deno: `brew install deno`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin/index.ts
git commit -m "feat(admin): action quản lý đề — list/get/save/delete/duplicate"
```

---

### Task 8: Edge Function admin — action phần thi và câu hỏi

**Files:**
- Modify: `supabase/functions/admin/index.ts`

**Interfaces:**
- Consumes: `csvToQuestions` (Task 6).
- Produces: `save_section`, `delete_section`, `reorder_sections`, `save_questions`, `delete_question`, `import_csv`.

- [ ] **Step 1: Thêm các action**

```typescript
      case "save_section": {
        const s = payload.section ?? {};
        const examId = parseInt(s.exam_id, 10);
        const kind = String(s.kind ?? "");
        if (!Number.isInteger(examId)) throw new Error("'exam_id' không hợp lệ.");
        if (!["mcq", "open_cloze", "mcq_cloze"].includes(kind)) {
          throw new Error("Dạng phần thi không hợp lệ.");
        }
        const passage = kind === "mcq" ? null : String(s.passage ?? "").trim();
        if (kind !== "mcq" && !passage) throw new Error("Phần dạng đoạn văn phải có nội dung đoạn văn.");
        const row = {
          exam_id: examId, kind,
          position: Number.isInteger(parseInt(s.position, 10)) ? parseInt(s.position, 10) : 1,
          title: String(s.title ?? "").trim(),
          instructions: String(s.instructions ?? "").trim(),
          passage, example: String(s.example ?? "").trim() || null,
        };
        if (s.id) {
          // kind không nằm trong update: FK ghép sẽ chặn nếu đã có câu hỏi.
          const { kind: _drop, ...upd } = row;
          const { error } = await sb.from("sections").update(upd).eq("id", parseInt(s.id, 10));
          if (error) throw error;
          return json({ ok: true, id: parseInt(s.id, 10) });
        }
        const { data, error } = await sb.from("sections").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: data.id });
      }

      case "delete_section": {
        const id = parseInt(payload.section_id, 10);
        if (!Number.isInteger(id)) throw new Error("'section_id' không hợp lệ.");
        const { error } = await sb.from("sections").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "reorder_sections": {
        const order = payload.order; // [{id, position}, …]
        if (!Array.isArray(order)) throw new Error("'order' phải là mảng.");
        // position là unique deferrable -> dời sang dải tạm trước, tránh đụng khoá.
        for (const it of order) {
          const { error } = await sb.from("sections")
            .update({ position: 1000 + parseInt(it.position, 10) })
            .eq("id", parseInt(it.id, 10));
          if (error) throw error;
        }
        for (const it of order) {
          const { error } = await sb.from("sections")
            .update({ position: parseInt(it.position, 10) })
            .eq("id", parseInt(it.id, 10));
          if (error) throw error;
        }
        return json({ ok: true });
      }

      case "save_questions": {
        // Ghi cả bảng câu của MỘT phần trong một lần: editor cloze sửa cả bảng cùng lúc.
        const sectionId = parseInt(payload.section_id, 10);
        const list = payload.questions;
        if (!Number.isInteger(sectionId)) throw new Error("'section_id' không hợp lệ.");
        if (!Array.isArray(list)) throw new Error("'questions' phải là mảng.");

        const { data: sec, error: secErr } = await sb.from("sections")
          .select("id, exam_id, kind").eq("id", sectionId).maybeSingle();
        if (secErr) throw secErr;
        if (!sec) throw new Error("Không tìm thấy phần thi.");

        const rows = list.map((q: any, i: number) => {
          const num = parseInt(q.number, 10);
          if (!Number.isInteger(num)) throw new Error(`Câu thứ ${i + 1}: số câu không hợp lệ.`);

          let answers: string[];
          let content: Record<string, unknown>;

          if (sec.kind === "open_cloze") {
            answers = (Array.isArray(q.accepted_answers) ? q.accepted_answers : [])
              .map((a: unknown) => String(a ?? "").trim()).filter(Boolean);
            if (!answers.length) throw new Error(`Câu ${num}: phải có ít nhất một đáp án.`);
            content = {};
          } else {
            const correct = String(q.correct ?? q.accepted_answers?.[0] ?? "").trim().toUpperCase();
            if (!["A", "B", "C", "D"].includes(correct)) {
              throw new Error(`Câu ${num}: đáp án đúng phải là A/B/C/D.`);
            }
            const o = q.content?.options ?? {};
            for (const k of ["a", "b", "c", "d"]) {
              if (!String(o[k] ?? "").trim()) throw new Error(`Câu ${num}: thiếu phương án ${k.toUpperCase()}.`);
            }
            answers = [correct];
            content = {
              options: {
                a: String(o.a).trim(), b: String(o.b).trim(),
                c: String(o.c).trim(), d: String(o.d).trim(),
              },
            };
            if (sec.kind === "mcq") {
              const stem = String(q.content?.stem ?? "").trim();
              if (!stem) throw new Error(`Câu ${num}: thiếu nội dung câu hỏi.`);
              content.stem = stem;
            }
          }
          return {
            section_id: sec.id, exam_id: sec.exam_id, kind: sec.kind, number: num,
            content, accepted_answers: answers,
            explanation: String(q.explanation ?? "").trim() || null,
          };
        });

        // Thay cả bảng câu của phần này: xoá rồi chèn lại.
        const del = await sb.from("questions").delete().eq("section_id", sec.id);
        if (del.error) throw del.error;
        if (rows.length) {
          const ins = await sb.from("questions").insert(rows);
          if (ins.error) throw ins.error;
        }
        return json({ ok: true, count: rows.length });
      }

      case "delete_question": {
        const id = parseInt(payload.question_id, 10);
        if (!Number.isInteger(id)) throw new Error("'question_id' không hợp lệ.");
        const { error } = await sb.from("questions").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "import_csv": {
        // CSV chỉ dùng cho phần dạng 'mcq'; hai dạng cloze soạn qua form.
        const sectionId = parseInt(payload.section_id, 10);
        if (!Number.isInteger(sectionId)) throw new Error("'section_id' không hợp lệ.");
        const { data: sec, error: secErr } = await sb.from("sections")
          .select("id, exam_id, kind").eq("id", sectionId).maybeSingle();
        if (secErr) throw secErr;
        if (!sec) throw new Error("Không tìm thấy phần thi.");
        if (sec.kind !== "mcq") throw new Error("Chỉ nạp CSV được cho phần trắc nghiệm A/B/C/D.");

        const parsed = csvToQuestions(String(payload.csv || ""));
        const rows = parsed.map((q) => ({
          section_id: sec.id, exam_id: sec.exam_id, kind: "mcq", number: q.number,
          content: q.content, accepted_answers: q.accepted_answers, explanation: q.explanation,
        }));
        const del = await sb.from("questions").delete().eq("section_id", sec.id);
        if (del.error) throw del.error;
        const ins = await sb.from("questions").insert(rows);
        if (ins.error) throw ins.error;
        return json({ ok: true, count: rows.length });
      }
```

- [ ] **Step 2: Kiểm cú pháp**

Run: `deno check supabase/functions/admin/index.ts`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin/index.ts
git commit -m "feat(admin): action quản lý phần thi và câu hỏi"
```

---

### Task 9: Kết quả theo đề + Edge Function export

**Files:**
- Modify: `supabase/functions/admin/index.ts`, `supabase/functions/export/index.ts`

**Interfaces:**
- Produces: `list_submissions(exam_id)`, `clear_submissions(exam_id)`; `export` nhận thêm `?exam=<code>`.

- [ ] **Step 1: Sửa hai action kết quả**

```typescript
      case "list_submissions": {
        const examId = parseInt(payload.exam_id, 10);
        if (!Number.isInteger(examId)) throw new Error("'exam_id' không hợp lệ.");
        const { data, error } = await sb.from("submissions")
          .select("id, full_name, class_name, score, total, answers, created_at")
          .eq("exam_id", examId).order("id", { ascending: false });
        if (error) throw error;
        return json({ submissions: data });
      }

      case "clear_submissions": {
        const examId = parseInt(payload.exam_id, 10);
        if (!Number.isInteger(examId)) throw new Error("'exam_id' không hợp lệ.");
        const { error } = await sb.from("submissions").delete().eq("exam_id", examId);
        if (error) throw error;
        return json({ ok: true });
      }
```

- [ ] **Step 2: Sửa Edge Function export cho nhiều đề**

Thay khối truy vấn ở `supabase/functions/export/index.ts:16-33`:

```typescript
  const examCode = url.searchParams.get("exam");   // tuỳ chọn: lọc theo mã đề
  let q = sb.from("submissions")
    .select("id, full_name, class_name, score, total, created_at, exams(code, title)")
    .order("id", { ascending: true });
  if (examCode) {
    const { data: ex } = await sb.from("exams")
      .select("id").eq("code", examCode.toUpperCase()).maybeSingle();
    if (!ex) return new Response("Không tìm thấy đề: " + examCode, { status: 404 });
    q = q.eq("exam_id", ex.id);
  }
  const { data, error } = await q;
  if (error) return new Response("DB error: " + error.message, { status: 500 });

  const rows = (data ?? []).map((r: any) => ({
    "ID": r.id,
    "Mã đề": r.exams?.code ?? "",
    "Tên đề": r.exams?.title ?? "",
    "Họ và tên": r.full_name,
    "Lớp": r.class_name,
    "Điểm": r.score,
    "Tổng": r.total,
    "Thời gian nộp": new Date(r.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  }));
```

Và sửa độ rộng cột cho khớp 8 cột:

```typescript
  ws["!cols"] = [{ wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 24 },
                 { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }];
```

- [ ] **Step 3: Kiểm cú pháp cả hai**

Run: `deno check supabase/functions/admin/index.ts supabase/functions/export/index.ts`
Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin/index.ts supabase/functions/export/index.ts
git commit -m "feat(admin): kết quả lọc theo đề, export thêm cột mã đề"
```

---

### Task 10: Chạy thật trên Supabase và verify đầu-cuối

**Files:** không sửa file nào — đây là bước triển khai và kiểm chứng thật.

- [ ] **Step 1: Chạy toàn bộ test cục bộ lần cuối**

```bash
./tests/sql/run.sh && node --test 'tests/*.test.mjs'
```
Expected: cả hai đều PASS.

- [ ] **Step 2: Chạy schema trên Supabase**

Mở SQL Editor trên dashboard → dán toàn bộ `supabase/schema.sql` → Run.
⚠️ Bước này **xoá sạch** 51 câu hỏi và mọi kết quả cũ — đã thống nhất ở spec §2.

Rồi dán `supabase/seed-demo.sql` → Run.

- [ ] **Step 3: Kiểm chứng bằng SQL Editor**

```sql
select code, title, is_published,
       (select count(*) from questions q where q.exam_id = e.id) as so_cau
from exams e order by code;
```
Expected: `GOLD8 | FCE Test 3 — Gold | t | 8` và `TAP8 | CAE Test 8 — Tap water | t | 8`.

- [ ] **Step 4: Deploy hai Edge Function**

```bash
supabase functions deploy admin  --no-verify-jwt
supabase functions deploy export --no-verify-jwt
```

- [ ] **Step 5: Verify RPC bằng curl với anon key**

```bash
URL=$(grep -o 'https://[^"]*' config.js | head -1)
ANON=$(grep -o "SUPABASE_ANON_KEY *= *['\"][^'\"]*" config.js | sed "s/.*['\"]//")

# Phải trả meta đề, KHÔNG có câu hỏi
curl -s -X POST "$URL/rest/v1/rpc/exam_info" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_code":"GOLD8"}'

# Phải trả passage + questions, KHÔNG có accepted_answers/explanation
curl -s -X POST "$URL/rest/v1/rpc/start_exam" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_code":"GOLD8"}' | grep -c accepted_answers
```
Expected: lệnh cuối in `0` — không rò đáp án.

- [ ] **Step 6: Verify anon KHÔNG đọc được bảng gốc**

```bash
curl -s "$URL/rest/v1/questions?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
Expected: mảng rỗng `[]` hoặc lỗi permission — **không** được trả câu hỏi nào.

- [ ] **Step 7: Verify Edge Function admin**

```bash
curl -s -X POST "$URL/functions/v1/admin" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "x-admin-token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"action":"list_exams"}'
```
Expected: JSON có hai đề. Thử lại **không** kèm `x-admin-token` → phải nhận `403`.

- [ ] **Step 8: Commit ghi chú triển khai**

```bash
git commit --allow-empty -m "chore(db): triển khai schema mới và seed đề mẫu lên Supabase"
```

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §3.1 `exams` | Task 2 |
| §3.2 `sections` | Task 2 |
| §3.3 `questions` + `content` jsonb | Task 2 |
| §3.4 `submissions` | Task 2 |
| §4.1 bỏ view, bật RLS | Task 2 |
| §4.2 `is_correct`, `exam_by_code` | Task 3 |
| §4.3 ba RPC | Task 4 |
| §5.5 action Edge Function | Task 7, 8, 9 |
| §5.6 CSV | Task 6, 8 |
| §8 dọn file cũ, seed mẫu | Task 5 |
| §10 kiểm chứng schema | Task 2 (test tự động hoá lại) |
| §11.1 test SQL | Task 1–4 |
| §11.2 test JS (`lib-csv`) | Task 6 |

§11.2 còn `lib-passage.js` và `lib-time.js` — **thuộc Plan B** (frontend), không nằm trong plan này.

§5.1–5.4 (giao diện admin) và §6 (app học sinh) — **Plan B**.

**Type consistency:** `accepted_answers` là `text[]` xuyên suốt; `content.options` luôn là object khoá `a`/`b`/`c`/`d`; `csvToQuestions` trả `{number, content, accepted_answers, explanation}` khớp cột DB; RPC luôn nhận tham số tên `p_code`.

**Điểm dễ sai đã ghi rõ trong plan:**
- `start_exam` phải `order by t.position` với alias subquery — viết `s.position` sẽ lỗi `missing FROM-clause entry` (đã gặp thật khi kiểm chứng).
- `content_shape` phải bọc `coalesce` — check constraint trả NULL là PASS.
- `deferrable` chỉ dùng được với `constraint <tên> unique (…)`, không dùng được với `unique (…)` inline.
- `reorder_sections` phải dời sang dải tạm `1000+` trước — dù `deferrable` bảo vệ trong transaction, PostgREST gửi từng update riêng lẻ nên vẫn đụng khoá.
