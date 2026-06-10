import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 4173);
const distDir = resolve("dist");
const indexPath = join(distDir, "index.html");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function fileForRequest(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(distDir, normalized);
  if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return indexPath;
}

createServer((request, response) => {
  const filePath = fileForRequest(request.url || "/");
  const extension = extname(filePath);
  const isAsset = filePath.includes(`${join(distDir, "assets")}`);

  response.setHeader("Content-Type", contentTypes[extension] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Cache-Control",
    isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  );

  createReadStream(filePath)
    .on("error", () => {
      response.statusCode = 500;
      response.end("Error loading asset");
    })
    .pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Frontend listening on ${port}`);
});
