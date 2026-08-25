#!/usr/bin/env bash
# Chạy test schema trên Postgres 16 trong Docker. Không cần cài psql trên máy.
set -euo pipefail
cd "$(dirname "$0")/../.."
C=quiz_test_pg

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ Dựng Postgres 16…"
docker run -d --rm --name "$C" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "→ Nạp schema.sql…"
# Tạo role cho Supabase trước (bỏ qua lỗi nếu role đã tồn tại)
docker exec -i "$C" psql -U postgres -q -v ON_ERROR_STOP=0 << 'SQL'
create role anon nologin;
create role service_role nologin;
SQL
docker exec -i "$C" psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/schema.sql

fail=0
for f in tests/sql/[0-9]*.sql; do
  echo "→ $f"
  # ON_ERROR_STOP=1: bắt lỗi thật trong file test (sai syntax, sai tên bảng, v.v.).
  # Các ca cố ý gây lỗi đã được bọc trong hàm blocked() nên không nổi lên tới psql.
  if ! docker exec -i "$C" psql -U postgres -q -v ON_ERROR_STOP=1 < "$f" 2>&1 | tee /tmp/quiz_test_out; then
    fail=1
  fi
  if grep -q 'ASSERT-FAIL' /tmp/quiz_test_out; then
    echo "  ✗ có assertion thất bại"; fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "✓ TẤT CẢ TEST SQL PASS" || { echo "✗ CÓ TEST FAIL"; exit 1; }
