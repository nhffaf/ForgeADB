'use strict'

const fs = require('fs')
const zlib = require('zlib')

// Android sparse image format constants.
const SPARSE_MAGIC = 0xed26ff3a
const CHUNK_RAW = 0xcac1
const CHUNK_FILL = 0xcac2
const CHUNK_DONT_CARE = 0xcac3
const CHUNK_CRC32 = 0xcac4
const SPARSE_HEADER_SIZE = 28
const WORK_BUFFER = 1 << 20 // 1 MiB streaming buffer

/**
 * Read the first four bytes of a file and test for the sparse magic.
 */
async function isSparseImage(filePath) {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const head = Buffer.alloc(4)
    const { bytesRead } = await handle.read(head, 0, 4, 0)
    if (bytesRead < 4) return false
    return head.readUInt32LE(0) === SPARSE_MAGIC
  } finally {
    await handle.close()
  }
}

/**
 * Expand an Android sparse image into a raw image while gzip-compressing the
 * output stream on the fly. The intermediate raw image is never materialised on
 * disk, keeping memory and storage usage bounded regardless of GSI size.
 *
 * @returns the size in bytes of the uncompressed raw image (KEY_SYSTEM_SIZE).
 */
async function sparseToGzip(inputPath, outputGzPath, onProgress) {
  const handle = await fs.promises.open(inputPath, 'r')
  try {
    const header = Buffer.alloc(SPARSE_HEADER_SIZE)
    await handle.read(header, 0, SPARSE_HEADER_SIZE, 0)
    if (header.readUInt32LE(0) !== SPARSE_MAGIC) {
      throw new Error('File is not a valid Android sparse image.')
    }

    const fileHeaderSize = header.readUInt16LE(8)
    const chunkHeaderSize = header.readUInt16LE(10)
    const blockSize = header.readUInt32LE(12)
    const totalBlocks = header.readUInt32LE(16)
    const totalChunks = header.readUInt32LE(20)
    const rawSize = totalBlocks * blockSize

    const output = fs.createWriteStream(outputGzPath)
    const gzip = zlib.createGzip({ level: 6 })
    gzip.pipe(output)
    const done = new Promise((resolve, reject) => {
      output.on('finish', resolve)
      output.on('error', reject)
      gzip.on('error', reject)
    })

    const write = (buffer) =>
      new Promise((resolve) => {
        if (gzip.write(buffer)) resolve()
        else gzip.once('drain', resolve)
      })

    const zeros = Buffer.alloc(WORK_BUFFER)
    let cursor = fileHeaderSize
    let written = 0

    for (let i = 0; i < totalChunks; i++) {
      const chunkHeader = Buffer.alloc(chunkHeaderSize)
      await handle.read(chunkHeader, 0, chunkHeaderSize, cursor)
      const chunkType = chunkHeader.readUInt16LE(0)
      const chunkBlocks = chunkHeader.readUInt32LE(4)
      const chunkTotalSize = chunkHeader.readUInt32LE(8)
      const dataOffset = cursor + chunkHeaderSize
      const outputBytes = chunkBlocks * blockSize

      if (chunkType === CHUNK_RAW) {
        const buffer = Buffer.alloc(WORK_BUFFER)
        let remaining = outputBytes
        let readAt = dataOffset
        while (remaining > 0) {
          const toRead = Math.min(WORK_BUFFER, remaining)
          const { bytesRead } = await handle.read(buffer, 0, toRead, readAt)
          if (bytesRead <= 0) break
          await write(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead))
          remaining -= bytesRead
          readAt += bytesRead
          written += bytesRead
          if (onProgress) onProgress(written, rawSize)
        }
      } else if (chunkType === CHUNK_FILL) {
        const fill = Buffer.alloc(4)
        await handle.read(fill, 0, 4, dataOffset)
        const pattern = Buffer.alloc(WORK_BUFFER)
        for (let offset = 0; offset + 4 <= WORK_BUFFER; offset += 4) fill.copy(pattern, offset)
        let remaining = outputBytes
        while (remaining > 0) {
          const n = Math.min(WORK_BUFFER, remaining)
          await write(n === WORK_BUFFER ? pattern : pattern.subarray(0, n))
          remaining -= n
          written += n
          if (onProgress) onProgress(written, rawSize)
        }
      } else if (chunkType === CHUNK_DONT_CARE) {
        let remaining = outputBytes
        while (remaining > 0) {
          const n = Math.min(WORK_BUFFER, remaining)
          await write(n === WORK_BUFFER ? zeros : zeros.subarray(0, n))
          remaining -= n
          written += n
          if (onProgress) onProgress(written, rawSize)
        }
      }
      // CHUNK_CRC32 carries no output payload and is skipped.

      cursor += chunkTotalSize
    }

    gzip.end()
    await done
    return rawSize
  } finally {
    await handle.close()
  }
}

/**
 * Gzip-compress an already-raw image without modifying its contents.
 *
 * @returns the size in bytes of the uncompressed source image.
 */
async function rawToGzip(inputPath, outputGzPath, onProgress) {
  const { size } = await fs.promises.stat(inputPath)
  await new Promise((resolve, reject) => {
    const source = fs.createReadStream(inputPath)
    const gzip = zlib.createGzip({ level: 6 })
    const output = fs.createWriteStream(outputGzPath)
    let read = 0
    source.on('data', (chunk) => {
      read += chunk.length
      if (onProgress) onProgress(read, size)
    })
    source.on('error', reject)
    gzip.on('error', reject)
    output.on('error', reject)
    output.on('finish', resolve)
    source.pipe(gzip).pipe(output)
  })
  return size
}

/**
 * Prepare a GSI image for DSU installation: detect sparse vs raw, then produce a
 * gzip-compressed raw image at outputGzPath. Returns the uncompressed raw size.
 */
async function prepareGzImage(inputPath, outputGzPath, onProgress) {
  const sparse = await isSparseImage(inputPath)
  const rawSize = sparse
    ? await sparseToGzip(inputPath, outputGzPath, onProgress)
    : await rawToGzip(inputPath, outputGzPath, onProgress)
  return { rawSize, wasSparse: sparse }
}

module.exports = { isSparseImage, prepareGzImage }
