#!/bin/bash
# two Taxi — install / connect the platform on taxi2-main. Safe to run more than once.
#   curl -fsSL https://raw.githubusercontent.com/truegroupteam/taxi2-site/main/server/platform.sh | bash
set -euo pipefail
KEY=/root/.ssh/taxi2_deploy
REPO=git@github.com:truegroupteam/taxi2-platform.git
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "taxi2-main deploy" -f "$KEY"
export GIT_SSH_COMMAND="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
if ! git ls-remote "$REPO" >/dev/null 2>&1; then
  echo
  echo "Сървърът още няма достъп до кода. Изпрати на Claude този ред (публичен ключ — безопасно е):"
  echo
  cat "$KEY.pub"
  echo
  exit 0
fi
if [ -d /opt/taxi2/app/.git ]; then
  cd /opt/taxi2/app && git fetch -q origin main && git reset -q --hard origin/main
else
  git clone -q "$REPO" /opt/taxi2/app
fi
bash /opt/taxi2/app/deploy/install.sh
