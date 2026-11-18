#!/usr/bin/env node

// actions/upload-artifact drops file modes, so a core binary that lost its executable bit on the way into a
// Linux or macOS zip would only fail on the user's machine. This reads each zip's central directory and fails
// packaging instead.

const fs = require("node:fs")
const path = require("node:path")

const { paths } = require("./appConfig.json")

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIZE = 22
const MAX_ZIP_COMMENT_SIZE = 0xffff
const CENTRAL_DIRECTORY_ENTRY_SIZE = 46
const ENTRY_FIELD = { madeByHost: 5, nameLength: 28, extraLength: 30, commentLength: 32, externalAttributes: 38 }
const END_FIELD = { entryCount: 10, centralDirectoryOffset: 16 }
const MODE_SHIFT = 16
const UNIX_HOST = 3
const EXECUTABLE_BITS = 0o111
const CORE_ENTRY = /(^|\/)(resources|Contents\/Resources)\/codecharta-core$/

function findEndOfCentralDirectory(zip) {
    const earliestStart = Math.max(0, zip.length - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_ZIP_COMMENT_SIZE)
    for (let offset = zip.length - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= earliestStart; offset--) {
        if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
            return offset
        }
    }
    throw new Error("not a zip file: no end of central directory")
}

function readEntryAt(zip, offset) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY_SIGNATURE) {
        throw new Error(`broken central directory at byte ${offset}`)
    }
    const nameLength = zip.readUInt16LE(offset + ENTRY_FIELD.nameLength)
    const extraLength = zip.readUInt16LE(offset + ENTRY_FIELD.extraLength)
    const commentLength = zip.readUInt16LE(offset + ENTRY_FIELD.commentLength)
    return {
        name: zip.toString("utf8", offset + CENTRAL_DIRECTORY_ENTRY_SIZE, offset + CENTRAL_DIRECTORY_ENTRY_SIZE + nameLength),
        host: zip.readUInt8(offset + ENTRY_FIELD.madeByHost),
        mode: zip.readUInt32LE(offset + ENTRY_FIELD.externalAttributes) >>> MODE_SHIFT,
        nextOffset: offset + CENTRAL_DIRECTORY_ENTRY_SIZE + nameLength + extraLength + commentLength
    }
}

function readCentralDirectory(zip) {
    const endOffset = findEndOfCentralDirectory(zip)
    const entryCount = zip.readUInt16LE(endOffset + END_FIELD.entryCount)
    let offset = zip.readUInt32LE(endOffset + END_FIELD.centralDirectoryOffset)
    const entries = []
    for (let index = 0; index < entryCount; index++) {
        const entry = readEntryAt(zip, offset)
        entries.push(entry)
        offset = entry.nextOffset
    }
    return entries
}

function checkZip(zipPath) {
    const coreEntries = readCentralDirectory(fs.readFileSync(zipPath)).filter(entry => CORE_ENTRY.test(entry.name))
    if (coreEntries.length !== 1) {
        throw new Error(`${zipPath} holds ${coreEntries.length} core binaries instead of one`)
    }
    const [core] = coreEntries
    if (core.host !== UNIX_HOST || (core.mode & EXECUTABLE_BITS) === 0) {
        throw new Error(`${zipPath}: ${core.name} is not executable (mode ${core.mode.toString(8)})`)
    }
    console.log(`${path.basename(zipPath)}: ${core.name} mode ${core.mode.toString(8)}`)
}

function checkCoreModes() {
    const unixZips = fs
        .readdirSync(paths.packagePath)
        .filter(fileName => /-(linux|darwin)-[^-]+\.zip$/.test(fileName))
        .map(fileName => path.join(paths.packagePath, fileName))
    for (const zipPath of unixZips) {
        checkZip(zipPath)
    }
}

module.exports = { checkCoreModes }
