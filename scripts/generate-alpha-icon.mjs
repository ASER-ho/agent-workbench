import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const size = 256
const rowMaskBytes = Math.ceil(size / 32) * 4
const xorBytes = size * size * 4
const andBytes = rowMaskBytes * size
const bitmapBytes = 40 + xorBytes + andBytes
const output = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.ico')
const file = Buffer.alloc(6 + 16 + bitmapBytes)

file.writeUInt16LE(0, 0)
file.writeUInt16LE(1, 2)
file.writeUInt16LE(1, 4)
file.writeUInt8(0, 6)
file.writeUInt8(0, 7)
file.writeUInt8(0, 8)
file.writeUInt8(0, 9)
file.writeUInt16LE(1, 10)
file.writeUInt16LE(32, 12)
file.writeUInt32LE(bitmapBytes, 14)
file.writeUInt32LE(22, 18)

const header = 22
file.writeUInt32LE(40, header)
file.writeInt32LE(size, header + 4)
file.writeInt32LE(size * 2, header + 8)
file.writeUInt16LE(1, header + 12)
file.writeUInt16LE(32, header + 14)
file.writeUInt32LE(0, header + 16)
file.writeUInt32LE(xorBytes, header + 20)
file.writeInt32LE(2835, header + 24)
file.writeInt32LE(2835, header + 28)

const clamp = value => Math.max(0, Math.min(255, Math.round(value)))
const roundedSquare = (x, y) => {
  const radius = 42
  const left = 12, right = size - 13, top = 12, bottom = size - 13
  const cx = Math.max(left + radius, Math.min(right - radius, x))
  const cy = Math.max(top + radius, Math.min(bottom - radius, y))
  return Math.hypot(x - cx, y - cy) <= radius
}
const ringDistance = (x, y) => Math.abs(Math.hypot(x - 128, y - 128) - 72)
const nodeDistance = (x, y, angle) => {
  const nx = 128 + Math.cos(angle) * 72
  const ny = 128 + Math.sin(angle) * 72
  return Math.hypot(x - nx, y - ny)
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0
    if (roundedSquare(x, y)) {
      const radial = Math.max(0, 1 - Math.hypot(x - 110, y - 96) / 210)
      r = 9 + radial * 17
      g = 15 + radial * 19
      b = 33 + radial * 39
      a = 255
      const ring = ringDistance(x, y)
      if (ring < 7) {
        const blend = 1 - ring / 7
        r = r * (1 - blend) + 34 * blend
        g = g * (1 - blend) + 211 * blend
        b = b * (1 - blend) + 238 * blend
      }
      for (const angle of [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6]) {
        const node = nodeDistance(x, y, angle)
        if (node < 13) {
          const blend = 1 - node / 13
          r = r * (1 - blend) + 139 * blend
          g = g * (1 - blend) + 92 * blend
          b = b * (1 - blend) + 246 * blend
        }
      }
      if (Math.abs(x - 128) + Math.abs(y - 128) < 23) {
        r = 240; g = 249; b = 255
      }
    }
    const row = size - 1 - y
    const offset = header + 40 + (row * size + x) * 4
    file[offset] = clamp(b)
    file[offset + 1] = clamp(g)
    file[offset + 2] = clamp(r)
    file[offset + 3] = clamp(a)
  }
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, file)
console.log(`generated ${output} (${file.length} bytes)`)
