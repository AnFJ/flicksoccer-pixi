import {noop} from './util'
import Image, {img} from './Image'
import {canvas} from './canvas'
import location from './location'
import document from './document'
import WebSocket from './WebSocket'
import navigator from './navigator'
import TouchEvent from './TouchEvent'
import XMLDocument from './XMLDocument'
import localStorage from './localStorage'
import * as performance from './performance'
import XMLHttpRequest from './XMLHttpRequest'
import {Element, HTMLCanvasElement, HTMLImageElement, HTMLVideoElement} from './element'
import minigame from './minigame'

const systemInfo = minigame.getSystemInfoSync()
const {platform, screenWidth, screenHeight, windowWidth, windowHeight, pixelRatio} = systemInfo

GameGlobal.canvas = canvas
canvas.addEventListener = document.addEventListener
canvas.removeEventListener = document.removeEventListener

// 修复: 将系统宽高注入到 canvas，确保 getBoundingClientRect 模拟值正确
canvas.width = windowWidth * pixelRatio
canvas.height = windowHeight * pixelRatio
if (canvas.style) {
    canvas.style.width = windowWidth + 'px'
    canvas.style.height = windowHeight + 'px'
}

if (platform === 'devtools') {
  Object.defineProperties(window, {
    Image: {value: Image},
    Element: {value: Element},
    ontouchstart: {value: noop},
    WebSocket: {value: WebSocket},
    addEventListener: {value: noop},
    TouchEvent: {value: TouchEvent},
    XMLDocument: {value: XMLDocument},
    localStorage: {value: localStorage},
    XMLHttpRequest: {value: XMLHttpRequest},
    HTMLVideoElement: {value: HTMLVideoElement},
    HTMLImageElement: {value: HTMLImageElement},
    HTMLCanvasElement: {value: HTMLCanvasElement},
  })

  for (const key in document) {
    const desc = Object.getOwnPropertyDescriptor(window.document, key)
    if (!desc || desc.configurable) {
      Object.defineProperty(window.document, key, {value: document[key]})
    }
  }
} else {
  GameGlobal.Image = Image
  GameGlobal.self = GameGlobal
  GameGlobal.window = GameGlobal
  GameGlobal.ontouchstart = noop
  GameGlobal.document = document
  GameGlobal.location = location
  GameGlobal.WebSocket = WebSocket
  GameGlobal.navigator = navigator
  GameGlobal.TouchEvent = TouchEvent
  GameGlobal.addEventListener = noop
  GameGlobal.performance = performance
  GameGlobal.XMLDocument = XMLDocument
  GameGlobal.removeEventListener = noop
  GameGlobal.localStorage = localStorage
  GameGlobal.XMLHttpRequest = XMLHttpRequest
  GameGlobal.HTMLImageElement = img.constructor.name !== 'Object' ? img.constructor : HTMLImageElement
  GameGlobal.HTMLVideoElement = HTMLVideoElement
  GameGlobal.HTMLCanvasElement = HTMLCanvasElement
  GameGlobal.WebGLRenderingContext = GameGlobal.WebGLRenderingContext || {}

  // [关键修复] 注入 window 尺寸，供 pixi-interaction.js 使用
  GameGlobal.innerWidth = windowWidth
  GameGlobal.innerHeight = windowHeight
  GameGlobal.devicePixelRatio = pixelRatio
  
  // 模拟 DOMParser，防止 BitmapFont 加载报错
  GameGlobal.DOMParser = class DOMParser {
      parseFromString(str) {
          return new XMLDocument(str);
      }
  }
}