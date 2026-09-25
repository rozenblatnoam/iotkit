export type CommandHandler<T = unknown> = (
  payload?: T
) => void | Promise<void>;

export interface CommandOptions<T = unknown> {
  name: string;
  description?: string;
  handler: CommandHandler<T>;
}

export class Command<T = unknown> {
  readonly name: string;
  readonly description: string | undefined;

  private readonly handler:
    CommandHandler<T>;

  constructor(
    options: CommandOptions<T>
  ) {
    this.name = options.name;
    this.description =
      options.description;
    this.handler =
      options.handler;
  }

  async execute(
    payload?: T
  ): Promise<void> {
    await this.handler(
      payload
    );
  }
}