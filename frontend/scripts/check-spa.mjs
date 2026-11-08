// Checks the static build: index.html exists, deep links fall back to it, and the entry script is served.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const root = new URL("../dist/client/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = (await stat(path).catch(() => null))?.isFile() ? path : join(root, "index.html");
  res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
  res.end(await readFile(file));
}).listen(0);

const base = `http://127.0.0.1:${server.address().port}`;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); failed ||= !ok; };

const home = await (await fetch(`${base}/`)).text();
check(home.includes("<div") || home.includes("<script"), "index.html served at /");
const entry = home.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
check(Boolean(entry), "entry script referenced with an absolute /assets path");
const deep = await fetch(`${base}/scenarios/1`);
check(deep.status === 200 && (await deep.text()) === home, "deep link /scenarios/1 falls back to index.html");
if (entry) check((await fetch(`${base}${entry}`)).headers.get("content-type") === "text/javascript", "entry script is served as JavaScript");
server.close();
process.exit(failed ? 1 : 0);
