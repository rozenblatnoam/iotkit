export type TransportQoS = 0 | 1 | 2;

export interface TransportPublishOptions {
  qos?: TransportQoS;
  retain?: boolean;
}

export interface TransportMessage {
  topic: string;
  payload: string | Uint8Array;
}

export type TransportMessageHandler = (
  message: TransportMessage
) => void | Promise<void>;

export interface Transport {
  readonly name: string;

  connect(): Promise<void>;

  disconnect(): Promise<void>;

  publish(
    topic: string,
    payload: string | Uint8Array,
    options?: TransportPublishOptions
  ): Promise<void>;

  subscribe(
    topic: string,
    handler: TransportMessageHandler
  ): Promise<() => void>;

  isConnected(): boolean;
}