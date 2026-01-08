
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

const {platform} = minigame.getSystemInfoSync()

GameGlobal.canvas = canvas
canvas.addEventListener = document.addEventListener
canvas.removeEventListener = document.removeEventListener

// [核心修复] 获取正确的 Image 构造函数
// new Image() 返回的是 minigame.createImage() 的实例
// 必须确保 window.HTMLImageElement 指向该实例的构造函数，这样 instance instanceof HTMLImageElement 才能为真
// element.js 中导出的 HTMLImageElement 是继承类，会导致 instanceof 检查失败
const RealHTMLImageElement = img.constructor;

if (platform === 'devtools') {
  Object.defineProperties(window, {
    Image: {value: Image},
    Element: {value: Element},
    ontouchstart: {value: noop},
    WebSocket: {value: WebSocket},
    addEventListener: {value: noop},
    removeEventListener: {value: noop}, 
    TouchEvent: {value: TouchEvent},
    XMLDocument: {value: XMLDocument},
    localStorage: {value: localStorage},
    XMLHttpRequest: {value: XMLHttpRequest},
    HTMLVideoElement: {value: HTMLVideoElement},
    // [修复] 使用真实的构造函数
    HTMLImageElement: {value: RealHTMLImageElement}, 
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
  GameGlobal.removeEventListener = noop
  GameGlobal.performance = performance
  GameGlobal.XMLDocument = XMLDocument
  GameGlobal.localStorage = localStorage
  GameGlobal.XMLHttpRequest = XMLHttpRequest
  // [修复] 优先使用真实的构造函数
  GameGlobal.HTMLImageElement = RealHTMLImageElement; 
  GameGlobal.HTMLVideoElement = HTMLVideoElement
  GameGlobal.HTMLCanvasElement = HTMLCanvasElement
  GameGlobal.WebGLRenderingContext = GameGlobal.WebGLRenderingContext || {}
}

if (typeof globalThis !== 'undefined') {
    if (!globalThis.addEventListener) globalThis.addEventListener = noop;
    if (!globalThis.removeEventListener) globalThis.removeEventListener = noop;
}
