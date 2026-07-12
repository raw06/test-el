const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const DURATION_SEC = 60 * 60;
let questions = [], timerId = null, student = null, submitted = false;

const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); $(id).classList.remove('hidden'); };

$('info-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('full-name').value.trim(), cls = $('class-name').value.trim();
  if (!name || !cls) return;
  student = { name, cls };
  await loadQuestions();
  renderQuiz();
  show('screen-quiz');
  startTimer();
});

async function loadQuestions() {
  const { data, error } = await sb.from('questions_public').select('*').order('number');
  if (error) { alert('Lỗi tải câu hỏi: ' + error.message); throw error; }
  questions = data;
}

function renderQuiz() {
  $('questions').innerHTML = questions.map((q, i) => `
    <div class="q" data-num="${q.number}" style="--i:${i}">
      <div class="stem"><span class="num">${q.number}</span>${escapeHtml(q.content)}</div>
      ${['a','b','c','d'].map(o => `
        <label class="opt">
          <input type="radio" name="q${q.number}" value="${o.toUpperCase()}" />
          <span class="opt-key">${o.toUpperCase()}</span>
          <span class="opt-text">${escapeHtml(q['option_' + o])}</span>
        </label>`).join('')}
    </div>`).join('');
  renderNav();
  updateProgress();
  $('quiz-form').addEventListener('change', (e) => {
    const q = e.target.closest('.q');
    if (q) { q.classList.add('answered'); q.classList.remove('missing'); }
    updateProgress();
  });
}

// Lưới số câu để theo dõi + nhảy nhanh tới từng câu.
function renderNav() {
  $('nav-grid').innerHTML = questions.map(q =>
    `<button type="button" class="nav-cell" data-goto="${q.number}">${q.number}</button>`
  ).join('');
  $('nav-grid').addEventListener('click', (e) => {
    const num = e.target.dataset.goto;
    if (!num) return;
    const el = document.querySelector(`.q[data-num="${num}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function isAnswered(number) {
  return !!$('quiz-form').querySelector(`input[name="q${number}"]:checked`);
}

function updateProgress() {
  const answered = questions.filter(q => isAnswered(q.number)).length;
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  $('progress').textContent = `Đã trả lời ${answered}/${questions.length}`;
  const fill = $('progress-fill');
  if (fill) fill.style.width = pct + '%';
  // Cập nhật màu ô trong lưới theo trạng thái từng câu.
  questions.forEach(q => {
    const cell = $('nav-grid').querySelector(`[data-goto="${q.number}"]`);
    if (cell) cell.classList.toggle('done', isAnswered(q.number));
  });
}

function startTimer() {
  let left = DURATION_SEC;
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, '0'), s = String(left % 60).padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
    $('timer-bar').classList.toggle('warn', left <= 300);
    if (left <= 0) { clearInterval(timerId); doSubmit(true); return; }
    left--;
  };
  tick(); timerId = setInterval(tick, 1000);
}

$('quiz-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const unanswered = questions.filter(q => !$('quiz-form').querySelector(`input[name="q${q.number}"]:checked`));
  if (unanswered.length > 0) {
    // Bắt buộc làm hết mới cho nộp (trừ khi hết giờ — xử lý ở startTimer)
    markUnanswered(unanswered);
    alert(`Bạn còn ${unanswered.length} câu chưa trả lời. Vui lòng làm hết tất cả các câu trước khi nộp bài.`);
    const first = document.querySelector(`.q[data-num="${unanswered[0].number}"]`);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  doSubmit(false);
});

// Đánh dấu đỏ các câu chưa trả lời; tự bỏ đánh dấu khi học sinh chọn đáp án
function markUnanswered(list) {
  list.forEach(q => {
    const el = document.querySelector(`.q[data-num="${q.number}"]`);
    if (el) el.classList.add('missing');
  });
}

async function doSubmit(auto) {
  if (submitted) return; submitted = true;
  clearInterval(timerId);
  $('submit-btn').disabled = true;
  const answers = {};
  questions.forEach(q => {
    const sel = $('quiz-form').querySelector(`input[name="q${q.number}"]:checked`);
    if (sel) answers[q.number] = sel.value;
  });
  const { data, error } = await sb.rpc('submit_quiz', {
    p_full_name: student.name, p_class: student.cls, p_answers: answers,
  });
  if (error) { alert('Lỗi nộp bài: ' + error.message); submitted = false; $('submit-btn').disabled = false; return; }
  renderResult(data.score, data.total, auto);
  show('screen-result');
}

function renderResult(score, total, auto) {
  const pct = total ? score / total : 0;
  const msg = resultMessage(score, total, pct);
  $('result-emoji').textContent = msg.emoji;
  $('result-title').textContent = msg.title;
  $('score-text').innerHTML =
    `Chào <b>${escapeHtml(student.name)}</b> (lớp ${escapeHtml(student.cls)})<br>` +
    `Bạn đúng <b>${score}/${total}</b> câu — ${msg.line}`;
  $('result-note').textContent = auto
    ? 'Đã hết giờ nên bài được nộp tự động. Bạn có thể đóng trang này.'
    : 'Kết quả đã được ghi nhận. Bạn có thể đóng trang này.';
  if (pct >= 0.8) celebrate();
}

// Thông báo điểm thân thiện theo mức làm được
function resultMessage(score, total, pct) {
  if (pct >= 0.9) return { emoji: '🏆', title: 'Xuất sắc!', line: 'quá đỉnh, giữ phong độ nhé! 🎉' };
  if (pct >= 0.8) return { emoji: '🌟', title: 'Làm tốt lắm!', line: 'kết quả rất đáng khen 👏' };
  if (pct >= 0.65) return { emoji: '👍', title: 'Khá lắm!', line: 'chỉ cần cố thêm chút nữa thôi.' };
  if (pct >= 0.5) return { emoji: '🙂', title: 'Cũng ổn!', line: 'ôn thêm vài thì động từ là ngon ngay.' };
  return { emoji: '💪', title: 'Cố lên nhé!', line: 'đừng nản, luyện thêm rồi sẽ tiến bộ.' };
}

// Emoji bay lên ăn mừng khi điểm cao
function celebrate() {
  const card = document.querySelector('.result-card');
  const icons = ['🎉', '✨', '🎊', '⭐', '💫'];
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    s.textContent = icons[i % icons.length];
    s.style.left = (8 + Math.floor((i / 12) * 84)) + '%';
    s.style.animationDelay = (i * 60) + 'ms';
    card.appendChild(s);
    setTimeout(() => s.remove(), 1600 + i * 60);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
