import { EventBus } from "./EventBus.js";

export interface RuleContext {
  device: unknown;
  event: unknown | undefined;
  eventType: string | undefined;
}

export type RuleTrigger =
  | string
  | string[];

export type RuleMode =
  | "level"
  | "rising"
  | "falling"
  | "changed";

export type RuleCondition = (
  context: RuleContext
) => boolean | Promise<boolean>;

export type RuleAction = (
  context: RuleContext
) => void | Promise<void>;

export interface RuleOptions {
  id: string;
  name?: string;
  trigger?: RuleTrigger;
  mode?: RuleMode;
  condition: RuleCondition;
  action: RuleAction;
}

export interface RuleEvent {
  rule: Rule;
  context: RuleContext;
  timestamp: Date;
}

export class Rule {
  readonly id: string;
  readonly name: string;
  readonly trigger: RuleTrigger | undefined;
  readonly mode: RuleMode;

  private readonly condition: RuleCondition;
  private readonly action: RuleAction;

  private enabled = true;

  /**
   * Previous result of the condition.
   *
   * undefined means that the rule has not
   * evaluated its condition yet.
   */
  private previousCondition:
    boolean | undefined;

  private readonly events =
    new EventBus();

  constructor(
    options: RuleOptions
  ) {
    this.id = options.id;

    this.name =
      options.name ?? options.id;

    this.trigger =
      options.trigger;

    this.mode =
      options.mode ?? "level";

    this.condition =
      options.condition;

    this.action =
      options.action;
  }

  // --------------------------------------------------
  // Enable / Disable
  // --------------------------------------------------

  enable(): void {
    this.enabled = true;

    // Start a fresh edge-detection cycle.
    this.previousCondition =
      undefined;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // --------------------------------------------------
  // Trigger Matching
  // --------------------------------------------------

  private matchesTrigger(
    eventType: string | undefined
  ): boolean {
    if (
      this.trigger === undefined
    ) {
      return true;
    }

    if (
      eventType === undefined
    ) {
      return false;
    }

    if (
      typeof this.trigger ===
      "string"
    ) {
      return (
        this.trigger === eventType
      );
    }

    return this.trigger.includes(
      eventType
    );
  }

  // --------------------------------------------------
  // Mode Matching
  // --------------------------------------------------

  private matchesMode(
    current: boolean
  ): boolean {
    const previous =
      this.previousCondition;

    switch (this.mode) {
      case "level":
        /**
         * Execute whenever the condition
         * is currently true.
         */
        return current;

      case "rising":
        /**
         * Execute only when:
         *
         * false → true
         */
        return (
          previous !== undefined &&
          previous === false &&
          current === true
        );

      case "falling":
        /**
         * Execute only when:
         *
         * true → false
         */
        return (
          previous !== undefined &&
          previous === true &&
          current === false
        );

      case "changed":
        /**
         * Execute whenever the condition
         * changes in either direction.
         */
        return (
          previous !== undefined &&
          previous !== current
        );

      default:
        return false;
    }
  }

  // --------------------------------------------------
  // Evaluation
  // --------------------------------------------------

  async evaluate(
    context: RuleContext
  ): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    if (
      !this.matchesTrigger(
        context.eventType
      )
    ) {
      return false;
    }

    const currentCondition =
      await this.condition(
        context
      );

    const shouldExecute =
      this.matchesMode(
        currentCondition
      );

    // Store the condition result AFTER
    // evaluating the current transition.
    this.previousCondition =
      currentCondition;

    if (!shouldExecute) {
      return false;
    }

    const event: RuleEvent = {
      rule: this,
      context,
      timestamp: new Date()
    };

    this.events.emit(
      "matched",
      event
    );

    await this.action(
      context
    );

    this.events.emit(
      "executed",
      event
    );

    return true;
  }

  // --------------------------------------------------
  // Rule State
  // --------------------------------------------------

  getPreviousCondition():
    boolean | undefined {
    return this.previousCondition;
  }

  reset(): void {
    this.previousCondition =
      undefined;
  }

  // --------------------------------------------------
  // Events
  // --------------------------------------------------

  on(
    event: string,
    handler: (
      payload: RuleEvent
    ) => void
  ): () => void {
    return this.events.on(
      event,
      handler
    );
  }
}