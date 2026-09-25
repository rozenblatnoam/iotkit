import { Device } from "../src/Device.js";
import { Sensor } from "../src/Sensor.js";
import { Capability } from "../src/Capability.js";
import { Rule } from "../src/Rule.js";

export type EvoMaxFlightMode =
  | "idle"
  | "armed"
  | "flying"
  | "returning"
  | "landing";

export interface EvoMaxPosition {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface EvoMaxSimulatorOptions {
  id?: string;
  name?: string;
  initialBattery?: number;
  initialLatitude?: number;
  initialLongitude?: number;
  initialAltitude?: number;
}

export class EvoMaxSimulator {
  readonly device: Device;

  readonly battery: Sensor<number>;
  readonly altitude: Sensor<number>;
  readonly speed: Sensor<number>;
  readonly heading: Sensor<number>;
  readonly position: Sensor<EvoMaxPosition>;

  private flightMode: EvoMaxFlightMode =
    "idle";

  private armed = false;

  constructor(
    options: EvoMaxSimulatorOptions = {}
  ) {
    // --------------------------------------------------
    // Device
    // --------------------------------------------------

    this.device = new Device({
      id:
        options.id ??
        "evo-max-sim-01",

      name:
        options.name ??
        "Autel EVO Max Simulator",

      type: "uav"
    });

    // --------------------------------------------------
    // Sensors
    // --------------------------------------------------

    this.battery =
      new Sensor<number>({
        id: "battery",
        type: "battery",
        unit: "%"
      });

    this.altitude =
      new Sensor<number>({
        id: "altitude",
        type: "altitude",
        unit: "m"
      });

    this.speed =
      new Sensor<number>({
        id: "speed",
        type: "speed",
        unit: "m/s"
      });

    this.heading =
      new Sensor<number>({
        id: "heading",
        type: "heading",
        unit: "°"
      });

    this.position =
      new Sensor<EvoMaxPosition>({
        id: "position",
        type: "gps"
      });

    // --------------------------------------------------
    // Register Sensors
    // --------------------------------------------------

    this.device
      .addSensor(this.battery)
      .addSensor(this.altitude)
      .addSensor(this.speed)
      .addSensor(this.heading)
      .addSensor(this.position);

    // --------------------------------------------------
    // Capabilities
    // --------------------------------------------------

    this.device
      .addCapability(
        new Capability({
          id: "gps",
          type: "gps",
          metadata: {
            simulated: true
          }
        })
      )
      .addCapability(
        new Capability({
          id: "battery",
          type: "battery",
          metadata: {
            simulated: true
          }
        })
      )
      .addCapability(
        new Capability({
          id: "flight",
          type: "flight",
          metadata: {
            simulated: true
          }
        })
      )
      .addCapability(
        new Capability({
          id: "camera",
          type: "camera",
          metadata: {
            simulated: true
          }
        })
      );

    // --------------------------------------------------
    // Commands
    // --------------------------------------------------

    this.device.addCommand(
      "arm",
      () => {
        this.arm();
      },
      "Arm the UAV"
    );

    this.device.addCommand(
      "disarm",
      () => {
        this.disarm();
      },
      "Disarm the UAV"
    );

    this.device.addCommand(
      "takeoff",
      (payload?: unknown) => {
        const altitude =
          this.extractNumber(
            payload,
            10
          );

        this.takeoff(
          altitude
        );
      },
      "Take off to the requested altitude"
    );

    this.device.addCommand(
      "land",
      () => {
        this.land();
      },
      "Land the UAV"
    );

    this.device.addCommand(
      "return-home",
      () => {
        this.returnHome();
      },
      "Return to home position"
    );

    // --------------------------------------------------
    // Autonomous Rules
    // --------------------------------------------------

    const lowBatteryRule =
      new Rule({
        id: "low-battery-return-home",

        name:
          "Return home when battery is critically low",

        trigger:
          "sensor:change",

        mode:
          "rising",

        condition: ({
          event
        }) => {
          const sensorEvent =
            event as {
              sensor:
                Sensor<number>;
              value: number;
            };

          return (
            sensorEvent.sensor.id ===
              "battery" &&
            sensorEvent.value < 20
          );
        },

        action: () => {
          this.returnHome();
        }
      });

    this.device.addRule(
      lowBatteryRule
    );

    // --------------------------------------------------
    // Initial Values
    // --------------------------------------------------

    const initialBattery =
      this.clamp(
        options.initialBattery ?? 100,
        0,
        100
      );

    const initialAltitude =
      options.initialAltitude ?? 0;

    const initialLatitude =
      options.initialLatitude ?? 32.0000;

    const initialLongitude =
      options.initialLongitude ?? 34.8000;

    this.battery.setValue(
      initialBattery
    );

    this.altitude.setValue(
      initialAltitude
    );

    this.speed.setValue(0);

    this.heading.setValue(0);

    this.position.setValue({
      latitude:
        initialLatitude,

      longitude:
        initialLongitude,

      altitude:
        initialAltitude
    });

    this.updateState();
  }

  // --------------------------------------------------
  // Lifecycle
  // --------------------------------------------------

  start(): void {
    this.device.start();
  }

  stop(): void {
    this.device.stop();
  }

  // --------------------------------------------------
  // Flight
  // --------------------------------------------------

  arm(): void {
    if (this.armed) {
      return;
    }

    this.armed = true;

    this.flightMode =
      "armed";

    this.updateState();
  }

  disarm(): void {
    if (!this.armed) {
      return;
    }

    const currentAltitude =
      this.altitude.getValue() ?? 0;

    if (
      currentAltitude > 0
    ) {
      throw new Error(
        "Cannot disarm while the UAV is airborne"
      );
    }

    this.armed = false;

    this.flightMode =
      "idle";

    this.updateState();
  }

  takeoff(
    targetAltitude = 10
  ): void {
    if (!this.armed) {
      throw new Error(
        "Cannot take off: UAV is not armed"
      );
    }

    if (
      targetAltitude <= 0
    ) {
      throw new Error(
        "Target altitude must be greater than 0"
      );
    }

    this.flightMode =
      "flying";

    this.altitude.setValue(
      targetAltitude
    );

    this.speed.setValue(3);

    const position =
      this.position.getValue();

    if (position) {
      this.position.setValue({
        ...position,
        altitude:
          targetAltitude
      });
    }

    this.updateState();
  }

  land(): void {
    this.flightMode =
      "landing";

    this.updateState();

    this.altitude.setValue(0);

    this.speed.setValue(0);

    const position =
      this.position.getValue();

    if (position) {
      this.position.setValue({
        ...position,
        altitude: 0
      });
    }

    this.flightMode =
      this.armed
        ? "armed"
        : "idle";

    this.updateState();
  }

  returnHome(): void {
    this.flightMode =
      "returning";

    this.speed.setValue(5);

    this.updateState();

    this.device.reportTelemetry(
      "returnHome",
      true,
      {
        metadata: {
          source:
            "evo-max-simulator",
          reason:
            "low-battery-or-command"
        }
      }
    );
  }

  // --------------------------------------------------
  // Simulation
  // --------------------------------------------------

  simulateFlight(
    altitude: number,
    speed: number,
    heading: number
  ): void {
    if (!this.armed) {
      throw new Error(
        "Cannot simulate flight: UAV is not armed"
      );
    }

    if (
      altitude < 0
    ) {
      throw new Error(
        "Altitude cannot be negative"
      );
    }

    this.flightMode =
      altitude > 0
        ? "flying"
        : "armed";

    this.altitude.setValue(
      altitude
    );

    this.speed.setValue(
      speed
    );

    this.heading.setValue(
      heading
    );

    const position =
      this.position.getValue();

    if (position) {
      this.position.setValue({
        ...position,
        altitude
      });
    }

    this.updateState();
  }

  setBattery(
    value: number
  ): void {
    this.battery.setValue(
      this.clamp(
        value,
        0,
        100
      )
    );
  }

  setPosition(
    latitude: number,
    longitude: number,
    altitude?: number
  ): void {
    const currentAltitude =
      this.altitude.getValue() ?? 0;

    const nextAltitude =
      altitude ??
      currentAltitude;

    this.position.setValue({
      latitude,
      longitude,
      altitude:
        nextAltitude
    });

    this.altitude.setValue(
      nextAltitude
    );
  }

  // --------------------------------------------------
  // State
  // --------------------------------------------------

  isArmed(): boolean {
    return this.armed;
  }

  getFlightMode():
    EvoMaxFlightMode {
    return this.flightMode;
  }

  getPosition():
    EvoMaxPosition | undefined {
    return this.position.getValue();
  }

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  private updateState(): void {
    this.device
      .setState(
        "armed",
        this.armed
      )
      .setState(
        "flightMode",
        this.flightMode
      );
  }

  private extractNumber(
    payload: unknown,
    fallback: number
  ): number {
    if (
      typeof payload ===
      "number"
    ) {
      return payload;
    }

    if (
      typeof payload ===
        "object" &&
      payload !== null
    ) {
      const value =
        (
          payload as {
            altitude?: unknown;
          }
        ).altitude;

      if (
        typeof value ===
        "number"
      ) {
        return value;
      }
    }

    return fallback;
  }

  private clamp(
    value: number,
    min: number,
    max: number
  ): number {
    return Math.min(
      Math.max(
        value,
        min
      ),
      max
    );
  }
}