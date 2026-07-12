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

  const ws = utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }];
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
