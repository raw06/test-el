import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

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

  const head = ["ID", "Họ và tên", "Lớp", "Điểm", "Tổng", "Thời gian nộp"];
  const body = (data ?? []).map((r) => [
    r.id, r.full_name, r.class_name, r.score, r.total,
    new Date(r.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  ]);
  const tr = (cells: unknown[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;

  // Excel mở được file HTML-table (SpreadsheetML) — không cần thư viện ngoài.
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"></head>` +
    `<body><table border="1">${tr(head)}${body.map(tr).join("")}</table></body></html>`;

  // BOM để Excel nhận UTF-8 (tiếng Việt đúng dấu).
  return new Response("﻿" + html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="ket-qua-lam-bai.xls"`,
    },
  });
});
