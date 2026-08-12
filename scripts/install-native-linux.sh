#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Instala ou atualiza o ViperConnect nativamente em Debian/Ubuntu.

Uso:
  sudo bash scripts/install-native-linux.sh [opções]

Opções:
  --tag TAG              Tag imutável a instalar (padrão: versão do package.json)
  --role ROLE            all, web, broker, worker ou video (padrão: all)
  --env-file ARQUIVO     Arquivo de ambiente a instalar em /etc/viperconnect
  --install-root DIR     Releases e link current (padrão: /opt/viperconnect)
  --state-root DIR       Dados persistentes (padrão: /var/lib/viperconnect)
  --service-user USER    Usuário de serviço (padrão: viperconnect)
  --repo URL             Repositório Git
  --no-start             Instala e habilita a unit sem iniciá-la
  --dry-run              Valida argumentos e mostra o plano sem alterar o host
  -h, --help             Mostra esta ajuda
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_VERSION=""
if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
  DEFAULT_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${PROJECT_ROOT}/package.json" | head -1)"
fi
TAG="${DEFAULT_VERSION:+v${DEFAULT_VERSION}}"
ROLE="all"
ENV_SOURCE=""
INSTALL_ROOT="/opt/viperconnect"
STATE_ROOT="/var/lib/viperconnect"
SERVICE_USER="viperconnect"
REPO_URL="https://github.com/ViperTecCorporation/ViperConnect.git"
START_SERVICE="true"
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --tag) TAG="${2:?valor ausente para --tag}"; shift 2 ;;
    --role) ROLE="${2:?valor ausente para --role}"; shift 2 ;;
    --env-file) ENV_SOURCE="${2:?valor ausente para --env-file}"; shift 2 ;;
    --install-root) INSTALL_ROOT="${2:?valor ausente para --install-root}"; shift 2 ;;
    --state-root) STATE_ROOT="${2:?valor ausente para --state-root}"; shift 2 ;;
    --service-user) SERVICE_USER="${2:?valor ausente para --service-user}"; shift 2 ;;
    --repo) REPO_URL="${2:?valor ausente para --repo}"; shift 2 ;;
    --no-start) START_SERVICE="false"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Opção desconhecida: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$TAG" ]] || { printf 'Informe --tag ao executar o instalador fora do repositório.\n' >&2; exit 2; }
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'Tag inválida: %s\n' "$TAG" >&2; exit 2; }
[[ "$ROLE" =~ ^(all|web|broker|worker|video)$ ]] || { printf 'Role inválida: %s\n' "$ROLE" >&2; exit 2; }
[[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] || { printf 'Usuário inválido: %s\n' "$SERVICE_USER" >&2; exit 2; }
[[ "$INSTALL_ROOT" == /* && "$INSTALL_ROOT" != "/" ]] || { printf 'install-root deve ser absoluto e específico\n' >&2; exit 2; }
[[ "$STATE_ROOT" == /* && "$STATE_ROOT" != "/" ]] || { printf 'state-root deve ser absoluto e específico\n' >&2; exit 2; }
[[ "$INSTALL_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'install-root contém caracteres inválidos\n' >&2; exit 2; }
[[ "$STATE_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'state-root contém caracteres inválidos\n' >&2; exit 2; }
if [[ -n "$ENV_SOURCE" && ! -r "$ENV_SOURCE" ]]; then
  printf 'Arquivo de ambiente não encontrado ou sem leitura: %s\n' "$ENV_SOURCE" >&2
  exit 2
fi

SERVICE_SUFFIX=""
ROLE_ENVIRONMENT=""
ROLE_DESCRIPTION=""
if [[ "$ROLE" != "all" ]]; then
  SERVICE_SUFFIX="-${ROLE}"
  ROLE_ENVIRONMENT="Environment=UNOAPI_PROCESS_ROLE=${ROLE}"
  ROLE_DESCRIPTION=" (${ROLE})"
fi
SERVICE_NAME="viperconnect${SERVICE_SUFFIX}.service"
RELEASES_ROOT="${INSTALL_ROOT}/releases"
RELEASE_DIR="${RELEASES_ROOT}/${TAG}"
ENV_TARGET="/etc/viperconnect/viperconnect.env"
UNIT_TARGET="/etc/systemd/system/${SERVICE_NAME}"

printf 'ViperConnect native install plan\n'
printf '  tag: %s\n' "$TAG"
printf '  role: %s\n' "$ROLE"
printf '  release: %s\n' "$RELEASE_DIR"
printf '  state: %s\n' "$STATE_ROOT"
printf '  unit: %s\n' "$SERVICE_NAME"
if [[ "$DRY_RUN" == "true" ]]; then
  printf 'Dry-run concluído; nenhuma alteração foi realizada.\n'
  exit 0
fi

[[ "${EUID}" -eq 0 ]] || { printf 'Execute como root ou com sudo.\n' >&2; exit 1; }
[[ -r /etc/os-release ]] || { printf 'Linux sem /etc/os-release não suportado.\n' >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" =~ ^(debian|ubuntu)$ || "${ID_LIKE:-}" == *debian* ]] || {
  printf 'Distribuição não suportada: %s\n' "${ID:-desconhecida}" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg build-essential python3 ffmpeg

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]' 2>/dev/null || true)"
if [[ "$NODE_MAJOR" != "24" ]]; then
  install -d -m 0755 /etc/apt/keyrings
  KEY_TMP="$(mktemp)"
  trap 'rm -f "${KEY_TMP:-}"' EXIT
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$KEY_TMP"
  gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg "$KEY_TMP"
  rm -f "$KEY_TMP"
  trap - EXIT
  printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main\n' \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

corepack enable
corepack prepare yarn@1.22.22 --activate

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_ROOT" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
install -d -m 0755 "$INSTALL_ROOT" "$RELEASES_ROOT"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 \
  "$STATE_ROOT" "$STATE_ROOT/data" "$STATE_ROOT/data/medias" "$STATE_ROOT/data/logs"

if [[ ! -f "${RELEASE_DIR}/dist/src/cloud.js" ]]; then
  if [[ -e "$RELEASE_DIR" ]]; then
    mv "$RELEASE_DIR" "${RELEASE_DIR}.incomplete.$(date +%s)"
  fi
  STAGING_DIR="$(mktemp -d "${RELEASES_ROOT}/.install-${TAG}-XXXXXX")"
  trap 'case "${STAGING_DIR:-}" in "'"${RELEASES_ROOT}"'"/.install-"*) rm -rf -- "$STAGING_DIR";; esac' EXIT
  git clone --depth 1 --branch "$TAG" "$REPO_URL" "$STAGING_DIR"
  (
    cd "$STAGING_DIR"
    yarn install --frozen-lockfile
    yarn build
    rm -rf -- node_modules
    NODE_ENV=production yarn install --production --frozen-lockfile --no-progress
    test ! -d node_modules/@whiskeysockets/baileys
    test -f dist/src/cloud.js
    test -f public/app/main.js
  )
  if [[ -e "${STAGING_DIR}/data" && ! -L "${STAGING_DIR}/data" ]]; then
    mv "${STAGING_DIR}/data" "${STAGING_DIR}/data.build"
  fi
  ln -s "$STATE_ROOT/data" "${STAGING_DIR}/data"
  mv "$STAGING_DIR" "$RELEASE_DIR"
  STAGING_DIR=""
fi

install -d -m 0750 /etc/viperconnect
if [[ -n "$ENV_SOURCE" ]]; then
  install -m 0600 "$ENV_SOURCE" "$ENV_TARGET"
elif [[ ! -f "$ENV_TARGET" ]]; then
  install -m 0600 "${RELEASE_DIR}/deploy/native/viperconnect.env.example" "$ENV_TARGET"
  printf 'Configure %s e execute o instalador novamente.\n' "$ENV_TARGET" >&2
  exit 1
fi

grep -Eq '^REDIS_URL=.+$' "$ENV_TARGET" || { printf 'REDIS_URL ausente em %s\n' "$ENV_TARGET" >&2; exit 1; }
grep -Eq '^AMQP_URL=.+$' "$ENV_TARGET" || { printf 'AMQP_URL ausente em %s\n' "$ENV_TARGET" >&2; exit 1; }

UNIT_TEMPLATE="${RELEASE_DIR}/deploy/systemd/viperconnect.service.in"
sed \
  -e "s|@@SERVICE_USER@@|${SERVICE_USER}|g" \
  -e "s|@@INSTALL_ROOT@@|${INSTALL_ROOT}|g" \
  -e "s|@@STATE_ROOT@@|${STATE_ROOT}|g" \
  -e "s|@@ROLE_ENVIRONMENT@@|${ROLE_ENVIRONMENT}|g" \
  -e "s|@@ROLE_DESCRIPTION@@|${ROLE_DESCRIPTION}|g" \
  "$UNIT_TEMPLATE" > "$UNIT_TARGET"
chmod 0644 "$UNIT_TARGET"

ln -sfn "$RELEASE_DIR" "${INSTALL_ROOT}/current.next"
mv -Tf "${INSTALL_ROOT}/current.next" "${INSTALL_ROOT}/current"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
if [[ "$START_SERVICE" == "true" ]]; then
  systemctl restart "$SERVICE_NAME"
  systemctl --no-pager --full status "$SERVICE_NAME"
fi

printf 'Instalação concluída: %s -> %s\n' "${INSTALL_ROOT}/current" "$RELEASE_DIR"
