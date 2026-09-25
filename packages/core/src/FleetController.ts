import { EventBus } from "./EventBus.js";
import type { CommandResultData, IotKitController } from "./Controller.js";
import type { MessageEnvelope } from "./Message.js";

export interface FleetTwinEvent {
  fleet: FleetController;
  deviceId: string;
  twin: MessageEnvelope<unknown>;
  firstSeen: boolean;
  timestamp: Date;
}

export interface FleetDeviceInfo {
  deviceId: string;
  twin: MessageEnvelope<unknown>;
}

export type FleetTwinPredicate<T = unknown> = (
  twin: MessageEnvelope<T>
) => boolean;

export class FleetController {
  readonly events = new EventBus();

  private readonly twins = new Map<string, MessageEnvelope<unknown>>();
  private readonly unsubscribeControllerTwin: () => void;

  private connected = false;

  constructor(
    private readonly controller: IotKitController
  ) {
    this.unsubscribeControllerTwin = this.controller.onTwin(
      (twin: MessageEnvelope<unknown>) => {
        const firstSeen = !this.twins.has(twin.deviceId);

        this.twins.set(twin.deviceId, twin);

        this.events.emit("twin", {
          fleet: this,
          deviceId: twin.deviceId,
          twin,
          firstSeen,
          timestamp: new Date()
        } satisfies FleetTwinEvent);
      }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.controller.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.controller.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Returns all devices discovered through Twin messages.
   */
  list(): string[] {
    return Array.from(this.twins.keys());
  }

  /**
   * Alias with a more explicit name.
   */
  listDevices(): string[] {
    return this.list();
  }

  /**
   * Returns all known devices with their latest Twin.
   */
  getDevices(): FleetDeviceInfo[] {
    return Array.from(this.twins.entries()).map(
      ([deviceId, twin]) => ({
        deviceId,
        twin
      })
    );
  }

  /**
   * Returns the latest Twin received for a device.
   */
  getTwin<T = unknown>(
    deviceId: string
  ): MessageEnvelope<T> | undefined {
    return this.twins.get(deviceId) as MessageEnvelope<T> | undefined;
  }

  /**
   * Returns the Twin or throws when the device is unknown.
   */
  requireTwin<T = unknown>(
    deviceId: string
  ): MessageEnvelope<T> {
    const twin = this.getTwin<T>(deviceId);

    if (twin === undefined) {
      throw new Error(
        `Device "${deviceId}" is not known to the fleet.`
      );
    }

    return twin;
  }

  /**
   * Sends a remote command and waits for its command-result.
   */
  async command<TPayload = unknown, TResult = unknown>(
    deviceId: string,
    command: string,
    payload?: TPayload,
    timeoutMs?: number
  ): Promise<MessageEnvelope<CommandResultData<TResult>>> {
    return this.controller.sendCommand<TPayload, TResult>(
      deviceId,
      command,
      payload,
      timeoutMs
    );
  }

  /**
   * Waits until a device is discovered through a Twin message.
   */
  async waitForDevice(
    deviceId: string,
    timeoutMs = 5000
  ): Promise<MessageEnvelope<unknown>> {
    return this.waitForTwin(deviceId, undefined, timeoutMs);
  }

  /**
   * Waits for a Twin matching an optional predicate.
   */
  async waitForTwin<T = unknown>(
    deviceId: string,
    predicate?: FleetTwinPredicate<T>,
    timeoutMs = 5000
  ): Promise<MessageEnvelope<T>> {
    const existing = this.getTwin<T>(deviceId);

    if (
      existing !== undefined &&
      (predicate === undefined || predicate(existing))
    ) {
      return existing;
    }

    return new Promise<MessageEnvelope<T>>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (
        callback: () => void
      ): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }

        unsubscribe();
        callback();
      };

      const unsubscribe = this.onTwin((event) => {
        if (event.deviceId !== deviceId) {
          return;
        }

        const twin = event.twin as MessageEnvelope<T>;

        if (
          predicate !== undefined &&
          !predicate(twin)
        ) {
          return;
        }

        finish(() => {
          resolve(twin);
        });
      });

      timer = setTimeout(() => {
        finish(() => {
          reject(
            new Error(
              `Timed out waiting for Twin of device "${deviceId}".`
            )
          );
        });
      }, timeoutMs);
    });
  }

  onTwin(
    handler: (event: FleetTwinEvent) => void
  ): () => void {
    return this.events.on("twin", handler);
  }

  onDeviceDiscovered(
    handler: (event: FleetTwinEvent) => void
  ): () => void {
    return this.events.on("twin", (event: FleetTwinEvent) => {
      if (event.firstSeen) {
        handler(event);
      }
    });
  }

  clearCache(): void {
    this.twins.clear();
  }

  dispose(): void {
    this.unsubscribeControllerTwin();
    this.events.removeAllListeners();
    this.twins.clear();
  }
}