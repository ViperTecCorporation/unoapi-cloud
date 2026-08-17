#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Compila e instala o relay-bridge ausente em instalações Linux nativas.

Uso:
  sudo bash scripts/repair-native-relay-bridge.sh [opções]

Opções:
  --env-file ARQUIVO    EnvironmentFile do serviço (padrão: autodetectar pela unit;
                        fallback: /etc/viperconnect/viperconnect.env)
  --service UNIT        Unit systemd a reiniciar; pode ser repetida
  --install-path PATH   Destino do binário (padrão: /usr/local/libexec/viperconnect/relay-bridge)
  --go-series VERSION   Série do Go usada no build (padrão: 1.25)
  --no-restart          Instala e configura sem reiniciar serviços
  -h, --help            Mostra esta ajuda

Exemplos:
  sudo bash scripts/repair-native-relay-bridge.sh
  sudo bash scripts/repair-native-relay-bridge.sh --service viperconnect-worker.service
  sudo bash scripts/repair-native-relay-bridge.sh --service naxion-unoapi.service
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${PROJECT_ROOT}/vendor/zapo-voip/native/relay-bridge"
ENV_FILE="/etc/viperconnect/viperconnect.env"
ENV_FILE_EXPLICIT="false"
INSTALL_PATH="/usr/local/libexec/viperconnect/relay-bridge"
GO_SERIES="1.25"
RESTART_SERVICES="true"
SERVICES=()

while (($#)); do
  case "$1" in
    --env-file) ENV_FILE="${2:?valor ausente para --env-file}"; ENV_FILE_EXPLICIT="true"; shift 2 ;;
    --service) SERVICES+=("${2:?valor ausente para --service}"); shift 2 ;;
    --install-path) INSTALL_PATH="${2:?valor ausente para --install-path}"; shift 2 ;;
    --go-series) GO_SERIES="${2:?valor ausente para --go-series}"; shift 2 ;;
    --no-restart) RESTART_SERVICES="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Opção desconhecida: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$ENV_FILE" == /* && "$ENV_FILE" != "/" ]] || { printf 'env-file deve ser absoluto e específico\n' >&2; exit 2; }
[[ "$INSTALL_PATH" == /* && "$INSTALL_PATH" != "/" ]] || { printf 'install-path deve ser absoluto e específico\n' >&2; exit 2; }
[[ "$ENV_FILE" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'env-file contém caracteres inválidos\n' >&2; exit 2; }
[[ "$INSTALL_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'install-path contém caracteres inválidos\n' >&2; exit 2; }
[[ "$GO_SERIES" =~ ^[0-9]+\.[0-9]+$ ]] || { printf 'go-series inválida: %s\n' "$GO_SERIES" >&2; exit 2; }
for service_name in "${SERVICES[@]}"; do
  [[ "$service_name" =~ ^[A-Za-z0-9_.@-]+\.service$ ]] || {
    printf 'Unit systemd inválida: %s\n' "$service_name" >&2
    exit 2
  }
done
[[ -f "${SOURCE_DIR}/go.mod" && -f "${SOURCE_DIR}/go.sum" && -f "${SOURCE_DIR}/main.go" ]] || {
  printf 'Fontes do relay-bridge não encontrados em %s\n' "$SOURCE_DIR" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || { printf 'Execute como root ou com sudo.\n' >&2; exit 1; }

for command_name in install awk grep systemctl stat chown chmod mv mktemp rm; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Dependência obrigatória ausente: %s\n' "$command_name" >&2
    exit 1
  }
done

if [[ "$ENV_FILE_EXPLICIT" == "false" && ${#SERVICES[@]} -gt 0 ]]; then
  DISCOVERED_ENV_FILE="$(
    systemctl show "${SERVICES[0]}" --property=EnvironmentFiles --value 2>/dev/null \
      | awk '{ for (index = 1; index <= NF; index += 1) if ($index ~ /^-?\//) { value = $index; sub(/^-/, "", value); print value; exit } }'
  )"
  if [[ -n "$DISCOVERED_ENV_FILE" ]]; then
    [[ "$DISCOVERED_ENV_FILE" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
      printf 'EnvironmentFile descoberto contém caracteres não suportados: %s\n' "$DISCOVERED_ENV_FILE" >&2
      exit 1
    }
    ENV_FILE="$DISCOVERED_ENV_FILE"
    printf 'EnvironmentFile descoberto pela unit %s: %s\n' "${SERVICES[0]}" "$ENV_FILE"
  fi
fi

[[ -f "$ENV_FILE" ]] || {
  printf 'EnvironmentFile não encontrado: %s\n' "$ENV_FILE" >&2
  printf 'Informe o caminho correto com --env-file.\n' >&2
  exit 1
}

REPAIR_TMP="$(mktemp -d /tmp/viperconnect-relay-repair-XXXXXX)"
cleanup() {
  case "${REPAIR_TMP:-}" in
    /tmp/viperconnect-relay-repair-*) rm -rf -- "$REPAIR_TMP" ;;
  esac
}
trap cleanup EXIT

BUILD_OUTPUT="${REPAIR_TMP}/relay-bridge"
bash "${PROJECT_ROOT}/scripts/build-native-relay-bridge.sh" \
  --source-dir "$SOURCE_DIR" \
  --output "$BUILD_OUTPUT" \
  --go-series "$GO_SERIES"

printf 'Instalando %s...\n' "$INSTALL_PATH"
install -D -o root -g root -m 0755 "$BUILD_OUTPUT" "$INSTALL_PATH"

ENV_TMP="$(mktemp "$(dirname -- "$ENV_FILE")/.viperconnect-env-XXXXXX")"
awk -v value="$INSTALL_PATH" '
  BEGIN { replaced = 0 }
  /^ZAPO_VOIP_RELAY_BRIDGE_PATH=/ {
    if (!replaced) print "ZAPO_VOIP_RELAY_BRIDGE_PATH=" value
    replaced = 1
    next
  }
  { print }
  END {
    if (!replaced) print "ZAPO_VOIP_RELAY_BRIDGE_PATH=" value
  }
' "$ENV_FILE" > "$ENV_TMP"
ENV_MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || printf '600')"
ENV_OWNER="$(stat -c '%u' "$ENV_FILE" 2>/dev/null || printf '0')"
ENV_GROUP="$(stat -c '%g' "$ENV_FILE" 2>/dev/null || printf '0')"
chown "$ENV_OWNER:$ENV_GROUP" "$ENV_TMP"
chmod "$ENV_MODE" "$ENV_TMP"
mv -f -- "$ENV_TMP" "$ENV_FILE"

if [[ "$RESTART_SERVICES" == "true" ]]; then
  if ((${#SERVICES[@]} == 0)); then
    for candidate in viperconnect-worker.service viperconnect.service; do
      if systemctl cat "$candidate" >/dev/null 2>&1; then
        SERVICES+=("$candidate")
      fi
    done
  fi
  if ((${#SERVICES[@]} == 0)); then
    printf 'Binário instalado, mas nenhuma unit conhecida foi encontrada.\n' >&2
    printf 'Reinicie manualmente o serviço UnoAPI que executa o worker Zapo.\n' >&2
    exit 0
  fi
  systemctl daemon-reload
  for service_name in "${SERVICES[@]}"; do
    printf 'Reiniciando %s...\n' "$service_name"
    systemctl restart "$service_name"
    systemctl --no-pager --full status "$service_name" || true
  done
fi

printf '\nReparo concluído.\n'
printf '  binário: %s\n' "$INSTALL_PATH"
printf '  ambiente: %s\n' "$ENV_FILE"
printf 'A próxima chamada não deve registrar "relay-bridge ENOENT".\n'
