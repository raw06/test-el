import { api, esc, toast } from './admin-api.js';
import { formatVn } from './lib-time.js';

const $ = (id) => document.getElementById(id);
const KEYS = ['a', 'b', 'c', 'd'];
let subs = [];
let examDetail = null;  // get_exam của đề đang xem, để đối chiếu bài làm
let openSub = null;

export function initResults() {
  if (initResults._done) return;
  initResults._done = true;
  $('res-exam').addEventListener('change', loadSubmissions);
  $('reload-subs-btn').addEventListener('click', loadSubmissions);
  $('download-xlsx-btn').addEventListener('click', downloadXlsx);
  $('clear-subs-btn').addEventListener('click', clearSubs);
  $('subs-body').addEventListener('click', (e) => {
    const id = e.target.dataset.view;
    if (id) showDetail(subs.find((s) => String(s.id) === id));
  });
  $('only-wrong').addEventListener('change', renderDetail);
  $('detail-close').addEventListener('click', closeDetail);
  $('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') closeDetail();
  });
}

export async function loadExamOptions() {
  try {
    const { exams } = await api('list_exams');
    const sel = $('res-exam');
    const keep = sel.value;
    sel.innerHTML = (exams ?? [])
      .map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.title)}</option>`).join('');
    if (keep && sel.querySelector(`option[value="${keep}"]`)) sel.value = keep;
    if (sel.value) await loadSubmissions();
  } catch (err) { toast(err.message, 'bad'); }
}

async function loadSubmissions() {
  const examId = Number($('res-exam').value);
  if (!examId) return;
  try {
    // Tải song song: bảng điểm và nội dung đề (cần để chấm lại chi tiết từng câu).
    const [{ submissions }, { exam }] = await Promise.all([
      api('list_submissions', { exam_id: examId }),
      api('get_exam', { exam_id: examId }),
    ]);
    subs = submissions ?? [];
    examDetail = exam;
    $('sub-count').textContent = `${subs.length} lượt nộp`;
    $('subs-empty').classList.toggle('hidden', subs.length > 0);
    $('subs-body').innerHTML = subs.map((r) => `<tr>
      <td>${r.id}</td>
      <td>${esc(r.full_name)}</td>
      <td>${esc(r.class_name)}</td>
      <td class="score">${r.score}/${r.total}</td>
      <td>${formatVn(r.created_at)}</td>
      <td><button type="button" class="icon-btn" data-view="${r.id}">Xem bài</button></td>
    </tr>`).join('');
  } catch (err) { toast(err.message, 'bad'); }
}

// Dẹt đề thành mảng câu hỏi kèm đáp án đúng — chỉ dùng ở phía giáo viên.
function examQuestions() {
  return (examDetail?.sections ?? [])
    .flatMap((sec) => (sec.questions ?? []).map((q) => ({ ...q, kind: sec.kind })))
    .sort((a, b) => a.number - b.number);
}

const isRight = (accepted, given) =>
  (accepted ?? []).some((a) => a.trim().toLowerCase() === String(given ?? '').trim().toLowerCase())
  && String(given ?? '').trim() !== '';

function showDetail(sub) {
  if (!sub) return;
  openSub = sub;
  $('detail-title').textContent = `Bài làm — ${sub.full_name}`;
  const wrong = examQuestions()
    .filter((q) => !isRight(q.accepted_answers, (sub.answers ?? {})[q.number])).length;
  $('detail-sub').textContent =
    `${sub.class_name} · Điểm ${sub.score}/${sub.total} · Sai ${wrong} câu · ${formatVn(sub.created_at)}`;
  $('only-wrong').checked = false;
  renderDetail();
  $('detail-modal').classList.remove('hidden');
}

function closeDetail() { $('detail-modal').classList.add('hidden'); openSub = null; }

function renderDetail() {
  if (!openSub) return;
  const answers = openSub.answers ?? {};
  const onlyWrong = $('only-wrong').checked;
  const items = examQuestions()
    .map((q) => {
      const chosen = String(answers[q.number] ?? '');
      return { q, chosen, ok: isRight(q.accepted_answers, chosen), blank: !chosen.trim() };
    })
    .filter((it) => !onlyWrong || !it.ok);

  if (!items.length) {
    $('detail-list').innerHTML =
      `<p class="muted center">${onlyWrong ? 'Không có câu sai nào 🎉' : 'Đề chưa có câu hỏi.'}</p>`;
    return;
  }

  $('detail-list').innerHTML = items.map(({ q, chosen, ok, blank }) => {
    const tag = ok ? '<span class="det-badge ok">Đúng</span>'
      : (blank ? '<span class="det-badge blank">Bỏ trống</span>'
               : '<span class="det-badge bad">Sai</span>');
    const accepted = (q.accepted_answers ?? []).join(' / ');
    const body = q.content?.options
      ? `${q.content.stem ? `<div class="det-stem">${esc(q.content.stem)}</div>` : ''}
         <div class="det-opts">${KEYS.map((k) => {
           const L = k.toUpperCase();
           const cls = [];
           if ((q.accepted_answers ?? []).includes(L)) cls.push('is-correct');
           if (L === chosen && !ok) cls.push('is-chosen-wrong');
           if (L === chosen && ok) cls.push('is-chosen-right');
           return `<div class="det-opt ${cls.join(' ')}">
             <span class="det-key">${L}</span>
             <span class="det-text">${esc(q.content.options[k])}</span>
           </div>`;
         }).join('')}</div>`
      : '';
    return `<div class="det-q ${ok ? '' : 'is-wrong'}">
      <div class="det-q-head">
        <span class="det-num">Câu ${q.number}</span>${tag}
        <span class="det-meta">HS trả lời: <b>${esc(chosen || '—')}</b> · Đúng: <b>${esc(accepted)}</b></span>
      </div>
      ${body}
      ${q.explanation ? `<div class="det-exp"><b>Giải thích:</b> ${esc(q.explanation)}</div>` : ''}
    </div>`;
  }).join('');
}

async function clearSubs() {
  const examId = Number($('res-exam').value);
  const label = $('res-exam').selectedOptions[0]?.textContent ?? '';
  if (!examId) return;
  if (!confirm(`Xoá TẤT CẢ kết quả của đề "${label}"? Không thể hoàn tác.`)) return;
  try { await api('clear_submissions', { exam_id: examId }); toast('Đã xoá kết quả'); loadSubmissions(); }
  catch (err) { toast(err.message, 'bad'); }
}

// Sinh .xlsx ngay trong trình duyệt bằng SheetJS (nạp từ CDN trong admin.html).
// Cột phải khớp với Edge Function export — sửa đây thì sửa cả bên đó.
function downloadXlsx() {
  if (typeof XLSX === 'undefined') { toast('Chưa tải được thư viện Excel, thử lại.', 'bad'); return; }
  if (!subs.length) { toast('Chưa có kết quả nào để tải.', 'bad'); return; }
  const code = examDetail?.code ?? '';
  const data = subs.map((r) => ({
    'ID': r.id,
    'Mã đề': code,
    'Tên đề': examDetail?.title ?? '',
    'Họ và tên': r.full_name,
    'Lớp': r.class_name,
    'Điểm': r.score,
    'Tổng': r.total,
    'Thời gian nộp': formatVn(r.created_at),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 24 },
                 { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KetQua');
  XLSX.writeFile(wb, `ket-qua-${code || 'de'}.xlsx`);
  toast('Đang tải file kết quả…');
}
