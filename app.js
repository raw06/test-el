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
  $('questions').innerHTML = questions.map(q => `
    <div class="q" data-num="${q.number}">
      <div class="stem"><span class="num">${q.number}</span>${escapeHtml(q.content)}</div>
      ${['a','b','c','d'].map(o => `
        <label class="opt">
          <input type="radio" name="q${q.number}" value="${o.toUpperCase()}" />
          <span class="opt-key">${o.toUpperCase()}</span>
          <span class="opt-text">${escapeHtml(q['option_' + o])}</span>
        </label>`).join('')}
    </div>`).join('');
  updateProgress();
  $('quiz-form').addEventListener('change', (e) => {
    const q = e.target.closest('.q');
    if (q) q.classList.add('answered');
    updateProgress();
  });
}

function updateProgress() {
  const answered = questions.filter(q => $('quiz-form').querySelector(`input[name="q${q.number}"]:checked`)).length;
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  $('progress').textContent = `Đã trả lời ${answered}/${questions.length}`;
  const fill = $('progress-fill');
  if (fill) fill.style.width = pct + '%';
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
  const answered = questions.filter(q => $('quiz-form').querySelector(`input[name="q${q.number}"]:checked`)).length;
  if (answered < questions.length &&
      !confirm(`Bạn mới trả lời ${answered}/${questions.length} câu. Nộp bài luôn?`)) return;
  doSubmit(false);
});

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
  $('score-text').textContent = `${student.name} (${student.cls}) — Điểm: ${data.score}/${data.total}`;
  if (auto) alert('Hết giờ! Bài đã được nộp tự động.');
  show('screen-result');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
