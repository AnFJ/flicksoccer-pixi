
import document from './document'
import {noop} from './util'
import {canvas} from './canvas'
import minigame from './minigame'

class TouchEvent {
  preventDefault = noop
  stopPropagation = noop
  target = canvas
  currentTarget = canvas

  constructor(type) {
    this.type = type
  }
}

function factory(type) {
  return ev => {
    const touchEvent = new TouchEvent(type)
    touchEvent.touches =
    touchEvent.targetTouches = ev.touches
    touchEvent.changedTouches = ev.changedTouches
    touchEvent.timeStamp = ev.timeStamp
    document.dispatch(touchEvent)
  }
}

minigame.onTouchStart(factory('touchstart'))
minigame.onTouchMove(factory('touchmove'))
minigame.onTouchEnd(factory('touchend'))
minigame.onTouchCancel(factory('touchcancel'))

export default TouchEvent
