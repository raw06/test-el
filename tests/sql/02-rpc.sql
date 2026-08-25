select assert(is_correct('{C}','C'),                                 'MCQ đúng');
select assert(is_correct('{C}','c'),                                 'MCQ viết thường vẫn đúng');
select assert(not is_correct('{C}','A'),                             'MCQ sai');
select assert(is_correct('{conversely,contrastingly}','Conversely'), 'cloze viết hoa vẫn đúng');
select assert(is_correct('{conversely,contrastingly}','contrastingly'),'cloze khớp đáp án thứ hai');
select assert(is_correct('{at}','  At  '),                           'cloze thừa khoảng trắng vẫn đúng');
select assert(not is_correct('{at}',''),                             'chuỗi rỗng là sai');
select assert(not is_correct('{at}',null),                           'không nộp là sai');
select assert(not is_correct('{at}','the'),                          'sai từ là sai');

-- ===== exam_by_code: tra đề, cửa sổ thời gian, và lớp bảo mật =====

-- Chạy SQL, trả true nếu bị chặn (ném lỗi).
create or replace function blocked(p_sql text) returns boolean
language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;

-- Trả thông báo lỗi để so nội dung.
create or replace function errmsg(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return '(không lỗi)'; exception when others then return sqlerrm; end $$;

insert into exams(code,title,is_published) values ('RPC1','Đề tra được',true);
insert into exams(code,title,is_published) values ('RPC2','Đề nháp',false);
insert into exams(code,title,is_published,expires_at)
  values ('RPC3','Đề hết hạn',true, now() - interval '1 hour');
insert into exams(code,title,is_published,opens_at)
  values ('RPC4','Đề chưa mở',true, now() + interval '1 hour');

select assert((exam_by_code('RPC1')).title = 'Đề tra được',      'tra đề đã xuất bản');
select assert((exam_by_code('rpc1')).code  = 'RPC1',             'mã viết thường vẫn tra được');
select assert((exam_by_code('  RPC1  ')).code = 'RPC1',          'mã thừa khoảng trắng vẫn tra được');
select assert(blocked($$select exam_by_code('RPC2')$$),          'đề chưa xuất bản bị chặn');
select assert(blocked($$select exam_by_code('KHONGCO')$$),       'mã không tồn tại bị chặn');
select assert(blocked($$select exam_by_code('RPC3')$$),          'đề hết hạn bị chặn');
select assert(blocked($$select exam_by_code('RPC4')$$),          'đề chưa mở bị chặn');
select assert(blocked($$select exam_by_code(null)$$),            'mã null bị chặn');

-- Đề nháp và mã sai phải trả CÙNG một lỗi: không để lộ đề nào tồn tại.
select assert(errmsg($$select exam_by_code('RPC2')$$) = errmsg($$select exam_by_code('KHONGCO')$$),
                                                                 'đề nháp và mã sai trả cùng một lỗi');
select assert(errmsg($$select exam_by_code('RPC3')$$) like 'Đề đã hết hạn%',  'lỗi hết hạn nói rõ lý do');
select assert(errmsg($$select exam_by_code('RPC4')$$) like 'Đề chưa mở%',     'lỗi chưa mở nói rõ lý do');

-- Hàm nội bộ: anon không được gọi.
select assert(blocked($$set local role anon; select exam_by_code('RPC1')$$),
                                                                 'anon bị chặn gọi exam_by_code');

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
