// npm run deploy:demo: deploys the live demo. It clones the demo app into a temporary folder,
// replaces its files with this app's, puts demo/whisk.yaml in place of whisk.yaml, and runs whisk
// deploy there, so the repository's own manifest never changes and every push follows the last.
// WHISK_DEMO_APP names the demo app as <org>/<app>; arguments after -- go to whisk deploy.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.env.WHISK_DEMO_APP ?? "";
const m = /^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/.exec(target);
if (!m) {
  console.error(
    target
      ? `WHISK_DEMO_APP is "${target}", which is not <org>/<app>. Set it like WHISK_DEMO_APP=examples/status.`
      : "WHISK_DEMO_APP is not set. Set it to the demo app as <org>/<app>, like WHISK_DEMO_APP=examples/status npm run deploy:demo.",
  );
  process.exit(1);
}
const [, org, app] = m;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

// The files git would push: tracked and new ones, never ignored ones (node_modules, dist, .env),
// and never this folder's own binding.
const files = git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
  .split("\0")
  .filter((f) => f && !f.startsWith(".whisk/"));
const tmp = await mkdtemp(join(tmpdir(), "whisk-demo-"));
const dir = join(tmp, app);
try {
  // The demo app's own history, so this push follows the last one.
  execFileSync("whisk", ["clone", `${org}/${app}`, dir], { stdio: ["ignore", "ignore", "inherit"] });
  const old = (await readdir(dir)).filter((f) => f !== ".git" && f !== ".whisk");
  await Promise.all(old.map((f) => rm(join(dir, f), { recursive: true, force: true })));
  for (const f of files) {
    const exists = await stat(join(root, f)).then(() => true, () => false);
    if (exists) await cp(join(root, f), join(dir, f), { recursive: true });
  }
  // Whisk checks the manifest's name against the app it is pushed to, so the copy takes the demo's.
  const manifest = await readFile(join(root, "demo/whisk.yaml"), "utf8");
  await writeFile(join(dir, "whisk.yaml"), manifest.replace(/^name: .*$/m, `name: ${app}`));
  const rev = git("rev-parse", "--short", "HEAD").trim();
  console.log(`Deploying ${org}/${app} from ${rev} with demo/whisk.yaml`);
  execFileSync("whisk", ["deploy", "--org", org, "--app", app, "-m", `Live demo from ${rev}`, ...process.argv.slice(2)], { cwd: dir, stdio: "inherit" });
} catch (e) {
  process.exitCode = e.status ?? 1;
} finally {
  await rm(tmp, { recursive: true, force: true });
}
