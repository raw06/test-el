// Parser CSV tối giản: hỗ trợ dấu phẩy, ô có ngoặc kép, xuống dòng trong ô.
// Tách khỏi index.ts để test được bằng `node --test`.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"); // bỏ BOM, chuẩn hoá newline
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface CsvQuestion {
  number: number;
  content: { stem: string; options: { a: string; b: string; c: string; d: string } };
  accepted_answers: string[];
  explanation: string | null;
}

// CSV -> mảng câu hỏi dạng 'mcq' đã kiểm hợp lệ.
// Cột 'correct' trong CSV tương ứng accepted_answers trong DB.
export function csvToQuestions(text: string): CsvQuestion[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV rỗng hoặc thiếu dòng dữ liệu.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const need = ["number", "content", "option_a", "option_b", "option_c", "option_d", "correct"];
  const idx: Record<string, number> = {};
  for (const key of need) {
    const at = header.indexOf(key);
    if (at === -1) throw new Error(`CSV thiếu cột bắt buộc: ${key}`);
    idx[key] = at;
  }
  const expIdx = header.indexOf("explanation"); // tuỳ chọn

  const out = rows.slice(1).map((r, i) => {
    const get = (k: string) => (r[idx[k]] || "").trim();
    const num = parseInt(get("number"), 10);
    const correct = get("correct").toUpperCase();
    if (!Number.isInteger(num)) throw new Error(`Dòng ${i + 2}: 'number' không hợp lệ.`);
    if (!["A", "B", "C", "D"].includes(correct)) {
      throw new Error(`Dòng ${i + 2}: 'correct' phải là A/B/C/D.`);
    }
    for (const k of ["content", "option_a", "option_b", "option_c", "option_d"]) {
      if (!get(k)) throw new Error(`Dòng ${i + 2}: thiếu '${k}'.`);
    }
    const exp = expIdx === -1 ? "" : (r[expIdx] || "").trim();
    return {
      number: num,
      content: {
        stem: get("content"),
        options: { a: get("option_a"), b: get("option_b"), c: get("option_c"), d: get("option_d") },
      },
      accepted_answers: [correct],
      explanation: exp || null,
    };
  });
  const nums = new Set(out.map((q) => q.number));
  if (nums.size !== out.length) throw new Error("Cột 'number' bị trùng.");
  return out;
}
