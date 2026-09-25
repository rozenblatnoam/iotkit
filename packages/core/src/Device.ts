import { EventBus } from "./EventBus.js";
import { Sensor } from "./Sensor.js";
import { Actuator } from "./Actuator.js";

import {
  Command
} from "./Command.js";

import type {
  CommandHandler
} from "./Command.js";

import {
  StateManager
} from "./State.js";

import type {
  StateChangeEvent
} from "./State.js";

import {
  Capability
} from "./Capability.js";

import {
  Rule
} from "./Rule.js";

import type {
  RuleContext
} from "./Rule.js";

import {
  TelemetryManager
} from "./Telemetry.js";

import type {
  TelemetryRecord
} from "./Telemetry.js";

export interface DeviceOptions {
  id: string;
  name?: string;
  type?: string;
}

export interface DeviceTwinSnapshot {
  id: string;
  name: string;
  type: string;
  running: boolean;

  sensors: Array<{
    id: string;
    type: string;
    unit?: string;
    value: unknown;
  }>;

  actuators: Array<{
    id: string;
    type: string;
    active: boolean;
  }>;

  capabilities: Array<{
    id: string;
    type: string;
    metadata: Record<string, unknown>;
  }>;

  state: Record<string, unknown>;

  telemetry: TelemetryRecord[];
}

export class Device {
  readonly id: string;
  readonly name: string;
  readonly type: string;

  private readonly sensors =
    new Map<string, Sensor<any>>();

  private readonly actuators =
    new Map<string, Actuator>();

  private readonly commands =
    new Map<string, Command<any>>();

  private readonly capabilities =
    new Map<string, Capability>();

  private readonly rules =
    new Map<string, Rule>();

  readonly events =
    new EventBus();

  readonly state =
    new StateManager();

  readonly telemetry =
    new TelemetryManager();

  private running = false;

  // --------------------------------------------------
  // Rule execution queue
  // --------------------------------------------------

  private ruleQueue: Promise<void> =
    Promise.resolve();

  constructor(
    options: DeviceOptions
  ) {
    this.id = options.id;

    this.name =
      options.name ?? options.id;

    this.type =
      options.type ?? "generic";

    // --------------------------------------------------
    // State events
    // --------------------------------------------------

    this.state.onChange(
      (
        event: StateChangeEvent<unknown>
      ) => {
        const stateEvent = {
          device: this,
          ...event
        };

        this.events.emit(
          "state:change",
          stateEvent
        );

        this.queueRuleEvaluation(
          stateEvent,
          "state:change"
        );
      }
    );

    // --------------------------------------------------
    // Telemetry events
    // --------------------------------------------------

    this.telemetry.onReport(
      (
        record: TelemetryRecord
      ) => {
        this.events.emit(
          "telemetry:report",
          {
            device: this,
            record,
            timestamp: new Date()
          }
        );
      }
    );
  }

  // --------------------------------------------------
  // Sensors
  // --------------------------------------------------

  addSensor<T>(
    sensor: Sensor<T>
  ): this {
    if (
      this.sensors.has(
        sensor.id
      )
    ) {
      throw new Error(
        `Sensor "${sensor.id}" already exists on device "${this.id}"`
      );
    }

    this.sensors.set(
      sensor.id,
      sensor
    );

    sensor.onChange(
      (
        value: T,
        previousValue: T | undefined
      ) => {
        const event = {
          device: this,
          sensor,
          value,
          previousValue,
          timestamp: new Date()
        };

        // Sensor event
        this.events.emit(
          "sensor:change",
          event
        );

        // Sensor -> Telemetry
        this.telemetry.report(
          sensor.id,
          value,
          {
            ...(sensor.unit !== undefined
              ? {
                  unit: sensor.unit
                }
              : {}),

            metadata: {
              type: sensor.type,
              sensorId: sensor.id
            }
          }
        );

        // Queue rule evaluation.
        this.queueRuleEvaluation(
          event,
          "sensor:change"
        );
      }
    );

    this.events.emit(
      "sensor:registered",
      {
        device: this,
        sensor,
        timestamp: new Date()
      }
    );

    return this;
  }

  getSensor<T = unknown>(
    id: string
  ): Sensor<T> | undefined {
    return this.sensors.get(
      id
    ) as Sensor<T> | undefined;
  }

  getSensors(): Sensor[] {
    return Array.from(
      this.sensors.values()
    );
  }

  // --------------------------------------------------
  // Actuators
  // --------------------------------------------------

  addActuator(
    actuator: Actuator
  ): this {
    if (
      this.actuators.has(
        actuator.id
      )
    ) {
      throw new Error(
        `Actuator "${actuator.id}" already exists on device "${this.id}"`
      );
    }

    this.actuators.set(
      actuator.id,
      actuator
    );

    actuator.onStateChange(
      (active: boolean) => {
        const event = {
          device: this,
          actuator,
          active,
          timestamp: new Date()
        };

        this.events.emit(
          "actuator:stateChange",
          event
        );

        // Queue actuator-related rules.
        this.queueRuleEvaluation(
          event,
          "actuator:stateChange"
        );
      }
    );

    this.events.emit(
      "actuator:registered",
      {
        device: this,
        actuator,
        timestamp: new Date()
      }
    );

    return this;
  }

  getActuator(
    id: string
  ): Actuator | undefined {
    return this.actuators.get(
      id
    );
  }

  getActuators(): Actuator[] {
    return Array.from(
      this.actuators.values()
    );
  }

  // --------------------------------------------------
  // Commands
  // --------------------------------------------------

  addCommand<T>(
    name: string,
    handler: CommandHandler<T>,
    description?: string
  ): this {
    if (
      this.commands.has(name)
    ) {
      throw new Error(
        `Command "${name}" already exists on device "${this.id}"`
      );
    }

    const command =
      new Command<T>({
        name,
        handler,
        ...(description !== undefined
          ? {
              description
            }
          : {})
      });

    this.commands.set(
      name,
      command
    );

    this.events.emit(
      "command:registered",
      {
        device: this,
        command,
        timestamp: new Date()
      }
    );

    return this;
  }

  getCommand<T = unknown>(
    name: string
  ): Command<T> | undefined {
    return this.commands.get(
      name
    ) as Command<T> | undefined;
  }

  getCommands(): Command[] {
    return Array.from(
      this.commands.values()
    );
  }

  async execute<T = unknown>(
    name: string,
    payload?: T
  ): Promise<void> {
    const command =
      this.commands.get(
        name
      );

    if (!command) {
      throw new Error(
        `Command "${name}" not found on device "${this.id}"`
      );
    }

    this.events.emit(
      "command:beforeExecute",
      {
        device: this,
        command,
        payload,
        timestamp: new Date()
      }
    );

    try {
      await command.execute(
        payload
      );

      this.events.emit(
        "command:executed",
        {
          device: this,
          command,
          payload,
          timestamp: new Date()
        }
      );
    } catch (error) {
      this.events.emit(
        "command:error",
        {
          device: this,
          command,
          payload,
          error,
          timestamp: new Date()
        }
      );

      throw error;
    }
  }

  // --------------------------------------------------
  // State
  // --------------------------------------------------

  setState<T>(
    key: string,
    value: T
  ): this {
    this.state.set(
      key,
      value
    );

    return this;
  }

  getState<T = unknown>(
    key: string
  ): T | undefined {
    return this.state.get<T>(
      key
    );
  }

  hasState(
    key: string
  ): boolean {
    return this.state.has(
      key
    );
  }

  deleteState(
    key: string
  ): boolean {
    return this.state.delete(
      key
    );
  }

  clearState(): void {
    this.state.clear();
  }

  getStateSnapshot():
    Record<string, unknown> {
    return this.state.getAll();
  }

  onStateChange(
    handler: (
      event: {
        device: Device;
        key: string;
        value: unknown;
        previousValue: unknown;
        timestamp: Date;
      }
    ) => void
  ): () => void {
    return this.events.on(
      "state:change",
      handler
    );
  }

  // --------------------------------------------------
  // Telemetry
  // --------------------------------------------------

  reportTelemetry<T>(
    key: string,
    value: T,
    options: {
      unit?: string;
      timestamp?: Date;
      metadata?: Record<string, unknown>;
    } = {}
  ): this {
    this.telemetry.report(
      key,
      value,
      options
    );

    return this;
  }

  getTelemetry<T = unknown>(
    key: string
  ): TelemetryRecord<T> | undefined {
    return this.telemetry.get<T>(
      key
    );
  }

  getTelemetryValue<T = unknown>(
    key: string
  ): T | undefined {
    return this.telemetry.getValue<T>(
      key
    );
  }

  getTelemetrySnapshot():
    TelemetryRecord[] {
    return this.telemetry.getAll();
  }

  onTelemetry(
    handler: (
      record: TelemetryRecord
    ) => void
  ): () => void {
    return this.events.on(
      "telemetry:report",
      (
        event: {
          device: Device;
          record: TelemetryRecord;
        }
      ) => {
        handler(
          event.record
        );
      }
    );
  }

  // --------------------------------------------------
  // Capabilities
  // --------------------------------------------------

  addCapability(
    capability: Capability
  ): this {
    if (
      this.capabilities.has(
        capability.id
      )
    ) {
      throw new Error(
        `Capability "${capability.id}" already exists on device "${this.id}"`
      );
    }

    this.capabilities.set(
      capability.id,
      capability
    );

    this.events.emit(
      "capability:registered",
      {
        device: this,
        capability,
        timestamp: new Date()
      }
    );

    return this;
  }

  getCapability(
    id: string
  ): Capability | undefined {
    return this.capabilities.get(
      id
    );
  }

  hasCapability(
    id: string
  ): boolean {
    return this.capabilities.has(
      id
    );
  }

  getCapabilities():
    Capability[] {
    return Array.from(
      this.capabilities.values()
    );
  }

  // --------------------------------------------------
  // Rules
  // --------------------------------------------------

  addRule(
    rule: Rule
  ): this {
    if (
      this.rules.has(
        rule.id
      )
    ) {
      throw new Error(
        `Rule "${rule.id}" already exists on device "${this.id}"`
      );
    }

    this.rules.set(
      rule.id,
      rule
    );

    this.events.emit(
      "rule:registered",
      {
        device: this,
        rule,
        timestamp: new Date()
      }
    );

    return this;
  }

  getRule(
    id: string
  ): Rule | undefined {
    return this.rules.get(
      id
    );
  }

  getRules(): Rule[] {
    return Array.from(
      this.rules.values()
    );
  }

  removeRule(
    id: string
  ): boolean {
    return this.rules.delete(
      id
    );
  }

  // --------------------------------------------------
  // Rule Queue
  // --------------------------------------------------

  private queueRuleEvaluation(
    event: unknown,
    eventType: string
  ): void {
    this.ruleQueue =
      this.ruleQueue
        .then(
          () =>
            this.evaluateRules(
              event,
              eventType
            )
        )
        .catch(
          (error: unknown) => {
            this.events.emit(
              "rule:queueError",
              {
                device: this,
                event,
                eventType,
                error,
                timestamp: new Date()
              }
            );
          }
        );
  }

  /**
   * Wait until all currently queued
   * rule evaluations are completed.
   *
   * Useful for tests, simulations
   * and deterministic integrations.
   */
  async waitForRules(): Promise<void> {
    await this.ruleQueue;
  }

  async evaluateRules(
    event?: unknown,
    eventType?: string
  ): Promise<void> {
    const context: RuleContext = {
      device: this,
      event,
      eventType
    };

    for (
      const rule of this.rules.values()
    ) {
      try {
        const matched =
          await rule.evaluate(
            context
          );

        if (matched) {
          this.events.emit(
            "rule:executed",
            {
              device: this,
              rule,
              event,
              eventType,
              timestamp: new Date()
            }
          );
        }
      } catch (error) {
        this.events.emit(
          "rule:error",
          {
            device: this,
            rule,
            event,
            eventType,
            error,
            timestamp: new Date()
          }
        );
      }
    }
  }

  // --------------------------------------------------
  // Device Twin
  // --------------------------------------------------

  getTwinSnapshot():
    DeviceTwinSnapshot {
    return {
      id: this.id,

      name: this.name,

      type: this.type,

      running: this.running,

      sensors:
        this.getSensors().map(
          (sensor) => ({
            id: sensor.id,
            type: sensor.type,

            ...(sensor.unit !== undefined
              ? {
                  unit:
                    sensor.unit
                }
              : {}),

            value:
              sensor.getValue()
          })
        ),

      actuators:
        this.getActuators().map(
          (actuator) => ({
            id: actuator.id,
            type: actuator.type,
            active:
              actuator.isOn()
          })
        ),

      capabilities:
        this.getCapabilities().map(
          (capability) => ({
            id: capability.id,
            type: capability.type,
            metadata:
              capability
                .getMetadataSnapshot()
          })
        ),

      state:
        this.getStateSnapshot(),

      telemetry:
        this.getTelemetrySnapshot()
    };
  }

  // --------------------------------------------------
  // Lifecycle
  // --------------------------------------------------

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    this.events.emit(
      "device:start",
      {
        device: this,
        timestamp: new Date()
      }
    );
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    this.events.emit(
      "device:stop",
      {
        device: this,
        timestamp: new Date()
      }
    );
  }

  isRunning(): boolean {
    return this.running;
  }
}