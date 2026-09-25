import { EventBus } from "./EventBus.js";
import { Device } from "./Device.js";

export interface DeviceRegistryEvent {
  device: Device;
  timestamp: Date;
}

export class DeviceRegistry {
  private readonly devices =
    new Map<string, Device>();

  readonly events =
    new EventBus();

  // --------------------------------------------------
  // Registration
  // --------------------------------------------------

  register(
    device: Device
  ): this {
    if (
      this.devices.has(device.id)
    ) {
      throw new Error(
        `Device "${device.id}" already exists in registry`
      );
    }

    this.devices.set(
      device.id,
      device
    );

    this.events.emit<DeviceRegistryEvent>(
      "device:registered",
      {
        device,
        timestamp: new Date()
      }
    );

    return this;
  }

  unregister(
    id: string
  ): boolean {
    const device =
      this.devices.get(id);

    if (!device) {
      return false;
    }

    this.devices.delete(id);

    this.events.emit<DeviceRegistryEvent>(
      "device:unregistered",
      {
        device,
        timestamp: new Date()
      }
    );

    return true;
  }

  // --------------------------------------------------
  // Lookup
  // --------------------------------------------------

  get(
    id: string
  ): Device | undefined {
    return this.devices.get(id);
  }

  has(
    id: string
  ): boolean {
    return this.devices.has(id);
  }

  getAll(): Device[] {
    return Array.from(
      this.devices.values()
    );
  }

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  findByType(
    type: string
  ): Device[] {
    return this.getAll().filter(
      (device) =>
        device.type === type
    );
  }

  findByCapability(
    capabilityId: string
  ): Device[] {
    return this.getAll().filter(
      (device) =>
        device.hasCapability(
          capabilityId
        )
    );
  }

  find(
    predicate: (
      device: Device
    ) => boolean
  ): Device[] {
    return this.getAll().filter(
      predicate
    );
  }

  // --------------------------------------------------
  // Registry state
  // --------------------------------------------------

  get size(): number {
    return this.devices.size;
  }

  clear(): void {
    const devices =
      this.getAll();

    this.devices.clear();

    for (
      const device of devices
    ) {
      this.events.emit<DeviceRegistryEvent>(
        "device:unregistered",
        {
          device,
          timestamp: new Date()
        }
      );
    }
  }
}