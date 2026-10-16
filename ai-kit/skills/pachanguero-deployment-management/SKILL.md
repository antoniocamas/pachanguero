---
name: pachanguero-deployment-management
description: Operate the production pachanguero on erebor (k3s) with kubectl and helm - status, logs, admin-tool commands, and refreshing the kubeconfig context. Use for any command against the erebor cluster or when kubectl cannot connect to it.
---

# Pachanguero deployment management

Procedures for release, data and backups are in [`docs/deployment.md`](../../../docs/deployment.md)
and [`docs/backup_and_restore.md`](../../../docs/backup_and_restore.md); do not restate them.

## Rules

- Every `kubectl` and `helm` command against the cluster carries `--context erebor`. Never run `kubectl config use-context` on the real config
  (step 4 below uses it on a temporary copy): the current context stays whatever the user had.
- The app lives in namespace `pachanguero`; pass `-n pachanguero` on every namespaced command.
- Mutating commands (`delete`, `scale`, `rollout restart`, `helm uninstall`, PVC changes) need the
  user's go-ahead first. Releases go through `./build.sh --push` and `deploy/deploy.sh`, never
  `kubectl apply`.
- Never print `~/.kube/*`, secret values or `values.secrets.yaml`, and never commit them.
- Shell on `erebor`: `ssh smaug@192.168.1.87`. `sudo` asks for a password; do not try it.

## Everyday commands

```bash
kubectl --context erebor -n pachanguero get pods,svc,pvc
kubectl --context erebor -n pachanguero logs deploy/pachanguero -c pachanguero --tail=100
kubectl --context erebor -n pachanguero logs deploy/pachanguero -c backup
kubectl --context erebor -n pachanguero exec -it deploy/pachanguero -c pachanguero -- pachanguero-admin <command>
```

`pachanguero-admin` commands are in [`docs/commands.md`](../../../docs/commands.md#the-admin-tool).

## Refreshing the kubeconfig context

When: `kubectl --context erebor get nodes` fails with `x509`, `Unable to connect` or an
authentication error, or the cluster was reinstalled or `erebor`'s address changed.

1. Check `erebor` answers: `ssh smaug@192.168.1.87 hostname`.
2. Back up and note the current context name:
   `cp -p ~/.kube/config ~/.kube/config.bak-$(date +%Y%m%d)`; `kubectl config current-context`.
   No `~/.kube/config`: do step 3, then `cp ~/.kube/erebor.yaml ~/.kube/config` and stop. Config
   present but no current context: still back up, and drop the `use-context` part of step 4; `erebor` then becomes current and
   step 5's second check does not apply.
3. Fetch the admin config (readable without sudo on `erebor`) and rename it:
   `( umask 077; ssh smaug@192.168.1.87 'cat /etc/rancher/k3s/k3s.yaml' | sed 's#127\.0\.0\.1#192.168.1.87#; s/: default$/: erebor/' > ~/.kube/erebor.yaml )`.
   The file must not be empty.
4. Merge with the new file **first**, so its `erebor` entries replace the old ones, and put the
   noted context back (`<noted>`; the merge would otherwise make `erebor` current). Stop if a
   command fails, so the real file is only replaced by a good result:
   `( umask 077; KUBECONFIG=~/.kube/erebor.yaml:~/.kube/config kubectl config view --flatten > ~/.kube/config.new ) && KUBECONFIG=~/.kube/config.new kubectl config use-context <noted> && mv ~/.kube/config.new ~/.kube/config`.
5. Verify: `kubectl --context erebor get nodes` shows `erebor` Ready and `kubectl config current-context` prints the context noted in step 2.

The file holds cluster-admin credentials; if it leaks, rotate them on `erebor`.
