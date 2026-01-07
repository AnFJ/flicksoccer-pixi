
import minigame from './minigame'

export default function() {
    const video = minigame.createVideo({width: 0, height: 0, controls: false})
    video.canPlayType = () => {
        return true;
    }
    return video
  }
