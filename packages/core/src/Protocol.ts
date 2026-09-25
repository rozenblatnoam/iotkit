import {
  isMessageEnvelope
} from "./Message.js";

import type {
  MessageEnvelope
} from "./Message.js";

export class MessageProtocolError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageProtocolError";
  }
}

export function encodeMessage<T>(
  message: MessageEnvelope<T>
): string {
  if (!isMessageEnvelope(message)) {
    throw new MessageProtocolError(
      "Invalid iotkit message envelope."
    );
  }

  return JSON.stringify(message);
}

export function decodeMessage<T = unknown>(
  payload: string | Uint8Array
): MessageEnvelope<T> {
  const text =
    typeof payload === "string"
      ? payload
      : new TextDecoder().decode(payload);

  if (text.trim().length === 0) {
    throw new MessageProtocolError(
      "Cannot decode an empty message."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MessageProtocolError(
      "Invalid JSON message."
    );
  }

  if (!isMessageEnvelope(parsed)) {
    throw new MessageProtocolError(
      "Invalid iotkit message envelope."
    );
  }

  return parsed as MessageEnvelope<T>;
}

export function isEncodedMessage(
  payload: string | Uint8Array
): boolean {
  try {
    decodeMessage(payload);
    return true;
  } catch {
    return false;
  }
}