import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPassage, scanBlanks, diffBlanks } from '../lib-passage.js';

test('splitPassage: xen kẽ chữ và chỗ trống', () => {
  assert.deepEqual(splitPassage('Gold is {{1}} rare.'), [
    { type: 'text', value: 'Gold is ' },
    { type: 'gap', number: 1 },
    { type: 'text', value: ' rare.' },
  ]);
});

test('splitPassage: chỗ trống ngay đầu và ngay cuối', () => {
  assert.deepEqual(splitPassage('{{1}} giữa {{2}}'), [
    { type: 'gap', number: 1 },
    { type: 'text', value: ' giữa ' },
    { type: 'gap', number: 2 },
  ]);
});

test('splitPassage: giữ nguyên xuống dòng', () => {
  const t = splitPassage('dòng một\n\ndòng hai {{9}}');
  assert.equal(t[0].value, 'dòng một\n\ndòng hai ');
});

test('splitPassage: cho phép khoảng trắng bên trong ngoặc', () => {
  assert.deepEqual(splitPassage('a {{ 12 }} b')[1], { type: 'gap', number: 12 });
});

test('splitPassage: không có chỗ trống thì trả một khối chữ', () => {
  assert.deepEqual(splitPassage('chỉ là chữ'), [{ type: 'text', value: 'chỉ là chữ' }]);
});

test('splitPassage: chuỗi rỗng hoặc null trả mảng rỗng', () => {
  assert.deepEqual(splitPassage(''), []);
  assert.deepEqual(splitPassage(null), []);
});

test('splitPassage: gọi hai lần cho kết quả giống nhau', () => {
  const p = 'a {{1}} b {{2}}';
  assert.deepEqual(splitPassage(p), splitPassage(p)); // regex có cờ /g, phải reset lastIndex
});

test('scanBlanks: trả số theo thứ tự xuất hiện', () => {
  assert.deepEqual(scanBlanks('{{0}} x {{9}} y {{10}}'), [0, 9, 10]);
});

test('diffBlanks: khớp hoàn toàn thì ba mảng đều rỗng', () => {
  assert.deepEqual(diffBlanks('{{0}} a {{9}} b {{10}}', [9, 10]),
    { duplicates: [], missingQuestions: [], orphanQuestions: [] });
});

test('diffBlanks: chỗ trống chưa có câu hỏi', () => {
  assert.deepEqual(diffBlanks('{{9}} {{10}} {{11}}', [9]).missingQuestions, [10, 11]);
});

test('diffBlanks: câu hỏi không có chỗ trống tương ứng', () => {
  assert.deepEqual(diffBlanks('{{9}}', [9, 42]).orphanQuestions, [42]);
});

test('diffBlanks: chỗ trống bị đánh trùng số', () => {
  assert.deepEqual(diffBlanks('{{9}} x {{9}}', [9]).duplicates, [9]);
});

test('diffBlanks: chỗ trống số 0 là ví dụ mẫu, không đòi câu hỏi', () => {
  assert.deepEqual(diffBlanks('{{0}} {{9}}', [9]),
    { duplicates: [], missingQuestions: [], orphanQuestions: [] });
});
