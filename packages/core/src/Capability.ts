export interface CapabilityOptions {
  id: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export class Capability {
  readonly id: string;
  readonly type: string;
  readonly metadata:
    Record<string, unknown>;

  constructor(
    options: CapabilityOptions
  ) {
    this.id = options.id;
    this.type = options.type;
    this.metadata =
      options.metadata ?? {};
  }

  getMetadata<T = unknown>(
    key: string
  ): T | undefined {
    return this.metadata[
      key
    ] as T | undefined;
  }

  setMetadata<T>(
    key: string,
    value: T
  ): void {
    this.metadata[key] = value;
  }

  getMetadataSnapshot():
    Record<string, unknown> {
    return {
      ...this.metadata
    };
  }
}