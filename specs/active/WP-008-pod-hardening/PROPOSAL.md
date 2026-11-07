# Pod Hardening

The pachanguero pod is exposed to the internet through Caddy but only sets runAsUser: it has no read-only filesystem, no dropped capabilities, no seccomp profile and no NetworkPolicy.
Harden the pod and its network to the maximum the app tolerates: non-root, read-only root filesystem, no privilege escalation, all capabilities dropped, seccomp RuntimeDefault, and a NetworkPolicy allowing only Caddy in and DNS plus the bank API out.
An exposed service must give an attacker as little as possible if the app is ever compromised.