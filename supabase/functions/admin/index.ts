import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { csvToQuestions } from "./lib-csv.ts";

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

      case "get_settings": {
        const { data, error } = await sb.from("settings")
          .select("title, subtitle, duration_min").eq("id", 1).maybeSingle();
        if (error) throw error;
        // Dòng id=1 do schema.sql tạo; nếu thiếu thì trả mặc định để form vẫn dùng được.
        return json({ settings: data ?? { title: "Bài kiểm tra", subtitle: "", duration_min: 60 } });
      }

      case "save_settings": {
        const s = payload.settings ?? {};
        const title = String(s.title ?? "").trim();
        const subtitle = String(s.subtitle ?? "").trim();
        const duration = parseInt(s.duration_min, 10);
        if (!title) throw new Error("Tên bài kiểm tra không được để trống.");
        if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
          throw new Error("Thời lượng phải là số nguyên từ 1 đến 600 phút.");
        }
        const { error } = await sb.from("settings")
          .upsert({ id: 1, title, subtitle, duration_min: duration }, { onConflict: "id" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "list_submissions": {
        const { data, error } = await sb.from("submissions")
          .select("id, full_name, class_name, score, total, answers, created_at")
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
