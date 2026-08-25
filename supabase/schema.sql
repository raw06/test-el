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
  -- PostgREST cần FK TRỰC TIẾP mới nhúng được `questions(count)` từ `exams`.
  -- Toàn vẹn tham chiếu vốn đã có bắc cầu qua sections, dòng này thêm đường trực tiếp.
  foreign key (exam_id) references public.exams(id) on delete cascade,

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

-- ===== So khớp đáp án: bỏ qua hoa/thường và khoảng trắng thừa =====
create or replace function public.is_correct(p_accepted text[], p_given text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(p_accepted) a
    where btrim(coalesce(p_given, '')) <> ''
      and lower(btrim(a)) = lower(btrim(p_given)));
$$;

-- Đổi thứ tự các phần trong MỘT transaction: ràng buộc sections_position_uniq là
-- deferrable, nhưng chỉ được hoãn tới lúc commit — mà PostgREST commit từng update
-- một, nên hoán vị hai phần qua REST luôn đụng khoá. Gói vào hàm thì hết.
create or replace function public.reorder_sections(p_exam_id bigint, p_order jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sections s
     set position = (v.value ->> 'position')::int
    from jsonb_array_elements(p_order) v
   where s.id = (v.value ->> 'id')::bigint
     and s.exam_id = p_exam_id;
end $$;

-- Ghi cả bảng câu của MỘT phần trong MỘT transaction. Tách thành hai lệnh REST
-- (delete rồi insert) thì insert hỏng sẽ để lại phần thi RỖNG — mất dữ liệu thật.
create or replace function public.save_questions(p_section_id bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_exam bigint; v_kind text; v_n int;
begin
  select exam_id, kind into v_exam, v_kind from public.sections where id = p_section_id;
  if not found then raise exception 'Không tìm thấy phần thi.'; end if;

  delete from public.questions where section_id = p_section_id;

  insert into public.questions(section_id, exam_id, kind, number, content, accepted_answers, explanation)
  select p_section_id, v_exam, v_kind,
         (r ->> 'number')::int,
         coalesce(r -> 'content', '{}'::jsonb),
         array(select jsonb_array_elements_text(r -> 'accepted_answers')),
         nullif(btrim(coalesce(r ->> 'explanation', '')), '')
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.reorder_sections(bigint, jsonb) from public;
revoke all on function public.save_questions(bigint, jsonb)   from public;

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

-- ===== RLS: KHÔNG policy nào cho anon trên cả 4 bảng =====
alter table public.exams       enable row level security;
alter table public.sections    enable row level security;
alter table public.questions   enable row level security;
alter table public.submissions enable row level security;

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
