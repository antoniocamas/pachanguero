# Cloudflare Tunnel

Background reading: how Pachanguero could be published without opening any router port, and how
that compares with the DuckDNS + Caddy setup in [`deployment.md`](deployment.md). Nothing here is
deployed.

## The idea

A port forward lets the Internet **connect in** to your house. A tunnel reverses that: a small
program inside the house (`cloudflared`) **connects out** to Cloudflare and keeps the connection
open. A visitor talks to Cloudflare, and Cloudflare sends the request back down the open
connection to `cloudflared`, which hands it to the local service.

```
today:   visitor → house public IP :443 → Gondor forward → Caddy → app
tunnel:  visitor → Cloudflare edge ⇄ (outbound tunnel) ⇄ cloudflared → app
```

Because the connection starts from inside, the Orange router needs no DMZ, `Gondor` needs no
80/443 forward, and the house public IP stays out of DNS. Cloudflare terminates TLS at its edge and
issues the certificate; the traffic between Cloudflare and `cloudflared` is encrypted inside the tunnel.

## What it needs

- **A domain you own, with its DNS on Cloudflare.** A `duckdns.org` subdomain cannot be used: you
  do not control that zone, so Cloudflare cannot host it.
- A free Cloudflare account (the Tunnel feature is free).
- `cloudflared` running next to the app. In this cluster that would be a Deployment in the
  `pachanguero` namespace that forwards to `http://pachanguero:8787` through the cluster DNS name.
- Setup in short: create a tunnel in the Cloudflare Zero Trust dashboard, take its token, store it
  as a Secret, run `cloudflared tunnel run --token …`, and add a public hostname
  (`pachanguero.<your-domain>` → `http://pachanguero.pachanguero.svc.cluster.local:8787`).
  Cloudflare creates the DNS record by itself.

## Comparison

|                             | DuckDNS + Caddy (current)                     | Cloudflare Tunnel                                                         |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Router ports                | 80/443 open (DMZ + forwards)                  | none                                                                      |
| House public IP             | published in DNS                              | hidden                                                                    |
| Domain                      | free subdomain                                | own domain (paid)                                                         |
| TLS certificate             | Caddy, Let's Encrypt                          | Cloudflare edge                                                           |
| Who sees the traffic        | only you                                      | Cloudflare decrypts it at its edge                                        |
| Dependence on third parties | DuckDNS, Let's Encrypt                        | Cloudflare account, free-tier terms                                       |
| Works behind CGNAT          | no                                            | yes                                                                       |
| DDoS and bot filtering      | none                                          | included                                                                  |
| Extra access control        | login in the app                              | optional Cloudflare Access (SSO or one-time PIN by e-mail) before the app |
| Moving parts at home        | Caddy, DuckDNS updater, port forwards, toggle | one `cloudflared` pod                                                     |

## Related options

- **Tailscale Funnel**: the same idea (outbound connection to a relay) with a free `*.ts.net` name
  and no domain purchase. The name cannot be chosen freely and Tailscale becomes the third party.
- **Plain WireGuard** (`wg-easy-7`): private, no third party, but every player must install a VPN
  client.

## Why it is not used

The group is a few friends, the house has a public IPv4 address, and the Caddy path already exists. The tunnel's benefits (no open ports, hidden IP) would cost a purchased
domain and a Cloudflare dependency. It becomes attractive if the ISP moves the house behind CGNAT
or if exposing 80/443 stops being acceptable.
