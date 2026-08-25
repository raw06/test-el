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
