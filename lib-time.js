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
