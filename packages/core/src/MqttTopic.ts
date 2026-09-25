export type MqttTopicType =
  | "telemetry"
  | "state"
  | "twin"
  | "command"
  | "command-result"
  | "event";

export class MqttTopicBuilder {
  constructor(
    private readonly prefix = "iotkit"
  ) {}

  getPrefix(): string {
    return this.prefix;
  }

  private device(
    deviceId: string
  ): string {
    return `${this.prefix}/${deviceId}`;
  }

  telemetry(
    deviceId: string,
    key: string
  ): string {
    return `${this.device(deviceId)}/telemetry/${key}`;
  }

  telemetryWildcard(
    deviceId: string
  ): string {
    return `${this.device(deviceId)}/telemetry/+`;
  }

  state(
    deviceId: string,
    key: string
  ): string {
    return `${this.device(deviceId)}/state/${key}`;
  }

  stateWildcard(
    deviceId: string
  ): string {
    return `${this.device(deviceId)}/state/+`;
  }

  twin(
    deviceId: string
  ): string {
    return `${this.device(deviceId)}/twin`;
  }

  command(
    deviceId: string,
    command: string
  ): string {
    return `${this.device(deviceId)}/commands/${command}`;
  }

  commandWildcard(
    deviceId: string
  ): string {
    return `${this.device(deviceId)}/commands/+`;
  }

  commandResult(
    deviceId: string,
    command: string
  ): string {
    return `${this.device(deviceId)}/commands/${command}/result`;
  }

  event(
    deviceId: string,
    event: string
  ): string {
    return `${this.device(deviceId)}/events/${event}`;
  }

  eventWildcard(
    deviceId: string
  ): string {
    return `${this.device(deviceId)}/events/+`;
  }
}