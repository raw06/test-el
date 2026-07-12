import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

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
  const { data, error } = await sb
    .from("submissions")
    .select("id, full_name, class_name, score, total, created_at")
    .order("id", { ascending: true });
  if (error) return new Response("DB error: " + error.message, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    "ID": r.id,
    "Họ và tên": r.full_name,
    "Lớp": r.class_name,
    "Điểm": r.score,
    "Tổng": r.total,
    "Thời gian nộp": new Date(r.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KetQua");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ket-qua-lam-bai.xlsx"`,
    },
  });
});
