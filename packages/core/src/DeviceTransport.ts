import { Device } from "./Device.js";
import { Sensor } from "./Sensor.js";
import { Actuator } from "./Actuator.js";
import { Rule } from "./Rule.js";

import {
  createMessage,
  isMessageEnvelope
} from "./Message.js";

import type {
  TelemetryRecord
} from "./Telemetry.js";

import type {
  StateChangeEvent
} from "./State.js";

import type {
  Transport,
  TransportMessage
} from "./Transport.js";

import { MqttTopicBuilder } from "./MqttTopic.js";

export interface DeviceTransportOptions {
  topicPrefix?: string;
  publishTwinOnConnect?: boolean;
  publishTwinOnStateChange?: boolean;
  publishTwinOnTelemetry?: boolean;
  publishState?: boolean;
  publishEvents?: string[];
  twinDebounceMs?: number;
}

export class DeviceTransport {
  private readonly device: Device;
  private readonly transport: Transport;
  private readonly topics: MqttTopicBuilder;

  private readonly publishTwinOnConnect: boolean;
  private readonly publishTwinOnStateChange: boolean;
  private readonly publishTwinOnTelemetry: boolean;
  private readonly publishState: boolean;

  private readonly publishEvents: Set<string>;

  private readonly twinDebounceMs: number;

  private connected = false;

  private unsubscribeCommands: (() => void) | undefined;
  private unsubscribeTelemetry: (() => void) | undefined;
  private unsubscribeState: (() => void) | undefined;

  private readonly unsubscribeEvents: Array<() => void> = [];

  private twinTimer:
    ReturnType<typeof setTimeout> | undefined;

  constructor(
    device: Device,
    transport: Transport,
    options: DeviceTransportOptions = {}
  ) {
    this.device = device;
    this.transport = transport;

    this.topics = new MqttTopicBuilder(
      options.topicPrefix ?? "iotkit"
    );

    this.publishTwinOnConnect =
      options.publishTwinOnConnect ?? true;

    this.publishTwinOnStateChange =
      options.publishTwinOnStateChange ?? true;

    this.publishTwinOnTelemetry =
      options.publishTwinOnTelemetry ?? false;

    this.publishState =
      options.publishState ?? true;

    this.publishEvents = new Set(
      options.publishEvents ?? [
        "rule:matched",
        "rule:queueError"
      ]
    );

    this.twinDebounceMs =
      options.twinDebounceMs ?? 25;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.transport.connect();

    this.unsubscribeCommands =
      await this.transport.subscribe(
        this.topics.commandWildcard(
          this.device.id
        ),
        async (message) => {
          await this.handleCommand(message);
        }
      );

    this.unsubscribeTelemetry =
      this.device.telemetry.onReport(
        (record) => {
          void this.handleTelemetry(record);
        }
      );

    if (this.publishState) {
      this.unsubscribeState =
        this.device.state.onChange(
          (event) => {
            void this.handleStateChange(
              event
            );
          }
        );
    }

    this.registerEventListeners();

    this.connected = true;

    if (this.publishTwinOnConnect) {
      await this.publishTwin();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    if (this.twinTimer !== undefined) {
      clearTimeout(this.twinTimer);
      this.twinTimer = undefined;
    }

    this.unsubscribeCommands?.();
    this.unsubscribeCommands = undefined;

    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;

    this.unsubscribeState?.();
    this.unsubscribeState = undefined;

    for (const unsubscribe of this.unsubscribeEvents) {
      unsubscribe();
    }

    this.unsubscribeEvents.length = 0;

    await this.transport.disconnect();

    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publishTelemetry(
    record: TelemetryRecord
  ): Promise<void> {
    const data =
      record.unit !== undefined
        ? {
            key: record.key,
            value: record.value,
            unit: record.unit,
            metadata: record.metadata
          }
        : {
            key: record.key,
            value: record.value,
            metadata: record.metadata
          };

    const message = createMessage(
      this.device.id,
      "telemetry",
      data,
      {
        timestamp: record.timestamp
      }
    );

    await this.transport.publish(
      this.topics.telemetry(
        this.device.id,
        record.key
      ),
      JSON.stringify(message)
    );

    if (this.publishTwinOnTelemetry) {
      this.scheduleTwinPublish();
    }
  }

  async publishTwin(): Promise<void> {
    const message = createMessage(
      this.device.id,
      "twin",
      this.device.getTwinSnapshot()
    );

    await this.transport.publish(
      this.topics.twin(
        this.device.id
      ),
      JSON.stringify(message),
      {
        qos: 1,
        retain: true
      }
    );
  }

  private async handleTelemetry(
    record: TelemetryRecord
  ): Promise<void> {
    try {
      await this.publishTelemetry(
        record
      );
    } catch (error: unknown) {
      this.emitTransportError(
        "telemetry",
        error
      );
    }
  }

  private async handleStateChange(
    event: StateChangeEvent
  ): Promise<void> {
    try {
      if (this.publishState) {
        await this.publishStateMessage(
          event
        );
      }

      if (this.publishTwinOnStateChange) {
        this.scheduleTwinPublish();
      }
    } catch (error: unknown) {
      this.emitTransportError(
        "state",
        error
      );
    }
  }

  private async publishStateMessage(
    event: StateChangeEvent
  ): Promise<void> {
    const baseData = {
      key: event.key,
      value: event.value
    };

    const data =
      event.previousValue !== undefined
        ? {
            ...baseData,
            previousValue:
              event.previousValue
          }
        : baseData;

    const message = createMessage(
      this.device.id,
      "state",
      data,
      {
        timestamp: event.timestamp
      }
    );

    await this.transport.publish(
      this.topics.state(
        this.device.id,
        event.key
      ),
      JSON.stringify(message)
    );
  }

  private registerEventListeners(): void {
    for (
      const eventName of this.publishEvents
    ) {
      const unsubscribe =
        this.device.events.on(
          eventName,
          (payload: unknown) => {
            void this.handleDeviceEvent(
              eventName,
              payload
            );
          }
        );

      this.unsubscribeEvents.push(
        unsubscribe
      );
    }
  }

  private async handleDeviceEvent(
    eventName: string,
    payload: unknown
  ): Promise<void> {
    try {
      const message = createMessage(
        this.device.id,
        "event",
        {
          event: eventName,
          payload:
            this.serializeValue(payload)
        }
      );

      await this.transport.publish(
        this.topics.event(
          this.device.id,
          eventName
        ),
        JSON.stringify(message)
      );
    } catch (error: unknown) {
      this.emitTransportError(
        "event",
        error
      );
    }
  }

  private scheduleTwinPublish(): void {
    if (!this.connected) {
      return;
    }

    if (this.twinTimer !== undefined) {
      return;
    }

    this.twinTimer = setTimeout(() => {
      this.twinTimer = undefined;

      void this.publishTwin()
        .catch((error: unknown) => {
          this.emitTransportError(
            "twin",
            error
          );
        });
    }, this.twinDebounceMs);
  }

  private async handleCommand(
    message: TransportMessage
  ): Promise<void> {
    const commandName =
      this.extractCommandName(
        message.topic
      );

    if (commandName === undefined) {
      return;
    }

    let payload: unknown;

    try {
      payload = this.parsePayload(
        message.payload
      );
    } catch (error: unknown) {
      await this.publishCommandResult(
        commandName,
        false,
        undefined,
        error
      );

      return;
    }

    let correlationId:
      string | undefined;

    if (isMessageEnvelope(payload)) {
      if (
        payload.deviceId !==
        this.device.id
      ) {
        await this.publishCommandResult(
          commandName,
          false,
          undefined,
          new Error(
            `Command message deviceId "${payload.deviceId}" does not match device "${this.device.id}".`
          )
        );

        return;
      }

      if (payload.type !== "command") {
        await this.publishCommandResult(
          commandName,
          false,
          undefined,
          new Error(
            `Invalid message type "${payload.type}" for command topic.`
          )
        );

        return;
      }

      correlationId =
        payload.messageId;

      payload = payload.data;
    }

    try {
      await this.device.execute(
        commandName,
        payload
      );

      await this.publishCommandResult(
        commandName,
        true,
        payload,
        undefined,
        correlationId
      );

      this.scheduleTwinPublish();
    } catch (error: unknown) {
      await this.publishCommandResult(
        commandName,
        false,
        payload,
        error,
        correlationId
      );
    }
  }

  private async publishCommandResult(
    commandName: string,
    success: boolean,
    payload: unknown,
    error?: unknown,
    correlationId?: string
  ): Promise<void> {
    const baseData = {
      command: commandName,
      success,
      payload
    };

    const data =
      success || error === undefined
        ? baseData
        : {
            ...baseData,
            error: this.errorToString(
              error
            )
          };

    const message =
      correlationId !== undefined
        ? createMessage(
            this.device.id,
            "command-result",
            data,
            {
              correlationId
            }
          )
        : createMessage(
            this.device.id,
            "command-result",
            data
          );

    await this.transport.publish(
      this.topics.commandResult(
        this.device.id,
        commandName
      ),
      JSON.stringify(message)
    );
  }

  private extractCommandName(
    topic: string
  ): string | undefined {
    const prefix =
      this.topics.command(
        this.device.id,
        ""
      );

    if (!topic.startsWith(prefix)) {
      return undefined;
    }

    const commandName =
      topic.slice(prefix.length);

    if (
      commandName.length === 0 ||
      commandName.includes("/")
    ) {
      return undefined;
    }

    return commandName;
  }

  private parsePayload(
    payload: string | Uint8Array
  ): unknown {
    const text =
      typeof payload === "string"
        ? payload
        : new TextDecoder().decode(payload);

    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }

  private serializeValue(
    value: unknown,
    seen = new WeakSet<object>()
  ): unknown {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (value === undefined) {
      return undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message
      };
    }

    if (value instanceof Uint8Array) {
      return Array.from(value);
    }

    if (value instanceof Device) {
      return {
        id: value.id,
        name: value.name,
        type: value.type
      };
    }

    if (value instanceof Sensor) {
      return {
        id: value.id,
        type: value.type,
        unit: value.unit,
        value: value.getValue()
      };
    }

    if (value instanceof Actuator) {
      return {
        id: value.id
      };
    }

    if (value instanceof Rule) {
      return {
        id: value.id,
        name: value.name
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.serializeValue(
          item,
          seen
        )
      );
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);

      const result:
        Record<string, unknown> = {};

      for (
        const [
          key,
          nestedValue
        ] of Object.entries(
          value as Record<
            string,
            unknown
          >
        )
      ) {
        result[key] =
          this.serializeValue(
            nestedValue,
            seen
          );
      }

      return result;
    }

    return String(value);
  }

  private emitTransportError(
    type: string,
    error: unknown
  ): void {
    this.device.events.emit(
      "transport:error",
      {
        device: this.device,
        type,
        error,
        timestamp: new Date()
      }
    );
  }

  private errorToString(
    error: unknown
  ): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}