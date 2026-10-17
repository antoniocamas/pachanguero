// Drives the Enable Banking sandbox consent page without a person (task 08).
// Usage: node poc/sandbox_consent.mjs --login                      sign in once by hand in a visible window; the state is saved
//        node poc/sandbox_consent.mjs <consent-url> [--explore] [--headed]   (uses the saved state when there is one)
// Prints each step and the final redirected address. Never tries to get past a bot check:
// if a protection appears the script reports it and stops.
import process from "node:process";
import { console } from "node:console";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../../e2e/package.json"));
const { chromium } = require("@playwright/test");

import fs from "node:fs";
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const url = args.find((a) => !a.startsWith("--"));
const STATE = path.resolve(here, process.env.EBPOC_BROWSER_STATE || "local-sandbox/browser-state.json");
if (flags.includes("--login")) {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("https://enablebanking.com/sign-in");
  console.log("Sign in by hand in the window (e-mail and SMS codes). Waiting up to 15 minutes...");
  const flag = path.resolve(here, "local-sandbox/login-done");
  fs.rmSync(flag, { force: true });
  let last = "";
  const until = Date.now() + 900000;
  while (Date.now() < until && !fs.existsSync(flag)) {
    const u = p.url();
    if (u !== last) { console.log("page:", u.split("?")[0]); last = u; }
    if (!u.includes("/sign-in")) break;
    await p.waitForTimeout(2000);
  }
  await ctx.storageState({ path: STATE });
  console.log("Saved the signed-in state to", STATE);
  await b.close();
  process.exit(0);
}
if (!url) { console.error("usage: node poc/sandbox_consent.mjs <consent-url> [--explore] [--headed]"); process.exit(2); }
const explore = flags.includes("--explore");
const REDIRECT_HOST = process.env.EBPOC_REDIRECT_HOST || "example.com";

const browser = await chromium.launch({ headless: !flags.includes("--headed") });
const context = await browser.newContext(fs.existsSync(STATE) ? { storageState: STATE } : {});
console.log(fs.existsSync(STATE) ? "using saved sign-in state" : "no saved sign-in state");
await context.route(`**://${REDIRECT_HOST}/**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "redirect captured" }));
const page = await context.newPage();
let landed = null;
page.on("framenavigated", (f) => { if (f === page.mainFrame()) { const u = f.url(); console.log("nav:", u.replace(/(code|state)=[^&]+/g, "$1=…")); if (u.includes(REDIRECT_HOST)) landed = u; } });

const protections = async () => {
  const hits = [];
  for (const sel of ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]', '[class*="captcha" i]', 'text=/verify you are human/i', 'text=/one-time|OTP|verification code/i'])
    if (await page.locator(sel).count()) hits.push(sel);
  return hits;
};
const show = async (label) => {
  const text = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
  const buttons = await page.locator("button, input[type=submit], a[role=button]").allInnerTexts();
  console.log(`[${label}] text: ${text}\n[${label}] buttons: ${JSON.stringify(buttons)} protections: ${JSON.stringify(await protections())}`);
};

await page.goto(url, { waitUntil: "networkidle" });
await show("start");
if (explore) { await browser.close(); process.exit(0); }

const hits = await protections();
if (hits.length) { console.log("STOP: protection present", hits); await browser.close(); process.exit(3); }
await page.getByRole("button", { name: /continue authentication|continuar autenticaci/i }).click();
await page.waitForLoadState("networkidle");
await show("after-continue");
const box = page.locator('input[type=checkbox]').first();
await box.check();
await page.getByRole("button", { name: /authori[sz]e|autoriz/i }).click();
await page.waitForURL((u) => u.toString().includes(REDIRECT_HOST), { timeout: 30000 }).catch(() => {});
console.log("RESULT:", landed || page.url());
if (landed) fs.writeFileSync(path.resolve(here, "local-sandbox/last-redirect.txt"), landed);
await browser.close();
