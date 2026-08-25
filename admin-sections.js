import { api, esc, toast } from './admin-api.js';
import { diffBlanks, scanBlanks } from './lib-passage.js';

const $ = (id) => document.getElementById(id);
const KIND_LABEL = {
  mcq: 'Trắc nghiệm A/B/C/D',
  open_cloze: 'Đoạn văn — điền từ',
  mcq_cloze: 'Đoạn văn — chọn A/B/C/D',
};
let exam = null;

export function renderSectionsAdmin(next) {
  exam = next;
  bindOnce();
  const secs = [...(exam.sections ?? [])].sort((a, b) => a.position - b.position);
  $('sections-list').innerHTML = secs.length
    ? secs.map(sectionCard).join('')
    : '<p class="muted center">Đề chưa có phần nào. Chọn dạng ở trên rồi bấm “Thêm phần”.</p>';
}

function sectionCard(sec) {
  const qs = [...(sec.questions ?? [])].sort((a, b) => a.number - b.number);
  const isCloze = sec.kind !== 'mcq';
  return `<div class="card sec-card" data-sec="${sec.id}">
    <div class="toolbar-row">
      <span class="pill">${esc(KIND_LABEL[sec.kind] ?? sec.kind)}</span>
      <span class="muted small">Phần ${sec.position} · ${qs.length} câu</span>
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-move="up"   data-sec="${sec.id}">↑</button>
      <button type="button" class="icon-btn" data-move="down" data-sec="${sec.id}">↓</button>
      <button type="button" class="icon-btn danger" data-delsec="${sec.id}">Xoá phần</button>
    </div>

    <label class="field">
      <span class="field-label">Tiêu đề phần</span>
      <input data-f="title" data-sec="${sec.id}" value="${esc(sec.title)}" placeholder="Part 1" />
    </label>
    <label class="field">
      <span class="field-label">Hướng dẫn làm bài</span>
      <textarea data-f="instructions" data-sec="${sec.id}" rows="2">${esc(sec.instructions)}</textarea>
    </label>
    ${isCloze ? `
    <label class="field">
      <span class="field-label">Câu ví dụ mẫu <span class="muted small">(tuỳ chọn)</span></span>
      <input data-f="example" data-sec="${sec.id}" value="${esc(sec.example ?? '')}" placeholder="Example: (0) B change" />
    </label>
    <label class="field">
      <span class="field-label">Đoạn văn <em>*</em> <span class="muted small">— chỗ trống viết {{9}}</span></span>
      <textarea data-f="passage" data-sec="${sec.id}" rows="10" class="mono">${esc(sec.passage ?? '')}</textarea>
    </label>
    <p class="hint blank-hint" data-hint="${sec.id}"></p>` : ''}

    <div class="toolbar-row">
      <button type="button" class="btn btn-outline" data-savesec="${sec.id}">Lưu phần</button>
      ${isCloze ? `<button type="button" class="btn btn-ghost" data-sync="${sec.id}">⟳ Đồng bộ câu theo đoạn văn</button>` : ''}
      ${sec.kind === 'mcq' ? `
        <button type="button" class="btn btn-ghost" data-addq="${sec.id}">+ Thêm câu</button>
        <button type="button" class="btn btn-ghost" data-csv="${sec.id}">⬆️ Nạp CSV</button>
        <a href="mau-de.csv" class="link-sm" download>Tải CSV mẫu</a>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn btn-primary" data-saveq="${sec.id}">Lưu ${qs.length} câu</button>
    </div>

    <div class="q-table-wrap">
      <table class="q-table" data-qtable="${sec.id}">
        <thead><tr>${headCells(sec.kind)}</tr></thead>
        <tbody>${qs.map((q) => qRow(sec.kind, q)).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

function headCells(kind) {
  if (kind === 'open_cloze') {
    return '<th>Câu</th><th>Đáp án chấp nhận</th><th>Giải thích</th><th></th>';
  }
  const stem = kind === 'mcq' ? '<th>Đề bài</th>' : '';
  return `<th>Câu</th>${stem}<th>A</th><th>B</th><th>C</th><th>D</th><th>Đúng</th><th>Giải thích</th><th></th>`;
}

function qRow(kind, q = {}) {
  const n = q.number ?? '';
  const exp = esc(q.explanation ?? '');
  if (kind === 'open_cloze') {
    // Nhiều đáp án đúng ngăn nhau bằng dấu | — khớp không phân biệt hoa thường.
    const acc = esc((q.accepted_answers ?? []).join(' | '));
    return `<tr>
      <td><input class="w-num" data-c="number" value="${n}" /></td>
      <td><input data-c="accepted" value="${acc}" placeholder="conversely | contrastingly" /></td>
      <td><input data-c="explanation" value="${exp}" /></td>
      <td><button type="button" class="icon-btn danger" data-delrow="1">✕</button></td>
    </tr>`;
  }
  const o = q.content?.options ?? {};
  const correct = (q.accepted_answers ?? [])[0] ?? 'A';
  const stemCell = kind === 'mcq'
    ? `<td><input data-c="stem" value="${esc(q.content?.stem ?? '')}" /></td>` : '';
  const sel = ['A', 'B', 'C', 'D'].map((L) =>
    `<option value="${L}"${L === correct ? ' selected' : ''}>${L}</option>`).join('');
  return `<tr>
    <td><input class="w-num" data-c="number" value="${n}" /></td>
    ${stemCell}
    <td><input data-c="a" value="${esc(o.a ?? '')}" /></td>
    <td><input data-c="b" value="${esc(o.b ?? '')}" /></td>
    <td><input data-c="c" value="${esc(o.c ?? '')}" /></td>
    <td><input data-c="d" value="${esc(o.d ?? '')}" /></td>
    <td><select data-c="correct" class="w-num">${sel}</select></td>
    <td><input data-c="explanation" value="${exp}" /></td>
    <td><button type="button" class="icon-btn danger" data-delrow="1">✕</button></td>
  </tr>`;
}

/* ---------- Sự kiện: uỷ quyền hết cho hai vùng chứa ---------- */
function bindOnce() {
  if (bindOnce._done) return;
  bindOnce._done = true;

  $('add-sec-btn').addEventListener('click', addSection);

  $('sections-list').addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.delrow) { t.closest('tr').remove(); return; }
    if (t.dataset.delsec) return deleteSection(Number(t.dataset.delsec));
    if (t.dataset.savesec) return saveSection(Number(t.dataset.savesec));
    if (t.dataset.saveq) return saveQuestions(Number(t.dataset.saveq));
    if (t.dataset.sync) return syncRows(Number(t.dataset.sync));
    if (t.dataset.addq) return addRow(Number(t.dataset.addq));
    if (t.dataset.csv) return pickCsv(Number(t.dataset.csv));
    if (t.dataset.move) return moveSection(Number(t.dataset.sec), t.dataset.move);
  });

  // Gõ đoạn văn tới đâu, cảnh báo lệch chỗ trống hiện tới đó.
  $('sections-list').addEventListener('input', (e) => {
    if (e.target.dataset.f === 'passage') updateHint(Number(e.target.dataset.sec));
  });
}

const secById = (id) => (exam.sections ?? []).find((s) => s.id === id);
const fieldOf = (id, f) => $('sections-list').querySelector(`[data-f="${f}"][data-sec="${id}"]`);
const tableOf = (id) => $('sections-list').querySelector(`[data-qtable="${id}"] tbody`);

function updateHint(id) {
  const sec = secById(id);
  const hint = $('sections-list').querySelector(`[data-hint="${id}"]`);
  if (!sec || !hint) return;
  const passage = fieldOf(id, 'passage')?.value ?? '';
  const nums = [...tableOf(id).querySelectorAll('[data-c="number"]')]
    .map((el) => parseInt(el.value, 10)).filter(Number.isInteger);
  const d = diffBlanks(passage, nums);
  const parts = [];
  if (d.duplicates.length) parts.push(`Chỗ trống trùng số: ${d.duplicates.join(', ')}`);
  if (d.missingQuestions.length) parts.push(`Chỗ trống chưa có câu: ${d.missingQuestions.join(', ')}`);
  if (d.orphanQuestions.length) parts.push(`Câu không có chỗ trống: ${d.orphanQuestions.join(', ')}`);
  hint.textContent = parts.length
    ? '⚠️ ' + parts.join(' · ')
    : `✓ ${scanBlanks(passage).filter((n) => n !== 0).length} chỗ trống khớp với bảng câu hỏi.`;
  hint.classList.toggle('warn', parts.length > 0);
}

async function addSection() {
  if (!exam?.id) { toast('Lưu thông tin đề trước đã.', 'bad'); return; }
  const kind = $('new-sec-kind').value;
  const position = (exam.sections ?? []).reduce((m, s) => Math.max(m, s.position), 0) + 1;
  try {
    await api('save_section', {
      section: {
        exam_id: exam.id, kind, position,
        title: '', instructions: '',
        // Phần dạng đoạn văn bắt buộc có passage -> mồi sẵn một chỗ trống mẫu.
        passage: kind === 'mcq' ? null : 'Nhập đoạn văn ở đây, chỗ trống viết {{1}}.',
        example: '',
      },
    });
    toast('Đã thêm phần');
    reopen();
  } catch (err) { toast(err.message, 'bad'); }
}

async function saveSection(id) {
  const sec = secById(id);
  if (!sec) return;
  try {
    await api('save_section', {
      section: {
        id, exam_id: exam.id, kind: sec.kind, position: sec.position,
        title: fieldOf(id, 'title')?.value ?? '',
        instructions: fieldOf(id, 'instructions')?.value ?? '',
        example: fieldOf(id, 'example')?.value ?? '',
        passage: sec.kind === 'mcq' ? null : (fieldOf(id, 'passage')?.value ?? ''),
      },
    });
    toast('Đã lưu phần');
    reopen();
  } catch (err) { toast(err.message, 'bad'); }
}

async function deleteSection(id) {
  const sec = secById(id);
  const n = (sec?.questions ?? []).length;
  if (!confirm(`Xoá phần này cùng ${n} câu hỏi bên trong? Không thể hoàn tác.`)) return;
  try { await api('delete_section', { section_id: id }); toast('Đã xoá phần'); reopen(); }
  catch (err) { toast(err.message, 'bad'); }
}

async function moveSection(id, dir) {
  const secs = [...(exam.sections ?? [])].sort((a, b) => a.position - b.position);
  const i = secs.findIndex((s) => s.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= secs.length) return;
  [secs[i], secs[j]] = [secs[j], secs[i]];
  try {
    // exam_id bắt buộc: Edge Function kiểm nó trước khi gọi RPC, RPC cũng lọc
    // update theo đúng exam_id để không đụng phần thi của đề khác.
    await api('reorder_sections', {
      exam_id: exam.id,
      order: secs.map((s, k) => ({ id: s.id, position: k + 1 })),
    });
    reopen();
  } catch (err) { toast(err.message, 'bad'); }
}

function addRow(id) {
  const sec = secById(id);
  const tbody = tableOf(id);
  const nums = [...tbody.querySelectorAll('[data-c="number"]')]
    .map((el) => parseInt(el.value, 10)).filter(Number.isInteger);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  tbody.insertAdjacentHTML('beforeend', qRow(sec.kind, { number: next }));
}

// Dựng lại bảng câu theo đúng các chỗ trống trong đoạn văn, giữ nguyên dòng đã nhập.
function syncRows(id) {
  const sec = secById(id);
  const passage = fieldOf(id, 'passage')?.value ?? '';
  const wanted = [...new Set(scanBlanks(passage).filter((n) => n !== 0))].sort((a, b) => a - b);
  const tbody = tableOf(id);
  const keep = new Map();
  tbody.querySelectorAll('tr').forEach((tr) => {
    const n = parseInt(tr.querySelector('[data-c="number"]').value, 10);
    if (Number.isInteger(n)) keep.set(n, readRow(sec.kind, tr));
  });
  tbody.innerHTML = wanted.map((n) => qRow(sec.kind, keep.get(n) ?? { number: n })).join('');
  updateHint(id);
  toast(`Bảng câu hỏi đã khớp ${wanted.length} chỗ trống`);
}

// Đọc một dòng bảng về đúng shape mà save_questions nhận.
function readRow(kind, tr) {
  const g = (c) => tr.querySelector(`[data-c="${c}"]`)?.value ?? '';
  const number = parseInt(g('number'), 10);
  const explanation = g('explanation').trim();
  if (kind === 'open_cloze') {
    return {
      number,
      accepted_answers: g('accepted').split('|').map((s) => s.trim()).filter(Boolean),
      explanation,
    };
  }
  const content = { options: { a: g('a'), b: g('b'), c: g('c'), d: g('d') } };
  if (kind === 'mcq') content.stem = g('stem');
  return { number, content, correct: g('correct'), explanation };
}

async function saveQuestions(id) {
  const sec = secById(id);
  const rows = [...tableOf(id).querySelectorAll('tr')].map((tr) => readRow(sec.kind, tr));
  const bad = rows.find((r) => !Number.isInteger(r.number));
  if (bad) { toast('Có dòng thiếu số câu.', 'bad'); return; }
  try {
    const { count } = await api('save_questions', { section_id: id, questions: rows });
    toast(`Đã lưu ${count} câu`);
    reopen();
  } catch (err) { toast(err.message, 'bad'); }
}

function pickCsv(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (!confirm(`Thay TOÀN BỘ câu hỏi của phần này bằng nội dung "${file.name}"?`)) return;
    try {
      const { count } = await api('import_csv', { section_id: id, csv: await file.text() });
      toast(`Đã nạp ${count} câu từ CSV`);
      reopen();
    } catch (err) { toast(err.message, 'bad'); }
  });
  input.click();
}

// Tải lại đề từ server sau mỗi thao tác ghi — tránh state trong bộ nhớ lệch với DB.
async function reopen() {
  const { openExam } = await import('./admin-exams.js');
  await openExam(exam.id);
}
