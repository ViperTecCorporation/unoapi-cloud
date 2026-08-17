#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Baixa um toolchain Go oficial temporário, testa e compila o relay-bridge Linux.

Uso:
  bash scripts/build-native-relay-bridge.sh [opções]

Opções:
  --source-dir DIR      Fontes do relay-bridge (padrão: vendor/zapo-voip/native/relay-bridge)
  --output PATH         Arquivo de saída (padrão: SOURCE_DIR/relay-bridge)
  --go-series VERSION   Série estável do Go (padrão: 1.25)
  -h, --help            Mostra esta ajuda
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${PROJECT_ROOT}/vendor/zapo-voip/native/relay-bridge"
OUTPUT_PATH=""
GO_SERIES="1.25"

while (($#)); do
  case "$1" in
    --source-dir) SOURCE_DIR="${2:?valor ausente para --source-dir}"; shift 2 ;;
    --output) OUTPUT_PATH="${2:?valor ausente para --output}"; shift 2 ;;
    --go-series) GO_SERIES="${2:?valor ausente para --go-series}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Opção desconhecida: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

SOURCE_DIR="$(cd -- "$SOURCE_DIR" 2>/dev/null && pwd)" || {
  printf 'Diretório de fontes não encontrado: %s\n' "$SOURCE_DIR" >&2
  exit 1
}
OUTPUT_PATH="${OUTPUT_PATH:-${SOURCE_DIR}/relay-bridge}"
[[ "$OUTPUT_PATH" == /* && "$OUTPUT_PATH" != "/" ]] || {
  printf 'output deve ser absoluto e específico\n' >&2
  exit 2
}
[[ "$OUTPUT_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  printf 'output contém caracteres inválidos\n' >&2
  exit 2
}
[[ "$GO_SERIES" =~ ^[0-9]+\.[0-9]+$ ]] || {
  printf 'go-series inválida: %s\n' "$GO_SERIES" >&2
  exit 2
}
[[ -f "${SOURCE_DIR}/go.mod" && -f "${SOURCE_DIR}/go.sum" && -f "${SOURCE_DIR}/main.go" ]] || {
  printf 'Fontes incompletas do relay-bridge em %s\n' "$SOURCE_DIR" >&2
  exit 1
}

for command_name in curl python3 sha256sum tar install mktemp uname rm; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Dependência obrigatória ausente: %s\n' "$command_name" >&2
    exit 1
  }
done

case "$(uname -m)" in
  x86_64|amd64) GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) printf 'Arquitetura não suportada: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

BUILD_TMP="$(mktemp -d /tmp/viperconnect-relay-build-XXXXXX)"
cleanup() {
  case "${BUILD_TMP:-}" in
    /tmp/viperconnect-relay-build-*) rm -rf -- "$BUILD_TMP" ;;
  esac
}
trap cleanup EXIT

printf 'Consultando a distribuição oficial do Go %s para linux/%s...\n' "$GO_SERIES" "$GO_ARCH"
GO_MANIFEST="${BUILD_TMP}/go-downloads.json"
curl --fail --silent --show-error --location \
  'https://go.dev/dl/?mode=json&include=all' \
  --output "$GO_MANIFEST"

GO_SELECTION="$({ GO_SERIES="$GO_SERIES" GO_ARCH="$GO_ARCH" python3 - "$GO_MANIFEST" <<'PY'
import json
import os
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    releases = json.load(handle)

series = os.environ["GO_SERIES"]
arch = os.environ["GO_ARCH"]
matches = []
for release in releases:
    version = str(release.get("version", ""))
    match = re.fullmatch(rf"go{re.escape(series)}\.(\d+)", version)
    if not match or not release.get("stable"):
        continue
    for item in release.get("files", []):
        if item.get("os") == "linux" and item.get("arch") == arch and item.get("kind") == "archive":
            matches.append((int(match.group(1)), item["filename"], item["sha256"], version))

if not matches:
    raise SystemExit(f"nenhum Go estável da série {series} encontrado para linux/{arch}")

_, filename, checksum, version = max(matches)
print(f"{filename}\t{checksum}\t{version}")
PY
} 2>&1)" || {
  printf 'Falha ao selecionar o toolchain Go: %s\n' "$GO_SELECTION" >&2
  exit 1
}

IFS=$'\t' read -r GO_FILENAME GO_SHA256 GO_VERSION <<<"$GO_SELECTION"
[[ -n "$GO_FILENAME" && "$GO_SHA256" =~ ^[a-f0-9]{64}$ && "$GO_VERSION" =~ ^go[0-9.]+$ ]] || {
  printf 'Resposta inválida do catálogo oficial do Go.\n' >&2
  exit 1
}

GO_ARCHIVE="${BUILD_TMP}/${GO_FILENAME}"
printf 'Baixando %s...\n' "$GO_VERSION"
curl --fail --silent --show-error --location \
  "https://go.dev/dl/${GO_FILENAME}" \
  --output "$GO_ARCHIVE"
printf '%s  %s\n' "$GO_SHA256" "$GO_ARCHIVE" | sha256sum --check --status || {
  printf 'Checksum SHA-256 do toolchain Go não confere.\n' >&2
  exit 1
}

tar -C "$BUILD_TMP" -xzf "$GO_ARCHIVE"
GO_BIN="${BUILD_TMP}/go/bin/go"
[[ -x "$GO_BIN" ]] || { printf 'Toolchain Go não foi extraído corretamente.\n' >&2; exit 1; }
"$GO_BIN" version

BUILD_OUTPUT="${BUILD_TMP}/relay-bridge"
printf 'Testando e compilando relay-bridge...\n'
(
  cd "$SOURCE_DIR"
  CGO_ENABLED=0 "$GO_BIN" test ./...
  CGO_ENABLED=0 GOOS=linux GOARCH="$GO_ARCH" \
    "$GO_BIN" build -trimpath -ldflags='-s -w' -o "$BUILD_OUTPUT" ./main.go
)
[[ -s "$BUILD_OUTPUT" && -x "$BUILD_OUTPUT" ]] || {
  printf 'Build não gerou um executável válido.\n' >&2
  exit 1
}

install -D -m 0755 "$BUILD_OUTPUT" "$OUTPUT_PATH"
[[ -s "$OUTPUT_PATH" && -x "$OUTPUT_PATH" ]] || {
  printf 'Executável não foi instalado corretamente em %s\n' "$OUTPUT_PATH" >&2
  exit 1
}
printf 'relay-bridge compilado em %s\n' "$OUTPUT_PATH"
