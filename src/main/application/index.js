import path from 'path'
import { app, systemPreferences, ipcMain } from 'electron'
import { Application } from 'nucleon'
import Window from 'window'
import Tray from 'tray/index'
import Sync from './sync'
import VaultManager from './vault_manager'
import Auditor from './auditor'
import { EVENTS } from './events'
import { isWindows } from './helpers/os'
import { trackAppEvent, trackVaultEvent } from 'analytics'
import { i18n } from './i18n'

const INACTIVE_TIMEOUT = 60000

export default class Swifty extends Application {
  components() {
    return { Window }
  }

  call(events) {
    Object.values(events).forEach(event => event.call(this))
  }

  subscribe() {
    Object.keys(EVENTS).forEach(event => {
      ipcMain.on(event, (e, data) => EVENTS[event].call(this, e, data))
    })
  }

  windowOptions() {
    return {
      titleBarStyle: 'hiddenInset',
      name: this.settings.name,
      width: this.settings.width,
      height: this.settings.height,
      devTools: this.settings.devTools,
      frame: !isWindows(),
      transparent: true,
      webPreferences: {
        worldSafeExecuteJavaScript: true,
        contextIsolation: true,
        preload: path.join(app.getAppPath(), 'preload', 'index.js')
      }
    }
  }

  onReady() {
    this.i18n = i18n
    this.closed = false
    this.tray = new Tray(this)
    this.vaultManager = new VaultManager()
    this.sync = new Sync()
    trackAppEvent('Launch')
  }

  onWindowReady() {
    this.window.removeMenu()
    this.window.disableNavigation()
    this.setupWindowEvents()
    this.subscribe()
    this.window.send('onload', this.i18n)

    if (!this.vaultManager.vaultExists()) return this.showSetup()

    return this.showAuth()
  }

  /**
   * Application Events
   */
  setupWindowEvents() {
    this.window.on('close', () => {
      this.closed = true
      this.showAuth()
    })
    this.window.on('show', () => (this.closed = false))
    this.window.on('blur', () => {
      if (this.closed) return
      this.inactiveTimeout = setTimeout(() => {
        if (this.cryptor) this.showAuth()
      }, INACTIVE_TIMEOUT)
    })
    this.window.on('focus', () => clearTimeout(this.inactiveTimeout))
  }

  /**
   * Authentication and Setup
   */

  showAuth() {
    this.window.webContents.send('auth', this.isTouchIdAvailable())
  }

  showSetup() {
    this.window.webContents.send('setup')
  }

  authSuccess() {
    this.window.enlarge()
    this.window.send('auth:success', {
      sync: this.sync.isConfigured(),
      data: this.vaultManager.read(),
      platform: process.platform
    })
    trackAppEvent('Authenticate')
  }

  authFail() {
    this.window.send('auth:fail')
    this.showAuth()
  }

  getAudit() {
    const auditor = new Auditor(this.vaultManager.read(), this.cryptor)
    auditor.getAudit().then(data => {
      this.window.send('audit:done', { data })
    })
  }

  pullVaultData() {
    this.window.send('vault:pull:started')
    return this.sync
      .perform()
      .then(data => {
        this.getAudit()
        trackVaultEvent('Sync')
        this.window.send('vault:pull:stopped', {
          success: true,
          data: data
        })
      })
      .catch(error => {
        this.window.send('vault:pull:stopped', { success: false, error })
      })
  }

  isTouchIdAvailable() {
    return (
      this.cryptor &&
      process.platform === 'darwin' &&
      systemPreferences.canPromptTouchID()
    )
  }
}
