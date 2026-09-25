import { randomUUID } from "node:crypto";

export type MessageType =
  | "telemetry"
  | "state"
  | "command"
  | "command-result"
  | "twin"
  | "event";

export interface MessageEnvelope<T = unknown> {
  version: 1;
  messageId: string;
  correlationId?: string;
  deviceId: string;
  timestamp: string;
  type: MessageType;
  data: T;
}

export interface CreateMessageOptions {
  messageId?: string;
  correlationId?: string;
  timestamp?: Date;
}

const MESSAGE_TYPES: readonly MessageType[] = [
  "telemetry",
  "state",
  "command",
  "command-result",
  "twin",
  "event"
];

export function isMessageType(
  value: unknown
): value is MessageType {
  return (
    typeof value === "string" &&
    MESSAGE_TYPES.includes(
      value as MessageType
    )
  );
}

export function createMessage<T>(
  deviceId: string,
  type: MessageType,
  data: T,
  options: CreateMessageOptions = {}
): MessageEnvelope<T> {
  const message: MessageEnvelope<T> = {
    version: 1,
    messageId:
      options.messageId ?? randomUUID(),
    deviceId,
    timestamp: (
      options.timestamp ?? new Date()
    ).toISOString(),
    type,
    data
  };

  if (options.correlationId !== undefined) {
    message.correlationId =
      options.correlationId;
  }

  return message;
}

export function isMessageEnvelope(
  value: unknown
): value is MessageEnvelope {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const message =
    value as Record<string, unknown>;

  if (
    message.version !== 1 ||
    typeof message.messageId !== "string" ||
    message.messageId.length === 0 ||
    typeof message.deviceId !== "string" ||
    message.deviceId.length === 0 ||
    typeof message.timestamp !== "string" ||
    Number.isNaN(
      Date.parse(message.timestamp)
    ) ||
    !isMessageType(message.type) ||
    !("data" in message)
  ) {
    return false;
  }

  if (
    "correlationId" in message &&
    typeof message.correlationId !== "string"
  ) {
    return false;
  }

  return true;
}