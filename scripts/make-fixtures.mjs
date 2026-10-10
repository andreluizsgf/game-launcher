// Creates fixtures/games with fake game folders for UI development on macOS.
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

const root = join(process.cwd(), 'fixtures', 'games')
const games = {
  'Hades': ['Hades.exe:4000', 'unins000.exe:9000'],
  'Hollow_Knight': ['hollow_knight.exe:700', 'UnityCrashHandler64.exe:1500'],
  'Celeste [GOG]': ['Celeste.exe:2000'],
  'The_Witcher.3-v4.04': ['bin/x64/witcher3.exe:60000', '_CommonRedist/vcredist_x64.exe:9000'],
  'Stardew Valley': ['Stardew Valley.exe:3000'],
  'Dead Cells': ['deadcells.exe:5000'],
  'Cuphead': ['Cuphead.exe:800'],
  'Sem Executavel': ['readme.txt:10'],
  'Outer Wilds': ['OuterWilds.exe:900', 'Launcher.exe:4000'],
  'Ori and the Will of the Wisps': ['oriwotw.exe:12000']
}

for (const [folder, files] of Object.entries(games)) {
  for (const spec of files) {
    const [rel, kb] = spec.split(':')
    const p = join(root, folder, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, Buffer.alloc(Number(kb) * 1024))
  }
}
console.log(`fixtures em ${root}`)
