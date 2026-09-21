import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import TitleBar from "../src/components/TitleBar";
import ToastHost from "../src/components/feedback/Toast";
import nl from "../src/i18n/locales/nl/common.json";
import { getCurrentWindow } from "@tauri-apps/api/window";

declare const WINDOW_PERMISSIONS: string[];
const host = document.getElementById("root")!;
let root = createRoot(host);
const tests: { name: string; error?: string }[] = [];
const errors: string[] = [];
const calls: string[] = [];
const api = window as unknown as Record<string, unknown>;
let rejectClose = false;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function ok(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
window.addEventListener("unhandledrejection", event => { errors.push(String(event.reason)); event.preventDefault(); });
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); tests.push({ name }); } catch (error) { tests.push({ name, error: String(error) }); }
}
async function mount(desktop = false) {
  flushSync(() => root.unmount());
  delete api.__TAURI_INTERNALS__;
  calls.length = 0;
  if (desktop) {
    api.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => 1,
      invoke: async (command: string, args: { label?: string } = {}) => {
        if (command === "plugin:window|close" && rejectClose) throw Error("Sluitverzoek geweigerd");
        if (command === "plugin:window|close" || command === "plugin:window|destroy") {
          const permission = `core:window:allow-${command.split("|")[1]}`;
          ok(WINDOW_PERMISSIONS.includes(permission), `Ontbrekende toestemming voor ${command}`);
          ok(args.label === "main", "Sluit alleen het huidige venster");
        }
        calls.push(command);
        if (command === "plugin:app|version") return "0.3.12";
        if (command === "plugin:window|is_maximized") return false;
        return 1;
      },
    };
    api.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  }
  root = createRoot(host);
  flushSync(() => root.render(<><TitleBar /><ToastHost /></>));
  await tick(); await tick();
}
async function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  ok(button, `Knop ontbreekt: ${selector}`);
  flushSync(() => button.click());
  await tick(); await tick();
}
async function run() {
  await i18next.use(initReactI18next).init({ lng: "nl", resources: { nl: { common: nl } }, defaultNS: "common", initImmediate: false });
  await test("browser-sluitknop geeft uitleg in plaats van een onafgehandelde desktopfout", async () => {
    await mount(); await click(".titlebar-close");
    ok(/tabblad/.test(host.querySelector('[role="status"]')?.textContent ?? ""), "Sluit het browsertabblad-melding ontbreekt");
    ok(errors.length === 0, errors.join("; "));
  });
  await test("minimaliseren en maximaliseren zijn in browser niet beschikbaar", async () => {
    await mount();
    ok(host.querySelector<HTMLButtonElement>(".titlebar-minimize")?.disabled, "Minimaliseren lijkt beschikbaar");
    ok(host.querySelector<HTMLButtonElement>(".titlebar-maximize")?.disabled, "Maximaliseren lijkt beschikbaar");
    flushSync(() => host.querySelector(".titlebar")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await tick();
    ok(errors.length === 0, errors.join("; "));
  });
  errors.length = 0;
  await test("desktop-sluitknop vraagt sluiten aan, zonder de opslagbeveiliging te omzeilen", async () => {
    await mount(true); await click(".titlebar-close");
    ok(calls.includes("plugin:window|close"), "Geen sluitverzoek");
    ok(!calls.includes("plugin:window|destroy"), "Titelbalk omzeilt de sluitbeveiliging");
  });
  await test("toegestane sluitroute kan na de opslagbeveiliging het hoofdvenster beëindigen", async () => {
    await getCurrentWindow().destroy();
    ok(calls.includes("plugin:window|destroy"), "Laatste sluitstap niet toegestaan");
  });
  await test("weigering van een desktop-sluitverzoek wordt zichtbaar gemeld", async () => {
    await mount(true); rejectClose = true; await click(".titlebar-close"); rejectClose = false;
    ok(/Sluitverzoek geweigerd/.test(host.querySelector('[role="status"]')?.textContent ?? ""), "Fout blijft onzichtbaar");
    ok(errors.length === 0, errors.join("; "));
  });
  await test("desktop behoudt minimaliseren en maximaliseren", async () => {
    await mount(true); await click(".titlebar-minimize"); await click(".titlebar-maximize");
    ok(calls.includes("plugin:window|minimize"), "Minimaliseren ontbreekt");
    ok(calls.includes("plugin:window|toggle_maximize"), "Maximaliseren ontbreekt");
  });
}
run().then(() => { document.getElementById("uitslag")!.textContent = JSON.stringify({ tests }); })
  .catch(error => { document.getElementById("uitslag")!.textContent = JSON.stringify({ tests, error: String(error) }); });
