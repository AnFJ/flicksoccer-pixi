
import minigame from './minigame'

export default {
  getItem(key) {
    return minigame.getStorageSync(key)
  },

  setItem(key, val) {
    return minigame.setStorageSync(key, val)
  },

  clear() {
    minigame.clearStorageSync()
  }
}
