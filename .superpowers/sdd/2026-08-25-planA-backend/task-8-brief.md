### Task 8: Edge Function admin — action phần thi và câu hỏi

**Files:**
- Modify: `supabase/functions/admin/index.ts`

**Interfaces:**
- Consumes: `csvToQuestions` (Task 6).
- Produces: `save_section`, `delete_section`, `reorder_sections`, `save_questions`, `delete_question`, `import_csv`.

- [ ] **Step 0: Thêm hai RPC ghi theo transaction vào `supabase/schema.sql`**

Đặt sau `is_correct`, trước `exam_by_code`. Hai hàm này KHÔNG cấp quyền cho `anon`
(chỉ Edge Function dùng service-role gọi được), nên không cần `grant execute ... to anon`.

```sql
-- Đổi thứ tự các phần trong MỘT transaction: ràng buộc sections_position_uniq là
-- deferrable, nhưng chỉ được hoãn tới lúc commit — mà PostgREST commit từng update
-- một, nên hoán vị hai phần qua REST luôn đụng khoá. Gói vào hàm thì hết.
create or replace function public.reorder_sections(p_exam_id bigint, p_order jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sections s
     set position = (v.value ->> 'position')::int
    from jsonb_array_elements(p_order) v
   where s.id = (v.value ->> 'id')::bigint
     and s.exam_id = p_exam_id;
end $$;

-- Ghi cả bảng câu của MỘT phần trong MỘT transaction. Tách thành hai lệnh REST
-- (delete rồi insert) thì insert hỏng sẽ để lại phần thi RỖNG — mất dữ liệu thật.
create or replace function public.save_questions(p_section_id bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_exam bigint; v_kind text; v_n int;
begin
  select exam_id, kind into v_exam, v_kind from public.sections where id = p_section_id;
  if not found then raise exception 'Không tìm thấy phần thi.'; end if;

  delete from public.questions where section_id = p_section_id;

  insert into public.questions(section_id, exam_id, kind, number, content, accepted_answers, explanation)
  select p_section_id, v_exam, v_kind,
         (r ->> 'number')::int,
         coalesce(r -> 'content', '{}'::jsonb),
         array(select jsonb_array_elements_text(r -> 'accepted_answers')),
         nullif(btrim(coalesce(r ->> 'explanation', '')), '')
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.reorder_sections(bigint, jsonb) from public;
revoke all on function public.save_questions(bigint, jsonb)   from public;
```

- [ ] **Step 1: Thêm các action**

```typescript
      case "save_section": {
        const s = payload.section ?? {};
        const examId = parseInt(s.exam_id, 10);
        const kind = String(s.kind ?? "");
        if (!Number.isInteger(examId)) throw new Error("'exam_id' không hợp lệ.");
        if (!["mcq", "open_cloze", "mcq_cloze"].includes(kind)) {
          throw new Error("Dạng phần thi không hợp lệ.");
        }
        const passage = kind === "mcq" ? null : String(s.passage ?? "").trim();
        if (kind !== "mcq" && !passage) throw new Error("Phần dạng đoạn văn phải có nội dung đoạn văn.");
        const row = {
          exam_id: examId, kind,
          position: Number.isInteger(parseInt(s.position, 10)) ? parseInt(s.position, 10) : 1,
          title: String(s.title ?? "").trim(),
          instructions: String(s.instructions ?? "").trim(),
          passage, example: String(s.example ?? "").trim() || null,
        };
        if (s.id) {
          // kind không nằm trong update: FK ghép sẽ chặn nếu đã có câu hỏi.
          const { kind: _drop, ...upd } = row;
          const { error } = await sb.from("sections").update(upd).eq("id", parseInt(s.id, 10));
          if (error) throw error;
          return json({ ok: true, id: parseInt(s.id, 10) });
        }
        const { data, error } = await sb.from("sections").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: data.id });
      }

      case "delete_section": {
        const id = parseInt(payload.section_id, 10);
        if (!Number.isInteger(id)) throw new Error("'section_id' không hợp lệ.");
        const { error } = await sb.from("sections").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "reorder_sections": {
        // Gọi RPC vì PostgREST tự commit TỪNG update: ràng buộc deferrable chỉ hoãn
        // tới cuối transaction, mà mỗi update là một transaction riêng -> vẫn đụng khoá.
        const examId = parseInt(payload.exam_id, 10);
        const order = payload.order; // [{id, position}, …]
        if (!Number.isInteger(examId)) throw new Error("'exam_id' không hợp lệ.");
        if (!Array.isArray(order)) throw new Error("'order' phải là mảng.");
        const { error } = await sb.rpc("reorder_sections", {
          p_exam_id: examId,
          p_order: order.map((it: any) => ({
            id: parseInt(it.id, 10), position: parseInt(it.position, 10),
          })),
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "save_questions": {
        // Ghi cả bảng câu của MỘT phần trong một lần: editor cloze sửa cả bảng cùng lúc.
        const sectionId = parseInt(payload.section_id, 10);
        const list = payload.questions;
        if (!Number.isInteger(sectionId)) throw new Error("'section_id' không hợp lệ.");
        if (!Array.isArray(list)) throw new Error("'questions' phải là mảng.");

        const { data: sec, error: secErr } = await sb.from("sections")
          .select("id, exam_id, kind").eq("id", sectionId).maybeSingle();
        if (secErr) throw secErr;
        if (!sec) throw new Error("Không tìm thấy phần thi.");

        const rows = list.map((q: any, i: number) => {
          const num = parseInt(q.number, 10);
          if (!Number.isInteger(num)) throw new Error(`Câu thứ ${i + 1}: số câu không hợp lệ.`);

          let answers: string[];
          let content: Record<string, unknown>;

          if (sec.kind === "open_cloze") {
            answers = (Array.isArray(q.accepted_answers) ? q.accepted_answers : [])
              .map((a: unknown) => String(a ?? "").trim()).filter(Boolean);
            if (!answers.length) throw new Error(`Câu ${num}: phải có ít nhất một đáp án.`);
            content = {};
          } else {
            const correct = String(q.correct ?? q.accepted_answers?.[0] ?? "").trim().toUpperCase();
            if (!["A", "B", "C", "D"].includes(correct)) {
              throw new Error(`Câu ${num}: đáp án đúng phải là A/B/C/D.`);
            }
            const o = q.content?.options ?? {};
            for (const k of ["a", "b", "c", "d"]) {
              if (!String(o[k] ?? "").trim()) throw new Error(`Câu ${num}: thiếu phương án ${k.toUpperCase()}.`);
            }
            answers = [correct];
            content = {
              options: {
                a: String(o.a).trim(), b: String(o.b).trim(),
                c: String(o.c).trim(), d: String(o.d).trim(),
              },
            };
            if (sec.kind === "mcq") {
              const stem = String(q.content?.stem ?? "").trim();
              if (!stem) throw new Error(`Câu ${num}: thiếu nội dung câu hỏi.`);
              content.stem = stem;
            }
          }
          return {
            section_id: sec.id, exam_id: sec.exam_id, kind: sec.kind, number: num,
            content, accepted_answers: answers,
            explanation: String(q.explanation ?? "").trim() || null,
          };
        });

        // Gọi RPC để xoá + chèn nằm trong MỘT transaction. Nếu tách làm hai lệnh
        // PostgREST, xoá xong mà chèn hỏng thì cả phần thi mất trắng (đã kiểm chứng).
        const { data: n, error } = await sb.rpc("save_questions", {
          p_section_id: sec.id, p_rows: rows,
        });
        if (error) throw error;
        return json({ ok: true, count: n });
      }

      case "delete_question": {
        const id = parseInt(payload.question_id, 10);
        if (!Number.isInteger(id)) throw new Error("'question_id' không hợp lệ.");
        const { error } = await sb.from("questions").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "import_csv": {
        // CSV chỉ dùng cho phần dạng 'mcq'; hai dạng cloze soạn qua form.
        const sectionId = parseInt(payload.section_id, 10);
        if (!Number.isInteger(sectionId)) throw new Error("'section_id' không hợp lệ.");
        const { data: sec, error: secErr } = await sb.from("sections")
          .select("id, exam_id, kind").eq("id", sectionId).maybeSingle();
        if (secErr) throw secErr;
        if (!sec) throw new Error("Không tìm thấy phần thi.");
        if (sec.kind !== "mcq") throw new Error("Chỉ nạp CSV được cho phần trắc nghiệm A/B/C/D.");

        const parsed = csvToQuestions(String(payload.csv || ""));
        const rows = parsed.map((q) => ({
          section_id: sec.id, exam_id: sec.exam_id, kind: "mcq", number: q.number,
          content: q.content, accepted_answers: q.accepted_answers, explanation: q.explanation,
        }));
        // Cùng lý do như save_questions: một transaction, hỏng thì phần cũ còn nguyên.
        const { data: n, error } = await sb.rpc("save_questions", {
          p_section_id: sec.id, p_rows: rows,
        });
        if (error) throw error;
        return json({ ok: true, count: n });
      }
```

- [ ] **Step 2: Kiểm cú pháp**

Run: `deno check supabase/functions/admin/index.ts`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin/index.ts
git commit -m "feat(admin): action quản lý phần thi và câu hỏi"
```

---

