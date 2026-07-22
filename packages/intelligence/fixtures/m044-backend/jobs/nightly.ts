import { CronJob } from "cron";

export const nightly = new CronJob("0 0 * * *", () => {
  /* cleanup */
});
