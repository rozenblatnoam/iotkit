import net from "node:net";
import { Aedes } from "aedes";

import {
  createMessage,
  decodeMessage,
  encodeMessage,
  DeviceTransport,
  EvoMaxSimulator,
  FleetController,
  FleetManager,
  IotKitController,
  MqttTopicBuilder
} from "@iotkit/core";

import type {
  CommandResultData,
  MessageEnvelope,
  TransportMessage
} from "@iotkit/core";

import { MqttTransport } from "@iotkit/mqtt";

const MQTT_URL = "mqtt://127.0.0.1:1884";
const MQTT_PORT = 1884;
const MQTT_HOST = "127.0.0.1";

const DEVICE_ID = "evo-max-01";

interface CommandMessageData {
  command: string;
  payload?: unknown;
}

interface TwinData {
  state?: Record<string, unknown>;
  sensors?: unknown;
  actuators?: unknown;
  capabilities?: unknown;
  telemetry?: unknown;
  [key: string]: unknown;
}

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForMessage<T = unknown>(
  transport: MqttTransport,
  topic: string,
  predicate?: (
    message: MessageEnvelope<T>
  ) => boolean,
  timeoutMs = 3000
): Promise<MessageEnvelope<T>> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  let resolveMessage!: (value: MessageEnvelope<T>) => void;
  let rejectMessage!: (reason?: unknown) => void;

  const promise = new Promise<MessageEnvelope<T>>((resolve, reject) => {
    resolveMessage = resolve;
    rejectMessage = reject;
  });

  const finish = (callback: () => void): void => {
    if (settled) return;

    settled = true;

    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (unsubscribe !== undefined) {
      unsubscribe();
      unsubscribe = undefined;
    }

    callback();
  };

  const handleMessage = (
    message: TransportMessage
  ): void => {
    if (settled) return;

    try {
      const decoded = decodeMessage<T>(message.payload);

      if (
        predicate !== undefined &&
        !predicate(decoded)
      ) {
        return;
      }

      finish(() => {
        resolveMessage(decoded);
      });
    } catch {
      // Ignore unrelated / malformed messages.
    }
  };

  try {
    // Subscribe FIRST so the caller can safely publish immediately afterwards.
    unsubscribe = await transport.subscribe(topic, handleMessage);

    if (settled) {
      unsubscribe();
      unsubscribe = undefined;
      return promise;
    }

    timer = setTimeout(() => {
      finish(() => {
        rejectMessage(
          new Error(
            `Timed out waiting for message on topic "${topic}".`
          )
        );
      });
    }, timeoutMs);
  } catch (error) {
    finish(() => {
      rejectMessage(error);
    });
  }

  return promise;
}


async function waitForMessageAfterAction<T = unknown>(
  transport: MqttTransport,
  topic: string,
  action: () => void | Promise<void>,
  predicate?: (
    message: MessageEnvelope<T>
  ) => boolean,
  timeoutMs = 3000
): Promise<MessageEnvelope<T>> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  let resolveMessage!: (value: MessageEnvelope<T>) => void;
  let rejectMessage!: (reason?: unknown) => void;

  const promise = new Promise<MessageEnvelope<T>>((resolve, reject) => {
    resolveMessage = resolve;
    rejectMessage = reject;
  });

  const finish = (callback: () => void): void => {
    if (settled) return;
    settled = true;

    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (unsubscribe !== undefined) {
      unsubscribe();
      unsubscribe = undefined;
    }

    callback();
  };

  const handleMessage = (message: TransportMessage): void => {
    if (settled) return;

    try {
      const decoded = decodeMessage<T>(message.payload);

      if (predicate !== undefined && !predicate(decoded)) {
        return;
      }

      finish(() => resolveMessage(decoded));
    } catch {
      // Ignore unrelated / malformed messages.
    }
  };

  try {
    // CRITICAL: the subscription must be fully registered before the action
    // publishes the message we are waiting for.
    unsubscribe = await transport.subscribe(topic, handleMessage);

    timer = setTimeout(() => {
      finish(() => {
        rejectMessage(
          new Error(`Timed out waiting for message on topic "${topic}".`)
        );
      });
    }, timeoutMs);

    await action();
  } catch (error) {
    finish(() => {
      rejectMessage(error);
    });
  }

  return promise;
}

async function sendMqttCommand<TPayload = unknown, TResult = unknown>(
  transport: MqttTransport,
  _topics: MqttTopicBuilder,
  deviceId: string,
  command: string,
  payload?: TPayload,
  timeoutMs = 3000
): Promise<MessageEnvelope<CommandResultData<TResult>>> {
  const commandMessage = createMessage<CommandMessageData>(
    deviceId,
    "command",
    {
      command,
      ...(payload !== undefined ? { payload } : {})
    }
  );

  const commandTopic = `iotkit/${deviceId}/commands/${command}`;
  const resultTopic = `iotkit/${deviceId}/commands/${command}/result`;

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let resolveResult!: (
    value: MessageEnvelope<CommandResultData<TResult>>
  ) => void;
  let rejectResult!: (reason?: unknown) => void;

  const resultPromise =
    new Promise<MessageEnvelope<CommandResultData<TResult>>>(
      (resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      }
    );

  const finish = (callback: () => void): void => {
    if (settled) return;

    settled = true;

    if (timer !== undefined) {
      clearTimeout(timer);
    }

    if (unsubscribe !== undefined) {
      unsubscribe();
      unsubscribe = undefined;
    }

    callback();
  };

  const handleResult = (
    message: TransportMessage
  ): void => {
    if (settled) return;

    try {
      const decoded =
        decodeMessage<CommandResultData<TResult>>(message.payload);

      if (
        decoded.type !== "command-result" ||
        decoded.deviceId !== deviceId ||
        decoded.correlationId !== commandMessage.messageId
      ) {
        return;
      }

      finish(() => {
        resolveResult(decoded);
      });
    } catch {
      // Ignore unrelated / malformed messages.
    }
  };

  try {
    // Subscribe FIRST so the command result cannot race the publish.
    unsubscribe = await transport.subscribe(
      resultTopic,
      handleResult
    );

    timer = setTimeout(() => {
      finish(() => {
        rejectResult(
          new Error(
            `Timed out waiting for command result for "${command}" on device "${deviceId}".`
          )
        );
      });
    }, timeoutMs);

    try {
      await transport.publish(
        commandTopic,
        encodeMessage(commandMessage)
      );
    } catch (error) {
      finish(() => {
        rejectResult(error);
      });
    }
  } catch (error) {
    finish(() => {
      rejectResult(error);
    });
  }

  return resultPromise;
}

function getTwinData(
  message: MessageEnvelope<unknown>
): TwinData {
  return message.data as TwinData;
}

function getTwinState(
  message: MessageEnvelope<unknown>
): Record<string, unknown> {
  return getTwinData(message).state ?? {};
}

function getTwinSensorValue(
  message: MessageEnvelope<unknown>,
  sensorId: string
): unknown {
  const sensors = getTwinData(message).sensors;

  if (!Array.isArray(sensors)) return undefined;

  const sensor = sensors.find((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null
    ) {
      return false;
    }

    const candidate = entry as {
      id?: unknown;
    };

    return candidate.id === sensorId;
  });

  if (
    typeof sensor !== "object" ||
    sensor === null
  ) {
    return undefined;
  }

  return (sensor as {
    value?: unknown;
  }).value;
}

async function main(): Promise<void> {
  console.log("=================================================");
  console.log(" IOTKIT MQTT INTEGRATION TEST");
  console.log("=================================================\n");

  const broker = await Aedes.createBroker();
  const server = net.createServer(broker.handle);

  let deviceMqtt: MqttTransport | undefined;
  let deviceTransport: DeviceTransport | undefined;
  let externalTransport: MqttTransport | undefined;
  let sdkTransport: MqttTransport | undefined;
  let fleetTransport: MqttTransport | undefined;

  try {
    // =================================================
    // MQTT BROKER
    // =================================================

    console.log(
      `Starting local MQTT broker on ${MQTT_HOST}:${MQTT_PORT}...`
    );

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);

      server.listen(
        MQTT_PORT,
        MQTT_HOST,
        () => {
          server.off("error", reject);
          resolve();
        }
      );
    });

    console.log("MQTT broker started.\n");

    // =================================================
    // EVO MAX SIMULATOR
    // =================================================

    const drone = new EvoMaxSimulator({
      id: DEVICE_ID,
      name: "EVO Max #1"
    });

    console.log("Created simulator:", {
      id: drone.device.id,
      name: drone.device.name,
      type: drone.device.type
    });

    // =================================================
    // DEVICE MQTT TRANSPORT
    // =================================================

    deviceMqtt = new MqttTransport({
      url: MQTT_URL,
      clientId: "iotkit-evo-max-01"
    });

    deviceTransport = new DeviceTransport(
      drone.device,
      deviceMqtt,
      {
        publishTwinOnConnect: true,
        publishTwinOnStateChange: true,
        publishTwinOnTelemetry: true,
        publishState: true,
        publishEvents: [
          "rule:matched",
          "rule:queueError"
        ],
        twinDebounceMs: 25
      }
    );

    await deviceTransport.connect();

    console.log("Device transport connected.\n");

    // =================================================
    // EXTERNAL MQTT CLIENT
    // =================================================

    externalTransport = new MqttTransport({
      url: MQTT_URL,
      clientId: "iotkit-external-client"
    });

    await externalTransport.connect();

    const topics = new MqttTopicBuilder("iotkit");

    // =================================================
    // TEST 1
    // =================================================

    console.log("TEST 1: Twin discovery");

    const twinTopic = topics.twin(DEVICE_ID);

    const initialTwin =
      await waitForMessage<unknown>(
        externalTransport,
        twinTopic,
        (message) =>
          message.type === "twin" &&
          message.deviceId === DEVICE_ID
      );

    assert(
      initialTwin.type === "twin",
      "Initial Twin message should have type=twin"
    );

    assert(
      initialTwin.deviceId === DEVICE_ID,
      "Twin should belong to evo-max-01"
    );

    console.log("Twin received:", initialTwin.data);
    console.log("TEST 1 completed successfully.\n");

    // =================================================
    // TEST 2
    // =================================================

    console.log("TEST 2: Telemetry");

    const telemetryTopic = topics.telemetry(
      DEVICE_ID,
      "battery"
    );

    const batteryTelemetry =
      await waitForMessageAfterAction(
        externalTransport,
        telemetryTopic,
        () => {
          drone.setBattery(90);
        },
        (message) =>
          message.type === "telemetry" &&
          message.deviceId === DEVICE_ID &&
          message.data !== undefined
      );

    console.log(
      "Battery telemetry:",
      batteryTelemetry.data
    );

    console.log("TEST 2 completed successfully.\n");

    // =================================================
    // TEST 3
    // =================================================

    console.log("TEST 3: State publication");

    const stateTopic = topics.state(
      DEVICE_ID,
      "testMode"
    );

    const stateMessage =
      await waitForMessageAfterAction(
        externalTransport,
        stateTopic,
        () => {
          drone.device.state.set("testMode", true);
        },
        (message) =>
          message.type === "state" &&
          message.deviceId === DEVICE_ID &&
          (message.data as {
            key?: string;
            value?: unknown;
          }).key === "testMode" &&
          (message.data as {
            key?: string;
            value?: unknown;
          }).value === true
      );

    console.log(
      "State message:",
      stateMessage.data
    );

    console.log("TEST 3 completed successfully.\n");

    // =================================================
    // TEST 4
    // =================================================

    console.log("TEST 4: Remote ARM command");

    const armResult = await sendMqttCommand(
      externalTransport,
      topics,
      DEVICE_ID,
      "arm"
    );

    console.log("ARM result:", armResult.data);

    assert(
      armResult.type === "command-result",
      "ARM should return command-result"
    );

    assert(
      armResult.correlationId !== undefined,
      "ARM result should contain correlationId"
    );

    await waitForMessage(
      externalTransport,
      twinTopic,
      (message) =>
        getTwinState(message).armed === true
    );

    assert(
      drone.isArmed(),
      "Drone should be armed"
    );

    console.log(
      "Drone armed:",
      drone.isArmed()
    );

    console.log("TEST 4 completed successfully.\n");

    // =================================================
    // TEST 5
    // =================================================

    console.log("TEST 5: Remote TAKEOFF command");

    const takeoffResult = await sendMqttCommand(
      externalTransport,
      topics,
      DEVICE_ID,
      "takeoff"
    );

    console.log(
      "TAKEOFF result:",
      takeoffResult.data
    );

    const flyingTwin = await waitForMessage(
      externalTransport,
      twinTopic,
      (message) =>
        getTwinState(message).flightMode ===
        "flying"
    );

    const twinAltitude =
      getTwinSensorValue(
        flyingTwin,
        "altitude"
      );

    const localAltitude =
      drone.altitude.getValue();

    console.log(
      "Flying Twin state:",
      getTwinState(flyingTwin)
    );

    console.log(
      "Flying Twin altitude:",
      twinAltitude
    );

    console.log(
      "Local simulator altitude:",
      localAltitude
    );

    assert(
      drone.getFlightMode() === "flying",
      "Drone should be flying"
    );

    assert(
      typeof localAltitude === "number" &&
        localAltitude > 0,
      "Takeoff should raise simulator altitude above 0"
    );

    assert(
      twinAltitude === localAltitude,
      "Twin altitude should match simulator altitude"
    );

    console.log(
      "Altitude:",
      localAltitude
    );

    console.log(
      "Flight mode:",
      drone.getFlightMode()
    );

    console.log("TEST 5 completed successfully.\n");

    // =================================================
    // TEST 6
    // =================================================

    console.log("TEST 6: Low battery automatic rule");

    let ruleQueueError: unknown;

    const removeRuleQueueError = drone.device.events.on(
      "rule:queueError",
      (event) => {
        ruleQueueError = event;
        console.error("[RULE] queue error:", event);
      }
    );

    // The simulator reacts to the battery threshold asynchronously.
    // The observable contract for this integration test is that lowering
    // the battery below the safety threshold automatically changes the
    // flight mode to returning.
    drone.setBattery(19);

    await delay(500);

    const batteryAfterDrop = drone.battery.getValue();
    const flightModeAfterDrop = drone.getFlightMode();

    console.log("[TEST 6] Battery:", batteryAfterDrop);
    console.log("[TEST 6] Local flight mode:", flightModeAfterDrop);

    assert(
      ruleQueueError === undefined,
      "Low battery rule queue should not report an error"
    );

    assert(
      batteryAfterDrop === 19,
      "Battery should drop to 19%"
    );

    assert(
      flightModeAfterDrop === "returning",
      "Low battery should automatically trigger return-home"
    );

    removeRuleQueueError();

    console.log("Low battery automatic return-home confirmed.");
    console.log("TEST 6 completed successfully.\n");

    // =================================================
    // TEST 7
    // =================================================

    console.log("TEST 7: Remote LAND + DISARM");

    const landResult = await sendMqttCommand(
      externalTransport,
      topics,
      DEVICE_ID,
      "land"
    );

    console.log("LAND result:", landResult.data);

    await waitForMessage(
      externalTransport,
      twinTopic,
      (message) => {
        const state = getTwinState(message);

        return (
          state.flightMode === "armed" ||
          state.flightMode === "idle"
        );
      }
    );

    assert(
      drone.altitude.getValue() === 0,
      "Drone altitude should be 0 after landing"
    );

    const disarmResult = await sendMqttCommand(
      externalTransport,
      topics,
      DEVICE_ID,
      "disarm"
    );

    console.log(
      "DISARM result:",
      disarmResult.data
    );

    await waitForMessage(
      externalTransport,
      twinTopic,
      (message) => {
        const state = getTwinState(message);

        return (
          state.armed === false &&
          state.flightMode === "idle"
        );
      }
    );

    assert(
      !drone.isArmed(),
      "Drone should be disarmed"
    );

    assert(
      drone.getFlightMode() === "idle",
      "Drone should be idle"
    );

    assert(
      drone.altitude.getValue() === 0,
      "Final altitude should be 0"
    );

    console.log(
      "Final local drone state:",
      {
        armed: drone.isArmed(),
        altitude: drone.altitude.getValue(),
        flightMode: drone.getFlightMode()
      }
    );

    console.log("TEST 7 completed successfully.\n");

    // =================================================
    // TEST 8
    // =================================================

    console.log("TEST 8: IotKitController SDK");

    sdkTransport = new MqttTransport({
      url: MQTT_URL,
      clientId: "iotkit-sdk-client"
    });

    const sdk = new IotKitController(
      sdkTransport,
      {
        commandTimeoutMs: 3000
      }
    );

    let sdkTelemetryCount = 0;
    let sdkStateCount = 0;
    let sdkTwinCount = 0;

    const removeTelemetry = sdk.onTelemetry(() => {
      sdkTelemetryCount += 1;
    });

    const removeState = sdk.onState(() => {
      sdkStateCount += 1;
    });

    const removeTwin = sdk.onTwin(() => {
      sdkTwinCount += 1;
    });

    await sdk.connect();
    await delay(100);

    const sdkArm = await sdk.sendCommand(
      DEVICE_ID,
      "arm"
    );

    assert(
      sdkArm.type === "command-result",
      "SDK ARM should return command-result"
    );

    const sdkTakeoff = await sdk.sendCommand(
      DEVICE_ID,
      "takeoff"
    );

    assert(
      sdkTakeoff.type === "command-result",
      "SDK TAKEOFF should return command-result"
    );

    await delay(100);

    assert(
      drone.isArmed(),
      "Drone should be armed through SDK"
    );

    assert(
      drone.getFlightMode() === "flying",
      "Drone should be flying through SDK"
    );

    const sdkLand = await sdk.sendCommand(
      DEVICE_ID,
      "land"
    );

    assert(
      sdkLand.type === "command-result",
      "SDK LAND should return command-result"
    );

    const sdkDisarm = await sdk.sendCommand(
      DEVICE_ID,
      "disarm"
    );

    assert(
      sdkDisarm.type === "command-result",
      "SDK DISARM should return command-result"
    );

    await delay(100);

    assert(
      !drone.isArmed(),
      "Drone should be disarmed through SDK"
    );

    assert(
      drone.altitude.getValue() === 0,
      "Drone altitude should be 0 after SDK sequence"
    );

    console.log(
      "SDK telemetry events:",
      sdkTelemetryCount
    );

    console.log(
      "SDK state events:",
      sdkStateCount
    );

    console.log(
      "SDK twin events:",
      sdkTwinCount
    );

    assert(
      sdkTelemetryCount > 0,
      "SDK should receive telemetry events"
    );

    assert(
      sdkStateCount > 0,
      "SDK should receive state events"
    );

    assert(
      sdkTwinCount > 0,
      "SDK should receive Twin events"
    );

    removeTelemetry();
    removeState();
    removeTwin();

    await sdk.disconnect();

    console.log(
      "IotKitController SDK test completed successfully.\n"
    );

    // =================================================
    // TEST 9
    // =================================================

    console.log("TEST 9: FleetManager");

    const fleet = new FleetManager({
      name: "EVO Max Fleet"
    });

    const drone1 = new EvoMaxSimulator({
      id: "evo-max-01",
      name: "EVO Max #1"
    });

    const drone2 = new EvoMaxSimulator({
      id: "evo-max-02",
      name: "EVO Max #2"
    });

    const drone3 = new EvoMaxSimulator({
      id: "evo-max-03",
      name: "EVO Max #3"
    });

    fleet.onDeviceRegistered((event) => {
      console.log(
        "[FLEET] Device registered:",
        event.device.id
      );
    });

    fleet.onDeviceUnregistered((event) => {
      console.log(
        "[FLEET] Device unregistered:",
        event.device.id
      );
    });

    fleet.onCommandExecuted((event) => {
      console.log(
        "[FLEET] Command executed:",
        {
          deviceId: event.device.id,
          command: event.command
        }
      );
    });

    fleet.register(drone1.device);
    fleet.register(drone2.device);
    fleet.register(drone3.device);

    console.log("Fleet name:", fleet.name);
    console.log("Fleet size:", fleet.size);

    assert(
      fleet.size === 3,
      "Fleet should contain 3 devices"
    );

    const uavs = fleet.findByType("uav");

    console.log(
      "Fleet UAV count:",
      uavs.length
    );

    assert(
      uavs.length === 3,
      "Fleet should contain 3 UAV devices"
    );

    const selected = fleet.require(
      "evo-max-02"
    );

    console.log(
      "Selected device:",
      {
        id: selected.id,
        name: selected.name,
        type: selected.type
      }
    );

    assert(
      selected.id === "evo-max-02",
      "Selected device should be evo-max-02"
    );

    const twins = fleet.getTwins();

    console.log(
      "Fleet twin count:",
      twins.length
    );

    assert(
      twins.length === 3,
      "Fleet should return 3 Twins"
    );

    await fleet.executeCommand(
      "evo-max-02",
      "arm"
    );

    console.log(
      "Drone 2 armed:",
      drone2.isArmed()
    );

    assert(
      drone2.isArmed(),
      "Drone 2 should be armed"
    );

    await fleet.executeCommand(
      "evo-max-02",
      "takeoff"
    );

    console.log(
      "Drone 2 altitude:",
      drone2.altitude.getValue()
    );

    console.log(
      "Drone 2 flight mode:",
      drone2.getFlightMode()
    );

    const drone2Altitude = drone2.altitude.getValue();

    assert(
      typeof drone2Altitude === "number" &&
        drone2Altitude > 0,
      "Drone 2 should have positive altitude after takeoff"
    );

    assert(
      drone2.getFlightMode() === "flying",
      "Drone 2 should be flying"
    );

    await fleet.executeCommand(
      "evo-max-02",
      "land"
    );

    await fleet.executeCommand(
      "evo-max-02",
      "disarm"
    );

    console.log(
      "Drone 2 final state:",
      {
        armed: drone2.isArmed(),
        altitude: drone2.altitude.getValue(),
        flightMode: drone2.getFlightMode()
      }
    );

    assert(
      !drone2.isArmed(),
      "Drone 2 should be disarmed"
    );

    assert(
      drone2.altitude.getValue() === 0,
      "Drone 2 altitude should be 0"
    );

    assert(
      drone2.getFlightMode() === "idle",
      "Drone 2 should be idle"
    );

    fleet.unregister("evo-max-03");

    const fleetSizeAfterUnregister =
      fleet.size;

    console.log(
      "Fleet size after unregister:",
      fleetSizeAfterUnregister
    );

    assert(
      Number(fleetSizeAfterUnregister) === 2,
      "Fleet should contain 2 devices after unregister"
    );

    fleet.removeAllListeners();

    console.log(
      "FleetManager test completed successfully.\n"
    );

    // =================================================
    // TEST 10
    // =================================================

    console.log("TEST 10: Remote command failure path");

    const unknownCommand = await sendMqttCommand(
      externalTransport,
      topics,
      DEVICE_ID,
      "command-that-does-not-exist"
    );

    console.log(
      "Unknown command result:",
      unknownCommand.data
    );

    assert(
      unknownCommand.type === "command-result",
      "Unknown command should return command-result"
    );

    assert(
      unknownCommand.deviceId === DEVICE_ID,
      "Unknown command result should belong to evo-max-01"
    );

    assert(
      unknownCommand.correlationId !== undefined,
      "Unknown command result should contain correlationId"
    );

    assert(
      unknownCommand.data.success === false,
      "Unknown command should fail with success=false"
    );

    console.log(
      "Remote command failure path confirmed."
    );

    console.log("TEST 10 completed successfully.\n");

    // =================================================
    // TEST 11
    // =================================================

    console.log("TEST 11: Message protocol round-trip");

    const protocolMessage = createMessage(
      DEVICE_ID,
      "event",
      {
        event: "integration-test",
        value: 42
      }
    );

    const encodedProtocolMessage =
      encodeMessage(protocolMessage);

    const decodedProtocolMessage =
      decodeMessage<{
        event: string;
        value: number;
      }>(encodedProtocolMessage);

    assert(
      decodedProtocolMessage.version ===
        protocolMessage.version,
      "Protocol version should survive encode/decode"
    );

    assert(
      decodedProtocolMessage.messageId ===
        protocolMessage.messageId,
      "Message ID should survive encode/decode"
    );

    assert(
      decodedProtocolMessage.deviceId ===
        protocolMessage.deviceId,
      "Device ID should survive encode/decode"
    );

    assert(
      decodedProtocolMessage.type === "event",
      "Decoded message should preserve type"
    );

    assert(
      decodedProtocolMessage.data.event ===
        "integration-test",
      "Decoded event payload should be preserved"
    );

    assert(
      decodedProtocolMessage.data.value === 42,
      "Decoded numeric payload should be preserved"
    );

    console.log("Protocol round-trip:", {
      messageId: decodedProtocolMessage.messageId,
      type: decodedProtocolMessage.type,
      data: decodedProtocolMessage.data
    });

    console.log("TEST 11 completed successfully.\n");

    // =================================================
    // TEST 12
    // =================================================

    console.log(
      "TEST 12: FleetController remote control"
    );

    fleetTransport = new MqttTransport({
      url: MQTT_URL,
      clientId: "iotkit-fleet-controller"
    });

    const fleetSdk = new IotKitController(
      fleetTransport,
      {
        commandTimeoutMs: 3000
      }
    );

    const remoteFleet = new FleetController(
      fleetSdk
    );

    remoteFleet.onDeviceDiscovered((event) => {
      console.log(
        "[FLEET CONTROLLER] Device discovered:",
        event.deviceId
      );
    });

    remoteFleet.onTwin((event) => {
      console.log(
        "[FLEET CONTROLLER] Twin updated:",
        event.deviceId
      );
    });

    await remoteFleet.connect();

    const discoveredTwin =
      await remoteFleet.waitForDevice(
        DEVICE_ID,
        3000
      );

    const discoveredData =
      discoveredTwin.data as TwinData;

    console.log(
      "Discovered remote device:",
      {
        deviceId: discoveredTwin.deviceId,
        type: discoveredData.type
      }
    );

    const knownDevices =
      remoteFleet.listDevices();

    console.log(
      "Known fleet devices:",
      knownDevices
    );

    assert(
      knownDevices.includes(DEVICE_ID),
      "FleetController should discover evo-max-01"
    );

    // ---------------------------------------------
    // Remote ARM
    // ---------------------------------------------

    console.log("\nRemote ARM");

    const remoteArm = await remoteFleet.command(
      DEVICE_ID,
      "arm"
    );

    console.log(
      "ARM result:",
      remoteArm.data
    );

    assert(
      remoteArm.type === "command-result",
      "FleetController ARM should return command-result"
    );

    await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message) =>
        getTwinState(message).armed === true,
      3000
    );

    assert(
      drone.isArmed(),
      "Remote ARM should arm the real simulator"
    );

    console.log("Remote ARM confirmed.");

    // ---------------------------------------------
    // Remote TAKEOFF
    // ---------------------------------------------

    console.log("\nRemote TAKEOFF");

    const remoteTakeoff =
      await remoteFleet.command(
        DEVICE_ID,
        "takeoff"
      );

    console.log(
      "TAKEOFF result:",
      remoteTakeoff.data
    );

    assert(
      remoteTakeoff.type === "command-result",
      "FleetController TAKEOFF should return command-result"
    );

    await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message) =>
        getTwinState(message).flightMode ===
        "flying",
      3000
    );

    assert(
      drone.getFlightMode() === "flying",
      "Remote TAKEOFF should put drone into flying mode"
    );

    console.log(
      "Remote TAKEOFF confirmed."
    );

    // ---------------------------------------------
    // Remote LAND
    // ---------------------------------------------

    console.log("\nRemote LAND");

    const remoteLand =
      await remoteFleet.command(
        DEVICE_ID,
        "land"
      );

    console.log(
      "LAND result:",
      remoteLand.data
    );

    assert(
      remoteLand.type === "command-result",
      "FleetController LAND should return command-result"
    );

    await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message) => {
        const state =
          getTwinState(message);

        return (
          state.flightMode === "armed" ||
          state.flightMode === "idle"
        );
      },
      3000
    );

    assert(
      drone.altitude.getValue() === 0,
      "Remote LAND should set altitude to 0"
    );

    console.log(
      "Remote LAND confirmed."
    );

    // ---------------------------------------------
    // Remote DISARM
    // ---------------------------------------------

    console.log("\nRemote DISARM");

    const remoteDisarm =
      await remoteFleet.command(
        DEVICE_ID,
        "disarm"
      );

    console.log(
      "DISARM result:",
      remoteDisarm.data
    );

    assert(
      remoteDisarm.type === "command-result",
      "FleetController DISARM should return command-result"
    );

    const finalRemoteTwin =
      await remoteFleet.waitForTwin(
        DEVICE_ID,
        (message) => {
          const state =
            getTwinState(message);

          return (
            state.armed === false &&
            state.flightMode === "idle"
          );
        },
        3000
      );

    const finalState =
      getTwinState(finalRemoteTwin);

    console.log(
      "Final remote state:",
      finalState
    );

    assert(
      !drone.isArmed(),
      "Remote DISARM should disarm the simulator"
    );

    assert(
      drone.altitude.getValue() === 0,
      "Final remote altitude should be 0"
    );

    assert(
      drone.getFlightMode() === "idle",
      "Final remote flight mode should be idle"
    );

    const cachedFinalTwin =
      remoteFleet.getTwin(DEVICE_ID);

    assert(
      cachedFinalTwin !== undefined,
      "FleetController should keep the latest Twin in cache"
    );

    assert(
      getTwinState(cachedFinalTwin).armed === false,
      "Cached Twin should contain the final disarmed state"
    );

    assert(
      getTwinState(cachedFinalTwin).flightMode === "idle",
      "Cached Twin should contain the final idle flight mode"
    );

    console.log("FleetController Twin cache verified.");

    await remoteFleet.disconnect();
    remoteFleet.dispose();

    console.log(
      "\nFleetController test completed successfully."
    );

    // =================================================
    // FINAL STATE
    // =================================================

    console.log("\n=================================================");
    console.log("FINAL EVO MAX #1 STATE");
    console.log("=================================================");

    console.log({
      id: drone.device.id,
      name: drone.device.name,
      running: drone.device.isRunning(),
      battery: drone.battery.getValue(),
      altitude: drone.altitude.getValue(),
      speed: drone.speed.getValue(),
      heading: drone.heading.getValue(),
      position: drone.position.getValue(),
      armed: drone.isArmed(),
      flightMode: drone.getFlightMode()
    });

    console.log(
      "\nMQTT integration test completed successfully."
    );
  } finally {
    // =================================================
    // CLEANUP
    // =================================================

    console.log("\nCleaning up...");

    try {
      await deviceTransport?.disconnect();
    } catch (error) {
      console.error(
        "DeviceTransport cleanup error:",
        error
      );
    }

    try {
      await deviceMqtt?.disconnect();
    } catch (error) {
      console.error(
        "Device MQTT cleanup error:",
        error
      );
    }

    try {
      await externalTransport?.disconnect();
    } catch (error) {
      console.error(
        "External MQTT cleanup error:",
        error
      );
    }

    try {
      await sdkTransport?.disconnect();
    } catch (error) {
      console.error(
        "SDK MQTT cleanup error:",
        error
      );
    }

    try {
      await fleetTransport?.disconnect();
    } catch (error) {
      console.error(
        "Fleet MQTT cleanup error:",
        error
      );
    }

    try {
      await new Promise<void>((resolve) => {
        broker.close(() => {
          resolve();
        });
      });
    } catch (error) {
      console.error(
        "Broker cleanup error:",
        error
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }

        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch (error) {
      console.error(
        "Server cleanup error:",
        error
      );
    }

    console.log("Cleanup completed.");
  }
}

main().catch((error: unknown) => {
  console.error(
    "\nMQTT integration test failed."
  );

  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error
  );

  process.exitCode = 1;
});
