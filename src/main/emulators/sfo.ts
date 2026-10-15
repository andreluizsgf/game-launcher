/** PARAM.SFO (PS3/PSP metadata): key → string/number. Empty when it isn't one. */
export function parseSfo(buf: Buffer): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (buf.length < 20 || buf.readUInt32BE(0) !== 0x00505346) return out
  const keyTable = buf.readUInt32LE(8)
  const dataTable = buf.readUInt32LE(12)
  const count = buf.readUInt32LE(16)
  for (let i = 0; i < count; i++) {
    const e = 20 + i * 16
    if (e + 16 > buf.length) break
    const keyStart = keyTable + buf.readUInt16LE(e)
    const fmt = buf.readUInt16LE(e + 2)
    const len = buf.readUInt32LE(e + 4)
    const data = dataTable + buf.readUInt32LE(e + 12)
    const keyEnd = buf.indexOf(0, keyStart)
    if (keyEnd < 0 || data + len > buf.length) continue
    const key = buf.toString('utf8', keyStart, keyEnd)
    // 0x0404 = uint32; 0x0204 / 0x0004 = utf8 string (null-terminated / not).
    out[key] = fmt === 0x0404 ? buf.readUInt32LE(data) : buf.toString('utf8', data, data + len).replace(/\0+$/, '')
  }
  return out
}
