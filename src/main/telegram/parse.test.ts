import { describe, expect, it } from 'vitest'
import { describeFile, extractButtons, extractLinks, isOpenable, renderTemplate, safeFileName } from './parse'

describe('extractLinks', () => {
  it('reads text-url entities with their label', () => {
    const text = 'Baixe aqui agora'
    const links = extractLinks(text, [{ className: 'MessageEntityTextUrl', offset: 6, length: 4, url: 'https://ex.com/a' }])
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
    const links = extractLinks('javascript:alert(1) file:///etc/passwd', [], [
      [{ text: 'Site', url: 'https://ex.com' }, { text: 'x', url: 'tg://resolve?domain=a' }]
    ])
    expect(links).toEqual([{ url: 'https://ex.com', label: 'Site', magnet: false }])
  })
})

describe('extractButtons', () => {
  it('keeps only callback buttons with position', () => {
    const buttons = extractButtons([
      [{ text: 'Site', url: 'https://ex.com' }, { text: 'Próxima', data: Buffer.from('p2') }],
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
