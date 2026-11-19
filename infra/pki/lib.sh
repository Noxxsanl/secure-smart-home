#!/usr/bin/env bash
# =============================================================================
#  Hàm dùng chung của gen_mqtt_certs.sh và gen_mqtt_client.sh (source, không chạy trực tiếp).
#
#  CERT_DIR (mặc định infra/mosquitto/certs, đổi bằng biến PKI_CERT_DIR — dùng khi kiểm thử):
#    ca.crt / ca.key        CA nội bộ (ca.key có thể mã hoá bằng passphrase: biến CA_KEY_PASS)
#    ca.crl                 Danh sách chứng chỉ client bị thu hồi — broker đọc (crlfile)
#    ca-db/                 Sổ cái của CA (index.txt, serial, crlnumber) để thu hồi được chứng chỉ
#    ca.cnf                 Cấu hình `openssl ca` (đường dẫn tương đối — chạy openssl từ CERT_DIR)
#    issued/<CN>.crt        Bản sao mọi chứng chỉ client đã cấp (để thu hồi theo tên)
#
#  Mọi đường dẫn trong file cấu hình là tương đối: openssl của Git Bash là bản Windows, không hiểu /e/... trong file.
#  Không dùng -subj "/CN=..." (Git Bash đổi tham số bắt đầu bằng "/" thành đường dẫn Windows) — CN đặt trong file cnf.
# =============================================================================

PKI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="${PKI_CERT_DIR:-$PKI_ROOT/infra/mosquitto/certs}"
CA_DAYS=3650
LEAF_DAYS=825

command -v openssl >/dev/null || { echo "[lỗi] Cần cài openssl (có sẵn trong Git Bash)"; exit 1; }

# -passin khi CA_KEY_PASS được đặt (ca.key mã hoá AES-256); không đặt thì ca.key dạng rõ như trước.
pki_passin()  { if [[ -n "${CA_KEY_PASS:-}" ]]; then echo "-passin env:CA_KEY_PASS"; fi; }

# Chạy openssl im lặng, chỉ in stderr khi lỗi. $PKI_TMP do người gọi tạo (mktemp -d).
pki_run() { "$@" 2>"$PKI_TMP/err" || { cat "$PKI_TMP/err" >&2; exit 1; }; }

# CA nội bộ (tạo 1 lần, dùng lại) + sổ cái để thu hồi.
pki_ensure_ca() {
  mkdir -p "$CERT_DIR"
  cd "$CERT_DIR"
  if [[ -f ca.key && -f ca.crt ]]; then
    echo "[ca]     Dùng lại CA có sẵn: $CERT_DIR/ca.crt"
  else
    cat > "$PKI_TMP/ca_req.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt             = no
x509_extensions    = v3_ca
[dn]
O  = Secure Smart Home IoT
CN = Secure Smart Home IoT Local CA
[v3_ca]
basicConstraints       = critical, CA:TRUE, pathlen:0
keyUsage               = critical, keyCertSign, cRLSign
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always
EOF
    if [[ -n "${CA_KEY_PASS:-}" ]]; then
      pki_run openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -aes-256-cbc -pass env:CA_KEY_PASS -out ca.key
    else
      pki_run openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ca.key
    fi
    chmod 600 ca.key
    # shellcheck disable=SC2046
    pki_run openssl req -x509 -new -key ca.key $(pki_passin) -sha256 -days "$CA_DAYS" \
      -config "$PKI_TMP/ca_req.cnf" -out ca.crt
    echo "[ca]     Đã tạo CA mới (hạn $CA_DAYS ngày)${CA_KEY_PASS:+, ca.key mã hoá bằng CA_KEY_PASS} — ca.key không được rời khỏi máy này"
  fi

  mkdir -p ca-db/newcerts issued
  [[ -f ca-db/index.txt ]] || : > ca-db/index.txt
  [[ -f ca-db/index.txt.attr ]] || echo "unique_subject = no" > ca-db/index.txt.attr
  [[ -f ca-db/serial ]] || openssl rand -hex 16 > ca-db/serial
  [[ -f ca-db/crlnumber ]] || echo 1000 > ca-db/crlnumber
  cat > ca.cnf <<'EOF'
# Sinh bởi infra/pki/lib.sh — đường dẫn tương đối, chạy openssl ca từ thư mục chứa file này.
[ca]
default_ca = local_ca
[local_ca]
dir              = ./ca-db
database         = ./ca-db/index.txt
new_certs_dir    = ./ca-db/newcerts
serial           = ./ca-db/serial
crlnumber        = ./ca-db/crlnumber
certificate      = ./ca.crt
private_key      = ./ca.key
default_md       = sha256
default_days     = 825
# CRL hết hạn thì broker từ chối MỌI chứng chỉ client → để hạn dài, cấp lại mỗi lần thu hồi.
default_crl_days = 3650
policy           = policy_cn
unique_subject   = no
copy_extensions  = none
[policy_cn]
commonName       = supplied
organizationName = optional
[client_ext]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature
extendedKeyUsage       = clientAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid, issuer
EOF
  [[ -f ca.crl ]] || pki_gen_crl
}

# CRL mới từ sổ cái (chạy trong CERT_DIR).
pki_gen_crl() {
  # shellcheck disable=SC2046
  pki_run openssl ca -config ca.cnf -gencrl $(pki_passin) -out ca.crl
  echo "[crl]    Đã cập nhật $CERT_DIR/ca.crl"
}

# Cấp chứng chỉ client ECDSA P-256 cho CN = $1, ghi khoá/chứng chỉ vào $2/$3 (chạy trong CERT_DIR).
pki_issue_client() {
  local cn="$1" key_out="$2" crt_out="$3"
  cat > "$PKI_TMP/client_req.cnf" <<EOF
[req]
distinguished_name = dn
prompt             = no
[dn]
O  = Secure Smart Home IoT
CN = $cn
EOF
  pki_run openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -config "$PKI_TMP/client_req.cnf" -keyout "$PKI_TMP/client.key" -out "$PKI_TMP/client.csr"
  # shellcheck disable=SC2046
  pki_run openssl ca -batch -notext -config ca.cnf -extensions client_ext -days "$LEAF_DAYS" $(pki_passin) \
    -in "$PKI_TMP/client.csr" -out "$PKI_TMP/client.crt"
  pki_run openssl verify -CAfile ca.crt "$PKI_TMP/client.crt"
  mkdir -p "$(dirname "$key_out")" "$(dirname "$crt_out")"
  tr -d '\r' < "$PKI_TMP/client.key" > "$key_out"
  chmod 600 "$key_out"
  tr -d '\r' < "$PKI_TMP/client.crt" > "$crt_out"
  cp "$crt_out" "issued/$cn.crt"
}
