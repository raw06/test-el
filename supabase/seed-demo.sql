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
