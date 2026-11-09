CODENAME: DC-E2E-SHARED-DATABASE-336

# E2E specs share one database

- Build the data a spec needs through the API, or do not depend on a clean slate: `e2e/.tmp/e2e.db` is shared by every spec and never reset between them. The suite runs on a single worker.
- Order a spec that needs an empty database before every spec that creates data: name it so it sorts first (`season-and-player.spec.ts` runs before `the-game-screen.spec.ts`).
- Clear the bank's last-read record (`ReadGap`) before a journey that reads.
