
import mqtt from "mqtt";

import type {
  IClientOptions,
  MqttClient,
} from "mqtt";

import type {
  Transport,
  TransportMessage,
  TransportMessageHandler,
  TransportPublishOptions,
} from "@iotkit/core";

export interface MqttTransportOptions {
  url: string;
  clientId?: string;
  options?: IClientOptions;
}

interface Subscription {
  topic: string;
  handlers: Set<TransportMessageHandler>;
}

export class MqttTransport implements Transport {
  readonly name = "mqtt";

  private readonly url: string;
  private readonly options: IClientOptions;

  private client: MqttClient | undefined;
  private connected = false;

  /**
   * Shared in-flight connection promise.
   *
   * Prevents multiple simultaneous connect() calls
   * from creating multiple MQTT clients.
   */
  private connecting:
    | Promise<void>
    | undefined;

  private readonly subscriptions =
    new Map<string, Subscription>();

  constructor(config: MqttTransportOptions) {
    this.url = config.url;

    this.options =
      config.clientId !== undefined
        ? {
            ...(config.options ?? {}),
            clientId: config.clientId,
          }
        : {
            ...(config.options ?? {}),
          };
  }

  async connect(): Promise<void> {
    if (
      this.connected &&
      this.client !== undefined
    ) {
      return;
    }

    if (this.connecting !== undefined) {
      return this.connecting;
    }

    this.connecting = this.createConnection();

    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async createConnection(): Promise<void> {
    const client = mqtt.connect(
      this.url,
      this.options,
    );

    this.client = client;
    this.connected = false;

    client.on(
      "message",
      (
        topic: string,
        payload: Buffer,
      ) => {
        void this.handleMessage(
          topic,
          payload,
        );
      },
    );

    try {
      await new Promise<void>(
        (resolve, reject) => {
          let settled = false;

          const handleConnect =
            (): void => {
              if (settled) {
                return;
              }

              settled = true;
              this.connected = true;

              client.off(
                "error",
                handleError,
              );

              resolve();
            };

          const handleError =
            (error: Error): void => {
              if (settled) {
                return;
              }

              settled = true;

              client.off(
                "connect",
                handleConnect,
              );

              this.connected = false;

              if (this.client === client) {
                this.client = undefined;
              }

              reject(error);
            };

          client.once(
            "connect",
            handleConnect,
          );

          client.once(
            "error",
            handleError,
          );
        },
      );
    } catch (error) {
      this.connected = false;

      if (this.client === client) {
        this.client = undefined;
      }

      try {
        client.end(
          true,
          {},
        );
      } catch {
        // Cleanup must not hide the original error.
      }

      throw error;
    }
  }

  async disconnect(): Promise<void> {
    /**
     * If connect() is currently in progress, wait for it
     * before closing the client.
     */
    if (this.connecting !== undefined) {
      try {
        await this.connecting;
      } catch {
        // Connection failure is already handled by connect().
      }
    }

    const client = this.client;

    if (client === undefined) {
      this.connected = false;
      this.subscriptions.clear();
      return;
    }

    await new Promise<void>(
      (resolve) => {
        let settled = false;

        const finish = (): void => {
          if (settled) {
            return;
          }

          settled = true;
          resolve();
        };

        client.end(
          false,
          {},
          finish,
        );
      },
    );

    if (this.client === client) {
      this.client = undefined;
    }

    this.connected = false;
    this.subscriptions.clear();
  }

  async publish(
    topic: string,
    payload: string | Uint8Array,
    options: TransportPublishOptions = {},
  ): Promise<void> {
    if (
      !this.connected ||
      this.client === undefined
    ) {
      throw new Error(
        "MQTT transport is not connected.",
      );
    }

    const mqttPayload =
      typeof payload === "string"
        ? payload
        : Buffer.from(payload);

    await new Promise<void>(
      (resolve, reject) => {
        this.client!.publish(
          topic,
          mqttPayload,
          {
            qos: options.qos ?? 0,
            retain:
              options.retain ?? false,
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      },
    );
  }

  async subscribe(
    topic: string,
    handler: TransportMessageHandler,
  ): Promise<() => void> {
    if (
      !this.connected ||
      this.client === undefined
    ) {
      throw new Error(
        "MQTT transport is not connected.",
      );
    }

    let subscription =
      this.subscriptions.get(topic);

    if (subscription === undefined) {
      subscription = {
        topic,
        handlers:
          new Set<TransportMessageHandler>(),
      };

      this.subscriptions.set(
        topic,
        subscription,
      );

      try {
        await new Promise<void>(
          (resolve, reject) => {
            this.client!.subscribe(
              topic,
              {
                qos: 0,
              },
              (error) => {
                if (error) {
                  reject(error);
                  return;
                }

                resolve();
              },
            );
          },
        );
      } catch (error) {
        /**
         * Do not leave a failed subscription
         * in the local subscription map.
         */
        this.subscriptions.delete(topic);
        throw error;
      }
    }

    subscription.handlers.add(handler);

    let unsubscribed = false;

    return async (): Promise<void> => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;

      const current =
        this.subscriptions.get(topic);

      if (current === undefined) {
        return;
      }

      current.handlers.delete(handler);

      if (current.handlers.size > 0) {
        return;
      }

      this.subscriptions.delete(topic);

      if (
        !this.connected ||
        this.client === undefined
      ) {
        return;
      }

      await new Promise<void>(
        (resolve) => {
          this.client!.unsubscribe(
            topic,
            () => {
              resolve();
            },
          );
        },
      );
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(
    topic: string,
    payload: Buffer,
  ): Promise<void> {
    const message: TransportMessage = {
      topic,
      payload,
    };

    for (
      const subscription of
        this.subscriptions.values()
    ) {
      if (
        !MqttTransport.matchesTopic(
          subscription.topic,
          topic,
        )
      ) {
        continue;
      }

      for (
        const handler of
          subscription.handlers
      ) {
        try {
          await handler(message);
        } catch {
          /**
           * One handler failure must not prevent
           * other handlers from receiving the message.
           */
        }
      }
    }
  }

  private static matchesTopic(
    filter: string,
    topic: string,
  ): boolean {
    const filterParts =
      filter.split("/");

    const topicParts =
      topic.split("/");

    for (
      let index = 0;
      index < filterParts.length;
      index += 1
    ) {
      const filterPart =
        filterParts[index];

      const topicPart =
        topicParts[index];

      /**
       * MQTT multi-level wildcard.
       *
       * '#' must be the final level.
       */
      if (filterPart === "#") {
        return (
          index ===
          filterParts.length - 1
        );
      }

      /**
       * MQTT single-level wildcard.
       */
      if (filterPart === "+") {
        if (
          topicPart === undefined
        ) {
          return false;
        }

        continue;
      }

      if (
        filterPart !== topicPart
      ) {
        return false;
      }
    }

    return (
      filterParts.length ===
      topicParts.length
    );
  }
}
