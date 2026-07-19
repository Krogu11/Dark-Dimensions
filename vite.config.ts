import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { promises as fs } from "node:fs";
import path from "node:path";

function contentStudioPlugin(): Plugin {
  return {
    name: "dark-dimensions-content-studio",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "POST" || !request.url?.startsWith("/__content-studio/")) {
          next();
          return;
        }

        try {
          const body = await readJsonBody(request);
          if (request.url === "/__content-studio/save") {
            const packPath = path.resolve("src/content/content-pack.json");
            const localePath = path.resolve("src/localization/en.json");
            const locale = JSON.parse(await fs.readFile(localePath, "utf8")) as Record<string, unknown>;
            for (const [key, value] of Object.entries(body.names as Record<string, string>)) {
              setNestedValue(locale, key, value);
            }
            await fs.writeFile(packPath, `${JSON.stringify(body.pack, null, 2)}\n`, "utf8");
            await fs.writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`, "utf8");
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.url === "/__content-studio/asset") {
            const cardId = String(body.cardId ?? "");
            const kind = body.kind === "card" ? "card" : "portrait";
            const dataUrl = String(body.dataUrl ?? "");
            if (!/^[a-z0-9_-]+$/.test(cardId) || !dataUrl.startsWith("data:image/webp;base64,")) {
              sendJson(response, 400, { error: "Invalid card id or WebP payload." });
              return;
            }
            const directory = path.resolve("public/assets/cards", cardId);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(
              path.join(directory, `${kind}.webp`),
              Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
            );
            sendJson(response, 200, { path: `/assets/cards/${cardId}/${kind}.webp` });
            return;
          }

          if (request.url === "/__content-studio/terrain-asset") {
            const terrainId = String(body.terrainId ?? "");
            const dataUrl = String(body.dataUrl ?? "");
            if (!/^[a-zA-Z0-9_-]+$/.test(terrainId) || !dataUrl.startsWith("data:image/webp;base64,")) {
              sendJson(response, 400, { error: "Invalid terrain id or WebP payload." });
              return;
            }
            const directory = path.resolve("public/assets/terrain/battle");
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(
              path.join(directory, `${terrainId}.webp`),
              Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
            );
            sendJson(response, 200, { path: `/assets/terrain/battle/${terrainId}.webp` });
            return;
          }

          if (request.url === "/__content-studio/item-asset") {
            const itemId = String(body.itemId ?? "");
            const dataUrl = String(body.dataUrl ?? "");
            if (!/^[a-z0-9_-]+$/.test(itemId) || !dataUrl.startsWith("data:image/webp;base64,")) {
              sendJson(response, 400, { error: "Invalid item id or WebP payload." });
              return;
            }
            const directory = path.resolve("public/assets/items", itemId);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(
              path.join(directory, "item.webp"),
              Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
            );
            sendJson(response, 200, { path: `/assets/items/${itemId}/item.webp` });
            return;
          }

          sendJson(response, 404, { error: "Unknown Content Studio endpoint." });
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : "Content Studio failed." });
        }
      });
    },
  };
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16 * 1024 * 1024) throw new Error("Content Studio payload exceeds 16 MB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function setNestedValue(target: Record<string, unknown>, dottedKey: string, value: string): void {
  const parts = dottedKey.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export default defineConfig({
  base: "./",
  plugins: [react(), contentStudioPlugin()],
  server: {
    port: 5173,
  },
});
