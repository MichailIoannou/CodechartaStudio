#!/usr/bin/env node

// Install scripts are disabled repository-wide (.npmrc ignore-scripts=true) to keep
// compromised dependencies from executing code during npm install. Electron is the one
// dependency that genuinely needs its postinstall (it downloads the platform binary),
// so the desktop scripts run this check first and fetch the binary on demand.
//
// Electron's install script is run directly with node rather than through `npm rebuild`:
// npm 12 blocks lifecycle scripts not listed in allowScripts even with --ignore-scripts=false,
// and only warns about it, so the rebuild reported success without downloading anything.

const { existsSync } = require("node:fs")
const { execFileSync } = require("node:child_process")
const { join } = require("node:path")

const electronFolder = join(__dirname, "..", "node_modules", "electron")
const electronPathFile = join(electronFolder, "path.txt")
const electronInstallScript = join(electronFolder, "install.js")

if (!existsSync(electronPathFile)) {
    console.log("Electron binary is missing (install scripts are disabled) — downloading it now...")
    execFileSync(process.execPath, [electronInstallScript], { cwd: electronFolder, stdio: "inherit" })
}

if (!existsSync(electronPathFile)) {
    console.error(`Electron binary is still missing after running ${electronInstallScript}.`)
    process.exit(1)
}
