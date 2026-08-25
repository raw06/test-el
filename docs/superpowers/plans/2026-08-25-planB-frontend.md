# Plan B — Frontend: App học sinh và giao diện quản trị

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học sinh nhập mã đề, làm bài gồm ba dạng câu hỏi trộn lẫn, nộp xong xem lời giải; giáo viên soạn được đề nhiều phần và xem bài làm từng em.

**Architecture:** Tách `app.js` và `admin.js` thành module ES nạp thẳng bằng `<script type="module">` — không bundler, không build step. Hai hàm thuần (`lib-passage.js`, `lib-time.js`) dùng chung cho cả hai app và được test bằng `node --test`. Toàn bộ dữ liệu học sinh đi qua ba RPC của Plan A; toàn bộ dữ liệu giáo viên đi qua Edge Function `admin`.

**Tech Stack:** HTML/CSS/JS thuần (ES modules), `@supabase/supabase-js@2` và `xlsx@0.18.5` qua CDN, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-25-nhieu-de-va-dang-cau-hoi-design.md`

**Phụ thuộc:** Plan A phải xong và đã deploy — plan này gọi `exam_info`, `start_exam`, `submit_quiz` và các action admin mới.

## Global Constraints

- Toàn bộ UI text, comment, commit message dùng **tiếng Việt** có dấu đầy đủ.
- Thời gian hiển thị format `'vi-VN'`, timezone `'Asia/Ho_Chi_Minh'`.
- Mọi nội dung người dùng nhập phải qua `escapeHtml()` / `esc()` trước khi nội suy vào template string — code render bằng `innerHTML` ở khắp nơi.
- **Thêm file frontend mới bắt buộc sửa `.github/workflows/deploy.yml`** — workflow `cp` từng file theo tên, file không có trong danh sách sẽ không được deploy.
- `config.js` chỉ chứa `window.SUPABASE_URL` + `window.SUPABASE_ANON_KEY`. Không bao giờ đưa service-role key vào client.
- Không thêm `package.json`, không `npm install`.
- Text hardcode trong `index.html` là fallback có chủ đích — đừng "dọn".

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib-passage.js` | Hàm thuần: tách đoạn văn theo `{{n}}`, đối chiếu chỗ trống với câu hỏi |
| `lib-time.js` | Hàm thuần: đổi qua lại giữa `datetime-local` và ISO UTC theo giờ VN |
| `index.html` | Bốn màn: nhập mã đề → nhập thông tin → làm bài → kết quả |
| `app.js` | Điều phối: mã đề, phiên làm bài, đồng hồ, nộp bài |
| `app-render.js` | Vẽ đề: `mcq`, `open_cloze`, `mcq_cloze`; lưới điều hướng; thu/đặt đáp án |
| `app-result.js` | Vẽ màn kết quả và phần lời giải |
| `styles.css` | Thêm style cho đoạn văn, ô trống, khối lời giải |
| `admin.html` | Đăng nhập, tab Đề kiểm tra / Kết quả, hai view danh sách và soạn đề |
| `admin-api.js` | `api()`, `esc()`, `toast()`, quản lý token |
| `admin.js` | Đăng nhập, chuyển tab, nối các module |
| `admin-exams.js` | Danh sách đề + form thông tin đề |
| `admin-sections.js` | Soạn phần thi và bảng câu hỏi cho ba dạng |
| `admin-results.js` | Bảng kết quả theo đề, tải Excel, xem chi tiết bài làm |
| `.github/workflows/deploy.yml` | Bổ sung 7 file mới vào lệnh `cp` |

---

### Task 1: `lib-time.js` — đổi giờ giữa form và DB

**Files:**
- Create: `lib-time.js`, `tests/lib-time.test.mjs`

**Interfaces:**
- Produces:
  - `toUtcIso(localValue: string) → string | null` — nhận `'2026-08-25T14:30'` (hiểu là giờ VN), trả ISO UTC. Rỗng/không hợp lệ → `null`.
  - `toLocalInput(iso: string) → string` — ngược lại, trả đúng dạng `<input type="datetime-local">` cần. Rỗng/không hợp lệ → `''`.
  - `formatVn(iso: string) → string` — chuỗi hiển thị `'vi-VN'` theo giờ VN; rỗng → `'—'`.

- [ ] **Step 1: Viết test TRƯỚC**

`tests/lib-time.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUtcIso, toLocalInput, formatVn } from '../lib-time.js';

test('toUtcIso: hiểu giá trị nhập là giờ Việt Nam (+07:00)', () => {
  assert.equal(toUtcIso('2026-08-25T14:30'), '2026-08-25T07:30:00.000Z');
});

test('toUtcIso: qua ngày khi trừ 7 tiếng', () => {
  assert.equal(toUtcIso('2026-08-25T03:00'), '2026-08-24T20:00:00.000Z');
});

test('toUtcIso: chấp nhận cả dạng có giây', () => {
  assert.equal(toUtcIso('2026-08-25T14:30:45'), '2026-08-25T07:30:45.000Z');
});

test('toUtcIso: rỗng hoặc rác trả null', () => {
  assert.equal(toUtcIso(''), null);
  assert.equal(toUtcIso('   '), null);
  assert.equal(toUtcIso(null), null);
  assert.equal(toUtcIso('không phải ngày'), null);
});

test('toLocalInput: đưa ISO UTC về ô datetime-local giờ VN', () => {
  assert.equal(toLocalInput('2026-08-25T07:30:00.000Z'), '2026-08-25T14:30');
});

test('toLocalInput: nửa đêm giờ VN hiện 00 chứ không phải 24', () => {
  assert.equal(toLocalInput('2026-08-24T17:00:00.000Z'), '2026-08-25T00:00');
});

test('toLocalInput: rỗng hoặc rác trả chuỗi rỗng', () => {
  assert.equal(toLocalInput(null), '');
  assert.equal(toLocalInput(''), '');
  assert.equal(toLocalInput('rác'), '');
});

test('toUtcIso rồi toLocalInput trả lại đúng giá trị ban đầu', () => {
  const v = '2026-12-31T23:59';
  assert.equal(toLocalInput(toUtcIso(v)), v);
});

test('formatVn: rỗng trả gạch ngang', () => {
  assert.equal(formatVn(null), '—');
  assert.equal(formatVn(''), '—');
});

test('formatVn: có ngày tháng giờ VN trong chuỗi', () => {
  const s = formatVn('2026-08-25T07:30:00.000Z');
  assert.match(s, /25\/8\/2026|25\/08\/2026/);
  assert.match(s, /14:30/);
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `node --test tests/lib-time.test.mjs`
Expected: FAIL — `Cannot find module '../lib-time.js'`.

- [ ] **Step 3: Viết module**

`lib-time.js`:

```javascript
// Đổi giờ giữa ô <input type="datetime-local"> và mốc ISO UTC lưu trong DB.
// Luôn hiểu giá trị giáo viên nhập là GIỜ VIỆT NAM, bất kể máy họ đặt múi giờ nào —
// nếu dựa vào múi giờ của trình duyệt thì giáo viên đi công tác sẽ đặt nhầm hạn nộp.
const VN_OFFSET = '+07:00';

export function toUtcIso(localValue) {
  const v = String(localValue ?? '').trim();
  if (!v) return null;
  // datetime-local trả 'YYYY-MM-DDTHH:mm', một số trình duyệt kèm cả giây.
  const withSec = v.length === 16 ? v + ':00' : v;
  const d = new Date(withSec + VN_OFFSET);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // hourCycle 'h23': tránh một số engine trả '24' cho nửa đêm.
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatVn(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `node --test tests/lib-time.test.mjs`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib-time.js tests/lib-time.test.mjs
git commit -m "feat: lib-time đổi giờ giữa form và DB theo múi giờ Việt Nam"
```

---

### Task 2: `lib-passage.js` — tách đoạn văn theo `{{n}}`

**Files:**
- Create: `lib-passage.js`, `tests/lib-passage.test.mjs`

**Interfaces:**
- Produces:
  - `splitPassage(passage: string) → Array<{type:'text', value:string} | {type:'gap', number:number}>` — giữ nguyên thứ tự, giữ nguyên khoảng trắng và xuống dòng trong phần `text`.
  - `scanBlanks(passage: string) → number[]` — số hiệu các chỗ trống theo thứ tự xuất hiện, kể cả số trùng.
  - `diffBlanks(passage: string, numbers: number[]) → {duplicates:number[], missingQuestions:number[], orphanQuestions:number[]}` — đối chiếu chỗ trống với danh sách câu hỏi đang có. Chỗ trống số `0` là ví dụ mẫu, không tính.

- [ ] **Step 1: Viết test TRƯỚC**

`tests/lib-passage.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPassage, scanBlanks, diffBlanks } from '../lib-passage.js';

test('splitPassage: xen kẽ chữ và chỗ trống', () => {
  assert.deepEqual(splitPassage('Gold is {{1}} rare.'), [
    { type: 'text', value: 'Gold is ' },
    { type: 'gap', number: 1 },
    { type: 'text', value: ' rare.' },
  ]);
});

test('splitPassage: chỗ trống ngay đầu và ngay cuối', () => {
  assert.deepEqual(splitPassage('{{1}} giữa {{2}}'), [
    { type: 'gap', number: 1 },
    { type: 'text', value: ' giữa ' },
    { type: 'gap', number: 2 },
  ]);
});

test('splitPassage: giữ nguyên xuống dòng', () => {
  const t = splitPassage('dòng một\n\ndòng hai {{9}}');
  assert.equal(t[0].value, 'dòng một\n\ndòng hai ');
});

test('splitPassage: cho phép khoảng trắng bên trong ngoặc', () => {
  assert.deepEqual(splitPassage('a {{ 12 }} b')[1], { type: 'gap', number: 12 });
});

test('splitPassage: không có chỗ trống thì trả một khối chữ', () => {
  assert.deepEqual(splitPassage('chỉ là chữ'), [{ type: 'text', value: 'chỉ là chữ' }]);
});

test('splitPassage: chuỗi rỗng hoặc null trả mảng rỗng', () => {
  assert.deepEqual(splitPassage(''), []);
  assert.deepEqual(splitPassage(null), []);
});

test('splitPassage: gọi hai lần cho kết quả giống nhau', () => {
  const p = 'a {{1}} b {{2}}';
  assert.deepEqual(splitPassage(p), splitPassage(p)); // regex có cờ /g, phải reset lastIndex
});

test('scanBlanks: trả số theo thứ tự xuất hiện', () => {
  assert.deepEqual(scanBlanks('{{0}} x {{9}} y {{10}}'), [0, 9, 10]);
});

test('diffBlanks: khớp hoàn toàn thì ba mảng đều rỗng', () => {
  assert.deepEqual(diffBlanks('{{0}} a {{9}} b {{10}}', [9, 10]),
    { duplicates: [], missingQuestions: [], orphanQuestions: [] });
});

test('diffBlanks: chỗ trống chưa có câu hỏi', () => {
  assert.deepEqual(diffBlanks('{{9}} {{10}} {{11}}', [9]).missingQuestions, [10, 11]);
});

test('diffBlanks: câu hỏi không có chỗ trống tương ứng', () => {
  assert.deepEqual(diffBlanks('{{9}}', [9, 42]).orphanQuestions, [42]);
});

test('diffBlanks: chỗ trống bị đánh trùng số', () => {
  assert.deepEqual(diffBlanks('{{9}} x {{9}}', [9]).duplicates, [9]);
});

test('diffBlanks: chỗ trống số 0 là ví dụ mẫu, không đòi câu hỏi', () => {
  assert.deepEqual(diffBlanks('{{0}} {{9}}', [9]),
    { duplicates: [], missingQuestions: [], orphanQuestions: [] });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `node --test tests/lib-passage.test.mjs`
Expected: FAIL — `Cannot find module '../lib-passage.js'`.

- [ ] **Step 3: Viết module**

`lib-passage.js`:

```javascript
// Đoạn văn dùng {{9}} để đánh dấu chỗ trống — số trong ngoặc chính là số câu hỏi.
// Chỗ trống {{0}} là ví dụ mẫu của đề gốc: hiện ra nhưng không phải câu cần làm.
const GAP_RE = /\{\{\s*(\d+)\s*\}\}/g;

export function splitPassage(passage) {
  const src = String(passage ?? '');
  if (!src) return [];
  const out = [];
  let last = 0, m;
  GAP_RE.lastIndex = 0; // regex có cờ /g và dùng lại giữa các lần gọi
  while ((m = GAP_RE.exec(src)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: src.slice(last, m.index) });
    out.push({ type: 'gap', number: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

export function scanBlanks(passage) {
  return splitPassage(passage).filter((t) => t.type === 'gap').map((t) => t.number);
}

// Đối chiếu chỗ trống trong đoạn văn với danh sách số câu hỏi đang có,
// để admin cảnh báo trước khi lưu thay vì để học sinh gặp ô trống không chấm được.
export function diffBlanks(passage, numbers) {
  const gaps = scanBlanks(passage).filter((n) => n !== 0);
  const qs = (numbers ?? []).map(Number);
  const gapSet = new Set(gaps), qSet = new Set(qs);
  const asc = (a, b) => a - b;
  return {
    duplicates: [...new Set(gaps.filter((n, i) => gaps.indexOf(n) !== i))].sort(asc),
    missingQuestions: [...gapSet].filter((n) => !qSet.has(n)).sort(asc),
    orphanQuestions: [...qSet].filter((n) => !gapSet.has(n)).sort(asc),
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `node --test 'tests/*.test.mjs'`
Expected: cả ba file test đều pass (`lib-csv`, `lib-time`, `lib-passage`).

- [ ] **Step 5: Commit**

```bash
git add lib-passage.js tests/lib-passage.test.mjs
git commit -m "feat: lib-passage tách đoạn văn theo dấu {{n}}"
```

---

### Task 3: `index.html` — bốn màn hình

**Files:**
- Modify: `index.html` (viết lại toàn bộ phần `<body>`)

**Interfaces:**
- Produces: các id mà `app.js` bám vào — `screen-code`, `code-form`, `exam-code`, `code-err`, `exam-preview`, `screen-info`, `chip-count`, `chip-duration`, `chip-expires`, `quiz-title`, `quiz-subtitle`, `info-form`, `full-name`, `class-name`, `info-err`, `change-code`, `screen-quiz`, `quiz-form`, `sections`, `nav-grid`, `nav-panel`, `nav-toggle`, `timer`, `timer-bar`, `progress`, `progress-fill`, `submit-btn`, `screen-result`, `result-emoji`, `result-title`, `score-text`, `result-note`, `review-wrap`, `review-list`, `only-wrong-result`.

- [ ] **Step 1: Viết lại `index.html`**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bài kiểm tra tiếng Anh</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- Màn 1: nhập mã đề -->
  <section id="screen-code" class="screen">
    <div class="card intro-card">
      <span class="badge">Bài kiểm tra</span>
      <h1>Nhập mã đề</h1>
      <p class="lead">Nhập mã đề giáo viên đưa cho bạn để xem thông tin bài kiểm tra.</p>
      <form id="code-form">
        <label class="field">
          <span class="field-label">Mã đề <em>*</em></span>
          <input id="exam-code" required maxlength="12" autocomplete="off"
                 autocapitalize="characters" spellcheck="false"
                 class="code-input" placeholder="GOLD8" />
        </label>
        <button type="submit" class="btn btn-primary btn-block">Tìm đề →</button>
      </form>
      <p class="err" id="code-err"></p>
    </div>
  </section>

  <!-- Màn 2: xem thông tin đề + nhập họ tên -->
  <section id="screen-info" class="screen hidden">
    <div class="card intro-card">
      <span class="badge">Bài kiểm tra</span>
      <h1><span id="quiz-title">Bài kiểm tra</span> <span id="quiz-subtitle" class="muted"></span></h1>
      <div class="meta-row" id="exam-preview">
        <span class="chip" id="chip-count">📝 — câu</span>
        <span class="chip" id="chip-duration">⏱️ — phút</span>
        <span class="chip" id="chip-expires">⏳ Không giới hạn</span>
      </div>
      <p class="lead">Nhập thông tin của bạn để bắt đầu. Đồng hồ sẽ chạy ngay khi bạn nhấn <b>Bắt đầu</b>.</p>
      <form id="info-form">
        <label class="field">
          <span class="field-label">Họ và tên <em>*</em></span>
          <input id="full-name" required autocomplete="name" placeholder="Nguyễn Văn A" />
        </label>
        <label class="field">
          <span class="field-label">Lớp <em>*</em></span>
          <input id="class-name" required placeholder="12A1" />
        </label>
        <button type="submit" class="btn btn-primary btn-block">Bắt đầu làm bài →</button>
      </form>
      <p class="err" id="info-err"></p>
      <p class="muted small"><a href="#" id="change-code">← Đổi mã đề khác</a></p>
    </div>
  </section>

  <!-- Màn 3: làm bài -->
  <section id="screen-quiz" class="screen quiz-layout hidden">
    <aside class="quiz-sticky">
      <div id="timer-bar">
        <div class="timer-left">
          <span class="timer-dot"></span>
          <div>
            <div class="timer-caption">Thời gian còn lại</div>
            <span id="timer" class="timer-clock">--:--</span>
          </div>
        </div>
        <div class="progress-wrap">
          <div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div>
          <span id="progress" class="progress-text"></span>
        </div>
      </div>
      <div id="nav-panel" class="card nav-panel">
        <div class="nav-head">
          <span class="nav-title">Theo dõi bài làm</span>
          <span class="nav-legend">
            <span class="lg lg-done"></span> Đã làm
            <span class="lg lg-todo"></span> Chưa làm
          </span>
          <button type="button" id="nav-toggle" class="nav-toggle" aria-label="Thu gọn">▾</button>
        </div>
        <div id="nav-grid" class="nav-grid"></div>
      </div>
    </aside>
    <form id="quiz-form">
      <div id="sections"></div>
      <div class="submit-row">
        <button type="submit" id="submit-btn" class="btn btn-primary btn-lg">Nộp bài</button>
      </div>
    </form>
  </section>

  <!-- Màn 4: kết quả + lời giải -->
  <section id="screen-result" class="screen hidden">
    <div class="card result-card">
      <div id="result-emoji" class="result-check">✓</div>
      <h2 id="result-title">Đã nộp bài thành công!</h2>
      <p id="score-text" class="score-text"></p>
      <p id="result-note" class="muted">Bạn có thể đóng trang này.</p>
    </div>
    <div id="review-wrap" class="review-wrap hidden">
      <div class="card review-head">
        <h3>Lời giải chi tiết</h3>
        <label class="chk"><input type="checkbox" id="only-wrong-result" /> Chỉ hiện câu sai</label>
      </div>
      <div id="review-list" class="review-list"></div>
    </div>
  </section>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Kiểm bằng mắt**

Run: `python3 -m http.server 8000` rồi mở `localhost:8000/index.html`.
Expected: hiện màn nhập mã đề. Console báo lỗi 404 `app.js` chưa có module — chấp nhận được ở bước này.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(app): index.html thêm màn nhập mã đề và khối lời giải"
```

---

### Task 4: `app-render.js` — vẽ ba dạng câu hỏi

**Files:**
- Create: `app-render.js`

**Interfaces:**
- Consumes: `splitPassage` từ `lib-passage.js` (Task 2).
- Produces:
  - `escapeHtml(s: unknown) → string`
  - `allQuestions(sections) → Array<{number, content, kind, section_id}>` — dẹt mọi phần thành một mảng, sắp theo `number`.
  - `renderSections(root: Element, sections) → void`
  - `renderNav(grid: Element, sections) → void`
  - `collectAnswers(form: Element) → Record<string, string>`
  - `applyAnswers(form: Element, answers) → void`
  - `answeredNumbers(form: Element) → Set<string>`
  - `markAnswered(form: Element) → void` — tô lại trạng thái đã làm cho mọi câu

- [ ] **Step 1: Viết module**

`app-render.js`:

```javascript
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
  form.querySelectorAll('input[type="text"][data-qnum]').forEach((el) => {
    el.classList.toggle('filled', done.has(el.dataset.qnum));
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app-render.js
git commit -m "feat(app): app-render vẽ ba dạng câu hỏi và đoạn văn có chỗ trống"
```

---

### Task 5: `app-result.js` — màn kết quả và lời giải

**Files:**
- Create: `app-result.js`

**Interfaces:**
- Consumes: `escapeHtml`, `allQuestions` từ `app-render.js` (Task 4).
- Produces:
  - `renderResult(ctx: {student, sections, score, total, review, auto}) → void` — vẽ cả thẻ điểm lẫn khối lời giải; `review === null` thì ẩn hẳn khối lời giải.
  - `bindReviewFilter() → void` — nối ô "Chỉ hiện câu sai"; dùng lại ngữ cảnh do `renderResult` giữ, không nhận tham số.

- [ ] **Step 1: Viết module**

`app-result.js`:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add app-result.js
git commit -m "feat(app): app-result hiện điểm và lời giải sau khi nộp"
```

---

### Task 6: `app.js` — điều phối phiên làm bài

**Files:**
- Modify: `app.js` (viết lại toàn bộ)

**Interfaces:**
- Consumes: mọi export của `app-render.js` và `app-result.js`; ba RPC của Plan A.
- Produces: `STORAGE_KEY = 'quiz_state_v3'` — state `{code, name, cls, deadline, answers}`.

- [ ] **Step 1: Viết lại `app.js`**

```javascript
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
```

- [ ] **Step 2: Chạy thử đầu-cuối với đề mẫu**

Run: `python3 -m http.server 8000`, mở `localhost:8000/index.html`, nhập `TAP8`.
Expected: hiện `📝 8 câu`, `⏱️ 30 phút`. Bấm Bắt đầu → thấy đoạn văn có ô điền, `(0)` là ví dụ. Điền vài từ, F5 → đáp án và đồng hồ giữ nguyên. Nộp → hiện điểm và lời giải.

- [ ] **Step 3: Thử đề `GOLD8`**

Xoá `localStorage` (DevTools → Application → Clear), nhập `GOLD8`.
Expected: đoạn văn có số ô nhấn được, bảng A/B/C/D bên dưới, bấm số trong đoạn nhảy xuống đúng câu.

- [ ] **Step 4: Thử ca lỗi**

Nhập `NOPE9`.
Expected: hiện `Không tìm thấy đề với mã này.` ngay dưới form, không nhảy màn.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(app): app.js điều phối mã đề, phiên làm bài và nộp bài nhiều phần"
```

---

### Task 7: `styles.css` — style cho đoạn văn và lời giải

**Files:**
- Modify: `styles.css` (thêm vào cuối)

**Interfaces:**
- Consumes: class do `app-render.js` và `app-result.js` sinh ra.

- [ ] **Step 1: Thêm style**

Thêm vào cuối `styles.css`:

```css
/* ---------- Màn nhập mã đề ---------- */
.code-input {
  text-transform: uppercase;
  letter-spacing: .18em;
  font-weight: 700;
  font-size: 20px;
  text-align: center;
}

/* ---------- Phần thi ---------- */
.sec { margin-bottom: 28px; animation: fadeUp .4s both; animation-delay: calc(var(--i) * 60ms); }
.sec-title { font-size: 20px; margin: 0 0 4px; }
.sec-instr { color: var(--muted); margin: 0 0 10px; }
.sec-example {
  background: var(--brand-soft); border-radius: 10px;
  padding: 8px 12px; margin: 0 0 14px; font-size: 14px; font-weight: 600;
}

/* ---------- Đoạn văn có chỗ trống ---------- */
.passage {
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 20px 22px; box-shadow: var(--shadow);
  /* Đoạn văn giữ nguyên xuống dòng của đề gốc, nên phải pre-wrap. */
  white-space: pre-wrap;
  line-height: 2.1;
  margin-bottom: 16px;
}
.gap { display: inline-flex; align-items: center; gap: 4px; vertical-align: baseline; }
.gap-num {
  font-size: 11px; font-weight: 800; color: var(--brand);
  background: var(--brand-soft); border-radius: 6px; padding: 1px 5px;
}
.gap-input {
  font: inherit; font-size: 15px; font-weight: 600;
  width: 8.5em; padding: 2px 8px;
  border: 0; border-bottom: 2px solid var(--brand); border-radius: 4px 4px 0 0;
  background: var(--brand-soft); color: var(--ink);
}
.gap-input:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.gap-input.filled { background: #ecfdf5; border-bottom-color: var(--ok); }
.gap-input.missing { background: var(--warn-bg); border-bottom-color: var(--warn-ink); }
.gap-example { color: var(--muted); font-weight: 700; }
.gap-ref {
  font: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
  color: var(--brand); background: var(--brand-soft);
  border: 1px solid transparent; border-radius: 8px; padding: 1px 9px;
}
.gap-ref:hover { border-color: var(--brand); }

/* ---------- Bảng chọn A/B/C/D của mcq_cloze ---------- */
.cloze-opts { display: grid; gap: 10px; }
.q-inline { display: flex; gap: 12px; align-items: flex-start; }
.q-inline-num {
  flex: none; width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center; font-weight: 800; font-size: 13px;
  background: var(--brand-soft); color: var(--brand);
}
.q-inline-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; flex: 1; }
.q-inline.answered .q-inline-num { background: var(--ok); color: #fff; }
.q-inline.missing  .q-inline-num { background: var(--warn-ink); color: #fff; }

/* ---------- Lời giải sau khi nộp ---------- */
.review-wrap { max-width: 720px; margin: 24px auto 0; }
.review-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.review-head h3 { margin: 0; }
.review-list { display: grid; gap: 12px; margin-top: 12px; }
.rv-q { padding: 16px 18px; border-left: 4px solid var(--ok); }
.rv-q.is-wrong { border-left-color: var(--warn-ink); }
.rv-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.rv-num { font-weight: 800; }
.rv-meta { color: var(--muted); font-size: 14px; margin-left: auto; }
.rv-badge { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 10px; }
.rv-badge.ok    { background: #dcfce7; color: #15803d; }
.rv-badge.bad   { background: var(--warn-bg); color: var(--warn-ink); }
.rv-badge.blank { background: #f3f4f6; color: var(--muted); }
.rv-stem { font-weight: 600; margin-bottom: 8px; }
.rv-opts { display: grid; gap: 4px; }
.rv-opt { display: flex; gap: 8px; padding: 5px 10px; border-radius: 8px; font-size: 14px; }
.rv-opt.is-correct { background: #dcfce7; }
.rv-opt.is-chosen-wrong { background: var(--warn-bg); text-decoration: line-through; }
.rv-key { font-weight: 800; width: 1.2em; }
.rv-line { font-size: 15px; }
.rv-exp {
  margin-top: 10px; padding: 10px 12px; border-radius: 10px;
  background: var(--brand-soft); font-size: 14px; line-height: 1.6;
}
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }

@media (max-width: 640px) {
  .passage { padding: 16px; line-height: 2.3; }
  .gap-input { width: 7em; }
  .review-head { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 2: Kiểm bằng mắt trên cả hai đề**

Mở `localhost:8000/index.html`, làm thử `TAP8` và `GOLD8`, thu nhỏ cửa sổ xuống bề rộng điện thoại.
Expected: đoạn văn xuống dòng đúng như đề gốc, ô điền nằm gọn trong dòng, không tràn ngang.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(app): giao diện đoạn văn có chỗ trống và khối lời giải"
```

---

### Task 8: `admin.html` + `admin-api.js` + khung `admin.js`

**Files:**
- Modify: `admin.html` (viết lại toàn bộ `<body>`)
- Create: `admin-api.js`
- Modify: `admin.js` (viết lại thành module điều phối)

**Interfaces:**
- Produces (`admin-api.js`):
  - `api(action: string, extra?: object) → Promise<object>` — POST tới Edge Function `admin`, ném `Error` với message tiếng Việt.
  - `esc(s: unknown) → string`
  - `toast(msg: string, kind?: 'ok'|'bad') → void`
  - `setToken(t: string) → void`, `getToken() → string`, `clearToken() → void`
- Produces (`admin.js`): gọi `initExams()` và `initResults()` sau khi đăng nhập.

- [ ] **Step 1: Viết `admin-api.js`**

```javascript
const FN_BASE = window.SUPABASE_URL + '/functions/v1';
let token = sessionStorage.getItem('admin_token') || '';

export const getToken = () => token;
export function setToken(t) { token = t; sessionStorage.setItem('admin_token', t); }
export function clearToken() { token = ''; sessionStorage.removeItem('admin_token'); }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

// Gọi Edge Function admin. Trả về body JSON; ném lỗi kèm message tiếng Việt.
export async function api(action, extra = {}) {
  const res = await fetch(FN_BASE + '/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // anon key chỉ để qua gateway JWT của Supabase; quyền admin thật do x-admin-token quyết định.
      'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
      'apikey': window.SUPABASE_ANON_KEY,
      'x-admin-token': token,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* body rỗng hoặc không phải JSON */ }
  if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
  return body;
}
```

- [ ] **Step 2: Viết lại `admin.html`**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quản trị — Bài kiểm tra</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="admin.css" />
</head>
<body>
  <!-- Cổng đăng nhập -->
  <section id="screen-login" class="screen">
    <div class="card intro-card">
      <span class="badge">Khu vực giáo viên</span>
      <h1>Đăng nhập quản trị</h1>
      <p class="lead">Nhập mật khẩu quản trị để quản lý đề bài và xem kết quả.</p>
      <form id="login-form">
        <label class="field">
          <span class="field-label">Mật khẩu quản trị <em>*</em></span>
          <input id="admin-token" type="password" required placeholder="••••••••" autocomplete="current-password" />
        </label>
        <button type="submit" class="btn btn-primary btn-block">Đăng nhập</button>
      </form>
      <p class="err" id="login-err"></p>
      <p class="muted small"><a href="index.html">← Về trang làm bài</a></p>
    </div>
  </section>

  <!-- Bảng điều khiển -->
  <section id="screen-admin" class="screen wide hidden">
    <header class="admin-head">
      <h1>Quản trị bài kiểm tra</h1>
      <button id="logout-btn" class="btn btn-ghost">Đăng xuất</button>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="exams">📚 Đề kiểm tra</button>
      <button class="tab" data-tab="results">📊 Kết quả</button>
    </nav>

    <!-- Tab đề kiểm tra -->
    <div id="tab-exams" class="tab-panel">
      <!-- View A: danh sách đề -->
      <div id="exams-list-view">
        <div class="card toolbar">
          <div class="toolbar-row">
            <button id="add-exam-btn" class="btn btn-primary">+ Tạo đề mới</button>
            <button id="reload-exams-btn" class="btn btn-outline">↻ Tải lại</button>
            <span class="grow"></span>
            <span id="exam-count" class="muted small"></span>
          </div>
        </div>
        <div id="exams-list" class="q-list"></div>
      </div>

      <!-- View B: soạn một đề -->
      <div id="exam-edit-view" class="hidden">
        <div class="card toolbar">
          <div class="toolbar-row">
            <button id="back-to-exams" type="button" class="btn btn-ghost">← Danh sách đề</button>
            <span class="grow"></span>
            <a id="exam-open-link" class="link-sm" target="_blank" rel="noopener">Mở trang làm bài ↗</a>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Thông tin đề</h3>
          <form id="exam-form">
            <input type="hidden" id="exam-id" />
            <div class="opt-grid">
              <label class="field">
                <span class="field-label">Mã đề <em>*</em></span>
                <input id="exam-code-in" required maxlength="12" class="code-input" placeholder="GOLD8" />
              </label>
              <label class="field">
                <span class="field-label">Thời lượng (phút) <em>*</em></span>
                <input id="exam-duration" type="number" min="1" max="600" step="1" required placeholder="60" />
              </label>
            </div>
            <label class="field">
              <span class="field-label">Tên đề <em>*</em></span>
              <input id="exam-title" required maxlength="120" placeholder="FCE Test 3 — Gold" />
            </label>
            <label class="field">
              <span class="field-label">Phụ đề <span class="muted small">(tuỳ chọn)</span></span>
              <input id="exam-subtitle" maxlength="120" placeholder="Use of English Part 1" />
            </label>
            <div class="opt-grid">
              <label class="field">
                <span class="field-label">Mở lúc <span class="muted small">(để trống = mở ngay)</span></span>
                <input id="exam-opens" type="datetime-local" />
              </label>
              <label class="field">
                <span class="field-label">Hết hạn lúc <span class="muted small">(để trống = không hạn)</span></span>
                <input id="exam-expires" type="datetime-local" />
              </label>
            </div>
            <label class="chk"><input type="checkbox" id="exam-published" /> Xuất bản — học sinh nhập mã vào làm được</label>
            <label class="chk"><input type="checkbox" id="exam-explain" checked /> Hiện lời giải cho học sinh sau khi nộp</label>
            <p class="hint">Giờ nhập ở đây luôn là <b>giờ Việt Nam</b>. Đổi thời lượng không ảnh hưởng em nào đang làm dở — đồng hồ của em đó đã chốt mốc kết thúc.</p>
            <p class="err" id="exam-form-err"></p>
            <div class="toolbar-row">
              <button type="submit" id="exam-save-btn" class="btn btn-primary">Lưu thông tin đề</button>
              <button type="button" id="exam-dup-btn" class="btn btn-outline">⧉ Nhân bản đề</button>
              <span class="grow"></span>
              <button type="button" id="exam-del-btn" class="btn btn-danger">🗑️ Xoá đề</button>
            </div>
          </form>
        </div>

        <div class="card toolbar">
          <div class="toolbar-row">
            <h3 class="card-title grow">Các phần thi</h3>
            <select id="new-sec-kind" class="select-sm">
              <option value="mcq">Trắc nghiệm A/B/C/D</option>
              <option value="open_cloze">Đoạn văn — điền từ</option>
              <option value="mcq_cloze">Đoạn văn — chọn A/B/C/D</option>
            </select>
            <button id="add-sec-btn" type="button" class="btn btn-primary">+ Thêm phần</button>
          </div>
          <p class="hint">Trong đoạn văn, đánh dấu chỗ trống bằng <code>{{9}}</code> — số trong ngoặc chính là số câu. Dùng <code>{{0}}</code> cho ví dụ mẫu (không tính điểm).</p>
        </div>
        <div id="sections-list"></div>
      </div>
    </div>

    <!-- Tab kết quả -->
    <div id="tab-results" class="tab-panel hidden">
      <div class="card toolbar">
        <div class="toolbar-row">
          <label class="field field-inline">
            <span class="field-label">Đề</span>
            <select id="res-exam" class="select-sm"></select>
          </label>
          <button id="reload-subs-btn" type="button" class="btn btn-outline">↻ Tải lại</button>
          <button id="download-xlsx-btn" type="button" class="btn btn-primary">⬇️ Tải Excel (.xlsx)</button>
          <button id="clear-subs-btn" type="button" class="btn btn-danger">🗑️ Xoá kết quả đề này</button>
          <span class="grow"></span>
          <span id="sub-count" class="muted small"></span>
        </div>
      </div>
      <div class="card table-card">
        <table id="subs-table">
          <thead><tr><th>#</th><th>Họ và tên</th><th>Lớp</th><th>Điểm</th><th>Thời gian nộp</th><th></th></tr></thead>
          <tbody id="subs-body"></tbody>
        </table>
        <p id="subs-empty" class="muted center hidden">Chưa có học sinh nào nộp bài.</p>
      </div>
    </div>
  </section>

  <!-- Modal chi tiết bài làm -->
  <div id="detail-modal" class="modal hidden">
    <div class="modal-box card detail-box">
      <header class="detail-head">
        <div>
          <h3 id="detail-title">Chi tiết bài làm</h3>
          <p id="detail-sub" class="muted small"></p>
        </div>
        <button type="button" id="detail-close" class="btn btn-ghost">Đóng</button>
      </header>
      <div class="detail-filter">
        <label class="chk"><input type="checkbox" id="only-wrong" /> Chỉ hiện câu sai</label>
      </div>
      <div id="detail-list" class="detail-list"></div>
    </div>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="config.js"></script>
  <script type="module" src="admin.js"></script>
</body>
</html>
```

- [ ] **Step 3: Viết lại `admin.js` thành module điều phối**

```javascript
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
```

- [ ] **Step 4: Commit**

```bash
git add admin.html admin-api.js admin.js
git commit -m "feat(admin): khung giao diện quản lý nhiều đề"
```

---

### Task 9: `admin-exams.js` — danh sách và thông tin đề

**Files:**
- Create: `admin-exams.js`

**Interfaces:**
- Consumes: `api`, `esc`, `toast` (Task 8); `toUtcIso`, `toLocalInput`, `formatVn` (Task 1); `renderSectionsAdmin` từ `admin-sections.js` (Task 10).
- Produces:
  - `initExams() → void` — nối toàn bộ sự kiện của tab đề (gọi đúng một lần).
  - `loadExams() → Promise<void>` — tải và vẽ danh sách.
  - `openExam(id: number) → Promise<void>` — mở view soạn một đề; `admin-sections.js` gọi lại hàm này sau mỗi thao tác ghi.

- [ ] **Step 1: Viết module**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add admin-exams.js
git commit -m "feat(admin): danh sách đề và form thông tin đề"
```

---

### Task 10: `admin-sections.js` — soạn phần thi và câu hỏi

**Files:**
- Create: `admin-sections.js`

**Interfaces:**
- Consumes: `api`, `esc`, `toast` (Task 8); `diffBlanks`, `scanBlanks` (Task 2); `openExam` từ `admin-exams.js` (Task 9).
- Produces: `renderSectionsAdmin(exam) → void` — vẽ toàn bộ danh sách phần thi kèm bảng câu hỏi, và nối sự kiện một lần.

- [ ] **Step 1: Viết module**

```javascript
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
    await api('reorder_sections', { order: secs.map((s, k) => ({ id: s.id, position: k + 1 })) });
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
```

- [ ] **Step 2: Commit**

```bash
git add admin-sections.js
git commit -m "feat(admin): soạn phần thi và bảng câu hỏi cho ba dạng"
```

---

### Task 11: `admin-results.js` — kết quả theo đề

**Files:**
- Create: `admin-results.js`
- Modify: `admin.css` (thêm style cho bảng câu hỏi và thẻ đề)

**Interfaces:**
- Consumes: `api`, `esc`, `toast` (Task 8); `formatVn` (Task 1).
- Produces:
  - `initResults() → void` — nối sự kiện tab kết quả.
  - `loadExamOptions() → Promise<void>` — đổ danh sách đề vào `<select id="res-exam">`.

- [ ] **Step 1: Viết module**

```javascript
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
```

- [ ] **Step 2: Thêm style vào `admin.css`**

Thêm vào cuối `admin.css`:

```css
/* ---------- Thẻ đề trong danh sách ---------- */
.exam-card .qi-num.code {
  width: auto; min-width: 68px; padding: 0 10px;
  border-radius: 10px; font-size: 14px; letter-spacing: .08em;
}
.pill { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 9px; background: #f3f4f6; color: var(--muted); }
.pill.ok    { background: #dcfce7; color: #15803d; }
.pill.draft { background: #fef9c3; color: #a16207; }
.pill.bad   { background: var(--warn-bg); color: var(--warn-ink); }

/* ---------- Soạn phần thi ---------- */
.card-title { margin: 0 0 12px; font-size: 17px; }
.sec-card { margin-bottom: 18px; }
.select-sm { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.field-inline { flex-direction: row; align-items: center; gap: 8px; margin: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.7; }
.blank-hint.warn { color: var(--warn-ink); font-weight: 600; }

/* Bảng câu hỏi rộng hơn màn hình thì cuộn trong khung, không đẩy cả trang. */
.q-table-wrap { overflow-x: auto; margin-top: 10px; }
.q-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
.q-table th { text-align: left; font-weight: 700; color: var(--muted); padding: 6px 4px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.q-table td { padding: 3px 4px; vertical-align: top; }
.q-table input, .q-table select { width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.q-table .w-num { width: 62px; }

/* ---------- Chi tiết bài làm ---------- */
.det-exp { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--brand-soft); font-size: 13px; line-height: 1.6; }
.det-opt.is-chosen-right { background: #dcfce7; font-weight: 600; }
```

- [ ] **Step 3: Commit**

```bash
git add admin-results.js admin.css
git commit -m "feat(admin): bảng kết quả theo đề và xem chi tiết bài làm"
```

---

### Task 12: Deploy và verify đầu-cuối

**Files:**
- Modify: `.github/workflows/deploy.yml:12-15`
- Modify: `mau-de.csv`

**Interfaces:**
- Consumes: mọi file của Task 1–11.

- [ ] **Step 1: Bổ sung file mới vào workflow**

Thay khối `Assemble public/` trong `.github/workflows/deploy.yml`:

```yaml
      - name: Assemble public/
        run: |
          mkdir -p public
          # Liệt kê từng file: thiếu tên nào là file đó không lên Pages, trang trắng ngay.
          cp index.html styles.css config.js public/
          cp app.js app-render.js app-result.js public/
          cp lib-passage.js lib-time.js public/
          cp admin.html admin.css mau-de.csv public/
          cp admin.js admin-api.js admin-exams.js admin-sections.js admin-results.js public/
          # Chốt chặn: thiếu file nào thì fail build thay vì deploy trang hỏng.
          for f in index.html styles.css config.js app.js app-render.js app-result.js \
                   lib-passage.js lib-time.js admin.html admin.css admin.js admin-api.js \
                   admin-exams.js admin-sections.js admin-results.js mau-de.csv; do
            test -f "public/$f" || { echo "THIẾU public/$f"; exit 1; }
          done
```

- [ ] **Step 2: Thêm cột `explanation` vào CSV mẫu**

Ghi đè `mau-de.csv`:

```csv
number,content,option_a,option_b,option_c,option_d,correct,explanation
1,She ___ to school every day.,go,goes,going,gone,B,"Chủ ngữ số ít ở thì hiện tại đơn nên động từ thêm -s."
2,They ___ football when it started to rain.,play,played,were playing,have played,C,"Hành động đang diễn ra thì bị cắt ngang -> quá khứ tiếp diễn."
3,I ___ here since 2019.,live,lived,have lived,am living,C,"'since + mốc thời gian' đi với hiện tại hoàn thành."
```

- [ ] **Step 3: Chạy toàn bộ test**

Run: `./tests/sql/run.sh && node --test 'tests/*.test.mjs'`
Expected: cả hai đều PASS.

- [ ] **Step 4: Diễn tập tại chỗ — tạo một đề trộn ba dạng**

Run: `python3 -m http.server 8000`, mở `localhost:8000/admin.html`, đăng nhập.

Làm theo đúng thứ tự này:
1. **Tạo đề mới** — mã `MIX1`, tên `Đề trộn thử`, 45 phút, hạn đặt sau 1 giờ, tick **Xuất bản** và **Hiện lời giải**. Lưu.
2. **Thêm phần** dạng *Trắc nghiệm A/B/C/D* → bấm **Nạp CSV**, chọn `mau-de.csv`. Expected: `Đã nạp 3 câu từ CSV`.
3. **Thêm phần** dạng *Đoạn văn — điền từ* → dán đoạn văn có `{{4}}` và `{{5}}` → bấm **⟳ Đồng bộ câu theo đoạn văn**. Expected: bảng hiện đúng 2 dòng số 4 và 5, dòng gợi ý hiện `✓ 2 chỗ trống khớp`. Điền đáp án `at | in` và `due`, lưu câu.
4. **Thêm phần** dạng *Đoạn văn — chọn A/B/C/D* → dán đoạn có `{{6}}` → đồng bộ → điền 4 phương án + đáp án đúng + giải thích, lưu câu.
5. Bấm **↑ / ↓** đảo thứ tự hai phần. Expected: số phần đổi chỗ, không báo lỗi trùng khoá.

- [ ] **Step 5: Diễn tập làm bài**

Mở `localhost:8000/index.html`, nhập `MIX1`.
Expected: `📝 6 câu`. Làm bài, F5 giữa chừng → đáp án và đồng hồ còn nguyên. Nộp → điểm đúng, lời giải hiện đủ cả ba dạng.

- [ ] **Step 6: Kiểm cửa sổ thời gian**

Ở admin, bỏ tick **Xuất bản** của `MIX1`, lưu. Ở tab học sinh, xoá `localStorage` rồi nhập lại `MIX1`.
Expected: `Không tìm thấy đề với mã này.`

Tick lại **Xuất bản**, đặt **Hết hạn lúc** vào quá khứ, lưu. Nhập lại `MIX1`.
Expected: `Đề đã hết hạn lúc …` với giờ hiển thị đúng giờ Việt Nam.

- [ ] **Step 7: Kiểm tab Kết quả**

Sang tab **📊 Kết quả**, chọn `MIX1`.
Expected: thấy lượt nộp vừa rồi. Bấm **Xem bài** → chi tiết từng câu kèm giải thích. Bấm **Tải Excel** → file `ket-qua-MIX1.xlsx` có cột `Mã đề`.

- [ ] **Step 8: Dọn đề diễn tập**

Ở view soạn `MIX1`, bấm **🗑️ Xoá đề**, gõ `MIX1` để xác nhận.
Expected: đề biến khỏi danh sách; thử gõ sai mã thì báo `Mã xác nhận không khớp. Chưa xoá gì cả.`

- [ ] **Step 9: Commit và deploy**

```bash
git add .github/workflows/deploy.yml mau-de.csv
git commit -m "chore: deploy các module frontend mới, CSV mẫu thêm cột giải thích"
git push origin main
```

- [ ] **Step 10: Verify trên GitHub Pages**

Chờ workflow xanh, mở URL Pages.
Expected: màn nhập mã đề hiện ra, nhập `GOLD8` làm được hết. Mở DevTools → Network, kiểm không có request nào 404 (module thiếu trong `cp` sẽ lộ ra ở đây).

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §5.1 danh sách đề | Task 9 |
| §5.2 form thông tin đề (mã, hạn, xuất bản, cờ lời giải) | Task 8 (HTML), Task 9 (logic) |
| §5.3 soạn phần thi, đổi thứ tự | Task 10 |
| §5.4 bảng câu hỏi ba dạng, đồng bộ theo đoạn văn | Task 10 |
| §5.6 nạp CSV cho phần mcq | Task 10 (`pickCsv`), Plan A Task 8 (`import_csv`) |
| §5.7 kết quả theo đề, xem chi tiết, Excel | Task 11 |
| §6.1 nhập mã đề, xem meta trước khi bắt đầu | Task 3, Task 6 |
| §6.2 render `mcq` | Task 4 |
| §6.3 render `open_cloze` | Task 4, Task 7 |
| §6.4 render `mcq_cloze` | Task 4, Task 7 |
| §6.5 đồng hồ deadline tuyệt đối, khôi phục phiên | Task 6 |
| §6.6 lời giải sau khi nộp | Task 5, Task 7 |
| §7 bố cục file | Toàn bộ |
| §11.2 test `lib-passage`, `lib-time` | Task 1, Task 2 |

**Placeholder scan:** không còn "TBD"/"tương tự Task N". Mọi bước code đều có khối code đầy đủ; mọi bước kiểm thử đều ghi rõ lệnh chạy và kết quả mong đợi.

**Type consistency:**
- `content.options` luôn là object khoá `a`/`b`/`c`/`d`; `content.stem` chỉ có ở `mcq`.
- `accepted_answers` luôn là mảng chuỗi ở cả DB, `save_questions`, `readRow`, và `review`.
- `readRow` trả `{number, content, correct, explanation}` cho mcq/mcq_cloze — khớp đúng shape `save_questions` nhận ở Plan A Task 8; trả `{number, accepted_answers, explanation}` cho open_cloze.
- Mọi ô nhập đáp án của học sinh mang `data-qnum`, nên `collectAnswers` và `applyAnswers` không cần biết dạng câu.
- Cột Excel giống hệt nhau ở `admin-results.js:downloadXlsx` và `supabase/functions/export/index.ts` (Plan A Task 9) — 8 cột cùng thứ tự.
- `formatVn` dùng chung cho cả app học sinh và admin, nên định dạng thời gian nhất quán.

**Điểm dễ sai đã ghi rõ trong plan:**
- `.passage` bắt buộc `white-space: pre-wrap` — thiếu là đoạn văn dồn thành một dòng.
- `splitPassage` phải reset `GAP_RE.lastIndex` — regex có cờ `/g` và được dùng lại giữa các lần gọi; test Task 2 bắt đúng lỗi này.
- `form.addEventListener('input')` chứ không phải `'change'` — `change` trên ô text chỉ bắn khi rời ô, làm mất đáp án nếu học sinh F5 ngay sau khi gõ.
- `toLocalInput` phải đặt `hourCycle: 'h23'` — vài engine trả `24` cho nửa đêm.
- `deploy.yml` liệt kê từng file: thiếu một tên là trang trắng, nên Task 12 thêm vòng lặp `test -f` chốt chặn.
