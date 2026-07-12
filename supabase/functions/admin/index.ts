import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Parser CSV tối giản: hỗ trợ dấu phẩy, ô có ngoặc kép, xuống dòng trong ô.
function parseCsv(text: string): string[][] {
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

// CSV -> mảng câu hỏi đã kiểm tra hợp lệ.
function csvToQuestions(text: string) {
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
  const out = rows.slice(1).map((r, i) => {
    const num = parseInt((r[idx.number] || "").trim(), 10);
    const correct = (r[idx.correct] || "").trim().toUpperCase();
    if (!Number.isInteger(num)) throw new Error(`Dòng ${i + 2}: 'number' không hợp lệ.`);
    if (!["A", "B", "C", "D"].includes(correct)) throw new Error(`Dòng ${i + 2}: 'correct' phải là A/B/C/D.`);
    const get = (k: string) => (r[idx[k]] || "").trim();
    for (const k of ["content", "option_a", "option_b", "option_c", "option_d"]) {
      if (!get(k)) throw new Error(`Dòng ${i + 2}: thiếu '${k}'.`);
    }
    return {
      number: num, content: get("content"),
      option_a: get("option_a"), option_b: get("option_b"),
      option_c: get("option_c"), option_d: get("option_d"),
      correct_answer: correct,
    };
  });
  const nums = new Set(out.map((q) => q.number));
  if (nums.size !== out.length) throw new Error("Cột 'number' bị trùng.");
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("ADMIN_TOKEN");
  const token = req.headers.get("x-admin-token");
  if (!expected || token !== expected) return json({ error: "Sai mật khẩu quản trị." }, 403);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Body không hợp lệ." }, 400); }
  const action = payload?.action;

  try {
    switch (action) {
      case "login":
        return json({ ok: true });

      case "list_questions": {
        const { data, error } = await sb.from("questions")
          .select("id, number, content, option_a, option_b, option_c, option_d, correct_answer")
          .order("number");
        if (error) throw error;
        return json({ questions: data });
      }

      case "save_question": {
        const q = payload.question ?? {};
        const num = parseInt(q.number, 10);
        const correct = String(q.correct_answer || "").toUpperCase();
        if (!Number.isInteger(num)) throw new Error("'number' không hợp lệ.");
        if (!["A", "B", "C", "D"].includes(correct)) throw new Error("Đáp án đúng phải là A/B/C/D.");
        for (const k of ["content", "option_a", "option_b", "option_c", "option_d"]) {
          if (!String(q[k] || "").trim()) throw new Error(`Thiếu trường '${k}'.`);
        }
        const row = {
          number: num, content: q.content.trim(),
          option_a: q.option_a.trim(), option_b: q.option_b.trim(),
          option_c: q.option_c.trim(), option_d: q.option_d.trim(),
          correct_answer: correct,
        };
        // Upsert theo cột 'number' (unique) — sửa nếu đã có, thêm nếu chưa.
        const { error } = await sb.from("questions").upsert(row, { onConflict: "number" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete_question": {
        const num = parseInt(payload.number, 10);
        if (!Number.isInteger(num)) throw new Error("'number' không hợp lệ.");
        const { error } = await sb.from("questions").delete().eq("number", num);
        if (error) throw error;
        return json({ ok: true });
      }

      case "replace_csv": {
        const questions = csvToQuestions(String(payload.csv || ""));
        // Thay toàn bộ đề: xoá hết rồi chèn mới.
        const del = await sb.from("questions").delete().gte("number", 0);
        if (del.error) throw del.error;
        const ins = await sb.from("questions").insert(questions);
        if (ins.error) throw ins.error;
        return json({ ok: true, count: questions.length });
      }

      case "list_submissions": {
        const { data, error } = await sb.from("submissions")
          .select("id, full_name, class_name, score, total, created_at")
          .order("id", { ascending: false });
        if (error) throw error;
        return json({ submissions: data });
      }

      case "clear_submissions": {
        const { error } = await sb.from("submissions").delete().gte("id", 0);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: "Hành động không hợp lệ: " + action }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
