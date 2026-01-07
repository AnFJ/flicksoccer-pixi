
import minigame from './minigame'

function Canvas() {
  const canvas = minigame.createCanvas()
  canvas.style = {cursor: null}
  return canvas
}

const canvas = new Canvas()

export {
  canvas,
  Canvas
}
