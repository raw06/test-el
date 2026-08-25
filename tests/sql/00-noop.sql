-- Kiểm chính runner: hàm assert dùng chung cho mọi file test sau.
create or replace function assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok   — %', p_label;
  else raise notice 'ASSERT-FAIL — %', p_label;
  end if;
end $$;

select assert(true, 'runner chạy được');
