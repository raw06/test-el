import { api, setToken, getToken, clearToken } from './admin-api.js';
import { initExams, loadExams } from './admin-exams.js';
import { initResults, loadExamOptions } from './admin-results.js';

const $ = (id) => document.getElementById(id);
const show = (id) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
};

/* ---------- Đăng nhập ---------- */
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-err').textContent = '';
  setToken($('admin-token').value);
  try { await api('login'); enterAdmin(); }
  catch (err) { clearToken(); $('login-err').textContent = err.message; }
});

$('logout-btn').addEventListener('click', () => {
  clearToken();
  show('screen-login');
  $('admin-token').value = '';
});

async function enterAdmin() {
  show('screen-admin');
  initExams();
  initResults();
  await loadExams();
}

// Đã có token trong session thì tự vào thẳng.
if (getToken()) {
  api('login').then(enterAdmin).catch(() => clearToken());
}

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    $('tab-exams').classList.toggle('hidden', name !== 'exams');
    $('tab-results').classList.toggle('hidden', name !== 'results');
    if (name === 'results') loadExamOptions();
  });
});
