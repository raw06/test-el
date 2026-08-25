import { api, esc, toast } from './admin-api.js';
import { toUtcIso, toLocalInput, formatVn } from './lib-time.js';
import { renderSectionsAdmin } from './admin-sections.js';

const $ = (id) => document.getElementById(id);
let exams = [];
let current = null;   // đề đang mở ở view soạn đề

export function initExams() {
  if (initExams._done) return; // module nạp một lần, nhưng enterAdmin có thể chạy lại
  initExams._done = true;

  $('add-exam-btn').addEventListener('click', () => openBlank());
  $('reload-exams-btn').addEventListener('click', loadExams);
  $('back-to-exams').addEventListener('click', () => { current = null; loadExams(); showList(); });
  $('exams-list').addEventListener('click', (e) => {
    const id = e.target.dataset.open;
    if (id) openExam(Number(id));
  });
  $('exam-form').addEventListener('submit', saveExam);
  $('exam-dup-btn').addEventListener('click', duplicateExam);
  $('exam-del-btn').addEventListener('click', deleteExam);
}

function showList() {
  $('exams-list-view').classList.remove('hidden');
  $('exam-edit-view').classList.add('hidden');
}
function showEdit() {
  $('exams-list-view').classList.add('hidden');
  $('exam-edit-view').classList.remove('hidden');
}

export async function loadExams() {
  try {
    const { exams: list } = await api('list_exams');
    exams = list ?? [];
    $('exam-count').textContent = `${exams.length} đề`;
    $('exams-list').innerHTML = exams.length
      ? exams.map(examCard).join('')
      : '<p class="muted center">Chưa có đề nào. Bấm “Tạo đề mới” để bắt đầu.</p>';
  } catch (err) { toast(err.message, 'bad'); }
}

// PostgREST trả các cột count dạng [{count: n}].
const countOf = (v) => (Array.isArray(v) ? (v[0]?.count ?? 0) : 0);

function examCard(e) {
  const state = e.is_published
    ? '<span class="pill ok">Đang mở</span>'
    : '<span class="pill draft">Nháp</span>';
  const expired = e.expires_at && new Date(e.expires_at) < new Date()
    ? '<span class="pill bad">Hết hạn</span>' : '';
  return `<div class="card qi exam-card">
    <div class="qi-num code">${esc(e.code)}</div>
    <div class="qi-body">
      <div class="qi-stem">${esc(e.title)} ${state} ${expired}</div>
      <div class="qi-opts muted small">
        ${esc(e.subtitle || '—')} · ${e.duration_min} phút ·
        ${countOf(e.sections)} phần · ${countOf(e.questions)} câu ·
        ${countOf(e.submissions)} lượt nộp
      </div>
      <div class="qi-opts muted small">
        Mở: ${formatVn(e.opens_at)} · Hết hạn: ${formatVn(e.expires_at)}
      </div>
    </div>
    <div class="qi-actions">
      <button class="icon-btn" data-open="${e.id}">Soạn đề</button>
    </div>
  </div>`;
}

function openBlank() {
  current = null;
  $('exam-id').value = '';
  $('exam-code-in').value = '';
  $('exam-title').value = '';
  $('exam-subtitle').value = '';
  $('exam-duration').value = 60;
  $('exam-opens').value = '';
  $('exam-expires').value = '';
  $('exam-published').checked = false;
  $('exam-explain').checked = true;
  $('exam-form-err').textContent = '';
  $('exam-open-link').classList.add('hidden');
  // Chưa có id thì chưa gắn phần thi vào đâu được — lưu thông tin đề trước.
  $('sections-list').innerHTML =
    '<p class="muted center">Lưu thông tin đề trước, rồi mới thêm được phần thi.</p>';
  $('add-sec-btn').disabled = true;
  showEdit();
}

export async function openExam(id) {
  try {
    const { exam } = await api('get_exam', { exam_id: id });
    current = exam;
    $('exam-id').value = exam.id;
    $('exam-code-in').value = exam.code;
    $('exam-title').value = exam.title;
    $('exam-subtitle').value = exam.subtitle ?? '';
    $('exam-duration').value = exam.duration_min;
    $('exam-opens').value = toLocalInput(exam.opens_at);
    $('exam-expires').value = toLocalInput(exam.expires_at);
    $('exam-published').checked = !!exam.is_published;
    $('exam-explain').checked = !!exam.show_explanations;
    $('exam-form-err').textContent = '';
    const link = $('exam-open-link');
    link.href = 'index.html';
    link.classList.remove('hidden');
    $('add-sec-btn').disabled = false;
    renderSectionsAdmin(exam);
    showEdit();
  } catch (err) { toast(err.message, 'bad'); }
}

async function saveExam(e) {
  e.preventDefault();
  $('exam-form-err').textContent = '';
  const btn = $('exam-save-btn');
  btn.disabled = true;
  try {
    const { id } = await api('save_exam', {
      exam: {
        id: $('exam-id').value || null,
        code: $('exam-code-in').value,
        title: $('exam-title').value,
        subtitle: $('exam-subtitle').value,
        duration_min: $('exam-duration').value,
        opens_at: toUtcIso($('exam-opens').value),
        expires_at: toUtcIso($('exam-expires').value),
        is_published: $('exam-published').checked,
        show_explanations: $('exam-explain').checked,
      },
    });
    toast('Đã lưu thông tin đề');
    await openExam(id);   // tải lại để có id cho phần thi
    loadExams();
  } catch (err) {
    $('exam-form-err').textContent = err.message;
  } finally { btn.disabled = false; }
}

async function duplicateExam() {
  if (!current) { toast('Lưu đề trước đã.', 'bad'); return; }
  const newCode = prompt('Mã cho đề mới (3–12 ký tự chữ HOA hoặc số):', current.code + 'B');
  if (!newCode) return;
  try {
    const { id } = await api('duplicate_exam', { exam_id: current.id, new_code: newCode });
    toast('Đã nhân bản. Bản sao đang ở trạng thái nháp.');
    await loadExams();
    await openExam(id);
  } catch (err) { toast(err.message, 'bad'); }
}

async function deleteExam() {
  if (!current) return;
  // Xoá đề kéo theo mọi bài làm của học sinh -> bắt gõ lại mã, không dùng confirm suông.
  const typed = prompt(
    `Xoá đề "${current.title}" sẽ xoá LUÔN mọi bài làm của học sinh và không thể hoàn tác.\n` +
    `Gõ lại mã đề để xác nhận:`);
  if (!typed) return;
  try {
    await api('delete_exam', { exam_id: current.id, confirm_code: typed });
    toast('Đã xoá đề');
    current = null;
    await loadExams();
    showList();
  } catch (err) { toast(err.message, 'bad'); }
}
