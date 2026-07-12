-- ===== Bảng đề =====
create table if not exists public.questions (
  id            bigint generated always as identity primary key,
  number        int not null unique,
  content       text not null,
  option_a      text not null,
  option_b      text not null,
  option_c      text not null,
  option_d      text not null,
  correct_answer char(1) not null check (correct_answer in ('A','B','C','D'))
);

-- ===== Bảng kết quả =====
create table if not exists public.submissions (
  id         bigint generated always as identity primary key,
  full_name  text not null,
  class_name text not null,
  score      int  not null,
  total      int  not null,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);

-- ===== View công khai: câu hỏi KHÔNG kèm đáp án =====
create or replace view public.questions_public as
  select number, content, option_a, option_b, option_c, option_d
  from public.questions
  order by number;

-- ===== RLS =====
alter table public.questions   enable row level security;
alter table public.submissions enable row level security;
-- Không tạo policy nào cho anon trên 2 bảng gốc => anon KHÔNG select/insert trực tiếp được.
-- Cho phép anon đọc view (view chạy quyền owner, đã lọc bỏ đáp án).
grant select on public.questions_public to anon;

-- ===== RPC chấm điểm (chạy quyền definer, thấy đáp án nhưng không trả ra) =====
create or replace function public.submit_quiz(
  p_full_name text, p_class text, p_answers jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_score int; v_total int;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0
     or p_class is null or length(trim(p_class)) = 0 then
    raise exception 'full_name và class là bắt buộc';
  end if;

  select count(*) into v_total from public.questions;

  select count(*) into v_score
  from public.questions q
  where upper(p_answers ->> q.number::text) = q.correct_answer;

  insert into public.submissions(full_name, class_name, score, total, answers)
  values (trim(p_full_name), trim(p_class), v_score, v_total, p_answers);

  return jsonb_build_object('score', v_score, 'total', v_total);
end $$;

grant execute on function public.submit_quiz(text, text, jsonb) to anon;
