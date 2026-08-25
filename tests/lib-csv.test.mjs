import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, csvToQuestions } from '../supabase/functions/admin/lib-csv.ts';

const HEADER = 'number,content,option_a,option_b,option_c,option_d,correct';

test('parseCsv: bỏ BOM và tách dòng', () => {
  const rows = parseCsv('﻿a,b\n1,2\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: ô có ngoặc kép chứa dấu phẩy', () => {
  const rows = parseCsv('a,b\n"x, y",z\n');
  assert.deepEqual(rows[1], ['x, y', 'z']);
});

test('parseCsv: ngoặc kép lồng bên trong ô', () => {
  const rows = parseCsv('a\n"nói ""xin chào"""\n');
  assert.equal(rows[1][0], 'nói "xin chào"');
});

test('csvToQuestions: gói option thành content.options', () => {
  const [q] = csvToQuestions(`${HEADER}\n1,He ___ home.,go,goes,going,gone,B`);
  assert.equal(q.number, 1);
  assert.equal(q.content.stem, 'He ___ home.');
  assert.deepEqual(q.content.options, { a: 'go', b: 'goes', c: 'going', d: 'gone' });
  assert.deepEqual(q.accepted_answers, ['B']);
});

test('csvToQuestions: correct viết thường vẫn nhận', () => {
  const [q] = csvToQuestions(`${HEADER}\n1,x,a,b,c,d,b`);
  assert.deepEqual(q.accepted_answers, ['B']);
});

test('csvToQuestions: cột explanation là tuỳ chọn', () => {
  const [q1] = csvToQuestions(`${HEADER}\n1,x,a,b,c,d,A`);
  assert.equal(q1.explanation, null);
  const [q2] = csvToQuestions(`${HEADER},explanation\n1,x,a,b,c,d,A,Vì thế này.`);
  assert.equal(q2.explanation, 'Vì thế này.');
});

test('csvToQuestions: thiếu cột bắt buộc thì báo lỗi tiếng Việt', () => {
  assert.throws(() => csvToQuestions('number,content\n1,x'), /thiếu cột bắt buộc/i);
});

test('csvToQuestions: correct không phải A-D thì báo lỗi kèm số dòng', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,x,a,b,c,d,Z`), /Dòng 2.*A\/B\/C\/D/);
});

test('csvToQuestions: number trùng thì báo lỗi', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,x,a,b,c,d,A\n1,y,a,b,c,d,B`), /trùng/i);
});

test('csvToQuestions: thiếu nội dung ô thì báo lỗi kèm số dòng', () => {
  assert.throws(() => csvToQuestions(`${HEADER}\n1,,a,b,c,d,A`), /Dòng 2.*content/);
});
