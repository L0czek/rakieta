#!/usr/bin/env python3
"""Replay a recording written by the mqtt-recorder compose service.

Does the same as replay-mqtt.sh, but over a single broker connection, which makes it many
times faster. Needs the paho-mqtt package (see requirements.txt next to this file):

    python3 -m venv scripts/.venv
    scripts/.venv/bin/pip install -r scripts/requirements.txt
    scripts/.venv/bin/python scripts/replay-mqtt.py recordings/<file>.tsv
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time

try:
    import paho.mqtt.client as mqtt
except ImportError:
    raise SystemExit(
        "The paho-mqtt package is missing. Install it with\n"
        "  pip install -r scripts/requirements.txt\n"
        "preferably inside a virtual environment, or use replay-mqtt.sh instead."
    )

# Messages handed to the client library but not yet written to the broker. Reading the file
# is far quicker than the network, so sending is paused while this many are outstanding.
MAX_OUTSTANDING = 2000
CONNECT_TIMEOUT_S = 10
DRAIN_TIMEOUT_S = 60

# A broker with a limited per-subscriber queue (Mosquitto's max_queued_messages, 1000 unless
# configured) drops messages for a subscriber that reads slower than the replay sends,
# without telling anyone. This repository's mosquitto.conf removes that limit, so the replay
# runs unthrottled by default; the check below catches brokers that still drop.
#
# Mosquitto counts the messages it dropped for slow subscribers and republishes the count
# every sys_interval (10 s by default) when it changed.
DROPPED_TOPIC = "$SYS/broker/publish/messages/dropped"
DROPPED_SETTLE_S = 11


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="replay-mqtt.py",
        description=(
            "Publish every line of a recording to its original topic with the original QoS "
            "and retain flag, in file order, over a single connection. Recorded wall-clock "
            "times are ignored. Messages on cmd/# are never replayed because the firmware "
            "would execute them."
        ),
    )
    parser.add_argument("recording", help="recording .tsv file from the recordings/ directory")
    parser.add_argument(
        "host",
        nargs="?",
        default=os.environ.get("MQTT_HOST", "127.0.0.1"),
        help="broker host (default: $MQTT_HOST or 127.0.0.1)",
    )
    parser.add_argument(
        "port",
        nargs="?",
        type=int,
        default=int(os.environ.get("MQTT_PORT", "1883")),
        help="broker port (default: $MQTT_PORT or 1883)",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=0,
        metavar="MSG_PER_S",
        help="send at most this many messages per second (default: no limit)",
    )
    parser.add_argument(
        "--no-drop-check",
        action="store_true",
        help=(
            f"do not wait {DROPPED_SETTLE_S} s after the replay to ask the broker whether it "
            "dropped messages for a slow subscriber"
        ),
    )
    return parser.parse_args()


class Replayer:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.lock = threading.Condition()
        self.connected = False
        self.connect_error: str | None = None
        self.lost_connection: str | None = None
        self.queued = 0
        self.written = 0
        self.dropped_by_broker: int | None = None

        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_publish = self._on_publish
        self.client.on_message = self._on_message
        # The retained firmware ELF is a single message of about 12 MB.
        self.client.max_queued_messages_set(0)

    def _on_connect(self, _client, _userdata, _flags, reason_code, _properties) -> None:
        with self.lock:
            if reason_code.is_failure:
                self.connect_error = str(reason_code)
            else:
                self.connected = True
                self.client.subscribe(DROPPED_TOPIC)
            self.lock.notify_all()

    def _on_disconnect(self, _client, _userdata, _flags, reason_code, _properties) -> None:
        with self.lock:
            if self.connected:
                self.lost_connection = str(reason_code)
            self.connected = False
            self.lock.notify_all()

    def _on_publish(self, _client, _userdata, _mid, _reason_code, _properties) -> None:
        # Called once the message is on the wire (QoS 0) or acknowledged (QoS 1 and 2).
        with self.lock:
            self.written += 1
            self.lock.notify_all()

    def _on_message(self, _client, _userdata, message) -> None:
        if message.topic != DROPPED_TOPIC:
            return
        try:
            dropped = int(message.payload)
        except ValueError:
            return
        with self.lock:
            self.dropped_by_broker = dropped
            self.lock.notify_all()

    def dropped_count(self, wait_s: float = 0) -> int | None:
        """The broker's dropped-message counter, or None if the broker does not publish it."""
        with self.lock:
            if wait_s > 0:
                self.lock.wait_for(lambda: self.dropped_by_broker is not None, timeout=wait_s)
            return self.dropped_by_broker

    def connect(self) -> None:
        try:
            self.client.connect(self.host, self.port, keepalive=60)
        except OSError as error:
            raise SystemExit(f"Cannot connect to {self.host}:{self.port}: {error}") from error
        self.client.loop_start()

        with self.lock:
            self.lock.wait_for(
                lambda: self.connected or self.connect_error is not None,
                timeout=CONNECT_TIMEOUT_S,
            )
            if self.connect_error is not None:
                raise SystemExit(f"Broker refused the connection: {self.connect_error}")
            if not self.connected:
                raise SystemExit(f"No answer from the broker at {self.host}:{self.port}.")

    def _fail_if_disconnected(self) -> None:
        if self.lost_connection is not None:
            raise SystemExit(
                f"Lost the connection to the broker ({self.lost_connection}) after "
                f"{self.written} messages; the replay is incomplete."
            )

    def publish(self, topic: str, payload: bytes, qos: int, retain: bool) -> None:
        with self.lock:
            self.lock.wait_for(
                lambda: self.queued - self.written < MAX_OUTSTANDING
                or self.lost_connection is not None
            )
            self._fail_if_disconnected()
            self.queued += 1
        self.client.publish(topic, payload, qos=qos, retain=retain)

    def disconnect(self) -> None:
        self.client.disconnect()
        self.client.loop_stop()

    def drain(self) -> None:
        with self.lock:
            drained = self.lock.wait_for(
                lambda: self.written >= self.queued or self.lost_connection is not None,
                timeout=DRAIN_TIMEOUT_S,
            )
            self._fail_if_disconnected()
            if not drained:
                raise SystemExit(
                    f"The broker did not take the last {self.queued - self.written} messages "
                    f"within {DRAIN_TIMEOUT_S} s; the replay is incomplete."
                )


def read_recording(path: str):
    """Yield (line number, topic, qos, retain, payload) for every line of the recording."""
    with open(path, "rb") as recording:
        for number, raw_line in enumerate(recording, start=1):
            line = raw_line.rstrip(b"\r\n")
            if not line:
                continue

            fields = line.split(b"\t")
            if len(fields) != 5:
                raise SystemExit(
                    f"{path}:{number}: expected 5 tab-separated fields, found {len(fields)}."
                )
            _recorded_at, topic, qos, retain, payload_hex = fields

            try:
                yield (
                    number,
                    topic.decode("utf-8"),
                    int(qos),
                    retain == b"1",
                    bytes.fromhex(payload_hex.decode("ascii")),
                )
            except ValueError as error:
                raise SystemExit(f"{path}:{number}: {error}") from error


def main() -> None:
    args = parse_args()
    if not os.path.isfile(args.recording):
        raise SystemExit(f"Recording not found: {args.recording}")
    if args.rate < 0:
        raise SystemExit("--rate must not be negative.")

    replayer = Replayer(args.host, args.port)
    replayer.connect()
    dropped_before = None if args.no_drop_check else replayer.dropped_count(wait_s=1)

    sent = 0
    skipped = 0
    started = time.monotonic()
    last_progress = started
    show_progress = sys.stderr.isatty()

    for _number, topic, qos, retain, payload in read_recording(args.recording):
        if topic.startswith("cmd/"):
            skipped += 1
            continue

        if args.rate > 0:
            due = started + sent / args.rate
            delay = due - time.monotonic()
            if delay > 0:
                time.sleep(delay)

        replayer.publish(topic, payload, qos, retain)
        sent += 1

        if show_progress and time.monotonic() - last_progress >= 0.5:
            last_progress = time.monotonic()
            print(f"\r{sent} messages sent", end="", file=sys.stderr, flush=True)

    replayer.drain()
    elapsed = time.monotonic() - started
    if show_progress:
        print("\r", end="", file=sys.stderr)
    rate = sent / elapsed if elapsed > 0 else 0
    print(
        f"Replayed {sent} messages in {elapsed:.1f} s ({rate:.0f} per second), "
        f"skipped {skipped} on cmd/#."
    )

    if dropped_before is not None:
        print(f"Asking the broker about dropped messages ({DROPPED_SETTLE_S} s) ...", flush=True)
        time.sleep(DROPPED_SETTLE_S)
        dropped = (replayer.dropped_count() or 0) - dropped_before
        if dropped > 0:
            replayer.disconnect()
            raise SystemExit(
                f"The broker dropped {dropped} messages because a subscriber could not keep "
                "up. The frontend history from this replay is incomplete. Set "
                "'max_queued_messages 0' in the broker configuration, or clear the history "
                "and replay again with --rate."
            )
        print("The broker dropped nothing.")

    replayer.disconnect()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit("\nInterrupted; the replay is incomplete.")
