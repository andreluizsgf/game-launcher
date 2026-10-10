export type InputMode = 'auto' | 'xinput' | 'kbm' | 'native'

export interface Game {
  id: number
  /** null = added from the catalog, not installed yet. */
  folder: string | null
  title: string
  exePath: string | null
  exeOverride: string | null
  coverPath: string | null
  /** Wide artwork used as the home background. */
  artPath: string | null
  igdbId: number | null
  summary: string | null
  releaseYear: number | null
  genres: string[]
  addedAt: number
  lastPlayedAt: number | null
  totalSeconds: number
  hidden: boolean
  inputMode: InputMode
}

export interface Settings {
  gamesRoot: string | null
  fullscreen: boolean
  igdbClientId: string | null
  /** The secret itself never leaves the main process. */
  hasIgdbSecret: boolean
  telegramApiId: number | null
  hasTelegramApiHash: boolean
  /** Bot, group or channel username the game title is sent to. */
  telegramPeer: string | null
  /** Message sent to the peer; `{title}` is replaced by the game title. */
  telegramTemplate: string
  telegramLoggedIn: boolean
}

export type SettingsPatch = Partial<
  Pick<Settings, 'gamesRoot' | 'fullscreen' | 'igdbClientId' | 'telegramApiId' | 'telegramPeer' | 'telegramTemplate'>
>

export interface ScanResult {
  added: number
  updated: number
  removed: number
  total: number
}

export interface GameEndedEvent {
  gameId: number
  seconds: number
}

export interface CatalogHit {
  igdbId: number
  name: string
  year: number | null
  coverUrl: string | null
  /** Id of a game already in the library linked to this hit. */
  inLibraryId: number | null
}

export interface StoreGame extends CatalogHit {
  releaseDate: number | null
  artUrl: string | null
  /** IGDB aggregated rating 0–100. */
  rating: number | null
  ratingCount: number
  genres: string[]
  summary: string | null
  screenshots: string[]
}

export interface StoreSection {
  id: string
  title: string
  games: StoreGame[]
}

export interface TgLink {
  label: string
  url: string
  magnet: boolean
}

export interface TgFile {
  name: string
  size: number | null
  torrent: boolean
}

/** Inline bot button that triggers a callback (pagination, "more results"…). */
export interface TgButton {
  row: number
  col: number
  label: string
}

export interface TgMessage {
  id: number
  date: number
  text: string
  links: TgLink[]
  file: TgFile | null
  buttons: TgButton[]
}

/** Replies collected for one query; pushed again every time a message arrives or is edited. */
export interface TgThread {
  query: string
  sentAt: number
  messages: TgMessage[]
}

export interface TgDownloadProgress {
  msgId: number
  /** 0–1; 1 = done. */
  ratio: number
}

export type TgLoginStep = 'code' | 'password' | 'done'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface LauncherApi {
  listGames(): Promise<Game[]>
  rescan(): Promise<ScanResult>
  launch(gameId: number): Promise<Result<null>>
  removeGame(gameId: number): Promise<Result<null>>
  getSettings(): Promise<Settings>
  setSettings(patch: SettingsPatch): Promise<Settings>
  setIgdbSecret(secret: string): Promise<Settings>
  pickGamesRoot(): Promise<string | null>
  catalogSearch(query: string): Promise<Result<CatalogHit[]>>
  /** Adds a catalog game; merges into an installed game with the same title when there is one. */
  catalogAdd(igdbId: number): Promise<Result<Game>>
  /** Attaches catalog metadata/art to an existing library game. */
  catalogLink(gameId: number, igdbId: number): Promise<Result<Game>>
  storeSections(force?: boolean): Promise<Result<StoreSection[]>>
  setTelegramApiHash(hash: string): Promise<Settings>
  /** Starts login: Telegram sends a code to the phone/app. */
  telegramLoginPhone(phone: string): Promise<Result<TgLoginStep>>
  telegramLoginCode(code: string): Promise<Result<TgLoginStep>>
  telegramLoginPassword(password: string): Promise<Result<TgLoginStep>>
  telegramLogout(): Promise<Settings>
  /** Sends the game title to the peer, unless a recent thread for it exists (`force` resends). */
  telegramQuery(title: string, force?: boolean): Promise<Result<TgThread>>
  telegramOpenLink(url: string): Promise<Result<null>>
  /** Downloads a message's file; .torrent files are opened in the default torrent client. */
  telegramDownload(msgId: number): Promise<Result<string>>
  telegramPress(msgId: number, row: number, col: number): Promise<Result<null>>
  onTelegramThread(cb: (t: TgThread) => void): () => void
  onTelegramProgress(cb: (p: TgDownloadProgress) => void): () => void
  onGameEnded(cb: (e: GameEndedEvent) => void): () => void
  onGameStarted(cb: (gameId: number) => void): () => void
}
