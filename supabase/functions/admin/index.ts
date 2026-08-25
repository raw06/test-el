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

      case "list_exams": {
        const { data, error } = await sb.from("exams")
          .select("id, code, title, subtitle, duration_min, opens_at, expires_at, " +
                  "is_published, show_explanations, created_at, " +
                  "sections(count), questions(count), submissions(count)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json({ exams: data });
      }

      case "get_exam": {
        const id = parseInt(payload.exam_id, 10);
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        // Giữa sections và questions có HAI khoá ngoại ghép, phải chỉ đích danh
        // dùng cái nào, không thì PostgREST trả PGRST201 "ambiguous embedding".
        const { data, error } = await sb.from("exams")
          .select("*, sections(*, questions!questions_section_id_exam_id_fkey(*))")
          .eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Không tìm thấy đề.");
        return json({ exam: data });
      }

      case "save_exam": {
        const e = payload.exam ?? {};
        const code = String(e.code ?? "").trim().toUpperCase();
        const title = String(e.title ?? "").trim();
        const duration = parseInt(e.duration_min, 10);
        if (!/^[A-Z0-9]{3,12}$/.test(code)) {
          throw new Error("Mã đề phải gồm 3–12 ký tự chữ HOA hoặc số.");
        }
        if (!title) throw new Error("Tên đề không được để trống.");
        if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
          throw new Error("Thời lượng phải là số nguyên từ 1 đến 600 phút.");
        }
        const opens = e.opens_at ? new Date(e.opens_at) : null;
        const expires = e.expires_at ? new Date(e.expires_at) : null;
        if (opens && expires && opens >= expires) {
          throw new Error("Thời điểm mở phải trước thời điểm hết hạn.");
        }
        const row = {
          code, title,
          subtitle: String(e.subtitle ?? "").trim(),
          duration_min: duration,
          opens_at: opens ? opens.toISOString() : null,
          expires_at: expires ? expires.toISOString() : null,
          is_published: !!e.is_published,
          show_explanations: e.show_explanations !== false,
        };
        if (e.id) {
          const { error } = await sb.from("exams").update(row).eq("id", parseInt(e.id, 10));
          if (error) throw error;
          return json({ ok: true, id: parseInt(e.id, 10) });
        }
        const { data, error } = await sb.from("exams").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: data.id });
      }

      case "delete_exam": {
        const id = parseInt(payload.exam_id, 10);
        const confirmCode = String(payload.confirm_code ?? "").trim().toUpperCase();
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        const { data: ex, error: exErr } = await sb.from("exams")
          .select("code").eq("id", id).maybeSingle();
        if (exErr) throw exErr;
        if (!ex) throw new Error("Không tìm thấy đề.");
        // Xoá cascade cả bài làm của học sinh -> bắt gõ lại mã để xác nhận.
        if (confirmCode !== ex.code) throw new Error("Mã xác nhận không khớp. Chưa xoá gì cả.");
        const { error } = await sb.from("exams").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "duplicate_exam": {
        const id = parseInt(payload.exam_id, 10);
        const newCode = String(payload.new_code ?? "").trim().toUpperCase();
        if (!Number.isInteger(id)) throw new Error("'exam_id' không hợp lệ.");
        if (!/^[A-Z0-9]{3,12}$/.test(newCode)) {
          throw new Error("Mã đề mới phải gồm 3–12 ký tự chữ HOA hoặc số.");
        }
        const { data: src, error: srcErr } = await sb.from("exams")
          .select("*, sections(*, questions!questions_section_id_exam_id_fkey(*))")
          .eq("id", id).maybeSingle();
        if (srcErr) throw srcErr;
        if (!src) throw new Error("Không tìm thấy đề nguồn.");

        // Bản sao luôn ở trạng thái nháp: tránh vô tình mở đề chưa soát.
        const { data: ne, error: neErr } = await sb.from("exams").insert({
          code: newCode, title: src.title + " (bản sao)", subtitle: src.subtitle,
          duration_min: src.duration_min, opens_at: null, expires_at: null,
          is_published: false, show_explanations: src.show_explanations,
        }).select("id").single();
        if (neErr) throw neErr;

        for (const sec of (src.sections ?? [])) {
          const { data: ns, error: nsErr } = await sb.from("sections").insert({
            exam_id: ne.id, position: sec.position, kind: sec.kind, title: sec.title,
            instructions: sec.instructions, passage: sec.passage, example: sec.example,
          }).select("id").single();
          if (nsErr) throw nsErr;
          const qs = (sec.questions ?? []).map((q: any) => ({
            section_id: ns.id, exam_id: ne.id, kind: sec.kind, number: q.number,
            content: q.content, accepted_answers: q.accepted_answers, explanation: q.explanation,
          }));
          if (qs.length) {
            const { error } = await sb.from("questions").insert(qs);
            if (error) throw error;
          }
        }
        return json({ ok: true, id: ne.id, code: newCode });
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
