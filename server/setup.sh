#!/bin/bash
# two Taxi (taxi2.bg) — server setup for Ubuntu 24.04. Safe to run more than once.
# Secrets are generated on the server and never leave it.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
echo "== packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git jq ufw fail2ban unattended-upgrades docker.io docker-compose-v2 >/dev/null
timedatectl set-timezone Europe/Sofia || true
echo "== files"
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-taxi2.conf <<'TAXI2EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
TAXI2EOF
chmod 644 /etc/ssh/sshd_config.d/10-taxi2.conf
mkdir -p /etc/apt/apt.conf.d
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'TAXI2EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
TAXI2EOF
chmod 644 /etc/apt/apt.conf.d/20auto-upgrades
mkdir -p /etc/sysctl.d
cat > /etc/sysctl.d/90-taxi2.conf <<'TAXI2EOF'
vm.swappiness=10
vm.overcommit_memory=1
net.core.somaxconn=4096
fs.file-max=200000
TAXI2EOF
chmod 644 /etc/sysctl.d/90-taxi2.conf
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'TAXI2EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
TAXI2EOF
chmod 644 /etc/docker/daemon.json
mkdir -p /opt/taxi2
cat > /opt/taxi2/docker-compose.yml <<'TAXI2EOF'
name: taxi2
services:
  db:
    image: postgis/postgis:16-3.4
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_DB: taxi2
      POSTGRES_USER: taxi2
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      TZ: Europe/Sofia
    command: >
      postgres
      -c shared_buffers=1GB
      -c effective_cache_size=3GB
      -c work_mem=16MB
      -c maintenance_work_mem=256MB
      -c max_connections=200
      -c timezone=Europe/Sofia
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taxi2 -d taxi2"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$${REDIS_PASSWORD}\" --no-auth-warning ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 5
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
      - caddyconfig:/config

volumes:
  pgdata:
  redisdata:
  caddydata:
  caddyconfig:
TAXI2EOF
chmod 644 /opt/taxi2/docker-compose.yml
mkdir -p /opt/taxi2
cat > /opt/taxi2/Caddyfile <<'TAXI2EOF'
{
  email truegroupteam@gmail.com
}

api.taxi2.bg {
  header -Server
  respond /health "ok" 200
  respond "two Taxi API — скоро" 200
}

:80 {
  respond /health "ok" 200
  respond "two Taxi" 200
}
TAXI2EOF
chmod 644 /opt/taxi2/Caddyfile
mkdir -p /opt/taxi2/db/init
cat > /opt/taxi2/db/init/01-extensions.sql <<'TAXI2EOF'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
TAXI2EOF
chmod 644 /opt/taxi2/db/init/01-extensions.sql
mkdir -p /usr/local/bin
cat > /usr/local/bin/taxi2-backup <<'TAXI2EOF'
#!/bin/bash
set -euo pipefail
DIR=/opt/taxi2/backups
mkdir -p "$DIR"
STAMP=$(date +%Y-%m-%d_%H%M)
docker exec taxi2-db-1 pg_dump -U taxi2 -d taxi2 -Fc > "$DIR/taxi2_$STAMP.dump"
find "$DIR" -name 'taxi2_*.dump' -mtime +14 -delete
TAXI2EOF
chmod 750 /usr/local/bin/taxi2-backup
mkdir -p /etc/cron.d
cat > /etc/cron.d/taxi2-backup <<'TAXI2EOF'
SHELL=/bin/bash
30 3 * * * root /usr/local/bin/taxi2-backup >> /var/log/taxi2-backup.log 2>&1
TAXI2EOF
chmod 644 /etc/cron.d/taxi2-backup
mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/sshd.local <<'TAXI2EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
TAXI2EOF
chmod 644 /etc/fail2ban/jail.d/sshd.local
echo "== deploy user"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker deploy
usermod -aG docker deploy
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-deploy && chmod 440 /etc/sudoers.d/90-deploy
mkdir -p /home/deploy/.ssh && cp /root/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
echo "== swap"
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || fallocate -l 4G /swapfile
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
sysctl --system >/dev/null
systemctl restart ssh
echo "== firewall"
ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
for p in 22/tcp 80/tcp 443/tcp 443/udp; do ufw allow $p >/dev/null; done
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true
echo "== secrets"
cd /opt/taxi2
if [ ! -f .env ]; then
  umask 077
  printf "DB_PASSWORD=%s\nREDIS_PASSWORD=%s\nJWT_SECRET=%s\n" "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" "$(openssl rand -hex 48)" > .env
  umask 022
fi
mkdir -p backups
chown -R deploy:deploy /opt/taxi2 && chmod 600 .env
echo "== start stack"
systemctl restart docker
docker compose up -d
sleep 5
docker compose ps
echo "taxi2 setup finished" > /opt/taxi2/BOOTSTRAP_OK
echo
echo "ГОТОВО: проверка -> curl -s http://localhost/health"
