select assert(is_correct('{C}','C'),                                 'MCQ đúng');
select assert(is_correct('{C}','c'),                                 'MCQ viết thường vẫn đúng');
select assert(not is_correct('{C}','A'),                             'MCQ sai');
select assert(is_correct('{conversely,contrastingly}','Conversely'), 'cloze viết hoa vẫn đúng');
select assert(is_correct('{conversely,contrastingly}','contrastingly'),'cloze khớp đáp án thứ hai');
select assert(is_correct('{at}','  At  '),                           'cloze thừa khoảng trắng vẫn đúng');
select assert(not is_correct('{at}',''),                             'chuỗi rỗng là sai');
select assert(not is_correct('{at}',null),                           'không nộp là sai');
select assert(not is_correct('{at}','the'),                          'sai từ là sai');
