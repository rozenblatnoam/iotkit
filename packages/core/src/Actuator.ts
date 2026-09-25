import { EventBus } from "./EventBus.js";

export interface ActuatorOptions {
  id: string;
  type: string;
}

export class Actuator {
  readonly id: string;
  readonly type: string;

  private active = false;
  private readonly events = new EventBus();

  constructor(options: ActuatorOptions) {
    this.id = options.id;
    this.type = options.type;
  }

  turnOn(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.events.emit("stateChange", {
      active: true,
      actuator: this,
      timestamp: new Date()
    });
  }

  turnOff(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.events.emit("stateChange", {
      active: false,
      actuator: this,
      timestamp: new Date()
    });
  }

  isOn(): boolean {
    return this.active;
  }

  onStateChange(handler: (active: boolean) => void): () => void {
    return this.events.on("stateChange", (event: { active: boolean }) => {
      handler(event.active);
    });
  }
}
