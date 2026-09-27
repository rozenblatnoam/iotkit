import { EventBus } from "./EventBus.js";

export interface StateChangeEvent<T = unknown> {
  key: string;
  value: T;
  previousValue: T | undefined;
  timestamp: Date;
}

export class StateManager {
  private readonly values =
    new Map<string, unknown>();

  readonly events =
    new EventBus();

  set<T>(
    key: string,
    value: T
  ): boolean {
    const hasPrevious =
      this.values.has(key);

    const previousValue =
      this.values.get(key) as T | undefined;

    // Ignore no-op state updates.
    if (
      hasPrevious &&
      Object.is(previousValue, value)
    ) {
      return false;
    }

    this.values.set(
      key,
      value
    );

    this.events.emit(
      "change",
      {
        key,
        value,
        previousValue,
        timestamp: new Date()
      } satisfies StateChangeEvent<T>
    );

    return true;
  }

  get<T = unknown>(
    key: string
  ): T | undefined {
    return this.values.get(
      key
    ) as T | undefined;
  }

  has(
    key: string
  ): boolean {
    return this.values.has(
      key
    );
  }

  delete(
    key: string
  ): boolean {
    if (!this.values.has(key)) {
      return false;
    }

    const previousValue =
      this.values.get(key);

    this.values.delete(key);

    this.events.emit(
      "change",
      {
        key,
        value: undefined,
        previousValue,
        timestamp: new Date()
      } satisfies StateChangeEvent
    );

    return true;
  }

  clear(): void {
    for (
      const [
        key,
        previousValue
      ] of this.values
    ) {
      this.values.delete(key);

      this.events.emit(
        "change",
        {
          key,
          value: undefined,
          previousValue,
          timestamp: new Date()
        } satisfies StateChangeEvent
      );
    }
  }

  getAll(): Record<string, unknown> {
    const result:
      Record<string, unknown> = {};

    for (
      const [
        key,
        value
      ] of this.values
    ) {
      result[key] = value;
    }

    return result;
  }

  getKeys(): string[] {
    return Array.from(
      this.values.keys()
    );
  }

  onChange(
    handler: (
      event: StateChangeEvent
    ) => void
  ): () => void {
    return this.events.on(
      "change",
      handler
    );
  }

  on<T = unknown>(
    event: string,
    handler: (
      payload: T
    ) => void
  ): () => void {
    return this.events.on(
      event,
      handler
    );
  }

  removeAllListeners(): void {
    this.events.removeAllListeners();
  }
}
