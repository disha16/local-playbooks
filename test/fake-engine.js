// Stand-in for the capture engine: accepts the same arguments and answers /health.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const a = process.argv.slice(2);
const val = (f) => a[a.indexOf(f) + 1];
fs.writeFileSync(path.join(val("--data-dir"), "args.json"), JSON.stringify(a));
http.createServer((req, res) => res.end("{}")).listen(Number(val("--port")));
