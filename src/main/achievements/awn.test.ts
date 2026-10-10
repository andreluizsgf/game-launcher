import { describe, expect, it } from 'vitest'
import type { Game } from '@shared/types'
import { matchAwnGame, toAchievement, toGameAchievements } from './awn'

describe('toAchievement', () => {
  it('maps unlocked items with time, rarity and progress', () => {
    const a = toAchievement({
      name: 'ACH_1',
      displayName: 'Primeiro passo',
      description: 'Comece o jogo',
      icon: 'https://cdn/x.jpg',
      icongray: 'https://cdn/x_gray.jpg',
      Achieved: 1,
      UnlockTime: 1_790_000_000,
      percent: '12.5',
      CurProgress: 3,
      MaxProgress: 10
    })
    expect(a).toMatchObject({
      id: 'ACH_1',
      name: 'Primeiro passo',
      icon: 'https://cdn/x.jpg',
      unlocked: true,
      unlockedAt: 1_790_000_000_000,
      rarity: 12.5,
      progress: { current: 3, max: 10 }
    })
  })

  it('uses the gray icon and no time while locked', () => {
    const a = toAchievement({ name: 'X', icon: 'c.jpg', icongray: 'g.jpg', Achieved: false, UnlockTime: 0, hidden: 1 })
    expect(a).toMatchObject({
      unlocked: false,
      icon: 'g.jpg',
      unlockedAt: null,
      hidden: true,
      rarity: null,
      progress: null
    })
  })
})

describe('matchAwnGame', () => {
  const awn = [
    { appid: 1, name: 'Hades', achievement: { list: [] } },
    { appid: 2, name: 'Control', achievement: { list: [] } }
  ]
  const game = (title: string, folder: string | null) => ({ title, folder }) as Game

  it('prefers the executable inside the game folder', () => {
    const exes = new Map([['2', 'D:\\Jogos\\Control Resonant\\Rel\\Control.exe']])
    expect(matchAwnGame(game('Control Resonant', 'D:/Jogos/Control Resonant'), awn, exes)?.appid).toBe(2)
  })

  it('falls back to the title', () => {
    expect(matchAwnGame(game('Hades', null), awn, new Map())?.appid).toBe(1)
    expect(matchAwnGame(game('Outro', null), awn, new Map())).toBeNull()
  })
})

describe('toGameAchievements', () => {
  it('counts unlocked items', () => {
    const g = toGameAchievements({
      appid: 9,
      name: 'X',
      achievement: {
        list: [
          { name: 'a', Achieved: true },
          { name: 'b', Achieved: false }
        ]
      }
    })
    expect(g).toMatchObject({ appid: '9', total: 2, unlocked: 1 })
  })
})
