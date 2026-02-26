import Matter from 'matter-js';
import EventBus from '../../../managers/EventBus.js';
import { Events, TeamId } from '../../../constants.js';
import { GameConfig } from '../../../config.js';

export default class LiveFlickRules {
  constructor(physicsEngine, scene) {
    this.engine = physicsEngine.engine;
    this.scene = scene; 
    this.score = {
      [TeamId.LEFT]: 0,
      [TeamId.RIGHT]: 0
    };
    
    this.isGoalProcessing = false; 
    this.lastGoalTime = 0;
    
    this.collisionHandler = (event) => this.onCollisionStart(event);
    this.initCollisionEvents();
  }

  initCollisionEvents() {
    if (this.engine) {
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler);
    }
  }

  destroy() {
      if (this.engine) {
          Matter.Events.off(this.engine, 'collisionStart', this.collisionHandler);
      }
      this.engine = null;
      this.scene = null;
  }

  onCollisionStart(event) {
      const pairs = event.pairs;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        if (!this.isGoalProcessing) {
            this.checkGoal(bodyA, bodyB);
        }
        
        this.checkNetCollision(bodyA, bodyB);
        this.checkStrikerBallCollision(pair);
        this.checkSoundEffects(pair);
      }
  }

  checkSoundEffects(pair) {
      const { bodyA, bodyB } = pair;
      
      const relativeVelocity = Matter.Vector.sub(bodyA.velocity, bodyB.velocity);
      const intensity = Matter.Vector.magnitude(relativeVelocity);

      const SOUND_THRESHOLD = 1.0; 

      if (intensity < SOUND_THRESHOLD) return;

      const labels = [bodyA.label, bodyB.label];

      if (labels.includes('Ball') && labels.includes('Striker')) {
          return;
      }

      if (labels.includes('Ball')) {
          const other = bodyA.label === 'Ball' ? bodyB : bodyA;
          if (other.label && other.label.includes('Wall')) {
              EventBus.emit(Events.PLAY_SOUND, 'hit_wall');
              return;
          }
      }

      if (labels.includes('Striker')) {
          const other = bodyA.label === 'Striker' ? bodyB : bodyA;
          if (other.label && (other.label.includes('Wall') || other.label.includes('GoalNet'))) {
              EventBus.emit(Events.PLAY_SOUND, 'striker_hit_edge');
              return;
          }
      }

      if (labels.includes('Striker') && labels.includes('Striker')) {
          EventBus.emit(Events.PLAY_SOUND, 'striker_hit_striker');
          return;
      }
  }

  checkStrikerBallCollision(pair) {
      const { bodyA, bodyB } = pair;
      const isBall = bodyA.label === 'Ball' || bodyB.label === 'Ball';
      const isStriker = bodyA.label === 'Striker' || bodyB.label === 'Striker';

      if (isBall && isStriker) {
          const ballBody = bodyA.label === 'Ball' ? bodyA : bodyB;
          const strikerBody = bodyA.label === 'Striker' ? bodyA : bodyB;

          const relativeVelocity = Matter.Vector.sub(strikerBody.velocity, ballBody.velocity);
          const intensity = Matter.Vector.magnitude(relativeVelocity);

          if (intensity > 2) {
              EventBus.emit(Events.PLAY_SOUND, 'hit_ball');
              EventBus.emit(Events.COLLISION_HIT, {
                  x: ballBody.position.x,
                  y: ballBody.position.y,
                  intensity: intensity
              });
          }
      }
  }

  checkNetCollision(bodyA, bodyB) {
      const isBall = bodyA.label === 'Ball' || bodyB.label === 'Ball';
      const isNet = bodyA.label === 'GoalNet' || bodyB.label === 'GoalNet';

      if (isBall && isNet) {
          const ballBody = bodyA.label === 'Ball' ? bodyA : bodyB;
          Matter.Body.setVelocity(ballBody, {
              x: ballBody.velocity.x * 0.5,
              y: ballBody.velocity.y * 0.5
          });
      }
  }

  checkGoal(bodyA, bodyB) {
      const isBall = bodyA.label === 'Ball' || bodyB.label === 'Ball';
      const isGoalSensor = bodyA.label === 'GoalSensor' || bodyB.label === 'GoalSensor';

      if (isBall && isGoalSensor) {
          const sensorBody = bodyA.label === 'GoalSensor' ? bodyA : bodyB;
          const ballBody = bodyA.label === 'Ball' ? bodyA : bodyB;
          
          // Get the Goal entity from the sensor body
          // The sensor body was created in Goal.js and has .entity property attached
          const goalEntity = sensorBody.entity;
          
          if (!goalEntity) return;

          const now = Date.now();
          if (now - this.lastGoalTime < 2000) return;
          this.lastGoalTime = now;

          this.isGoalProcessing = true;

          // Goal entity has ownerTeamId, so if ball hits LEFT goal sensor, RIGHT team scores
          const scoringTeam = goalEntity.ownerTeamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
          this.score[scoringTeam]++;

          EventBus.emit(Events.GOAL_SCORED, {
              scoreTeam: scoringTeam,
              newScore: { ...this.score },
              ballPos: { x: ballBody.position.x, y: ballBody.position.y }
          });

          if (this.score[TeamId.LEFT] >= GameConfig.gameplay.maxScore) {
              EventBus.emit(Events.GAME_OVER, { winner: TeamId.LEFT });
          } else if (this.score[TeamId.RIGHT] >= GameConfig.gameplay.maxScore) {
              EventBus.emit(Events.GAME_OVER, { winner: TeamId.RIGHT });
          }
      }
  }

  resetProcessingState() {
      this.isGoalProcessing = false;
  }
}
