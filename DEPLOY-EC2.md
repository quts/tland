# Deploying the game server to EC2

The client is static and lives on Vercel. The game server is not static: it is
a long-lived process holding the room in memory between connections, so it
needs an always-on machine. This walks through putting it on one EC2 instance
with its own domain and TLS, then pointing the Vercel build at it.

Budget roughly 40 minutes the first time, most of it waiting for DNS.

```
browser ──https──> Vercel (static client)
   │
   └────wss───────> your-domain ──> EC2: Caddy (TLS) ──> game container :3000
```

## What you need first

- An AWS account.
- A domain you control, where you can add an `A` record. A subdomain is fine
  and is what the rest of this assumes: `game.example.com`.
- The repository is private, so the instance needs read access to it. We use a
  GitHub **deploy key**, which is a read-only SSH key scoped to this one repo —
  not your personal key.

Throughout, replace:

| Placeholder | With |
| --- | --- |
| `game.example.com` | your server's domain |
| `https://tland-dun.vercel.app` | your Vercel URL |
| `1.2.3.4` | the Elastic IP from step 2 |

---

## 1. Launch the instance

EC2 → **Launch instance**.

| Setting | Value | Why |
| --- | --- | --- |
| Name | `tland-game` | |
| AMI | **Amazon Linux 2023**, architecture **64-bit (Arm)** | Graviton is cheaper, and the image builds for arm64 |
| Instance type | **t4g.small** | 2 GB. `t4g.micro` (1 GB) runs the server fine but is tight for building the image — see step 5 if you want to use it |
| Key pair | create one, download the `.pem` | your SSH key |
| Storage | 16 GB gp3 | 8 GB fills up once Docker has a few layers |

Under **Network settings → Edit**, create a security group with exactly three
inbound rules:

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| SSH | 22 | **My IP** | not `0.0.0.0/0` — this is the one people get wrong |
| HTTP | 80 | `0.0.0.0/0` | Let's Encrypt needs it to issue and renew the certificate |
| HTTPS | 443 | `0.0.0.0/0` | where `wss://` actually arrives |

**Do not open 3000.** The game server listens there, but only Caddy on the same
machine should reach it. Leaving it open lets people bypass TLS and the origin
check.

Launch, then `chmod 400 your-key.pem` locally.

## 2. Give it a fixed address

A stopped-and-started instance gets a new public IP, which would break your DNS
every time. EC2 → **Elastic IPs** → *Allocate* → *Associate* with the instance.
Call the result `1.2.3.4`.

Elastic IPs are free **while associated with a running instance** and billed
hourly when they are not, so release it if you tear the instance down.

## 3. Point the domain at it

At your DNS provider, add:

```
Type  Name   Value      TTL
A     game   1.2.3.4    300
```

Check it from your Mac before going further — Caddy cannot get a certificate
until this resolves:

```bash
dig +short game.example.com
```

It should print `1.2.3.4`. If it prints nothing, wait and try again; a fresh
record usually takes a few minutes.

## 4. Connect and install Docker

```bash
ssh -i your-key.pem ec2-user@game.example.com
```

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

The group change only applies to a new login, so:

```bash
exit
```

then SSH back in and check it took:

```bash
docker ps
```

That must work without `sudo` before you continue.

## 5. Get the code onto the instance

Make a deploy key **on the instance**:

```bash
ssh-keygen -t ed25519 -C "tland-ec2" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy that line, then in GitHub: repo → **Settings → Deploy keys → Add deploy
key**. Title `tland-ec2`, paste the key, and **leave "Allow write access"
unchecked** — the instance only ever needs to read.

Back on the instance:

```bash
git clone git@github.com:quts/tland.git
cd tland
docker build -t tland/game:latest -f docker/game.Dockerfile .
```

The build installs only the `shared` and `server` workspaces, so it pulls about
130 MB and takes a few minutes on a `t4g.small`.

> **On a `t4g.micro`** the build can run out of memory. Either add swap first:
>
> ```bash
> sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
> sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```
>
> …or build on your Mac and ship the image instead of the source:
>
> ```bash
> # on your Mac, targeting the instance's architecture
> docker build --platform linux/arm64 -t tland/game:latest -f docker/game.Dockerfile .
> docker save tland/game:latest | gzip | ssh -i your-key.pem ec2-user@game.example.com 'gunzip | docker load'
> ```

## 6. Run the game server

```bash
docker run -d \
  --name tland-game \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e "ALLOWED_ORIGINS=https://tland-dun.vercel.app" \
  tland/game:latest
```

Two things in there matter:

- **`-p 127.0.0.1:3000:3000`** binds to loopback only. Even if the security
  group were wrong, nothing outside the machine can reach the server directly.
- **`ALLOWED_ORIGINS`** is your Vercel URL, with the scheme, no trailing slash.
  WebSocket upgrades are **not** subject to CORS, so without this any page
  anywhere could point itself at your room and use it as their backend. Add
  more origins comma-separated if you have preview deployments you want to
  allow.

`--restart unless-stopped` brings it back after a reboot. Check it:

```bash
docker logs tland-game
curl -s localhost:3000/healthz
```

You want to see `origins: https://tland-dun.vercel.app` in the log and
`{"status":"ok",...}` from the health check.

## 7. Put TLS in front with Caddy

Your Vercel page is HTTPS, and a page served over `https:` **cannot** open a
`ws:` socket — it has to be `wss:`. So the server needs a certificate.

Caddy gets and renews one from Let's Encrypt on its own, which is why it is
here instead of nginx: no certbot, no cron job, no renewal to forget.

```bash
sudo tee /etc/caddy.Caddyfile >/dev/null <<'EOF'
game.example.com {
	reverse_proxy 127.0.0.1:3000
}
EOF
```

That is the whole config. `reverse_proxy` handles the WebSocket upgrade
automatically — there is no special directive for it.

```bash
docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network host \
  -v /etc/caddy.Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2
```

- `--network host` lets Caddy reach `127.0.0.1:3000` and bind 80/443 directly.
- The `caddy_data` volume holds the certificate. **Keep it** — losing it means
  re-issuing, and Let's Encrypt rate-limits that.

Watch it get the certificate:

```bash
docker logs -f caddy
```

Then from your Mac:

```bash
curl -s https://game.example.com/healthz
```

`{"status":"ok",...}` over HTTPS means TLS is working and the proxy reaches the
game server.

## 8. Point Vercel at it

Vercel → project → **Settings → Environment Variables**:

| Name | Value | Environments |
| --- | --- | --- |
| `VITE_GAME_WS_URL` | `wss://game.example.com` | Production (and Preview, if you want previews to work) |

`wss`, not `https`. No path — the client appends `/ws` itself.

This is a **build-time** variable: Vite bakes it into the bundle, so setting it
is not enough. Go to **Deployments**, open the latest, and **Redeploy**.

Open the site. The join button should be live instead of saying
找不到遊戲伺服器, and the pill top-left should read 已連線.

## Afterwards

**Deploying a new version:**

```bash
ssh -i your-key.pem ec2-user@game.example.com
cd tland && git pull
docker build -t tland/game:latest -f docker/game.Dockerfile .
docker stop tland-game && docker rm tland-game
# then the same docker run as step 6
```

Players are disconnected and reconnect by themselves, but the room is in
memory, so everyone is sent back to the spawn. Deploy when it is quiet.

**If something is wrong:**

| Symptom | Look at |
| --- | --- |
| Site says 找不到遊戲伺服器 | Browser console. `wss://.../ws failed` means the server or DNS; nothing at all means `VITE_GAME_WS_URL` was not baked in — did you redeploy? |
| `curl https://game.example.com/healthz` hangs | Security group: is 443 open? |
| Caddy cannot get a certificate | `docker logs caddy`. Usually DNS has not propagated, or port 80 is closed |
| 403 on the WebSocket | `ALLOWED_ORIGINS` does not match your Vercel URL exactly — check scheme and trailing slash |
| Works, then stops after a reboot | `docker ps -a`. Both containers need `--restart unless-stopped` |

**Costs**, roughly, on-demand in a cheap region: `t4g.small` about US$12/month,
`t4g.micro` about US$6, plus a little for the EBS volume. The Elastic IP is
free while it is attached to a running instance. A reserved instance or Savings
Plan cuts this significantly if you keep it.

**Hardening, when it stops being a toy:** restrict SSH to a VPN or use Systems
Manager Session Manager instead of a key, put CloudWatch alarms on the health
check, and take an AMI snapshot so you can rebuild the machine from scratch.
