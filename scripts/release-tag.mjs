#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionScript = join(root, "scripts", "bump-version.mjs");

function fail(message) {
  console.error(`\u274c ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", ...options }).trim();
}

function currentVersion() {
  const text = readFileSync(join(root, "package.json"), "utf8");
  const match = text.match(/^\s*"version"\s*:\s*"([^"]*)"/m);
  if (!match) fail("package.json 中找不到 version 字段");
  return match[1];
}

function checkVersionConsistency() {
  try {
    execFileSync(process.execPath, [versionScript, "--check"], { cwd: root, stdio: "pipe" });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    fail(`版本号不一致，请先运行 "bun run version:bump <版本>"：\n${output}`);
  }
}

const rawArgs = process.argv.slice(2);
const positional = [];
let remote = "origin";
let dryRun = false;
let allowDirty = false;

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--allow-dirty") allowDirty = true;
  else if (arg === "--remote") {
    remote = rawArgs[index + 1];
    if (!remote) fail("--remote 需要一个远端名称");
    index += 1;
  } else if (arg.startsWith("--remote=")) remote = arg.slice("--remote=".length);
  else if (arg.startsWith("--")) fail(`未知参数：${arg}`);
  else positional.push(arg);
}

if (positional.length > 1) fail(`只能指定一个标签名，收到：${positional.join(" ")}`);

try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  fail("当前目录不是 Git 仓库");
}

checkVersionConsistency();
const version = currentVersion();
const tag = positional[0] ?? `v${version}`;

if (!/^[0-9A-Za-z._/-]+$/.test(tag) || tag.startsWith("-")) fail(`无效标签名：${tag}`);
try {
  execFileSync("git", ["check-ref-format", `refs/tags/${tag}`], { cwd: root, stdio: "ignore" });
} catch {
  fail(`无效标签名：${tag}`);
}

if (tag.startsWith("v") && tag !== `v${version}`) {
  fail(`标签 ${tag} 与当前版本 v${version} 不一致；请先运行 "bun run version:bump ${tag.slice(1)}"`);
}

try {
  git(["remote", "get-url", remote]);
} catch {
  fail(`找不到远端：${remote}`);
}

if (git(["tag", "--list", tag])) fail(`本地已存在标签：${tag}`);
const remoteTag = git(["ls-remote", "--tags", remote, `refs/tags/${tag}`]);
if (remoteTag) fail(`远端 ${remote} 已存在标签：${tag}`);

const dirtyFiles = git(["status", "--porcelain"]).split("\n").filter(Boolean).map((line) => line.trim());
if (dirtyFiles.length > 0) {
  console.error("\u26a0\ufe0f  工作区有未提交改动，这些改动不会进入标签：");
  for (const file of dirtyFiles.slice(0, 10)) console.error(`  ${file}`);
  if (dirtyFiles.length > 10) console.error(`  ... 共 ${dirtyFiles.length} 个文件`);
  if (!allowDirty && !dryRun) {
    fail("请先提交改动，或加 --allow-dirty 强制继续");
  }
}

const head = git(["rev-parse", "--short", "HEAD"]);
const tagCommand = ["tag", "-a", tag, "-m", `ch-rzl-edit ${tag}`];
const pushCommand = ["push", remote, `refs/tags/${tag}`];

if (dryRun) {
  console.log(`\u2139\ufe0f  将在 ${head} 创建并推送标签 ${tag}（dry-run，未执行）`);
  console.log(`  git ${tagCommand.map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ")}`);
  console.log(`  git ${pushCommand.join(" ")}`);
  process.exit(0);
}

git(tagCommand);
console.log(`\u2705 已创建标签 ${tag} -> ${head}`);

try {
  git(pushCommand, { stdio: "inherit" });
} catch {
  console.error(`\u274c 推送标签失败。本地标签已创建，可稍后手动重试：`);
  console.error(`  git push ${remote} refs/tags/${tag}`);
  process.exit(1);
}

console.log(`\u2705 已推送标签 ${tag} 到 ${remote}`);
console.log("   Release workflow 会在标签推送后构建安装包。");
