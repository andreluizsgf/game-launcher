import { useEffect, useState } from 'react'
import type { DownloadsStatus, StorageInfo, UpdateState } from '@shared/types'

/** Live status from the main process: torrent downloads and app updates. */
export function useSystemStatus(notify: (msg: string) => void) {
  const [downloads, setDownloads] = useState<DownloadsStatus>({ available: false, items: [] })
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle', version: null, percent: 0 })
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getDownloads().then(setDownloads)
    window.api.appVersion().then(setVersion)
    window.api.updateState().then(setUpdate)
    let lastUpdate = ''
    const offUpdate = window.api.onUpdate((u) => {
      setUpdate(u)
      const key = `${u.status}:${u.version}`
      if (key === lastUpdate) return
      lastUpdate = key
      if (u.status === 'ready') notify(`Versão ${u.version} pronta — reinicie em Configurações (ou ao fechar o app)`)
      if (u.status === 'portable') notify(`Versão ${u.version} disponível — baixe o instalador em Configurações`)
    })
    const offDownloads = window.api.onDownloads(setDownloads)
    return () => {
      offUpdate()
      offDownloads()
    }
  }, [notify])

  return { downloads, update, version }
}

/** Free space on the games drive: every 30 s (downloads fill it), and whenever the library or root changes. */
export function useStorage(libraryVersion: number, gamesRoot: string | null): StorageInfo | null {
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  useEffect(() => {
    const refresh = () => window.api.storage().then(setStorage)
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [libraryVersion, gamesRoot])
  return storage
}
