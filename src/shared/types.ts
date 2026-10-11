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
  /** Full release date (ms) when known from the catalog; drives the "Aguardados" shelf. */
  releaseDate: number | null
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
  /** Start with Windows, straight into fullscreen. */
  openAtLogin: boolean
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
  /** qBittorrent executable in use (override or auto-detected); null = not found. */
  qbittorrentPath: string | null
  /** qBittorrent Web UI, used to add torrents with a fixed folder and to follow progress. */
  qbWebUrl: string
  qbWebUser: string | null
  hasQbWebPassword: boolean
}

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'gamesRoot'
    | 'fullscreen'
    | 'openAtLogin'
    | 'igdbClientId'
    | 'telegramApiId'
    | 'telegramPeer'
    | 'telegramTemplate'
    | 'qbWebUrl'
    | 'qbWebUser'
  >
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

/** Result listed by a search bot as a title line followed by `/download<id>`; running it sends the command. */
export interface TgCommand {
  label: string
  command: string
}

export interface TgMessage {
  id: number
  date: number
  text: string
  links: TgLink[]
  file: TgFile | null
  buttons: TgButton[]
  commands: TgCommand[]
  /** Search bot answered that nothing was found. */
  noResults: boolean
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
  /** Set when done: where the torrent went. */
  openedWith?: 'qbittorrent' | 'default' | 'folder'
  /** Folder qBittorrent was told to save into; null = qBittorrent's own default (no games folder set). */
  savePath?: string | null
  /** Automatic download failed. */
  error?: string
}

export type TgLoginStep = 'code' | 'password' | 'done'

export type DownloadState = 'downloading' | 'stalled' | 'paused' | 'queued' | 'error' | 'done'

/** A qBittorrent torrent saving into the games folder. */
export interface DownloadInfo {
  hash: string
  /** Library game it belongs to (by folder or title); null when none matches. */
  gameId: number | null
  title: string
  /** 0–1 */
  progress: number
  state: DownloadState
  /** bytes/s */
  speed: number
  /** seconds left; null = unknown */
  eta: number | null
  size: number
}

export interface DownloadsStatus {
  /** qBittorrent Web UI reachable (and a games folder set). */
  available: boolean
  items: DownloadInfo[]
}

/** Disk holding the games folder (or the home folder when none is set). */
export interface StorageInfo {
  /** "D:" on Windows, "/" elsewhere. */
  label: string
  free: number
  total: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  /** Remote URL or local path; the gray version while locked. */
  icon: string | null
  hidden: boolean
  unlocked: boolean
  /** ms; null = locked or unknown. */
  unlockedAt: number | null
  /** % of players who have it (global rarity), when known. */
  rarity: number | null
  progress: { current: number; max: number } | null
}

export interface GameAchievements {
  source: string
  appid: string
  total: number
  unlocked: number
  list: Achievement[]
}

/**
 * idle: up to date (or not checked); downloading/ready: installed build updating itself;
 * portable: a newer version exists, but the portable build can't install it.
 */
export interface UpdateState {
  status: 'idle' | 'downloading' | 'ready' | 'portable'
  version: string | null
  /** 0–1 while downloading. */
  percent: number
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface LauncherApi {
  listGames(): Promise<Game[]>
  rescan(): Promise<ScanResult>
  launch(gameId: number): Promise<Result<null>>
  removeGame(gameId: number): Promise<Result<null>>
  /** Moves the game folder to the Recycle Bin (and drops its torrent from qBittorrent). */
  uninstallGame(gameId: number): Promise<Result<null>>
  getSettings(): Promise<Settings>
  setSettings(patch: SettingsPatch): Promise<Settings>
  setIgdbSecret(secret: string): Promise<Settings>
  pickGamesRoot(): Promise<string | null>
  /** File dialog to pick the qBittorrent app/executable. */
  pickQbittorrent(): Promise<Settings>
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
  /**
   * Sends the game title to the peer, unless a recent thread for it exists (`force` resends).
   * `igdbId` lets a download add the game to the library.
   */
  telegramQuery(title: string, force?: boolean, igdbId?: number | null): Promise<Result<TgThread>>
  /** http(s) opens in the browser; magnet links go to qBittorrent like .torrent files. */
  telegramOpenLink(url: string): Promise<Result<TgDownloadProgress['openedWith']>>
  /** Downloads a message's file; .torrent files go to qBittorrent (saving into the games folder) or the default client. */
  telegramDownload(msgId: number): Promise<Result<string>>
  telegramPress(msgId: number, row: number, col: number): Promise<Result<null>>
  /** Sends a bot command (e.g. `/download123`); the reply joins the current thread. */
  telegramCommand(command: string): Promise<Result<null>>
  readClipboard(): Promise<string>
  appVersion(): Promise<string>
  updateState(): Promise<UpdateState>
  onUpdate(cb: (s: UpdateState) => void): () => void
  /** Restart into the downloaded update. */
  installUpdate(): Promise<void>
  /** Opens the releases page (portable build: download the installer). */
  openReleases(): Promise<void>
  /** Achievements for a library game, read from Achievement Watcher Next; null = none found. */
  achievements(gameId: number): Promise<GameAchievements | null>
  /** In-game quick menu: bring the launcher over the running game, or send it back. */
  overlayToggle(): Promise<void>
  overlayHide(): Promise<void>
  onOverlay(cb: (open: boolean) => void): () => void
  /** Force-closes the running game. */
  stopGame(gameId: number): Promise<Result<null>>
  storage(): Promise<StorageInfo | null>
  setQbWebPassword(password: string): Promise<Settings>
  getDownloads(): Promise<DownloadsStatus>
  onDownloads(cb: (s: DownloadsStatus) => void): () => void
  /** Main process changed the library (download added a game, finished download rescanned). */
  onLibraryChanged(cb: (message: string | null) => void): () => void
  onTelegramThread(cb: (t: TgThread) => void): () => void
  onTelegramProgress(cb: (p: TgDownloadProgress) => void): () => void
  onGameEnded(cb: (e: GameEndedEvent) => void): () => void
  onGameStarted(cb: (gameId: number) => void): () => void
}
