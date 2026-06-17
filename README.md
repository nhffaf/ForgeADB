# ForgeADB

A modern, visual **ADB / Fastboot toolkit** for Android devices — single-click actions
for tasks that normally require cryptic command-line incantations.

Built with **Electron + React + Vite + Tailwind CSS + Lucide**. The `adb.exe` and
`fastboot.exe` binaries from Google's platform-tools are bundled with the app, so it
works out of the box — no separate ADB installation required.

> The original spec called for Tauri v2. Because this build machine has no Rust/MSVC
> toolchain, the app was implemented on **Electron** instead (Node-only build), keeping
> the exact requested frontend stack and a clean Rust-free path to a working `.exe`.

## Features

| Tab | What it does |
| --- | --- |
| **Dashboard** | Device status (codename, marketing name, Android version, security patch, CPU/ABI, bootloader state, active slot), battery card, reboot quick-actions (System / Recovery / Bootloader / Fastbootd), and screenshot capture with preview + save. |
| **ADB / Fastboot Tools** | *ADB Common:* drag-and-drop APK install, package manager (search, filter, uninstall/disable/enable/clear), file manager (browse + pull/push), real-time logcat (start/pause/clear, regex filter, level colouring), and the **DSU Package Installer**. *Fastboot Common:* boot temporary image, flash to partition, wipe cache/metadata/userdata, lock/unlock bootloader (with hard warnings). *Sideload (recovery):* OTA `.zip` sideloading with a live progress bar. |
| **Partition Manager** | Visual partition table with size bars, logical-vs-physical distinction, critical-partition flags. Per-partition flash / dump (backup) / erase, plus fastbootd logical-partition resize / delete / create. |
| **Terminal** | Interactive console with context switch (Host / `adb` / `adb shell` / `fastboot`), Tab autocomplete, command history (↑/↓), and a quick-click snippet panel. |

The **top status bar** shows the connected device with a dropdown to switch between
multiple devices (`adb -s <serial>`), live connection mode (ADB / Fastboot / Recovery /
Sideload / Unauthorized / Offline), battery, and Android version. Dangerous operations
require a typed confirmation; all CLI errors surface as readable toast notifications.

### ADB Sideload (OTA)

When a device reports the `sideload` state (recovery → *Apply update from ADB*), ForgeADB
automatically **locks incompatible tabs** (Partition Manager, App Manager, File Explorer,
Logcat) and surfaces a dedicated **Sideload** panel: drag-and-drop or pick an OTA `.zip`,
hit *Start Sideload*, and watch a live progress bar. The backend streams `adb sideload`
output and parses its `(~NN%)` markers into `sideload:progress` events.

### DSU Package Installer

Installs a Generic System Image as a temporary **Dynamic System Update**. ForgeADB first
checks A/B compatibility (`ro.build.ab_update` / `ro.boot.dynamic_partitions`, Android 10+)
and greys the panel out with an explanatory tooltip if unsupported. Provide a GSI URL or
local file, choose the userdata allocation (4 / 8 / 16 GB or custom), and ForgeADB fires the
`DynamicSystemInstallationService` intent via `am start-activity`.

## Run the built app

The packaged executables are in `release/`:

- **`ForgeADB-1.1.0-portable.exe`** — single-file portable, just double-click.
- **`ForgeADB-1.1.0-x64.exe`** — NSIS installer (Start-menu + desktop shortcut).

## Development

```bash
npm install        # install dependencies
npm run dev        # Vite dev server + Electron with hot reload + DevTools
npm run build      # build the React renderer into dist/
npm run dist       # build dist/ and package Windows .exe into release/
```

> Opening `dist/` in a plain browser shows the UI in **preview mode** with mock data
> (no device control) — useful for working on the interface.

## Project structure

```
electron/
  main.js        Electron main process / window
  preload.js     contextBridge — safe IPC API (window.adb)
  tools.js       adb/fastboot runner, resolves bundled platform-tools
  devices.js     device discovery + getprop/battery/fastboot info parsing
  ipc.js         all ipcMain handlers + logcat/sideload streaming + DSU
src/
  state/         DeviceContext, ToastContext, ConfirmContext
  components/     Sidebar, StatusBar, shared UI primitives
  views/          Dashboard, Tools, PartitionManager, Terminal
  views/tools/    AppManager, FileManager, Logcat, FastbootTools, Sideload, DSU
  assets/         app-icon.png (brand icon used in the UI)
  lib/            api bridge (+ browser mock), formatting helpers
scripts/
  make-icons.js  converts app-icon.png → build/icon.ico before packaging
build/           generated icon.ico / icon.png (Windows app icon)
platform-tools/  bundled adb.exe / fastboot.exe (shipped as app resources)
```

## Notes & safety

- Partition **dump** over ADB and reading `/dev/block/by-name` typically require **root**.
- **Flash / erase / resize** require the device in **fastboot** (bootloader) or **fastbootd**.
- Bootloader lock/unlock and `userdata` erase wipe the device and need on-device confirmation.
