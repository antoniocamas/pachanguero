# Proposal — WP-007-backups-and-currency

Production backups live on erebor's own disk, and nothing keeps the OS image, Node, npm dependencies and the Helm chart's pins current, so a release says little about what it ships.
Ship backups off erebor through the backup-shipper contract, and add a 3pp-update skill (update all, LTS preferred, else latest; exact-tag pins as in trade4me) with a light post-deploy verification.
An exposed service must survive losing the disk and must not run on stale software; releases then carry a meaningful version.
