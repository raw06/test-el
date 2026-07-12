const FN_BASE = window.SUPABASE_URL + "/functions/v1";
let token = sessionStorage.getItem("admin_token") || "";
let questionsCache = [];

const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); $(id).classList.remove('hidden'); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function toast(msg, kind = 'ok') {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

// Gọi Edge Function admin. Trả về data JSON; ném lỗi kèm message tiếng Việt.
async function api(action, extra = {}) {
  const res = await fetch(FN_BASE + "/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": token },
    body: JSON.stringify({ action, ...extra }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
  return body;
}

/* ---------- Đăng nhập ---------- */
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-err').textContent = '';
  token = $('admin-token').value;
  try {
    await api('login');
    sessionStorage.setItem('admin_token', token);
    enterAdmin();
  } catch (err) {
    $('login-err').textContent = err.message;
  }
});

$('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('admin_token'); token = '';
  show('screen-login'); $('admin-token').value = '';
});

async function enterAdmin() {
  show('screen-admin');
  await loadQuestions();
}

// Nếu đã có token trong session, tự đăng nhập lại.
if (token) {
  api('login').then(enterAdmin).catch(() => { sessionStorage.removeItem('admin_token'); token = ''; });
}

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    $('tab-questions').classList.toggle('hidden', name !== 'questions');
    $('tab-results').classList.toggle('hidden', name !== 'results');
    if (name === 'results') loadSubmissions();
  });
});

/* ---------- Câu hỏi ---------- */
async function loadQuestions() {
  try {
    const { questions } = await api('list_questions');
    questionsCache = questions || [];
    renderQuestions();
  } catch (err) { toast(err.message, 'bad'); }
}

function renderQuestions() {
  $('q-count').textContent = `${questionsCache.length} câu hỏi`;
  $('q-list').innerHTML = questionsCache.map(q => {
    const opts = ['a','b','c','d'].map(o => {
      const cls = q.correct_answer === o.toUpperCase() ? 'correct' : '';
      return `<span class="${cls}">${o.toUpperCase()}. ${esc(q['option_' + o])}</span>`;
    }).join('');
    return `<div class="card qi">
      <div class="qi-num">${q.number}</div>
      <div class="qi-body">
        <div class="qi-stem">${esc(q.content)}</div>
        <div class="qi-opts">${opts}</div>
      </div>
      <div class="qi-actions">
        <button class="icon-btn" data-edit="${q.number}">Sửa</button>
        <button class="icon-btn danger" data-del="${q.number}">Xoá</button>
      </div>
    </div>`;
  }).join('');
}

// Uỷ quyền sự kiện cho nút Sửa/Xoá.
$('q-list').addEventListener('click', async (e) => {
  const edit = e.target.dataset.edit, del = e.target.dataset.del;
  if (edit) openModal(questionsCache.find(q => String(q.number) === edit));
  if (del) {
    if (!confirm(`Xoá câu ${del}?`)) return;
    try { await api('delete_question', { number: Number(del) }); toast('Đã xoá câu ' + del); loadQuestions(); }
    catch (err) { toast(err.message, 'bad'); }
  }
});

$('add-q-btn').addEventListener('click', () => {
  const nextNum = questionsCache.reduce((m, q) => Math.max(m, q.number), 0) + 1;
  openModal(null, nextNum);
});

/* ---------- Modal ---------- */
function openModal(q, defaultNum) {
  $('q-modal-title').textContent = q ? `Sửa câu ${q.number}` : 'Thêm câu hỏi';
  $('q-orig-number').value = q ? q.number : '';
  $('q-number').value = q ? q.number : (defaultNum ?? '');
  $('q-content').value = q ? q.content : '';
  $('q-a').value = q ? q.option_a : '';
  $('q-b').value = q ? q.option_b : '';
  $('q-c').value = q ? q.option_c : '';
  $('q-d').value = q ? q.option_d : '';
  $('q-correct').value = q ? q.correct_answer : 'A';
  $('q-form-err').textContent = '';
  $('q-modal').classList.remove('hidden');
}
function closeModal() { $('q-modal').classList.add('hidden'); }
$('q-cancel').addEventListener('click', closeModal);
$('q-modal').addEventListener('click', (e) => { if (e.target.id === 'q-modal') closeModal(); });

$('q-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('q-form-err').textContent = '';
  const question = {
    number: Number($('q-number').value),
    content: $('q-content').value,
    option_a: $('q-a').value, option_b: $('q-b').value,
    option_c: $('q-c').value, option_d: $('q-d').value,
    correct_answer: $('q-correct').value,
  };
  try {
    await api('save_question', { question });
    closeModal(); toast('Đã lưu câu hỏi'); loadQuestions();
  } catch (err) { $('q-form-err').textContent = err.message; }
});

/* ---------- Upload CSV ---------- */
$('csv-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // cho phép chọn lại cùng file
  if (!file) return;
  if (!confirm(`Thay TOÀN BỘ đề hiện tại bằng nội dung file "${file.name}"?\nĐề cũ sẽ bị xoá.`)) return;
  try {
    const csv = await file.text();
    const { count } = await api('replace_csv', { csv });
    toast(`Đã nạp ${count} câu hỏi từ CSV`); loadQuestions();
  } catch (err) { toast(err.message, 'bad'); }
});

/* ---------- Kết quả ---------- */
async function loadSubmissions() {
  try {
    const { submissions } = await api('list_submissions');
    const rows = submissions || [];
    $('sub-count').textContent = `${rows.length} lượt nộp`;
    $('subs-empty').classList.toggle('hidden', rows.length > 0);
    $('subs-body').innerHTML = rows.map(r => `<tr>
      <td>${r.id}</td>
      <td>${esc(r.full_name)}</td>
      <td>${esc(r.class_name)}</td>
      <td class="score">${r.score}/${r.total}</td>
      <td>${new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
    </tr>`).join('');
  } catch (err) { toast(err.message, 'bad'); }
}

$('reload-subs-btn').addEventListener('click', loadSubmissions);

$('clear-subs-btn').addEventListener('click', async () => {
  if (!confirm('Xoá TẤT CẢ kết quả học sinh? Không thể hoàn tác.')) return;
  try { await api('clear_submissions'); toast('Đã xoá tất cả kết quả'); loadSubmissions(); }
  catch (err) { toast(err.message, 'bad'); }
});

// Tải Excel: dùng lại Edge Function export sẵn có, nhưng ở đây sinh CSV-xlsx từ dữ liệu đã tải.
$('download-xlsx-btn').addEventListener('click', async () => {
  try {
    const { submissions } = await api('list_submissions');
    downloadXlsx(submissions || []);
  } catch (err) { toast(err.message, 'bad'); }
});

// Tạo file .xls (SpreadsheetML) mở được bằng Excel — không cần thư viện ngoài.
function downloadXlsx(rows) {
  const head = ['ID', 'Họ và tên', 'Lớp', 'Điểm', 'Tổng', 'Thời gian nộp'];
  const body = rows.map(r => [
    r.id, r.full_name, r.class_name, r.score, r.total,
    new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  ]);
  const cell = (v) => `<td>${esc(v)}</td>`;
  const tr = (cells) => `<tr>${cells.map(cell).join('')}</tr>`;
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"></head>
    <body><table border="1">${tr(head)}${body.map(tr).join('')}</table></body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ket-qua-lam-bai.xls';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Đang tải file kết quả…');
}
