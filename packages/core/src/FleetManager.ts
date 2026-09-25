import { Device } from "./Device.js";
import {
  DeviceRegistry
} from "./DeviceRegistry.js";

import type {
  DeviceRegistryEvent
} from "./DeviceRegistry.js";

import { EventBus } from "./EventBus.js";

export interface FleetManagerOptions {
  name?: string;
}

export interface FleetDeviceEvent {
  fleet: FleetManager;
  device: Device;
  timestamp: Date;
}

export interface FleetCommandEvent {
  fleet: FleetManager;
  device: Device;
  command: string;
  payload: unknown;
  timestamp: Date;
}

export class FleetManager {
  readonly name: string;

  readonly events =
    new EventBus();

  readonly registry:
    DeviceRegistry;

  constructor(
    options: FleetManagerOptions = {}
  ) {
    this.name =
      options.name ?? "default";

    this.registry =
      new DeviceRegistry();

    this.registry.events.on<DeviceRegistryEvent>(
      "device:registered",
      (event) => {
        this.events.emit(
          "device:registered",
          {
            fleet: this,
            device: event.device,
            timestamp: new Date()
          } satisfies FleetDeviceEvent
        );
      }
    );

    this.registry.events.on<DeviceRegistryEvent>(
      "device:unregistered",
      (event) => {
        this.events.emit(
          "device:unregistered",
          {
            fleet: this,
            device: event.device,
            timestamp: new Date()
          } satisfies FleetDeviceEvent
        );
      }
    );
  }

  register(
    device: Device
  ): void {
    this.registry.register(
      device
    );
  }

  unregister(
    deviceId: string
  ): boolean {
    return this.registry.unregister(
      deviceId
    );
  }

  get(
    deviceId: string
  ): Device | undefined {
    return this.registry.get(
      deviceId
    );
  }

  require(
    deviceId: string
  ): Device {
    const device =
      this.get(deviceId);

    if (
      device === undefined
    ) {
      throw new Error(
        `Device "${deviceId}" is not registered in fleet "${this.name}".`
      );
    }

    return device;
  }

  has(
    deviceId: string
  ): boolean {
    return this.registry.has(
      deviceId
    );
  }

  getAll(): Device[] {
    return this.registry.getAll();
  }

  findByType(
    type: string
  ): Device[] {
    return this.registry.findByType(
      type
    );
  }

  findByCapability(
    capabilityType: string
  ): Device[] {
    return this.registry.findByCapability(
      capabilityType
    );
  }

  find(
    predicate: (
      device: Device
    ) => boolean
  ): Device[] {
    return this.registry.find(
      predicate
    );
  }

  get size(): number {
    return this.registry.size;
  }

  async executeCommand<T = unknown>(
    deviceId: string,
    command: string,
    payload?: T
  ): Promise<void> {
    const device =
      this.require(deviceId);

    await device.execute(
      command,
      payload
    );

    this.events.emit(
      "command:executed",
      {
        fleet: this,
        device,
        command,
        payload,
        timestamp: new Date()
      } satisfies FleetCommandEvent
    );
  }

  getTwins() {
    return this.getAll().map(
      (device) =>
        device.getTwinSnapshot()
    );
  }

  clear(): void {
    this.registry.clear();
  }

  onDeviceRegistered(
    handler: (
      event: FleetDeviceEvent
    ) => void
  ): () => void {
    return this.events.on(
      "device:registered",
      handler
    );
  }

  onDeviceUnregistered(
    handler: (
      event: FleetDeviceEvent
    ) => void
  ): () => void {
    return this.events.on(
      "device:unregistered",
      handler
    );
  }

  onCommandExecuted(
    handler: (
      event: FleetCommandEvent
    ) => void
  ): () => void {
    return this.events.on(
      "command:executed",
      handler
    );
  }

  removeAllListeners(): void {
    this.events.removeAllListeners();
  }
}