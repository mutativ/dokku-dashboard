#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$DASHBOARD_DIR/.env"
APP_NAME="dokku-dashboard"
IMAGE_NAME="dokku-dashboard-img:latest"

# ── Colors ───────────────────────────────────────────────────────────────────

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✔${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
err()     { echo -e "${RED}✖${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}=== $* ===${NC}\n"; }

# ── Args ─────────────────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 [user@host] [--ssh-key path] [--app name] [--code-only] [-y]"
  echo ""
  echo "  user@host      SSH destination (prompted if omitted)"
  echo "  --ssh-key path SSH key for VPS access (default: auto-detect ~/.ssh/)"
  echo "  --app name     Dokku app name (default: dokku-dashboard)"
  echo "  --code-only    Push new image only, skip config"
  echo "  -y / --yes     Non-interactive, use .env values as-is"
  exit 0
}

SSH_KEY=""; SSH_DEST=""; CODE_ONLY=false; YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-key)   SSH_KEY="$2"; shift 2 ;;
    --app)       APP_NAME="$2"; shift 2 ;;
    --code-only) CODE_ONLY=true; shift ;;
    -y|--yes)    YES=true; shift ;;
    --help|-h)   usage ;;
    *)           SSH_DEST="$1"; shift ;;
  esac
done

# ── Load .env (runtime app config only) ──────────────────────────────────────

if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    export "$key=$value"
  done < "$ENV_FILE"
fi

# ── Prompt helpers ────────────────────────────────────────────────────────────

ask() {
  # ask VAR "Label" [default]
  local var="$1" label="$2" default="${3:-}"
  local current="${!var:-$default}"
  if [ "$YES" = true ] && [ -n "$current" ]; then export "$var=$current"; return; fi
  local hint=""; [ -n "$current" ] && hint=" [$current]"
  read -rp "$(printf '%b%s%b%s: ' "$BOLD" "$label" "$NC" "$hint")" input
  export "$var=${input:-$current}"
}

ask_secret() {
  local var="$1" label="$2"
  if [ "$YES" = true ] && [ -n "${!var:-}" ]; then return; fi
  read -rsp "$(printf '%b%s%b: ' "$BOLD" "$label" "$NC")" input; echo ""
  [ -n "$input" ] && export "$var=$input"
}

ask_choice() {
  # ask_choice VAR "Label" "opt1|opt2|opt3" [default]
  local var="$1" label="$2" opts="$3" default="${4:-}"
  local current="${!var:-$default}"
  if [ "$YES" = true ] && [ -n "$current" ]; then export "$var=$current"; return; fi
  read -rp "$(printf '%b%s%b (%s) [%s]: ' "$BOLD" "$label" "$NC" "$opts" "$current")" input
  export "$var=${input:-$current}"
}

# ── SSH destination ───────────────────────────────────────────────────────────

[ -z "$SSH_DEST" ] && ask SSH_DEST "VPS SSH destination (e.g. root@1.2.3.4)"
[ -z "$SSH_DEST" ] && err "SSH destination required"

VPS_HOST=$(echo "$SSH_DEST" | cut -d@ -f2)

# ── SSH key (for deploy) ──────────────────────────────────────────────────────

if [ -z "$SSH_KEY" ]; then
  for k in ~/.ssh/id_ed25519 ~/.ssh/id_rsa; do
    [ -f "$k" ] && SSH_KEY="$k" && break
  done
fi
[ -z "$SSH_KEY" ] && err "No SSH key found. Pass --ssh-key /path/to/key"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

# ── Test connection ───────────────────────────────────────────────────────────

info "Connecting to $SSH_DEST..."
ssh "${SSH_OPTS[@]}" "$SSH_DEST" "echo ok" > /dev/null || err "Cannot connect to $SSH_DEST with key $SSH_KEY"
success "Connected"

# ── Interactive config ────────────────────────────────────────────────────────

if [ "$CODE_ONLY" = false ]; then
  header "Configure $APP_NAME"

  # Auth mode
  ask_choice AUTH_MODE "Auth mode" "password|google|both" "password"
  AUTH_MODE="${AUTH_MODE:-password}"

  # Password
  if [[ "$AUTH_MODE" == "password" || "$AUTH_MODE" == "both" ]]; then
    if [ -z "${DASHBOARD_PASSWORD_HASH:-}" ]; then
      ask_secret _PLAIN_PW "Dashboard password"
      [ -z "${_PLAIN_PW:-}" ] && err "Password required for auth mode '$AUTH_MODE'"
      info "Hashing password..."
      [ ! -d "$DASHBOARD_DIR/node_modules" ] && \
        (cd "$DASHBOARD_DIR" && bun install --silent 2>/dev/null || pnpm install --silent 2>/dev/null)
      DASHBOARD_PASSWORD_HASH=$(cd "$DASHBOARD_DIR" && \
        bun run src/hash-password.ts "$_PLAIN_PW" 2>/dev/null || \
        npx tsx src/hash-password.ts "$_PLAIN_PW" 2>/dev/null) || err "Failed to hash password"
      unset _PLAIN_PW
    else
      success "Using existing password hash"
    fi
  fi

  # Google OAuth
  if [[ "$AUTH_MODE" == "google" || "$AUTH_MODE" == "both" ]]; then
    ask        GOOGLE_CLIENT_ID      "Google Client ID"
    ask_secret GOOGLE_CLIENT_SECRET  "Google Client Secret"
    ask        GOOGLE_ALLOWED_DOMAIN "Allowed Google domain" ""
  fi

  # Session secret
  if [ -z "${SESSION_SECRET:-}" ]; then
    SESSION_SECRET=$(openssl rand -hex 32)
    info "Generated SESSION_SECRET"
  fi

  # Public URL — derive from existing domain or ask
  if [ -z "${PUBLIC_URL:-}" ]; then
    EXISTING_DOMAIN=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
      "dokku domains:report $APP_NAME 2>/dev/null | awk '/Domains app vhosts/{print \$NF}'" 2>/dev/null || true)
    SUGGESTED_URL=""; [ -n "$EXISTING_DOMAIN" ] && SUGGESTED_URL="https://$EXISTING_DOMAIN"
    ask PUBLIC_URL "Public URL (for OAuth callbacks)" "$SUGGESTED_URL"
  fi

  # Auto-detect Docker bridge IP
  info "Detecting Docker bridge IP on VPS..."
  DOCKER_BRIDGE_IP=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
    "ip addr show docker0 2>/dev/null | awk '/inet /{print \$2}' | cut -d/ -f1 || true")
  DOCKER_BRIDGE_IP="${DOCKER_BRIDGE_IP:-172.17.0.1}"
  success "Docker bridge IP: $DOCKER_BRIDGE_IP"

  # Dokku SSH key for app → Dokku access
  info "Checking app SSH key..."
  DOKKU_SSH_KEY=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
    "dokku config:get $APP_NAME DOKKU_SSH_KEY 2>/dev/null || true")

  if [ -z "$DOKKU_SSH_KEY" ]; then
    info "Generating new SSH key pair for app → Dokku access..."
    DOKKU_SSH_KEY=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" "
      ssh-keygen -t ed25519 -f /tmp/dokku-dash-key -N '' -q
      cat /tmp/dokku-dash-key.pub | dokku ssh-keys:add ${APP_NAME}-key 2>/dev/null || true
      base64 -w 0 /tmp/dokku-dash-key
      rm -f /tmp/dokku-dash-key /tmp/dokku-dash-key.pub
    ")
    success "SSH key generated and registered with Dokku"
  else
    success "Reusing existing Dokku SSH key"
  fi

  # Summary
  header "Deploy summary"
  printf "  %-22s %s\n" "App:"            "$APP_NAME"
  printf "  %-22s %s\n" "VPS:"            "$SSH_DEST"
  printf "  %-22s %s\n" "Auth mode:"      "$AUTH_MODE"
  printf "  %-22s %s\n" "DOKKU_SSH_HOST:" "$DOCKER_BRIDGE_IP (auto-detected)"
  [ -n "${PUBLIC_URL:-}"            ] && printf "  %-22s %s\n" "Public URL:"     "$PUBLIC_URL"
  [ -n "${GOOGLE_ALLOWED_DOMAIN:-}" ] && printf "  %-22s %s\n" "Google domain:"  "$GOOGLE_ALLOWED_DOMAIN"
  echo ""

  if [ "$YES" = false ]; then
    read -rp "$(printf '%bProceed? [Y/n]%b ' "$BOLD" "$NC")" confirm
    [[ "${confirm:-Y}" =~ ^[Nn] ]] && echo "Aborted." && exit 0
  fi
fi

# ── Build ─────────────────────────────────────────────────────────────────────

echo ""
APP_VERSION=$(git -C "$DASHBOARD_DIR" describe --tags --always --dirty 2>/dev/null || echo "dev")
info "[1/4] Building Docker image (linux/amd64) — version: $APP_VERSION..."
docker build --platform linux/amd64 --build-arg APP_VERSION="$APP_VERSION" -t "$IMAGE_NAME" "$DASHBOARD_DIR"
success "Image built"

# ── Push ──────────────────────────────────────────────────────────────────────

info "[2/4] Pushing image to VPS..."
docker save "$IMAGE_NAME" | gzip | ssh "${SSH_OPTS[@]}" "$SSH_DEST" 'gunzip | docker load'
success "Image pushed"

# ── Config ────────────────────────────────────────────────────────────────────

if [ "$CODE_ONLY" = true ]; then
  info "[3/4] Skipping config (--code-only)"
else
  info "[3/4] Configuring Dokku app..."

  ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
    "dokku apps:exists $APP_NAME 2>/dev/null || dokku apps:create $APP_NAME"

  # Set domain from PUBLIC_URL if not already configured
  if [ -n "${PUBLIC_URL:-}" ]; then
    DESIRED_DOMAIN=$(echo "$PUBLIC_URL" | sed 's|https\?://||' | cut -d/ -f1)
    CURRENT_DOMAIN=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
      "dokku domains:report $APP_NAME 2>/dev/null | awk '/Domains app vhosts/{print \$NF}'" || true)
    if [ "$CURRENT_DOMAIN" != "$DESIRED_DOMAIN" ] && [ -n "$DESIRED_DOMAIN" ]; then
      ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
        "dokku domains:set $APP_NAME $DESIRED_DOMAIN 2>/dev/null || true"
    fi
  fi

  # Upload env config via temp file (handles $, spaces, special chars safely)
  TMPCONF=$(mktemp); trap 'rm -f "$TMPCONF"' EXIT
  {
    echo "NODE_ENV=production"
    echo "PORT=${PORT:-4200}"
    echo "SESSION_SECRET=${SESSION_SECRET}"
    echo "AUTH_MODE=${AUTH_MODE:-password}"
    echo "DOKKU_SSH_HOST=${DOCKER_BRIDGE_IP}"
    echo "DOKKU_SSH_PORT=${DOKKU_SSH_PORT:-22}"
    echo "DOKKU_SSH_USER=${DOKKU_SSH_USER:-dokku}"
    echo "DOKKU_SSH_KEY=${DOKKU_SSH_KEY}"
    echo "DOKKU_APP_NAME=${APP_NAME}"
    [ -n "${DASHBOARD_PASSWORD_HASH:-}"  ] && echo "DASHBOARD_PASSWORD_HASH=${DASHBOARD_PASSWORD_HASH}"
    [ -n "${GOOGLE_CLIENT_ID:-}"         ] && echo "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
    [ -n "${GOOGLE_CLIENT_SECRET:-}"     ] && echo "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"
    [ -n "${GOOGLE_ALLOWED_DOMAIN:-}"    ] && echo "GOOGLE_ALLOWED_DOMAIN=${GOOGLE_ALLOWED_DOMAIN}"
    [ -n "${PUBLIC_URL:-}"               ] && echo "PUBLIC_URL=${PUBLIC_URL}"
    [ -n "${TRUSTED_PROXIES:-}"          ] && echo "TRUSTED_PROXIES=${TRUSTED_PROXIES}"
    [ -n "${ENABLE_SQL_EXPLORER:-}"      ] && echo "ENABLE_SQL_EXPLORER=${ENABLE_SQL_EXPLORER}"
  } > "$TMPCONF"

  ssh "${SSH_OPTS[@]}" "$SSH_DEST" "cat > /tmp/dokku-dash-env" < "$TMPCONF"
  ssh "${SSH_OPTS[@]}" "$SSH_DEST" "
    VARS=''
    while IFS='=' read -r k v; do
      [ -z \"\$k\" ] && continue
      VARS=\"\$VARS \$k='\$v'\"
    done < /tmp/dokku-dash-env
    eval dokku config:set --no-restart $APP_NAME \$VARS
    dokku ports:set $APP_NAME http:80:${PORT:-4200} 2>/dev/null || true
    rm -f /tmp/dokku-dash-env
  "
  success "Config set"
fi

# ── Deploy ────────────────────────────────────────────────────────────────────

info "[4/4] Deploying..."
ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
  "dokku git:from-image $APP_NAME $IMAGE_NAME 2>/dev/null || dokku ps:rebuild $APP_NAME"
success "Deployed"

# ── Let's Encrypt ─────────────────────────────────────────────────────────────

if [ "$CODE_ONLY" = false ]; then
  FINAL_DOMAIN=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
    "dokku domains:report $APP_NAME 2>/dev/null | awk '/Domains app vhosts/{print \$NF}'" || true)

  if [ -n "$FINAL_DOMAIN" ]; then
    HAS_CERT=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
      "dokku certs:report $APP_NAME 2>/dev/null | grep -c 'ssl enabled.*true' || echo 0")
    if [ "${HAS_CERT:-0}" = "0" ]; then
      info "Enabling Let's Encrypt for $FINAL_DOMAIN..."
      ssh "${SSH_OPTS[@]}" "$SSH_DEST" "dokku letsencrypt:enable $APP_NAME" \
        && success "SSL enabled" \
        || warn "Let's Encrypt failed — run: dokku letsencrypt:enable $APP_NAME"
    else
      success "SSL cert already present"
    fi
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────

FINAL_DOMAIN=$(ssh "${SSH_OPTS[@]}" "$SSH_DEST" \
  "dokku domains:report $APP_NAME 2>/dev/null | awk '/Domains app vhosts/{print \$NF}'" || true)

echo ""
if [ -n "$FINAL_DOMAIN" ]; then
  echo -e "${GREEN}${BOLD}✔ https://$FINAL_DOMAIN${NC}"
else
  echo -e "${GREEN}${BOLD}✔ http://$VPS_HOST:${PORT:-4200}${NC}"
fi
echo ""
