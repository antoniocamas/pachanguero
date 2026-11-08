CODENAME: SD-BANK-CONNECTION-322

# The bank connection

What the production deployment needs for the bank access, for whoever sets it up. The settings themselves are in [`commands.md`](commands.md#configuration).

| Setting                      | Where in the deployment                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `PACHANGUERO_PUBLIC_URL`     | `publicUrl` in `values.yaml`, the `env:` entry in `templates/deployment.yaml`   |
| `ENABLE_BANKING_APP_ID`      | `secrets.enableBankingAppId` in the operator's `values.secrets.yaml`            |
| `ENABLE_BANKING_PRIVATE_KEY` | `secrets.enableBankingPrivateKey` in `values.secrets.yaml`, a YAML block (`\|`) |

- **Both secrets are optional in the chart** (no `required`); `JWT_SECRET` stays required. `values.secrets.yaml.example` shows the entries, and how to make the key and certificate.
- **The redirect address** `https://pachanguero.duckdns.org/api/bank/callback` (`<publicUrl>/api/bank/callback`) must be listed, exactly, as an allowed redirect URL of the production application at the Enable Banking Control Panel; the certificate made with the key is uploaded there.
- **The operator's own `values.secrets.yaml`** ([`deployment.md`](deployment.md#one-time-setup)) needs the two entries before the release that first carries the bank connection.
- **Check after a release:** Ajustes › Banco names no missing setting (`PACHANGUERO_PUBLIC_URL` under `env:` and the two keys in the Secret, as `helm template` shows).
