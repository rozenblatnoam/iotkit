export type EventHandler<T = unknown> = (
  payload: T
) => void;

export class EventBus {
  private listeners = new Map<
    string,
    Set<EventHandler>
  >();

  on<T>(
    event: string,
    handler: EventHandler<T>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(
        event,
        new Set<EventHandler>()
      );
    }

    this.listeners
      .get(event)!
      .add(handler as EventHandler);

    return () => {
      this.off(event, handler);
    };
  }

  off<T>(
    event: string,
    handler: EventHandler<T>
  ): void {
    this.listeners
      .get(event)
      ?.delete(handler as EventHandler);
  }

  emit<T>(
    event: string,
    payload: T
  ): void {
    const handlers = this.listeners.get(event);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}