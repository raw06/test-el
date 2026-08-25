import {
  renderSections, renderNav, collectAnswers, applyAnswers,
  answeredNumbers, markAnswered, allQuestions,
} from './app-render.js';
import { renderResult, bindReviewFilter } from './app-result.js';
import { formatVn } from './lib-time.js';

const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
// Bump khi đổi shape state đã lưu: v3 thêm mã đề và đáp án dạng chữ.
const STORAGE_KEY = 'quiz_state_v3';

const $ = (id) => document.getElementById(id);
const show = (id) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
};

let exam = null;        // meta từ exam_info
let sections = [];      // đề đầy đủ từ start_exam
let student = null;
let deadline = 0;
let timerId = null;
let submitted = false;

/* ---------- Lưu / khôi phục phiên ---------- */
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveState() {
  if (!student || !exam) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    code: exam.code, name: student.name, cls: student.cls,
    deadline, answers: collectAnswers($('quiz-form')),
  }));
}
function clearState() { localStorage.removeItem(STORAGE_KEY); }

/* ---------- Màn 1: nhập mã đề ---------- */
$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('code-err').textContent = '';
  const code = $('exam-code').value.trim().toUpperCase();
  if (!code) return;
  try {
    await lookupExam(code);
    show('screen-info');
  } catch (err) {
    // Lỗi từ exam_by_code đã là tiếng Việt sẵn (mã sai / chưa mở / hết hạn).
    $('code-err').textContent = err.message;
  }
});

async function lookupExam(code) {
  const { data, error } = await sb.rpc('exam_info', { p_code: code });
  if (error) throw new Error(error.message);
  exam = data;
  $('quiz-title').textContent = exam.title;
  $('quiz-subtitle').textContent = exam.subtitle ? `(${exam.subtitle})` : '';
  document.title = exam.subtitle ? `${exam.title} — ${exam.subtitle}` : exam.title;
  $('chip-count').textContent = `📝 ${exam.total} câu`;
  $('chip-duration').textContent = `⏱️ ${exam.duration_min} phút`;
  $('chip-expires').textContent = exam.expires_at
    ? `⏳ Hạn: ${formatVn(exam.expires_at)}`
    : '⏳ Không giới hạn';
}

$('change-code').addEventListener('click', (e) => {
  e.preventDefault();
  exam = null; $('code-err').textContent = ''; $('info-err').textContent = '';
  show('screen-code');
});

/* ---------- Màn 2: nhập thông tin rồi bắt đầu ---------- */
$('info-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('info-err').textContent = '';
  const name = $('full-name').value.trim(), cls = $('class-name').value.trim();
  if (!name || !cls || !exam) return;
  try {
    await loadExamBody(exam.code);
  } catch (err) { $('info-err').textContent = err.message; return; }
  student = { name, cls };
  // Mốc kết thúc tuyệt đối: reload trang không làm đồng hồ chạy lại từ đầu.
  deadline = Date.now() + exam.duration_min * 60 * 1000;
  paintQuiz();
  saveState();
  show('screen-quiz');
  startTimer();
});

async function loadExamBody(code) {
  const { data, error } = await sb.rpc('start_exam', { p_code: code });
  if (error) throw new Error(error.message);
  sections = data.sections ?? [];
  // duration_min lấy lại từ start_exam: giáo viên có thể vừa đổi sau khi em tra mã.
  exam = { ...exam, ...data, total: allQuestions(sections).length };
}

function paintQuiz() {
  renderSections($('sections'), sections);
  renderNav($('nav-grid'), sections);
  updateProgress();
}

/* ---------- Trong lúc làm bài ---------- */
const form = $('quiz-form');

// 'input' bắt cả gõ chữ lẫn chọn radio; 'change' bỏ sót ký tự đang gõ dở.
form.addEventListener('input', () => { markAnswered(form); updateProgress(); saveState(); });

form.addEventListener('click', (e) => {
  const num = e.target.dataset.goto;
  if (num) jumpTo(num);
});
$('nav-grid').addEventListener('click', (e) => {
  const num = e.target.dataset.goto;
  if (num) jumpTo(num);
});
$('nav-toggle').addEventListener('click', () => $('nav-panel').classList.toggle('collapsed'));

function jumpTo(num) {
  const el = form.querySelector(`[data-num="${num}"]`)
          || form.querySelector(`input[data-qnum="${num}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el.tagName === 'INPUT') el.focus();
}

function updateProgress() {
  const total = allQuestions(sections).length;
  const done = answeredNumbers(form);
  const pct = total ? Math.round((done.size / total) * 100) : 0;
  $('progress').textContent = `Đã trả lời ${done.size}/${total}`;
  $('progress-fill').style.width = pct + '%';
  $('nav-grid').querySelectorAll('[data-goto]').forEach((cell) => {
    cell.classList.toggle('done', done.has(cell.dataset.goto));
  });
}

function startTimer() {
  clearInterval(timerId);
  const tick = () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
    $('timer-bar').classList.toggle('warn', left <= 300);
    if (left <= 0) { clearInterval(timerId); doSubmit(true); }
  };
  tick();
  timerId = setInterval(tick, 1000);
}

/* ---------- Nộp bài ---------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const done = answeredNumbers(form);
  const missing = allQuestions(sections).filter((q) => !done.has(String(q.number)));
  if (missing.length) {
    // Nộp thủ công bắt buộc làm hết; nộp tự động khi hết giờ thì không (xử lý ở startTimer).
    missing.forEach((q) => {
      form.querySelector(`[data-num="${q.number}"]`)?.classList.add('missing');
      form.querySelector(`input[data-qnum="${q.number}"]`)?.classList.add('missing');
    });
    alert(`Bạn còn ${missing.length} câu chưa trả lời. Vui lòng làm hết trước khi nộp bài.`);
    jumpTo(missing[0].number);
    return;
  }
  doSubmit(false);
});

async function doSubmit(auto) {
  if (submitted) return;
  submitted = true;
  clearInterval(timerId);
  $('submit-btn').disabled = true;
  const { data, error } = await sb.rpc('submit_quiz', {
    p_code: exam.code, p_full_name: student.name,
    p_class: student.cls, p_answers: collectAnswers(form),
  });
  if (error) {
    alert('Lỗi nộp bài: ' + error.message);
    submitted = false;
    $('submit-btn').disabled = false;
    if (!auto) startTimer(); // hết giờ rồi thì đừng bật lại đồng hồ
    return;
  }
  clearState();
  renderResult({ student, sections, score: data.score, total: data.total, review: data.review, auto });
  show('screen-result');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Khôi phục phiên khi tải lại trang ---------- */
async function init() {
  bindReviewFilter();
  const s = loadState();
  if (!s || !s.code || !s.name || !s.deadline) return; // chưa có phiên -> màn nhập mã
  try {
    await lookupExam(s.code);
    await loadExamBody(s.code);
  } catch (err) {
    // Đề bị xoá hoặc hết hạn trong lúc em đóng máy: bỏ phiên, quay về nhập mã.
    clearState();
    $('code-err').textContent = err.message;
    return;
  }
  student = { name: s.name, cls: s.cls };
  deadline = s.deadline;
  paintQuiz();
  applyAnswers(form, s.answers);
  updateProgress();
  show('screen-quiz');
  if (Date.now() >= deadline) { doSubmit(true); return; } // hết giờ khi vắng mặt -> nộp luôn
  startTimer();
}

init();
