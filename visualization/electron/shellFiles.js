async function readRange(fs, filePath, position, maxLength) {
    const handle = await fs.promises.open(filePath, "r")
    try {
        const { size } = await handle.stat()
        const length = Math.max(0, Math.min(maxLength, size - position))
        const bytes = new Uint8Array(length)
        let filled = 0
        let bytesRead = -1
        while (filled < length && bytesRead !== 0) {
            ;({ bytesRead } = await handle.read(bytes, filled, length - filled, position + filled))
            filled += bytesRead
        }
        return { bytes: filled === length ? bytes : bytes.slice(0, filled), totalBytes: size }
    } finally {
        await handle.close()
    }
}

async function realPathOrNull(fs, filePath) {
    try {
        return await fs.promises.realpath(filePath)
    } catch {
        return null
    }
}

module.exports = { readRange, realPathOrNull }
