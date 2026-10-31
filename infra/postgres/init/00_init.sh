#!/usr/bin/env bash
# Khởi tạo PostgreSQL lần đầu (chạy bởi docker-entrypoint khi volume pg_data còn trống).
# Mục tiêu: least privilege — backend KHÔNG chạy bằng superuser `postgres`.
#   1. Tạo role ứng dụng (LOGIN, không superuser/createdb/createrole) với mật khẩu từ biến môi trường.
#   2. Giao quyền sở hữu database cho role đó và thu quyền kết nối của PUBLIC.
#   3. Chạy 001_schema.sql BẰNG role ứng dụng để mọi bảng thuộc về nó — nhờ vậy migration runtime
#      (backend/src/infrastructure/database/migrate.ts) có quyền DDL mà không cần superuser.
# Mật khẩu chỉ đi qua biến môi trường (\getenv), không nằm trên dòng lệnh và không được in ra log.
# Trong giai đoạn init, server tạm chỉ nghe unix socket với `trust` nên không cần mật khẩu khi kết nối.
# KHÔNG dùng `set -u`: file này bị entrypoint postgres `source` (không phải chạy) khi thiếu bit thực thi
# — thường gặp trên Windows — nên `-u` sẽ rò vào shell của entrypoint và làm nó chết vì biến chưa gán.
# Biến bắt buộc đã kiểm tường minh bằng ${VAR:?} bên dưới nên không cần `-u`.
set -eo pipefail

: "${POSTGRES_APP_USER:?Thiếu POSTGRES_APP_USER (xem .env.example)}"
: "${POSTGRES_APP_PASSWORD:?Thiếu POSTGRES_APP_PASSWORD (xem .env.example)}"
: "${POSTGRES_DB:?Thiếu POSTGRES_DB (xem .env.example)}"

SUPERUSER="${POSTGRES_USER:-postgres}"
SCHEMA_DIR="${SCHEMA_DIR:-/schema}"

# format(%I/%L) tự quote định danh và literal → an toàn với ký tự đặc biệt trong tên/mật khẩu.
# SET log_min_error_statement = panic: nếu CREATE ROLE ... PASSWORD lỗi, PostgreSQL mặc định ghi cả câu
# lệnh (chứa mật khẩu rõ) vào log STATEMENT; đặt ngưỡng panic để câu đó không bao giờ vào log (superuser
# được phép đổi tham số này theo phiên). log_statement = none phòng khi image bật log mọi câu lệnh.
psql -v ON_ERROR_STOP=1 -U "$SUPERUSER" -d postgres <<'SQL'
SET log_min_error_statement = panic;
SET log_statement = 'none';
\getenv app_user POSTGRES_APP_USER
\getenv app_pass POSTGRES_APP_PASSWORD
\getenv db_name POSTGRES_DB
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_pass') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'app_user') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'app_user') \gexec
SQL

psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_APP_USER" -d "$POSTGRES_DB" -f "$SCHEMA_DIR/001_schema.sql"
