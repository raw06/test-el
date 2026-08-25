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
