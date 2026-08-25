import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Bản ESM của SheetJS trên esm.sh — Deno bundle được (khác cdn.sheetjs.com).
import { utils, write } from "https://esm.sh/xlsx@0.18.5";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = Deno.env.get("EXPORT_TOKEN");
  if (!expected || token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const examCode = url.searchParams.get("exam");   // tuỳ chọn: lọc theo mã đề
  let q = sb.from("submissions")
    .select("id, full_name, class_name, score, total, created_at, exams(code, title)")
    .order("id", { ascending: true });
  if (examCode) {
    const { data: ex } = await sb.from("exams")
      .select("id").eq("code", examCode.toUpperCase()).maybeSingle();
    if (!ex) return new Response("Không tìm thấy đề: " + examCode, { status: 404 });
    q = q.eq("exam_id", ex.id);
  }
  const { data, error } = await q;
  if (error) return new Response("DB error: " + error.message, { status: 500 });

  const rows = (data ?? []).map((r: any) => ({
    "ID": r.id,
    "Mã đề": r.exams?.code ?? "",
    "Tên đề": r.exams?.title ?? "",
    "Họ và tên": r.full_name,
    "Lớp": r.class_name,
    "Điểm": r.score,
    "Tổng": r.total,
    "Thời gian nộp": new Date(r.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  }));

  const ws = utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 24 },
                 { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }];
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "KetQua");
  const buf: Uint8Array = write(wb, { type: "array", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ket-qua-lam-bai.xlsx"`,
    },
  });
});
