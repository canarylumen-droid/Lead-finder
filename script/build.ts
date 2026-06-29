import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { build as viteBuild } from "vite";

const allowlist = [
  "drizzle-orm",
  "express",
  "pg",
  "puppeteer-core",
  "puppeteer-extra",
  "puppeteer-extra-plugin-stealth",
  "zod",
  // Bundle these pure-JS packages so they don't need to be in node_modules at runtime
  "nodemailer",
  "smtp-server",
  "ws",
  "cheerio",
  "p-limit",
  "p-retry",
  "zod-validation-error",
  "connect-pg-simple",
  "memorystore",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("build complete → dist/index.cjs");

  console.log("building client...");
  await viteBuild({
    configFile: "vite.config.ts",
  });
  console.log("client build complete → dist/public");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
