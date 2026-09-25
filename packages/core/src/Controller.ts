import { EventBus } from "./EventBus.js";

import {
  createMessage,
  isMessageEnvelope
} from "./Message.js";

import {
  decodeMessage
} from "./Protocol.js";

import type {
  MessageEnvelope
} from "./Message.js";

import type {
  Transport,
  TransportMessage
} from "./Transport.js";

import { MqttTopicBuilder } from "./MqttTopic.js";

export interface IotKitControllerOptions {
  topicPrefix?: string;
  deviceId?: string;
  commandTimeoutMs?: number;
}

export interface TelemetryMessageData {
  key: string;
  value: unknown;
  unit?: string;
  metadata?: Record<string, unknown>;
}

export interface StateMessageData {
  key: string;
  value: unknown;
  previousValue?: unknown;
}

export interface CommandResultData<
  TResult = unknown
> {
  command: string;
  success: boolean;
  payload?: unknown;
  error?: string;
  result?: TResult;
}

export interface EventMessageData {
  event: string;
  payload: unknown;
}

export interface ProtocolErrorEvent {
  topic: string;
  error: unknown;
  timestamp: Date;
}

interface PendingCommand {
  resolve: (
    message: MessageEnvelope<
      CommandResultData<unknown>
    >
  ) => void;

  reject: (
    error: Error
  ) => void;

  timer: ReturnType<typeof setTimeout>;
}

export class IotKitController {
  readonly events = new EventBus();

  private readonly transport: Transport;
  private readonly topics: MqttTopicBuilder;

  private readonly deviceId:
    string | undefined;

  private readonly commandTimeoutMs: number;

  private connected = false;

  private unsubscribeMessages:
    (() => void) | undefined;

  private readonly pendingCommands =
    new Map<
      string,
      PendingCommand
    >();

  constructor(
    transport: Transport,
    options: IotKitControllerOptions = {}
  ) {
    this.transport = transport;

    this.topics =
      new MqttTopicBuilder(
        options.topicPrefix ?? "iotkit"
      );

    this.deviceId =
      options.deviceId;

    this.commandTimeoutMs =
      options.commandTimeoutMs ?? 5000;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.transport.connect();

    const subscription =
      this.deviceId !== undefined
        ? `${this.getTopicPrefix()}/${this.deviceId}/#`
        : `${this.getTopicPrefix()}/#`;

    this.unsubscribeMessages =
      await this.transport.subscribe(
        subscription,
        async (message) => {
          await this.handleMessage(
            message
          );
        }
      );

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.unsubscribeMessages?.();
    this.unsubscribeMessages =
      undefined;

    this.rejectPendingCommands(
      new Error(
        "IotKitController disconnected."
      )
    );

    await this.transport.disconnect();

    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendCommand<
    TPayload = unknown,
    TResult = unknown
  >(
    deviceId: string,
    command: string,
    payload?: TPayload,
    timeoutMs = this.commandTimeoutMs
  ): Promise<
    MessageEnvelope<
      CommandResultData<TResult>
    >
  > {
    if (!this.connected) {
      throw new Error(
        "IotKitController is not connected."
      );
    }

    const message =
      createMessage(
        deviceId,
        "command",
        payload ?? {}
      );

    const resultPromise =
      new Promise<
        MessageEnvelope<
          CommandResultData<TResult>
        >
      >(
        (resolve, reject) => {
          const timer =
            setTimeout(() => {
              this.pendingCommands.delete(
                message.messageId
              );

              reject(
                new Error(
                  `Command "${command}" timed out after ${timeoutMs}ms.`
                )
              );
            }, timeoutMs);

          this.pendingCommands.set(
            message.messageId,
            {
              resolve: (
                resultMessage
              ) => {
                resolve(
                  resultMessage as MessageEnvelope<
                    CommandResultData<TResult>
                  >
                );
              },

              reject,

              timer
            }
          );
        }
      );

    try {
      await this.transport.publish(
        this.topics.command(
          deviceId,
          command
        ),
        JSON.stringify(message)
      );
    } catch (error: unknown) {
      const pending =
        this.pendingCommands.get(
          message.messageId
        );

      if (pending !== undefined) {
        clearTimeout(
          pending.timer
        );

        this.pendingCommands.delete(
          message.messageId
        );

        pending.reject(
          error instanceof Error
            ? error
            : new Error(
                String(error)
              )
        );
      }
    }

    return resultPromise;
  }

  onMessage(
    handler: (
      message: MessageEnvelope
    ) => void
  ): () => void {
    return this.events.on(
      "message",
      handler
    );
  }

  onTelemetry<T = unknown>(
    handler: (
      message: MessageEnvelope<
        TelemetryMessageData & {
          value: T;
        }
      >
    ) => void
  ): () => void {
    return this.events.on(
      "telemetry",
      handler
    );
  }

  onState(
    handler: (
      message: MessageEnvelope<
        StateMessageData
      >
    ) => void
  ): () => void {
    return this.events.on(
      "state",
      handler
    );
  }

  onTwin<T = unknown>(
    handler: (
      message: MessageEnvelope<T>
    ) => void
  ): () => void {
    return this.events.on(
      "twin",
      handler
    );
  }

  onCommandResult<T = unknown>(
    handler: (
      message: MessageEnvelope<
        CommandResultData<T>
      >
    ) => void
  ): () => void {
    return this.events.on(
      "command-result",
      handler
    );
  }

  onEvent(
    handler: (
      message: MessageEnvelope<
        EventMessageData
      >
    ) => void
  ): () => void {
    return this.events.on(
      "event",
      handler
    );
  }

  onProtocolError(
    handler: (
      event: ProtocolErrorEvent
    ) => void
  ): () => void {
    return this.events.on(
      "protocol:error",
      handler
    );
  }

  private async handleMessage(
    message: TransportMessage
  ): Promise<void> {
    try {
      const decoded =
        decodeMessage(
          message.payload
        );

      if (
        this.deviceId !== undefined &&
        decoded.deviceId !==
          this.deviceId
      ) {
        return;
      }

      this.events.emit(
        "message",
        decoded
      );

      switch (decoded.type) {
        case "telemetry":
          this.events.emit(
            "telemetry",
            decoded
          );
          break;

        case "state":
          this.events.emit(
            "state",
            decoded
          );
          break;

        case "twin":
          this.events.emit(
            "twin",
            decoded
          );
          break;

        case "command-result":
          this.events.emit(
            "command-result",
            decoded
          );

          this.resolvePendingCommand(
            decoded
          );
          break;

        case "event":
          this.events.emit(
            "event",
            decoded
          );
          break;

        case "command":
          break;
      }
    } catch (error: unknown) {
      this.events.emit(
        "protocol:error",
        {
          topic: message.topic,
          error,
          timestamp: new Date()
        }
      );
    }
  }

  private resolvePendingCommand(
    message: MessageEnvelope
  ): void {
    const correlationId =
      message.correlationId;

    if (
      correlationId === undefined
    ) {
      return;
    }

    const pending =
      this.pendingCommands.get(
        correlationId
      );

    if (pending === undefined) {
      return;
    }

    clearTimeout(
      pending.timer
    );

    this.pendingCommands.delete(
      correlationId
    );

    pending.resolve(
      message as MessageEnvelope<
        CommandResultData<unknown>
      >
    );
  }

  private rejectPendingCommands(
    error: Error
  ): void {
    for (
      const [
        messageId,
        pending
      ] of this.pendingCommands
    ) {
      clearTimeout(
        pending.timer
      );

      pending.reject(error);

      this.pendingCommands.delete(
        messageId
      );
    }
  }

  private getTopicPrefix(): string {
    return this.topics.getPrefix();
  }
}