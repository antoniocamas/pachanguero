# Q-03 — State of the backup staging path on erebor

Checked over ssh as `smaug` (uid 1000) on erebor: `/var/backups/erebor/pachanguero/` exists, is empty,
owned by `smaug:smaug` (uid 1000), mode `750`, created 2026-11-02. Its sibling `trade4me/` has the
same owner and mode. The parent `/var/backups/erebor/` is `root:root` `755`.

Consequence: the pachanguero pod and the shipper both run as uid 1000, so both can write and delete
there; no administrator step is owed for the directory. The hostPath type `Directory` is satisfied.
