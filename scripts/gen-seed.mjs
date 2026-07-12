import { readFileSync, writeFileSync } from 'node:fs';
const qs = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)));
const esc = (s) => String(s).replace(/'/g, "''");
const rows = qs.map(q =>
  `(${q.number}, '${esc(q.content)}', '${esc(q.option_a)}', '${esc(q.option_b)}', ` +
  `'${esc(q.option_c)}', '${esc(q.option_d)}', '${q.correct}')`
).join(',\n');
const sql =
`-- Sinh tự động bởi scripts/gen-seed.mjs — KHÔNG sửa tay
truncate table public.questions restart identity cascade;
insert into public.questions
  (number, content, option_a, option_b, option_c, option_d, correct_answer)
values
${rows};
`;
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log('Wrote supabase/seed.sql with', qs.length, 'rows');
