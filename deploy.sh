#!/usr/bin/env bash
# Deploys the web app and the Firestore Security Rules to the Firebase project
# in .firebaserc, after the same checks CI runs.
#
#   ./deploy.sh              rules and hosting together (the default; the app and
#                            the rules must agree on the data shape)
#   ./deploy.sh --check      run every check and the build, deploy nothing
#   ./deploy.sh --skip-tests skip the unit suites (typecheck still runs in the build)
#
# The Function is not deployed here: it needs the Blaze plan and a deploy-time
# manifest without the workspace dependency (see v3/phase-1.md).
set -euo pipefail
cd "$(dirname "$0")"

CHECK_ONLY=false
RUN_TESTS=true
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --skip-tests) RUN_TESTS=false ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }

step "Preflight"
PROJECT=$(python3 -c "import json; print(json.load(open('.firebaserc'))['projects']['default'])")
ENV_FILE=apps/web/.env.local
if ! grep -q "^VITE_FIREBASE_PROJECT_ID=${PROJECT}$" "$ENV_FILE" 2>/dev/null; then
  echo "Refusing: ${ENV_FILE} must set VITE_FIREBASE_PROJECT_ID=${PROJECT}. The build bakes it in; without it the deployed app refuses to start." >&2
  exit 1
fi
if grep -q "^VITE_STORE=memory" "$ENV_FILE"; then
  echo "Refusing: VITE_STORE=memory is set in ${ENV_FILE}; a production build would run on the in-memory store." >&2
  exit 1
fi
if ! firebase login:list 2>/dev/null | grep -q "Logged in as"; then
  echo "Refusing: the Firebase CLI is not logged in (firebase login)." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Note: the working tree has uncommitted changes; they will be deployed."
fi
echo "Project ${PROJECT}, branch $(git rev-parse --abbrev-ref HEAD), commit $(git rev-parse --short HEAD)."

if [ "$RUN_TESTS" = true ]; then
  step "Unit suites (engine, functions, scripts)"
  pnpm test
fi

step "Typecheck and production build"
pnpm build

if [ "$CHECK_ONLY" = true ]; then
  step "Check only: nothing deployed"
  exit 0
fi

step "Deploy rules and hosting to ${PROJECT}"
firebase deploy --only firestore:rules,hosting --project "$PROJECT"

step "Verify the live bundle"
BUILT=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' apps/web/dist/index.html | head -1)
LIVE=$(/usr/bin/curl -s "https://${PROJECT}.web.app/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
if [ "$BUILT" = "$LIVE" ]; then
  echo "https://${PROJECT}.web.app serves ${LIVE}, the bundle just built."
else
  echo "Warning: the live page serves ${LIVE:-nothing} but the build is ${BUILT}. The CDN may still be updating; check again in a minute." >&2
  exit 1
fi
