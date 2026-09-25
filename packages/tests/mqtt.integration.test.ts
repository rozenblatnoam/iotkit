import net from "node:net";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
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
  MqttTransport,
  MqttTopicBuilder,
} from "../../packages/core/src/index.js";

import type {
  CommandResultData,
  MessageEnvelope,
  TransportMessage,
} from "../../packages/core/src/index.js";

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

const DEVICE_ID = "evo-max-01";

let broker: Awaited<ReturnType<typeof Aedes.createBroker>>;
let server: net.Server;
let mqttUrl = "";
let drone: EvoMaxSimulator;
let deviceMqtt: MqttTransport;
let deviceTransport: DeviceTransport;
let externalTransport: MqttTransport;
let sdkTransport: MqttTransport;
let fleetTransport: MqttTransport;
let topics: MqttTopicBuilder;

function getTwinData(message: MessageEnvelope<unknown>): TwinData {
  return message.data as TwinData;
}

function getTwinState(message: MessageEnvelope<unknown>): Record<string, unknown> {
  return getTwinData(message).state ?? {};
}

function getTwinSensorValue(
  message: MessageEnvelope<unknown>,
  sensorId: string,
): unknown {
  const sensors = getTwinData(message).sensors;
  if (!Array.isArray(sensors)) return undefined;

  const sensor = sensors.find((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    return (entry as { id?: unknown }).id === sensorId;
  });

  if (typeof sensor !== "object" || sensor === null) return undefined;
  return (sensor as { value?: unknown }).value;
}

async function waitForMessage<T = unknown>(
  transport: MqttTransport,
  topic: string,
  predicate?: (message: MessageEnvelope<T>) => boolean,
  timeoutMs = 3000,
): Promise<MessageEnvelope<T>> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const promise = new Promise<MessageEnvelope<T>>((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      unsubscribe = undefined;
      callback();
    };

    const handleMessage = (message: TransportMessage): void => {
      if (settled) return;
      try {
        const decoded = decodeMessage<T>(message.payload);
        if (predicate && !predicate(decoded)) return;
        finish(() => resolve(decoded));
      } catch {
        // Ignore malformed/unrelated messages.
      }
    };

    void (async () => {
      try {
        // Subscribe before starting the timer/publisher to avoid races.
        unsubscribe = await transport.subscribe(topic, handleMessage);
        if (settled) {
          const remove = unsubscribe;
          unsubscribe = undefined;
          remove?.();
          return;
        }

        timer = setTimeout(() => {
          finish(() =>
            reject(new Error(`Timed out waiting for message on topic "${topic}".`)),
          );
        }, timeoutMs);
      } catch (error) {
        finish(() => reject(error));
      }
    })();
  });

  return promise;
}

async function waitForMessageAfterAction<T = unknown>(
  transport: MqttTransport,
  topic: string,
  action: () => void | Promise<void>,
  predicate?: (message: MessageEnvelope<T>) => boolean,
  timeoutMs = 3000,
): Promise<MessageEnvelope<T>> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const promise = new Promise<MessageEnvelope<T>>((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      unsubscribe = undefined;
      callback();
    };

    const handleMessage = (message: TransportMessage): void => {
      if (settled) return;
      try {
        const decoded = decodeMessage<T>(message.payload);
        if (predicate && !predicate(decoded)) return;
        finish(() => resolve(decoded));
      } catch {
        // Ignore malformed/unrelated messages.
      }
    };

    void (async () => {
      try {
        unsubscribe = await transport.subscribe(topic, handleMessage);
        timer = setTimeout(() => {
          finish(() =>
            reject(new Error(`Timed out waiting for message on topic "${topic}".`)),
          );
        }, timeoutMs);
        await action();
      } catch (error) {
        finish(() => reject(error));
      }
    })();
  });

  return promise;
}

async function sendMqttCommand<TResult = unknown>(
  transport: MqttTransport,
  deviceId: string,
  command: string,
  payload?: unknown,
  timeoutMs = 3000,
): Promise<MessageEnvelope<CommandResultData<TResult>>> {
  const commandMessage = createMessage<CommandMessageData>(
    deviceId,
    "command",
    {
      command,
      ...(payload !== undefined ? { payload } : {}),
    },
  );

  const commandTopic = topics.command(deviceId, command);
  const resultTopic = topics.commandResult(deviceId, command);

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const promise = new Promise<MessageEnvelope<CommandResultData<TResult>>>((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      unsubscribe = undefined;
      callback();
    };

    const handleResult = (message: TransportMessage): void => {
      if (settled) return;
      try {
        const decoded = decodeMessage<CommandResultData<TResult>>(message.payload);
        if (
          decoded.type !== "command-result" ||
          decoded.deviceId !== deviceId ||
          decoded.correlationId !== commandMessage.messageId
        ) {
          return;
        }
        finish(() => resolve(decoded));
      } catch {
        // Ignore malformed/unrelated messages.
      }
    };

    void (async () => {
      try {
        unsubscribe = await transport.subscribe(resultTopic, handleResult);
        timer = setTimeout(() => {
          finish(() =>
            reject(
              new Error(
                `Timed out waiting for command result for "${command}" on device "${deviceId}".`,
              ),
            ),
          );
        }, timeoutMs);

        await transport.publish(commandTopic, encodeMessage(commandMessage));
      } catch (error) {
        finish(() => reject(error));
      }
    })();
  });

  return promise;
}

function listen(serverToListen: net.Server, host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      serverToListen.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      serverToListen.off("error", onError);
      const address = serverToListen.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve MQTT broker address."));
        return;
      }
      resolve(address.port);
    };

    serverToListen.once("error", onError);
    serverToListen.once("listening", onListening);
    serverToListen.listen(0, host);
  });
}

async function closeTransport(transport: MqttTransport | undefined): Promise<void> {
  if (!transport) return;
  try {
    await transport.disconnect();
  } catch {
    // Cleanup should not hide the test failure.
  }
}

before(async () => {
  broker = await Aedes.createBroker();
  server = net.createServer(broker.handle);
  const port = await listen(server);
  mqttUrl = `mqtt://127.0.0.1:${port}`;

  drone = new EvoMaxSimulator({
    id: DEVICE_ID,
    name: "EVO Max #1",
  });

  deviceMqtt = new MqttTransport({
    url: mqttUrl,
    clientId: "iotkit-test-device",
  });

  deviceTransport = new DeviceTransport(drone.device, deviceMqtt, {
    publishTwinOnConnect: true,
    publishTwinOnStateChange: true,
    publishTwinOnTelemetry: true,
    publishState: true,
    publishEvents: ["rule:matched", "rule:queueError"],
    twinDebounceMs: 25,
  });

  await deviceTransport.connect();

  externalTransport = new MqttTransport({
    url: mqttUrl,
    clientId: "iotkit-test-external",
  });
  await externalTransport.connect();

  sdkTransport = new MqttTransport({
    url: mqttUrl,
    clientId: "iotkit-test-sdk",
  });

  fleetTransport = new MqttTransport({
    url: mqttUrl,
    clientId: "iotkit-test-fleet",
  });

  topics = new MqttTopicBuilder("iotkit");
});

after(async () => {
  await closeTransport(fleetTransport);
  await closeTransport(sdkTransport);
  await closeTransport(externalTransport);
  await closeTransport(deviceMqtt);

  try {
    await deviceTransport.disconnect();
  } catch {
    // Ignore cleanup errors.
  }

  try {
    broker.close();
  } catch {
    // Ignore cleanup errors.
  }

  await new Promise<void>((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
});

test("MQTT / UAV integration", { concurrency: false }, async (t) => {
  const twinTopic = topics.twin(DEVICE_ID);

  await t.test("Twin discovery", async () => {
    const twin = await waitForMessage(
      externalTransport,
      twinTopic,
      (message) => message.type === "twin" && message.deviceId === DEVICE_ID,
    );

    assert.equal(twin.type, "twin");
    assert.equal(twin.deviceId, DEVICE_ID);

    const data = getTwinData(twin);
    assert.equal(data.type, "uav");
    assert.ok(Array.isArray(data.sensors));
    assert.ok(Array.isArray(data.capabilities));
  });

  await t.test("Telemetry and state publication", async () => {
    const telemetryTopic = topics.telemetry(DEVICE_ID, "battery");
    const telemetry = await waitForMessageAfterAction(
      externalTransport,
      telemetryTopic,
      () => drone.setBattery(90),
      (message) =>
        message.type === "telemetry" &&
        message.deviceId === DEVICE_ID &&
        message.data !== undefined,
    );

    assert.equal((telemetry.data as { value: number }).value, 90);

    const stateTopic = topics.state(DEVICE_ID, "testMode");
    const state = await waitForMessageAfterAction(
      externalTransport,
      stateTopic,
      () => {
        drone.device.state.set("testMode", true);
      },
      (message) =>
        message.type === "state" &&
        message.deviceId === DEVICE_ID &&
        (message.data as { key?: string }).key === "testMode" &&
        (message.data as { value?: unknown }).value === true,
    );

    assert.deepEqual(state.data, { key: "testMode", value: true });
  });

  await t.test("Remote MQTT commands: ARM → TAKEOFF → LAND → DISARM", async () => {
    drone.setBattery(100);

   const armTwinPromise = waitForMessage(
  externalTransport,
  twinTopic,
  (message) => getTwinState(message).armed === true,
);

const arm = await sendMqttCommand(externalTransport, DEVICE_ID, "arm");
assert.equal(arm.type, "command-result");
assert.equal(arm.data.success, true);
assert.notEqual(arm.correlationId, undefined);

await armTwinPromise;
assert.equal(drone.isArmed(), true);

    const takeoff = await sendMqttCommand(externalTransport, DEVICE_ID, "takeoff");
    assert.equal(takeoff.data.success, true);

    const flyingTwin = await waitForMessage(
      externalTransport,
      twinTopic,
      (message: MessageEnvelope<unknown>) => getTwinState(message).flightMode === "flying",
    );
    assert.equal(drone.getFlightMode(), "flying");
    assert.equal(getTwinSensorValue(flyingTwin, "altitude"), drone.altitude.getValue());
    assert.ok((drone.altitude.getValue() ?? 0) > 0);

    const land = await sendMqttCommand(externalTransport, DEVICE_ID, "land");
    assert.equal(land.data.success, true);
    assert.equal(drone.altitude.getValue(), 0);

    const disarm = await sendMqttCommand(externalTransport, DEVICE_ID, "disarm");
    assert.equal(disarm.data.success, true);

    await waitForMessage(
      externalTransport,
      twinTopic,
      (message: MessageEnvelope<unknown>) =>
        getTwinState(message).armed === false &&
        getTwinState(message).flightMode === "idle",
    );

    assert.equal(drone.isArmed(), false);
    assert.equal(drone.getFlightMode(), "idle");
  });

  await t.test("Low-battery automatic safety behavior", async () => {
    drone.setBattery(100);
    await sendMqttCommand(externalTransport, DEVICE_ID, "arm");
    await sendMqttCommand(externalTransport, DEVICE_ID, "takeoff");

    drone.setBattery(19);

    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(drone.battery.getValue(), 19);
    assert.equal(drone.getFlightMode(), "returning");
  });

  await t.test("IotKitController SDK", async () => {
    const sdk = new IotKitController(sdkTransport, { commandTimeoutMs: 3000 });
    await sdk.connect();
    let telemetryCount = 0;
    let stateCount = 0;
    let twinCount = 0;

    const removeTelemetry = sdk.onTelemetry(() => telemetryCount++);
    const removeState = sdk.onState(() => stateCount++);
    const removeTwin = sdk.onTwin(() => twinCount++);

    drone.setBattery(100);

    const arm = await sdk.sendCommand(DEVICE_ID, "arm");
    assert.equal(arm.type, "command-result");

    const takeoff = await sdk.sendCommand(DEVICE_ID, "takeoff");
    assert.equal(takeoff.type, "command-result");
    assert.equal(drone.getFlightMode(), "flying");

    const land = await sdk.sendCommand(DEVICE_ID, "land");
    assert.equal(land.type, "command-result");

    const disarm = await sdk.sendCommand(DEVICE_ID, "disarm");
    assert.equal(disarm.type, "command-result");

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(drone.isArmed(), false);
    assert.equal(drone.altitude.getValue(), 0);
    assert.ok(telemetryCount > 0);
    assert.ok(stateCount > 0);
    assert.ok(twinCount > 0);

    removeTelemetry();
    removeState();
    removeTwin();
    await sdk.disconnect();
  });

  await t.test("Unknown command failure path", async () => {
    const result = await sendMqttCommand(
      externalTransport,
      DEVICE_ID,
      "command-that-does-not-exist",
    );

    assert.equal(result.type, "command-result");
    assert.equal(result.data.success, false);
    assert.equal(result.data.command, "command-that-does-not-exist");
    assert.match(String(result.data.error), /not found/i);
  });

  await t.test("FleetManager", async () => {
    const fleet = new FleetManager({ name: "EVO Max Fleet" });
    const drone1 = new EvoMaxSimulator({ id: "fleet-01", name: "Fleet #1" });
    const drone2 = new EvoMaxSimulator({ id: "fleet-02", name: "Fleet #2" });
    const drone3 = new EvoMaxSimulator({ id: "fleet-03", name: "Fleet #3" });

    fleet.register(drone1.device);
    fleet.register(drone2.device);
    fleet.register(drone3.device);

    assert.equal(fleet.size, 3);
    assert.equal(fleet.findByType("uav").length, 3);
    assert.equal(fleet.require("fleet-02").id, "fleet-02");
    assert.equal(fleet.getTwins().length, 3);

    await fleet.executeCommand("fleet-02", "arm");
    await fleet.executeCommand("fleet-02", "takeoff");
    assert.equal(drone2.isArmed(), true);
    assert.equal(drone2.getFlightMode(), "flying");
    assert.ok((drone2.altitude.getValue() ?? 0) > 0);

    await fleet.executeCommand("fleet-02", "land");
    await fleet.executeCommand("fleet-02", "disarm");

    assert.equal(drone2.isArmed(), false);
    assert.equal(drone2.altitude.getValue(), 0);
    assert.equal(drone2.getFlightMode(), "idle");

    fleet.unregister("fleet-03");
    assert.equal(fleet.size, 2);
    fleet.removeAllListeners();
  });

  await t.test("FleetController remote control and Twin cache", async () => {
    await fleetTransport.connect();

    const sdk = new IotKitController(fleetTransport, { commandTimeoutMs: 3000 });
    const remoteFleet = new FleetController(sdk);

    await remoteFleet.connect();

    const discovered = await remoteFleet.waitForDevice(DEVICE_ID, 3000);
    assert.equal(discovered.deviceId, DEVICE_ID);
    assert.equal(remoteFleet.listDevices().includes(DEVICE_ID), true);

    drone.setBattery(100);

    const arm = await remoteFleet.command(DEVICE_ID, "arm");
    assert.equal(arm.data.success, true);
    await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message: MessageEnvelope<unknown>) => getTwinState(message).armed === true,
      3000,
    );
    assert.equal(drone.isArmed(), true);

    const takeoff = await remoteFleet.command(DEVICE_ID, "takeoff");
    assert.equal(takeoff.data.success, true);
    await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message: MessageEnvelope<unknown>) => getTwinState(message).flightMode === "flying",
      3000,
    );

    const land = await remoteFleet.command(DEVICE_ID, "land");
    assert.equal(land.data.success, true);
    assert.equal(drone.altitude.getValue(), 0);

    const disarm = await remoteFleet.command(DEVICE_ID, "disarm");
    assert.equal(disarm.data.success, true);

    const finalTwin = await remoteFleet.waitForTwin(
      DEVICE_ID,
      (message: MessageEnvelope<unknown>) =>
        getTwinState(message).armed === false &&
        getTwinState(message).flightMode === "idle",
      3000,
    );

    const cachedTwin = remoteFleet.getTwin(DEVICE_ID);
    assert.ok(cachedTwin);
    assert.equal(getTwinState(finalTwin).armed, false);
    assert.equal(getTwinState(cachedTwin).flightMode, "idle");

    await remoteFleet.disconnect();
    remoteFleet.dispose();
  });
});
