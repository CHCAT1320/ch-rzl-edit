#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  packageJson: join(root, "package.json"),
  tauriConf: join(root, "src-tauri", "tauri.conf.json"),
  cargoToml: join(root, "src-tauri", "Cargo.toml"),
  cargoLock: join(root, "src-tauri", "Cargo.lock"),
};
const labels = {
  packageJson: "package.json",
  tauriConf: "src-tauri/tauri.conf.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};
const packageName = "ch-rzl-edit";

function fail(message) {
  console.error(`\u274c ${message}`);
  process.exit(1);
}

function readJsonText(path) {
  return readFileSync(path, "utf8");
}

const jsonVersionPattern = /^(\s*"version"\s*:\s*")([^"]*)(")/m;

function jsonVersion(text, label) {
  const match = text.match(jsonVersionPattern);
  if (!match) fail(`${label} 中找不到 version 字段`);
  return match[2];
}

function replaceJsonVersion(text, version, label) {
  if (!jsonVersionPattern.test(text)) fail(`${label} 中找不到 version 字段`);
  return text.replace(jsonVersionPattern, `$1${version}$3`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cargoTomlVersion(text) {
  const match = text.match(/^\[package\][^[]*?^version\s*=\s*"([^"]*)"/m);
  if (!match) fail("src-tauri/Cargo.toml 中找不到 [package] 段的 version");
  return match[1];
}

function replaceCargoTomlVersion(text, version) {
  const section = text.match(/^\[package\][^[]*/m);
  if (!section) fail("src-tauri/Cargo.toml 中找不到 [package] 段");
  const updated = section[0].replace(/^(version\s*=\s*")[^"]*(")/m, `$1${version}$2`);
  return text.slice(0, section.index) + updated + text.slice(section.index + section[0].length);
}

function cargoLockPattern() {
  return new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname = "${escapeRegExp(packageName)}"\\r?\\nversion = ")([^"]*)(")`,
  );
}

function cargoLockVersion(text) {
  const match = text.match(cargoLockPattern());
  if (!match) fail("src-tauri/Cargo.lock 中找不到本项目的 package 条目");
  return match[2];
}

function replaceCargoLockVersion(text, version) {
  return text.replace(cargoLockPattern(), `$1${version}$3`);
}

function parseVersion(value) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) fail(`无效版本号：${value}`);
  return value;
}

function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split(/[.+-]/).map((part) => Number.parseInt(part, 10));
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  return parseVersion(kind);
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => !arg.startsWith("--"));

const packageJsonText = readJsonText(files.packageJson);
const tauriConfText = readJsonText(files.tauriConf);
const cargoTomlText = readFileSync(files.cargoToml, "utf8");
const cargoLockText = existsSync(files.cargoLock) ? readFileSync(files.cargoLock, "utf8") : null;

const current = jsonVersion(packageJsonText, "package.json");

if (check) {
  const found = {
    "package.json": current,
    "src-tauri/tauri.conf.json": jsonVersion(tauriConfText, "src-tauri/tauri.conf.json"),
    "src-tauri/Cargo.toml": cargoTomlVersion(cargoTomlText),
    ...(cargoLockText ? { "src-tauri/Cargo.lock": cargoLockVersion(cargoLockText) } : {}),
  };
  const mismatched = Object.entries(found).filter(([, version]) => version !== current);
  if (mismatched.length === 0) {
    console.log(`\u2705 版本一致：${current}`);
    process.exit(0);
  }
  console.error(`\u274c 版本不一致（以 package.json 的 ${current} 为准）：`);
  for (const [file, version] of mismatched) console.error(`  ${file}: ${version}`);
  process.exit(1);
}

if (positional.length > 1) fail(`只能指定一个版本，收到：${positional.join(" ")}`);
if (positional.length === 0) {
  console.log(`当前版本：${current}`);
  console.log("用法：");
  console.log("  bun scripts/bump-version.mjs patch      # 0.1.2 -> 0.1.3");
  console.log("  bun scripts/bump-version.mjs minor      # 0.1.2 -> 0.2.0");
  console.log("  bun scripts/bump-version.mjs major      # 0.1.2 -> 1.0.0");
  console.log("  bun scripts/bump-version.mjs 1.2.3      # 指定版本");
  console.log("  bun scripts/bump-version.mjs --check    # 校验各文件版本一致");
  console.log("  加 --dry-run 只预览，不写入文件");
  process.exit(0);
}

const next = bumpVersion(current, positional[0]);
if (next === current) fail(`新版本与当前版本相同：${current}`);

const nextPackageJson = replaceJsonVersion(packageJsonText, next, "package.json");
const nextTauriConf = replaceJsonVersion(tauriConfText, next, "src-tauri/tauri.conf.json");
const nextCargoToml = replaceCargoTomlVersion(cargoTomlText, next);
const nextCargoLock = cargoLockText ? replaceCargoLockVersion(cargoLockText, next) : null;

if (dryRun) {
  console.log(`\u2139\ufe0f  ${current} -> ${next}（dry-run，未写入）`);
  for (const [key, label] of Object.entries(labels)) {
    if (key === "cargoLock" && !nextCargoLock) continue;
    console.log(`  ${label}`);
  }
  process.exit(0);
}

writeFileSync(files.packageJson, nextPackageJson);
writeFileSync(files.tauriConf, nextTauriConf);
writeFileSync(files.cargoToml, nextCargoToml);
if (nextCargoLock) writeFileSync(files.cargoLock, nextCargoLock);

console.log(`\u2705 版本已更新：${current} -> ${next}`);
console.log(`  package.json`);
console.log(`  src-tauri/tauri.conf.json`);
console.log(`  src-tauri/Cargo.toml`);
if (nextCargoLock) console.log(`  src-tauri/Cargo.lock`);
console.log("");
console.log("下一步：");
console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml${nextCargoLock ? " src-tauri/Cargo.lock" : ""}`);
console.log(`  git commit -m "chore: release v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push origin HEAD --tags`);
