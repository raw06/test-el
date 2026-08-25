import { splitPassage } from './lib-passage.js';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Dẹt mọi phần thành một mảng câu hỏi; số câu đánh liên tục toàn đề nên sắp theo number.
export function allQuestions(sections) {
  return (sections ?? [])
    .flatMap((sec) => (sec.questions ?? []).map((q) => ({ ...q, kind: sec.kind, section_id: sec.id })))
    .sort((a, b) => a.number - b.number);
}

const KEYS = ['a', 'b', 'c', 'd'];

function optionList(number, options) {
  return KEYS.map((k) => `
    <label class="opt">
      <input type="radio" name="q${number}" data-qnum="${number}" value="${k.toUpperCase()}" />
      <span class="opt-key">${k.toUpperCase()}</span>
      <span class="opt-text">${escapeHtml(options?.[k])}</span>
    </label>`).join('');
}

// Dạng 1: câu trắc nghiệm đứng một mình, có đề bài riêng.
function renderMcq(sec) {
  return (sec.questions ?? []).map((q) => `
    <div class="q" data-num="${q.number}">
      <div class="stem"><span class="num">${q.number}</span>${escapeHtml(q.content?.stem)}</div>
      ${optionList(q.number, q.content?.options)}
    </div>`).join('');
}

// Dạng 2 và 3: đoạn văn có chỗ trống.
// open_cloze điền thẳng vào ô trong đoạn; mcq_cloze chọn A/B/C/D ở bảng bên dưới.
function renderCloze(sec) {
  const byNum = new Map((sec.questions ?? []).map((q) => [q.number, q]));
  const body = splitPassage(sec.passage).map((t) => {
    if (t.type === 'text') return escapeHtml(t.value);
    const q = byNum.get(t.number);
    // Chỗ trống không có câu hỏi tương ứng là ví dụ mẫu của đề gốc — chỉ hiện số.
    if (!q) return `<span class="gap gap-example">(${t.number})</span>`;
    if (sec.kind === 'open_cloze') {
      return `<span class="gap">
        <span class="gap-num">${t.number}</span>
        <input type="text" class="gap-input" data-qnum="${t.number}"
               autocomplete="off" autocapitalize="off" autocorrect="off"
               spellcheck="false" aria-label="Câu ${t.number}" />
      </span>`;
    }
    return `<button type="button" class="gap gap-ref" data-goto="${t.number}">${t.number}</button>`;
  }).join('');

  const opts = sec.kind === 'mcq_cloze'
    ? `<div class="cloze-opts">${(sec.questions ?? []).map((q) => `
        <div class="q q-inline" data-num="${q.number}">
          <div class="q-inline-num">${q.number}</div>
          <div class="q-inline-opts">${optionList(q.number, q.content?.options)}</div>
        </div>`).join('')}</div>`
    : '';

  return `<div class="passage">${body}</div>${opts}`;
}

export function renderSections(root, sections) {
  root.innerHTML = (sections ?? []).map((sec, i) => `
    <section class="sec" data-sec="${sec.id}" style="--i:${i}">
      ${sec.title ? `<h2 class="sec-title">${escapeHtml(sec.title)}</h2>` : ''}
      ${sec.instructions ? `<p class="sec-instr">${escapeHtml(sec.instructions)}</p>` : ''}
      ${sec.example ? `<p class="sec-example">${escapeHtml(sec.example)}</p>` : ''}
      ${sec.kind === 'mcq' ? renderMcq(sec) : renderCloze(sec)}
    </section>`).join('');
}

export function renderNav(grid, sections) {
  grid.innerHTML = allQuestions(sections).map((q) =>
    `<button type="button" class="nav-cell" data-goto="${q.number}">${q.number}</button>`).join('');
}

// Mọi ô nhập đáp án đều mang data-qnum, nên thu và đặt đáp án dùng chung một đường,
// không cần biết câu đó thuộc dạng nào.
export function collectAnswers(form) {
  const a = {};
  form.querySelectorAll('input[data-qnum]').forEach((el) => {
    const n = el.dataset.qnum;
    if (el.type === 'radio') { if (el.checked) a[n] = el.value; }
    else if (el.value.trim()) a[n] = el.value.trim();
  });
  return a;
}

export function applyAnswers(form, answers) {
  if (!answers) return;
  Object.entries(answers).forEach(([num, val]) => {
    const radio = form.querySelector(`input[type="radio"][data-qnum="${num}"][value="${val}"]`);
    if (radio) { radio.checked = true; return; }
    const text = form.querySelector(`input[type="text"][data-qnum="${num}"]`);
    if (text) text.value = val;
  });
  markAnswered(form);
}

export function answeredNumbers(form) {
  return new Set(Object.keys(collectAnswers(form)));
}

// Tô trạng thái "đã làm" cho từng câu — dùng cả khi khôi phục phiên lẫn khi học sinh gõ.
export function markAnswered(form) {
  const done = answeredNumbers(form);
  form.querySelectorAll('[data-num]').forEach((el) => {
    const isDone = done.has(el.dataset.num);
    el.classList.toggle('answered', isDone);
    if (isDone) el.classList.remove('missing');
  });
  // Ô điền từ nằm trong <span class="gap"> không có data-num, nên vòng lặp trên
  // không gỡ được dấu đỏ cho nó — phải gỡ ở đây, không thì học sinh gõ xong vẫn thấy đỏ.
  form.querySelectorAll('input[type="text"][data-qnum]').forEach((el) => {
    const isDone = done.has(el.dataset.qnum);
    el.classList.toggle('filled', isDone);
    if (isDone) el.classList.remove('missing');
  });
}
