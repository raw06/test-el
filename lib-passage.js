// Đoạn văn dùng {{9}} để đánh dấu chỗ trống — số trong ngoặc chính là số câu hỏi.
// Chỗ trống {{0}} là ví dụ mẫu của đề gốc: hiện ra nhưng không phải câu cần làm.
const GAP_RE = /\{\{\s*(\d+)\s*\}\}/g;

export function splitPassage(passage) {
  const src = String(passage ?? '');
  if (!src) return [];
  const out = [];
  let last = 0, m;
  GAP_RE.lastIndex = 0; // regex có cờ /g và dùng lại giữa các lần gọi
  while ((m = GAP_RE.exec(src)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: src.slice(last, m.index) });
    out.push({ type: 'gap', number: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

export function scanBlanks(passage) {
  return splitPassage(passage).filter((t) => t.type === 'gap').map((t) => t.number);
}

// Đối chiếu chỗ trống trong đoạn văn với danh sách số câu hỏi đang có,
// để admin cảnh báo trước khi lưu thay vì để học sinh gặp ô trống không chấm được.
export function diffBlanks(passage, numbers) {
  const gaps = scanBlanks(passage).filter((n) => n !== 0);
  const qs = (numbers ?? []).map(Number);
  const gapSet = new Set(gaps), qSet = new Set(qs);
  const asc = (a, b) => a - b;
  return {
    duplicates: [...new Set(gaps.filter((n, i) => gaps.indexOf(n) !== i))].sort(asc),
    missingQuestions: [...gapSet].filter((n) => !qSet.has(n)).sort(asc),
    orphanQuestions: [...qSet].filter((n) => !gapSet.has(n)).sort(asc),
  };
}
