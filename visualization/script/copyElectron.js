#!/usr/bin/env node

const { copyFileSync, existsSync } = require("node:fs")
const { basename, join } = require("node:path")

const visualizationFolder = join(__dirname, "..")
const bundleFolder = join(visualizationFolder, "dist", "bundler", "browser")
const shellFiles = ["electron/main.js", "electron/coreMethods.generated.json", "package.json"]

if (!existsSync(join(bundleFolder, "index.html"))) {
    console.error(`No index.html in ${bundleFolder}: run ng build before copying the electron files.`)
    process.exit(1)
}

for (const shellFile of shellFiles) {
    copyFileSync(join(visualizationFolder, shellFile), join(bundleFolder, basename(shellFile)))
}
