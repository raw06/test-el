import { escapeHtml, allQuestions } from './app-render.js';

const $ = (id) => document.getElementById(id);
const KEYS = ['a', 'b', 'c', 'd'];
let ctx = null; // giữ lại để ô lọc vẽ lại được mà không cần gọi RPC lần nữa

export function renderResult(next) {
  ctx = next;
  const { student, score, total, review, auto } = ctx;
  const pct = total ? score / total : 0;
  const msg = resultMessage(pct);
  $('result-emoji').textContent = msg.emoji;
  $('result-title').textContent = msg.title;
  $('score-text').innerHTML =
    `Chào <b>${escapeHtml(student.name)}</b> (lớp ${escapeHtml(student.cls)})<br>` +
    `Bạn đúng <b>${score}/${total}</b> câu — ${msg.line}`;
  $('result-note').textContent = auto
    ? 'Đã hết giờ nên bài được nộp tự động. Bạn có thể đóng trang này.'
    : 'Kết quả đã được ghi nhận. Bạn có thể đóng trang này.';

  // review = null nghĩa là giáo viên tắt lời giải cho đề này.
  const wrap = $('review-wrap');
  wrap.classList.toggle('hidden', !Array.isArray(review) || review.length === 0);
  if (Array.isArray(review) && review.length) renderReview();
  if (pct >= 0.8) celebrate();
}

export function bindReviewFilter() {
  $('only-wrong-result').addEventListener('change', renderReview);
}

function renderReview() {
  if (!ctx) return;
  const onlyWrong = $('only-wrong-result').checked;
  const byNum = new Map(allQuestions(ctx.sections).map((q) => [q.number, q]));
  const items = ctx.review.filter((r) => !onlyWrong || !r.is_correct);

  if (!items.length) {
    $('review-list').innerHTML =
      `<p class="muted center">${onlyWrong ? 'Bạn không sai câu nào 🎉' : 'Không có dữ liệu.'}</p>`;
    return;
  }

  $('review-list').innerHTML = items.map((r) => {
    const q = byNum.get(r.number);
    const chosen = String(r.chosen ?? '');
    const accepted = (r.accepted ?? []).join(' / ');
    const tag = r.is_correct
      ? '<span class="rv-badge ok">Đúng</span>'
      : (chosen ? '<span class="rv-badge bad">Sai</span>'
                : '<span class="rv-badge blank">Bỏ trống</span>');

    // Câu trắc nghiệm hiện lại đủ bốn phương án; câu điền từ chỉ hiện từ đã gõ.
    const body = q && q.content?.options
      ? `${q.content.stem ? `<div class="rv-stem">${escapeHtml(q.content.stem)}</div>` : ''}
         <div class="rv-opts">${KEYS.map((k) => {
           const L = k.toUpperCase();
           const cls = [];
           if ((r.accepted ?? []).includes(L)) cls.push('is-correct');
           if (L === chosen && !r.is_correct) cls.push('is-chosen-wrong');
           return `<div class="rv-opt ${cls.join(' ')}">
             <span class="rv-key">${L}</span>
             <span class="rv-text">${escapeHtml(q.content.options[k])}</span>
           </div>`;
         }).join('')}</div>`
      : `<div class="rv-line">Bạn điền: <b>${escapeHtml(chosen || '—')}</b></div>`;

    return `<div class="card rv-q ${r.is_correct ? '' : 'is-wrong'}">
      <div class="rv-head">
        <span class="rv-num">Câu ${r.number}</span>${tag}
        <span class="rv-meta">Đáp án đúng: <b>${escapeHtml(accepted)}</b></span>
      </div>
      ${body}
      ${r.explanation
        ? `<div class="rv-exp"><b>Giải thích:</b> ${escapeHtml(r.explanation)}</div>`
        : ''}
    </div>`;
  }).join('');
}

function resultMessage(pct) {
  if (pct >= 0.9) return { emoji: '🏆', title: 'Xuất sắc!', line: 'quá đỉnh, giữ phong độ nhé! 🎉' };
  if (pct >= 0.8) return { emoji: '🌟', title: 'Làm tốt lắm!', line: 'kết quả rất đáng khen 👏' };
  if (pct >= 0.65) return { emoji: '👍', title: 'Khá lắm!', line: 'chỉ cần cố thêm chút nữa thôi.' };
  if (pct >= 0.5) return { emoji: '🙂', title: 'Cũng ổn!', line: 'xem lại lời giải bên dưới là ngon ngay.' };
  return { emoji: '💪', title: 'Cố lên nhé!', line: 'đọc kỹ lời giải bên dưới rồi luyện thêm.' };
}

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
