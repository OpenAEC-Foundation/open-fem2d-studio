import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const hier = dirname(fileURLToPath(import.meta.url));

/**
 * Normtoetsing bereikbaar maken vanuit de browser.
 *
 * De toetsing draait in Rust. In de desktop-app roept de frontend hem aan via
 * Tauri; in een gewone browser bestaat dat niet, en dan bleef élke plek waar
 * een unity check hoort te staan leeg — het canvas én het rapport. Deze
 * plug-in geeft de dev-server een eindpunt dat dezelfde rekenkern aanroept,
 * zodat de toetsing overal meeloopt met de berekening.
 *
 * Het is dezelfde binary die ook achter de Tauri-commands zit, dus er ontstaat
 * geen tweede implementatie: één rekenkern, twee manieren om hem te bereiken.
 * Bouwen met `cargo build --release --bin toetsbrug` in src-tauri.
 */
function toetsbrug(): Plugin {
  const exe = resolve(
    hier,
    "../src-tauri/target/release",
    // @ts-expect-error process is a nodejs global
    process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
  );

  return {
    name: "openaec-toetsbrug",
    configureServer(server) {
      server.middlewares.use("/api/toetsing", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ fout: "alleen POST" }));
          return;
        }
        if (!existsSync(exe)) {
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              fout:
                "De rekenkern is nog niet gebouwd. Draai in src-tauri: " +
                "cargo build --release --bin toetsbrug",
            }),
          );
          return;
        }

        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const kind = spawn(exe, [], { stdio: ["pipe", "pipe", "pipe"] });
          let uit = "";
          let fout = "";
          kind.stdout.on("data", (d) => (uit += d));
          kind.stderr.on("data", (d) => (fout += d));
          kind.on("error", (e) => {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ fout: `rekenkern start niet: ${e.message}` }));
          });
          kind.on("close", (code) => {
            res.setHeader("content-type", "application/json");
            if (uit) {
              // De brug schrijft ook fouten als JSON, dus afsluitcode 1 mét
              // inhoud is een nette foutmelding en geen crash.
              res.statusCode = code === 0 ? 200 : 400;
              res.end(uit);
            } else {
              res.statusCode = 500;
              res.end(
                JSON.stringify({ fout: fout || `rekenkern stopte met code ${code}` }),
              );
            }
          });
          kind.stdin.end(body);
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), toetsbrug()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1440,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      // 4. ignore the ts-rs generated types — `cargo test` rewrites them on
      //    every run, which would otherwise cause an HMR flicker storm.
      ignored: ["**/src-tauri/**", "**/src/lib/types/**"],
    },
  },
}));
