import { describe, expect, it } from 'vitest'
import {
  describeFile,
  extractButtons,
  extractCommands,
  extractLinks,
  isBotCommand,
  isNoResults,
  isOpenable,
  renderTemplate,
  safeFileName
} from './parse'

describe('extractLinks', () => {
  it('reads text-url entities with their label', () => {
    const text = 'Baixe aqui agora'
    const links = extractLinks(text, [
      { className: 'MessageEntityTextUrl', offset: 6, length: 4, url: 'https://ex.com/a' }
    ])
    expect(links).toEqual([{ url: 'https://ex.com/a', label: 'aqui', magnet: false }])
  })

  it('finds bare urls and magnets, labels magnets by dn and dedupes', () => {
    const magnet = 'magnet:?xt=urn:btih:abc&dn=Some+Game+v1.0'
    const text = `Links: https://www.site.org/x, ${magnet} https://www.site.org/x`
    const links = extractLinks(text, [{ className: 'MessageEntityUrl', offset: 7, length: 22 }])
    expect(links).toEqual([
      { url: 'https://www.site.org/x', label: 'site.org', magnet: false },
      { url: magnet, label: 'Some Game v1.0', magnet: true }
    ])
  })

  it('takes url buttons and ignores unsafe schemes', () => {
    const links = extractLinks(
      'javascript:alert(1) file:///etc/passwd',
      [],
      [
        [
          { text: 'Site', url: 'https://ex.com' },
          { text: 'x', url: 'tg://resolve?domain=a' }
        ]
      ]
    )
    expect(links).toEqual([{ url: 'https://ex.com', label: 'Site', magnet: false }])
  })
})

describe('extractButtons', () => {
  it('keeps only callback buttons with position', () => {
    const buttons = extractButtons([
      [
        { text: 'Site', url: 'https://ex.com' },
        { text: 'Próxima', data: Buffer.from('p2') }
      ],
      [{ text: 'Mais', data: Buffer.from('m') }]
    ])
    expect(buttons).toEqual([
      { row: 0, col: 1, label: 'Próxima' },
      { row: 1, col: 0, label: 'Mais' }
    ])
  })
})

describe('helpers', () => {
  it('detects torrents', () => {
    expect(describeFile('Game.TORRENT', null, 10).torrent).toBe(true)
    expect(describeFile('x', 'application/x-bittorrent', null).torrent).toBe(true)
    expect(describeFile('trailer.mp4', 'video/mp4', 1).torrent).toBe(false)
  })

  it('renders template', () => {
    expect(renderTemplate('{title}', 'Hades')).toBe('Hades')
    expect(renderTemplate('/search {title} pc', 'Hades')).toBe('/search Hades pc')
    expect(renderTemplate('/search', 'Hades')).toBe('/search Hades')
  })

  it('sanitizes names and schemes', () => {
    expect(safeFileName('../a:b?.torrent')).toBe('_a_b_.torrent')
    expect(isOpenable('magnet:?xt=1')).toBe(true)
    expect(isOpenable('file:///x')).toBe(false)
  })
})

describe('extractCommands', () => {
  it('keeps the title and download command of each result', () => {
    const text = [
      '"download" - baixar o torrent com midia',
      '"cover" - informações sobre o torrent',
      '"readme" - instruções de instalação (se necessário)',
      '',
      '✅Torrents encontrados: 2✅',
      '',
      'Control Resonant [2026][1 GB]',
      '/download59423 /cover59423 /readme59423',
      '',
      'Control Ultimate Edition [2020][42 GB]',
      '/download1001 /cover1001'
    ].join('\n')
    expect(extractCommands(text)).toEqual([
      { label: 'Control Resonant [2026][1 GB]', command: '/download59423' },
      { label: 'Control Ultimate Edition [2020][42 GB]', command: '/download1001' }
    ])
  })

  it('ignores messages without download commands and validates commands', () => {
    expect(extractCommands('Nada encontrado')).toEqual([])
    expect(isBotCommand('/download59423')).toBe(true)
    expect(isBotCommand('/download1 rm -rf')).toBe(false)
  })
})

describe('isNoResults', () => {
  it('detects the empty answer', () => {
    expect(isNoResults('❌Torrents encontrados: 0❌\n\nNenhum torrent encontrado')).toBe(true)
    expect(isNoResults('✅Torrents encontrados: 10✅')).toBe(false)
  })
})
