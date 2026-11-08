// Runs in CI. Fails if the workflow carries credentials, webhook ids, tokens or personal addresses,
// or if the explorer's guided paths name a node that doesn't exist.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const problems = [];
const text = fs.readFileSync(path.join(root, "workflow.json"), "utf8");
const wf = JSON.parse(text);

const patterns = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT-like token"],
  [/\bsk-[A-Za-z0-9_-]{16,}/, "OpenAI-style key"],
  [/\bgsk_[A-Za-z0-9]{16,}/, "Groq-style key"],
  [/\bAIza[A-Za-z0-9_-]{20,}/, "Google API key"],
  [/\b\d{8,12}:[A-Za-z0-9_-]{30,}/, "Telegram bot token"],
  [/[\w.+-]+@(gmail|outlook|hotmail|yahoo)\.[a-z.]+/i, "personal email address"],
  [/(docs|drive)\.google\.com\/[^\s"]+/, "private Google link"],
];
for (const [pattern, label] of patterns) if (pattern.test(text)) problems.push(label);

const names = new Set(wf.nodes.map((n) => n.name));
for (const node of wf.nodes) {
  if (node.webhookId) problems.push(`${node.name}: webhookId`);
  for (const [type, cred] of Object.entries(node.credentials || {})) {
    if (cred.id) problems.push(`${node.name}: ${type} credential id`);
  }
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "site/data.js"), "utf8"), sandbox);
for (const trace of sandbox.window.PROJECT.traces) {
  for (const [name] of trace.steps) {
    if (!names.has(name)) problems.push(`path "${trace.label}" names missing node ${name}`);
  }
}
for (const item of sandbox.window.PROJECT.signature.items) {
  if (!sandbox.window.PROJECT.traces[item.trace]) problems.push(`"${item.label}" points to a missing path`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`All clean: ${wf.nodes.length} nodes.`);
