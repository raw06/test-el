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
