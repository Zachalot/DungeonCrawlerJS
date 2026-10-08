import { DAMAGE_NUMBER_TIME, SWING_EFFECT_TIME } from "../config.js";

/** Short-lived visuals: floating damage numbers, sword swings, impact puffs. */
export class Effects {
  constructor() {
    this.texts = [];
    this.swings = [];
    this.puffs = [];
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color, age: 0, life: DAMAGE_NUMBER_TIME });
  }

  addSwing(x, y, angle, radius, arc) {
    this.swings.push({ x, y, angle, radius, arc, age: 0, life: SWING_EFFECT_TIME });
  }

  addPuff(x, y, color) {
    this.puffs.push({ x, y, color, age: 0, life: 0.25 });
  }

  update(dt) {
    for (const list of [this.texts, this.swings, this.puffs]) {
      for (const e of list) e.age += dt;
    }
    this.texts = this.texts.filter((e) => e.age < e.life);
    this.swings = this.swings.filter((e) => e.age < e.life);
    this.puffs = this.puffs.filter((e) => e.age < e.life);
  }

  clear() {
    this.texts = [];
    this.swings = [];
    this.puffs = [];
  }
}
