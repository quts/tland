# Deploying the game server to EC2

The client is static and lives on Vercel. The game server is not static: it is
a long-lived process holding the room in memory between connections, so it
needs an always-on machine. This walks through putting it on one EC2 instance
with its own domain and TLS, then pointing the Vercel build at it.

This runbook has been followed end to end; the notes in it are the things that
actually went wrong, not hypotheticals.

```
browser ──https──> Vercel (static client)
   │
   └────wss───────> game.example.com ──> EC2: Caddy (TLS) ──> game container :3000
```

## What you need first

- An AWS account.
- A domain you control, where you can add an `A` record.
- The repository is private, so the instance needs read access to it. We use a
  GitHub **deploy key**, which is a read-only SSH key scoped to this one repo —
  not your personal key.

Throughout, replace:

| Placeholder | With |
| --- | --- |
| `game.example.com` | your server's domain |
| `https://your-app.vercel.app` | your Vercel URL |
| `1.2.3.4` | the Elastic IP from step 2 |

> **`example.com` is not a domain you can get a certificate for.** It is
> reserved by RFC 2606 and Let's Encrypt refuses it by policy. If you paste a
> step without substituting, the failure is `rejectedIdentifier ... forbidden
> by policy`, which does not sound like a typo but is one. Step 7 sets a shell
> variable for exactly this reason — use it.

---

## 1. Launch the instance

EC2 → **Launch instance**.

| Setting | Value | Why |
| --- | --- | --- |
| Name | `tland-game` | |
| AMI | **Amazon Linux 2023**, architecture **64-bit (Arm)** | Graviton is cheaper, and the image builds for arm64 |
| Instance type | **t4g.small** | 2 GB. `t4g.micro` (1 GB) runs the server fine but is tight for building the image — see step 5 |
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

Add an `A` record for `game` pointing at `1.2.3.4`, TTL 300.

### If your DNS is on Cloudflare, turn the proxy off

This one costs an afternoon if you miss it. In the Cloudflare DNS table, the
record must be **DNS only** (grey cloud), not **Proxied** (orange cloud).

With the proxy on:

- Cloudflare answers DNS with *its* IPs, so nothing reaches your instance
  directly.
- Cloudflare's "Always Use HTTPS" turns the plain-HTTP ACME challenge into a
  308 redirect at the edge, so **Caddy can never prove it owns the domain** and
  never gets a certificate.
- Cloudflare then fails to negotiate TLS with your origin, which surfaces to
  you as **`error code: 525`** — a Cloudflare page, not anything from your
  server.

Proxying also buys you nothing here: a WebSocket is not cacheable, the extra
hop adds latency to a realtime game, and Cloudflare's 100-second idle timeout
is one more thing that can go wrong.

Keeping the proxy is possible but means giving up HTTP-01: install a Cloudflare
Origin Certificate and set SSL/TLS mode to **Full (strict)**, or build Caddy
with its Cloudflare DNS plugin and use a DNS-01 challenge. Get it working
grey-clouded first.

### Check before moving on

Caddy cannot get a certificate until this resolves to your instance:

```bash
dig +short game.example.com @1.1.1.1
```

It must print `1.2.3.4`. If it prints Cloudflare addresses (`104.21.x.x`,
`172.67.x.x`), the record is still proxied.

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

The group change only applies to a new login, so `exit`, SSH back in, and check
it took:

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

> **On a `t4g.micro`** the build can run out of memory. Add swap first:
>
> ```bash
> sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
> sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```
>
> Building on your Mac and shipping the image is the other option, but note
> that **Apple Container's `image save` writes an OCI-layout archive**
> (`oci-layout` + `index.json`), which classic `docker load` on the instance
> will not read. Push through a registry instead — `container image push` and
> `docker pull` agree on the wire format even when their archive formats do
> not. Architecture needs no flag either way: an Apple-silicon Mac and a
> Graviton instance are both arm64.

## 6. Run the game server

```bash
docker run -d \
  --name tland-game \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e "ALLOWED_ORIGINS=https://your-app.vercel.app" \
  tland/game:latest
```

Two things in there matter:

- **`-p 127.0.0.1:3000:3000`** binds to loopback only. Even if the security
  group were wrong, nothing outside the machine can reach the server directly.
- **`ALLOWED_ORIGINS`** is your Vercel URL, with the scheme, no trailing slash.
  WebSocket upgrades are **not** subject to CORS, so without this any page
  anywhere could point itself at your room and use it as their backend.
  Comma-separate several — and come back to this if you add a custom domain in
  step 8, or the new domain gets a 403.

`--restart unless-stopped` brings it back after a reboot. Check it:

```bash
docker logs tland-game
curl -s localhost:3000/healthz
```

You want `origins: https://your-app.vercel.app` in the log and
`{"status":"ok",...}` from the health check.

## 7. Put TLS in front with Caddy

Your Vercel page is HTTPS, and a page served over `https:` **cannot** open a
`ws:` socket — it has to be `wss:`. So the server needs a certificate.

Caddy gets and renews one from Let's Encrypt on its own, which is why it is
here instead of nginx: no certbot, no cron job, no renewal to forget.

Set the domain once, so the config cannot be written with a placeholder in it:

```bash
DOMAIN=game.example.com
```

```bash
sudo tee /etc/caddy.Caddyfile >/dev/null <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:3000
}
EOF
cat /etc/caddy.Caddyfile
```

That `cat` is the point of this step — read it back and make sure it says your
domain. `reverse_proxy` handles the WebSocket upgrade on its own; there is no
extra directive for it.

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

Look for `"domains":["game.example.com"]` — your real domain — and then
`certificate obtained successfully`.

Caddy retries on a backoff that grows after each failure, so after you fix
whatever was wrong, `docker restart caddy` rather than waiting.

## 8. Point Vercel at it

The client needs to know where the server is, through `VITE_GAME_WS_URL`.
`wss`, not `https`, and no path — the client appends `/ws` itself.

This is a **build-time** value. Vite bakes it into the bundle, which has two
consequences: it is not a secret (anyone can read it out of the published
JavaScript), and setting it alone never changes anything — the bundle has to
be rebuilt.

**Keep it in `vercel.json`**, which is how this repo is set up:

```json
"build": { "env": { "VITE_GAME_WS_URL": "wss://game.example.com" } }
```

Since it is not a secret, there is nothing to gain from hiding it in a
dashboard, and plenty to gain from version control: the deployment is
reproducible, the value shows up in review, and pushing a change rebuilds
automatically — no "did you remember to redeploy".

The alternative is **Settings → Environment Variables** in the Vercel project
(not the Domains page), followed by **Deployments → ⋯ → Redeploy** by hand.
Use one or the other. Setting both leaves you guessing which one produced the
bundle you are looking at, which is exactly the confusion this value causes
when it goes wrong.

Migrating from the dashboard to `vercel.json`: add it to the file and let the
push deploy, confirm the bundle still carries the right URL with the command in
step 9, and only then delete the dashboard variable — and confirm once more.

### A custom domain for the client, optionally

If you also put the client on your own domain, Vercel gives you a `CNAME` to
add. On Cloudflare this record is **DNS only** as well.

Two things to watch:

- **Check the spelling against your nameservers.** A typo like `newlab.com` for
  `ntwlab.com` is a real domain belonging to somebody else, so Vercel sits on
  *Invalid Configuration* forever while your DNS looks perfectly correct.
  `dig +short NS your-domain` should return the nameservers of the account you
  are editing.
- **Add the new origin to `ALLOWED_ORIGINS`** and restart the game container,
  or the WebSocket from that domain gets a 403:

  ```bash
  docker stop tland-game && docker rm tland-game
  docker run -d --name tland-game --restart unless-stopped \
    -p 127.0.0.1:3000:3000 \
    -e "ALLOWED_ORIGINS=https://town.example.com,https://your-app.vercel.app" \
    tland/game:latest
  ```

Changing the client's domain does not need another redeploy — `VITE_GAME_WS_URL`
points at the *server*, which has not moved.

## 9. Verify it from outside

Two things will mislead you here, so the commands work around both.

**Your Mac's DNS cache** may still hold the old answer, which makes you think
the origin is broken when you are still talking to Cloudflare. `--resolve`
bypasses it:

```bash
curl -s --resolve game.example.com:443:1.2.3.4 https://game.example.com/healthz
```

**HTTP/2 has no `Upgrade` header.** curl negotiates h2 over TLS by default, so
a WebSocket handshake test returns `404` even on a working server. Browsers use
HTTP/1.1 for `wss://`, and so must your test:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --http1.1 \
  --resolve game.example.com:443:1.2.3.4 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Origin: https://your-app.vercel.app" \
  https://game.example.com/ws
```

A healthy deployment answers:

| Check | Expected |
| --- | --- |
| `/healthz` over HTTPS | `{"status":"ok",...}` |
| certificate | `subject: CN=game.example.com`, issuer Let's Encrypt, `verify ok` |
| upgrade, allowed origin | **101** |
| upgrade, any other origin | **403** |
| `nc -z 1.2.3.4 3000` | closed |

And in the browser: the pill top-left reads 已連線 and the join button is live
instead of saying 找不到遊戲伺服器.

You can confirm the client really got the URL without opening devtools:

```bash
curl -s https://your-app.vercel.app/assets/$(curl -s https://your-app.vercel.app/ \
  | grep -o 'assets/[^"]*\.js' | head -1 | cut -d/ -f2) | grep -o 'wss://[a-z.-]*' | head -1
```

Nothing printed means the variable was not set, or it was set and not redeployed.

## 10. Deploy by merging

Once the instance can update itself, deploying is merging on GitHub — no SSH,
no laptop. `scripts/ec2-deploy.sh` does the work and
`deploy/tland-deploy.service` runs it.

The script is **idempotent**: it asks the running container which commit it is
serving, and if that already matches the branch it does nothing. Asking the
container rather than the checkout matters — those differ exactly when a build
failed, and comparing the checkout instead would mistake a failed deploy for a
finished one and never retry it.

A commit that will not build is tried once and then left alone until a new one
arrives, so a broken branch cannot pin the instance at full CPU rebuilding it
every time the timer fires.

It is also **safe**: the new image is built and health-checked on a spare port
*before* anything touches the running container. A build that fails, or an
image that will not answer `/healthz`, leaves the live server exactly where it
was and exits non-zero.

### Install it

```bash
sudo cp /home/ec2-user/tland/deploy/tland.env.example /etc/tland.env
sudo nano /etc/tland.env          # set ALLOWED_ORIGINS
```

```bash
sudo cp /home/ec2-user/tland/deploy/tland-deploy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tland-deploy.service
```

That is systemd's equivalent of an `@reboot` cron entry, and the right tool
here: Amazon Linux 2023 ships systemd but not cron, and `journalctl` gives you
the log without any extra plumbing.

Run it once by hand to check it works — and to replace whatever is running now:

```bash
sudo systemctl start tland-deploy && journalctl -u tland-deploy -n 30 --no-pager
```

### Deploying from a phone, two ways

**Reboot to deploy.** Merge the pull request in the GitHub app, then restart
the instance from the AWS Console app. The service runs at boot, pulls, builds
and swaps.

**Or never reboot at all.** Install the timer as well and the instance checks
for itself every five minutes:

```bash
sudo cp /home/ec2-user/tland/deploy/tland-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tland-deploy.timer
```

Then merging *is* deploying. A check that finds nothing new costs one
`git fetch`, so the idle cost is nothing.

### Checking it landed, from a phone

`/healthz` reports the commit that is actually serving:

```
https://game.example.com/healthz
```

```json
{"status":"ok","protocol":2,"commit":"a3b6963","players":0,"uptimeSeconds":12}
```

Compare `commit` with the short SHA on GitHub. A small `uptimeSeconds`
alongside the new SHA means the swap just happened.

### When a deploy goes wrong

The live server keeps running, so the symptom is "my change is not live", not
an outage. The log says why:

```bash
journalctl -u tland-deploy -n 50 --no-pager
```

| Line | Meaning |
| --- | --- |
| `already serving … nothing to do` | The branch has not moved. Did the merge land? |
| `… already failed to deploy; waiting for a new commit` | That commit would not build. It is tried once, then left alone until you push a fix |
| `build failed; the running server has not been touched` | A compile error reached `main`; CI should have caught it |
| `the new image never became healthy; keeping the old one` | It built but will not start — the probe's own log is printed just above |
| `another deploy is already running` | A timer fired during a slow build. Harmless |

## Afterwards

**Deploying a new version** is step 10: merge, and the instance picks it up.
By hand, if you want to watch it happen:

```bash
sudo systemctl start tland-deploy && journalctl -u tland-deploy -f
```

Players are disconnected and reconnect by themselves, but the room is in
memory, so everyone is sent back to the spawn. Deploy when it is quiet.

**A change to the map or the world needs both halves.** The server validates
every move against its own copy of the map, so a client on a new map and a
server on an old one is not a cosmetic mismatch: the server rejects anything
outside the world it knows and snaps the player back. Merge, then make sure
the instance has picked it up before telling anyone.

**If something is wrong:**

| Symptom | Cause |
| --- | --- |
| `error code: 525` | Cloudflare proxy is on; Caddy has no certificate. Grey-cloud the record (step 3) |
| `rejectedIdentifier ... forbidden by policy` | The Caddyfile still says `example.com`. `cat /etc/caddy.Caddyfile` |
| `tlsv1 alert internal error` on 443 | Caddy is listening but has no certificate yet — read its log |
| Certificate never arrives | `docker logs caddy`. DNS not propagated, port 80 closed, or Caddy is between retries — restart it |
| `404` on a WebSocket test | You are testing over HTTP/2. Add `--http1.1` |
| `403` on the WebSocket | `ALLOWED_ORIGINS` does not match the page's origin exactly — scheme, host, no trailing slash |
| Site says 找不到遊戲伺服器 | Browser console. `wss://.../ws failed` means the server or DNS; nothing at all means `VITE_GAME_WS_URL` never reached the build — check it against the bundle (step 9) |
| Vercel domain stuck on *Invalid Configuration* | Check the spelling against `dig +short NS` |
| Works, then stops after a reboot | `docker ps -a`. Both containers need `--restart unless-stopped` |

**Costs**, roughly, on-demand in a cheap region: `t4g.small` about US$12/month,
`t4g.micro` about US$6, plus a little for the EBS volume. The Elastic IP is
free while it is attached to a running instance. A reserved instance or Savings
Plan cuts this significantly if you keep it.

**Hardening, when it stops being a toy:** restrict SSH to a VPN or use Systems
Manager Session Manager instead of a key, put CloudWatch alarms on the health
check, and take an AMI snapshot so you can rebuild the machine from scratch.
