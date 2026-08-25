import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUtcIso, toLocalInput, formatVn } from '../lib-time.js';

test('toUtcIso: hiểu giá trị nhập là giờ Việt Nam (+07:00)', () => {
  assert.equal(toUtcIso('2026-08-25T14:30'), '2026-08-25T07:30:00.000Z');
});

test('toUtcIso: qua ngày khi trừ 7 tiếng', () => {
  assert.equal(toUtcIso('2026-08-25T03:00'), '2026-08-24T20:00:00.000Z');
});

test('toUtcIso: chấp nhận cả dạng có giây', () => {
  assert.equal(toUtcIso('2026-08-25T14:30:45'), '2026-08-25T07:30:45.000Z');
});

test('toUtcIso: rỗng hoặc rác trả null', () => {
  assert.equal(toUtcIso(''), null);
  assert.equal(toUtcIso('   '), null);
  assert.equal(toUtcIso(null), null);
  assert.equal(toUtcIso('không phải ngày'), null);
});

test('toLocalInput: đưa ISO UTC về ô datetime-local giờ VN', () => {
  assert.equal(toLocalInput('2026-08-25T07:30:00.000Z'), '2026-08-25T14:30');
});

test('toLocalInput: nửa đêm giờ VN hiện 00 chứ không phải 24', () => {
  assert.equal(toLocalInput('2026-08-24T17:00:00.000Z'), '2026-08-25T00:00');
});

test('toLocalInput: rỗng hoặc rác trả chuỗi rỗng', () => {
  assert.equal(toLocalInput(null), '');
  assert.equal(toLocalInput(''), '');
  assert.equal(toLocalInput('rác'), '');
});

test('toUtcIso rồi toLocalInput trả lại đúng giá trị ban đầu', () => {
  const v = '2026-12-31T23:59';
  assert.equal(toLocalInput(toUtcIso(v)), v);
});

test('formatVn: rỗng trả gạch ngang', () => {
  assert.equal(formatVn(null), '—');
  assert.equal(formatVn(''), '—');
});

test('formatVn: có ngày tháng giờ VN trong chuỗi', () => {
  const s = formatVn('2026-08-25T07:30:00.000Z');
  assert.match(s, /25\/8\/2026|25\/08\/2026/);
  assert.match(s, /14:30/);
});
