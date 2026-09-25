import { EventBus } from "./EventBus.js";

export interface SensorOptions {
  id: string;
  type: string;
  unit?: string;
}

export interface SensorChangeEvent<T> {
  value: T;
  previousValue: T | undefined;
  sensor: Sensor<T>;
  timestamp: Date;
}

export class Sensor<T = number> {
  readonly id: string;
  readonly type: string;
  readonly unit: string | undefined;

  private value: T | undefined;

  private readonly events =
    new EventBus();

  constructor(
    options: SensorOptions
  ) {
    this.id = options.id;
    this.type = options.type;
    this.unit = options.unit;
  }

  // --------------------------------------------------
  // Value
  // --------------------------------------------------

  setValue(
    value: T
  ): void {
    const previousValue =
      this.value;

    this.value = value;

    this.events.emit<
      SensorChangeEvent<T>
    >(
      "change",
      {
        value,
        previousValue,
        sensor: this,
        timestamp: new Date()
      }
    );
  }

  getValue(): T | undefined {
    return this.value;
  }

  hasValue(): boolean {
    return this.value !== undefined;
  }

  // --------------------------------------------------
  // Events
  // --------------------------------------------------

  onChange(
    handler: (
      value: T,
      previousValue: T | undefined
    ) => void
  ): () => void {
    return this.events.on<
      SensorChangeEvent<T>
    >(
      "change",
      (
        event: SensorChangeEvent<T>
      ) => {
        handler(
          event.value,
          event.previousValue
        );
      }
    );
  }

  on<TPayload = unknown>(
    event: string,
    handler: (
      payload: TPayload
    ) => void
  ): () => void {
    return this.events.on<TPayload>(
      event,
      handler
    );
  }

  removeAllListeners(): void {
    this.events.removeAllListeners();
  }
}