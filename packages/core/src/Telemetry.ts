import { EventBus } from "./EventBus.js";

export interface TelemetryOptions {
  unit?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface TelemetryRecord<T = unknown> {
  key: string;
  value: T;
  unit?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export class TelemetryManager {
  private readonly readings =
    new Map<string, TelemetryRecord>();

  readonly events =
    new EventBus();

  // --------------------------------------------------
  // Report
  // --------------------------------------------------

  report<T>(
    key: string,
    value: T,
    options: TelemetryOptions = {}
  ): void {
    const baseRecord:
      TelemetryRecord<T> = {
      key,
      value,
      timestamp:
        options.timestamp ?? new Date(),
      metadata: {
        ...(options.metadata ?? {})
      }
    };

    const record:
      TelemetryRecord<T> =
      options.unit !== undefined
        ? {
            ...baseRecord,
            unit: options.unit
          }
        : baseRecord;

    this.readings.set(
      key,
      record
    );

    this.events.emit(
      "report",
      record
    );
  }

  // --------------------------------------------------
  // Read
  // --------------------------------------------------

  get<T = unknown>(
    key: string
  ): TelemetryRecord<T> | undefined {
    return this.readings.get(
      key
    ) as TelemetryRecord<T> | undefined;
  }

  getValue<T = unknown>(
    key: string
  ): T | undefined {
    return this.get<T>(
      key
    )?.value;
  }

  has(
    key: string
  ): boolean {
    return this.readings.has(key);
  }

  getAll(): TelemetryRecord[] {
    return Array.from(
      this.readings.values()
    );
  }

  // --------------------------------------------------
  // Remove
  // --------------------------------------------------

  delete(
    key: string
  ): boolean {
    return this.readings.delete(
      key
    );
  }

  clear(): void {
    this.readings.clear();
  }

  // --------------------------------------------------
  // Events
  // --------------------------------------------------

  onReport(
    handler: (
      record: TelemetryRecord
    ) => void
  ): () => void {
    return this.events.on(
      "report",
      handler
    );
  }
}