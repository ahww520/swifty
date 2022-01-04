import Storage from 'application/storage'

export const vaultFile = () => {
  if (process.env.SPECTRON_STORAGE_PATH) {
    return process.env.SPECTRON_STORAGE_PATH
  }
  if (!process.env.APP_ENV || process.env.APP_ENV === 'production') {
    return 'vault.swftx'
  }
  return `vault_${process.env.APP_ENV}.swftx`
}

export default class LegacyVault {
  constructor() {
    this.storage = new Storage(vaultFile())
  }

  authenticate(cryptor) {
    return this.isDecryptable(this.read(), cryptor)
  }

  setup(cryptor) {
    return this.storage.write(cryptor.encryptData({ entries: [] }))
  }

  isPristine() {
    return this.read() === ''
  }

  isDecryptable(data, cryptor) {
    try {
      return !!cryptor.decryptData(data)
    } catch (e) {
      return false
    }
  }

  write(data) {
    return this.storage.write(data)
  }

  read() {
    return this.storage.read()
  }

  import(path, cryptor) {
    const data = this.storage.import(path)
    if (this.isDecryptable(data, cryptor)) {
      return this.storage.write(data)
    }
    return false
  }

  export(filepath) {
    return this.storage.export(filepath)
  }
}
