---
title: "Agent Kumite — Live Ingestion Socket Protocol"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-14
locked_by: AK-44
supersedes: []
---

# Live Ingestion Socket Protocol

## Framing (binding)

> **The first non-file incremental ingress boundary for Agent Kumite is a local Unix Domain Socket that carries newline-delimited JSON with explicit request `type`, one-shot request/response semantics for store/projection reads and ingress appends, and an optional long-lived subscription stream for run updates.**

This is a locked decision, not a candidate. It operationalises the architecture boundary that ACP-backed live execution must normalize into canonical Kumite records before projection, and the Swift control-room rule that the run store is appended before downstream views recompute.[^architecture][^swift]

The point is not to pick a fashionable IPC layer. The point is to fix the first incremental live boundary tightly enough that the next implementation slice can proceed without inventing transport behavior ad hoc:

1. **Transport framing.** How bytes on the socket become messages.
2. **Message roles.** Which requests are one-shot and which are long-lived streams.
3. **Backpressure behavior.** What happens when subscribers fall behind.
4. **Shutdown semantics.** How the server stops without invalidating active senders or subscribers.

## Why this boundary exists

The file-backed stack is now complete:

1. build a live store from manifest + roster + ingress
2. persist the canonical live store
3. append more ingress onto that persisted store
4. project live control-room JSON from either raw inputs or the persisted store

The next step is not another file format. It is the first incremental transport boundary for live updates.

That transport must preserve the existing invariants:

- ACP-aligned envelopes remain the only incremental ingress payload
- the canonical live store remains authoritative
- projections remain derived views, not the only home of a fact
- `awaiting` lifecycle, replay markers, and round/phase boundaries remain canonical runtime state rather than surface-local guesses[^awaiting][^swift]

## Transport choice

### Binding decision

The transport is locked to:

- **Unix Domain Socket**
- **stream-oriented connection**
- **UTF-8 newline-delimited JSON**
- **symmetric encoder/decoder framing** on both client and server

The framing rule is simple:

1. every request, response, and streamed event is exactly one JSON object
2. every JSON object is terminated by one newline
3. both sides treat newline-delimited JSON as the only framing rule for the protocol

Manual mixed framing is forbidden. The implementation should use encoder/decoder-based newline framing symmetrically unless a later spec explicitly supersedes this.

### What is not locked here

This spec does **not** lock:

- the exact filesystem path of the socket
- launch tooling or daemon supervision
- remote TCP or HTTP exposure
- provider-facing APIs or ACP server internals

Those are deployment concerns. This spec only locks the on-wire local IPC contract once a client is connected.

## Connection model

One socket serves multiple runs. Messages always name the target `run_id`.

There are two connection lifecycles:

1. **One-shot request connections** — client sends one request, server sends one terminal response, server closes the connection.
2. **Subscription connections** — client sends one `subscribe_run` request, server sends one `subscribed` acknowledgment, then continues streaming event objects until the client disconnects or the server stops.

The protocol does **not** support arbitrary multiplexing or sequential request reuse on one-shot connections. The first transport seam should stay single-request-per-connection for one-shot RPCs.

## Common message envelope

Every message on the socket is a JSON object with:

```json
{
  "protocol_version": 1,
  "type": "append_ingress",
  "request_id": "req_01",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {}
}
```

The binding rules are:

1. **`protocol_version` is mandatory** on every request, response, and event.
2. **`type` is mandatory** and is the primary discriminator.
3. **`request_id` is mandatory** on all client-initiated requests and echoed by their terminal response.
4. **`run_id` is mandatory** on every run-scoped request and every run-scoped server event.
5. **`payload` is always an object** even when empty.

Unknown top-level fields are allowed but ignored unless a future spec says otherwise.

`request_id` is also the idempotency key for `append_ingress` within a live server process, scoped by `(run_id, type, request_id)`:

1. re-sending the same `append_ingress` request with the same `request_id`, `run_id`, `type`, and identical payload must return the original terminal success or error without re-applying the append
2. reusing a prior `request_id` with a different payload is a protocol error with code `request_id_conflict`
3. reusing the same `request_id` on a different `run_id` is allowed

`store_revision` is a strictly monotonic integer per run. It increases exactly once after each successful `append_ingress` that changes the canonical store, and all store/projection responses or events report the current revision they reflect.

## One-shot request types

### `append_ingress`

`append_ingress` is the canonical incremental write path.

Payload:

```json
{
  "envelopes": [/* ACP ingress envelopes */]
}
```

Semantics:

1. the server validates every envelope against the canonical ACP ingress contract
2. the server appends those envelopes to the run store in order
3. the server updates replay bookkeeping and derived live projection state
4. the server returns one terminal success or error response

Success response:

```json
{
  "protocol_version": 1,
  "type": "append_ingress_ok",
  "request_id": "req_01",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "appended_count": 2,
    "store_revision": 7,
    "latest_cursor": { "round": 3, "phase": "task_submission" },
    "open_await_count": 0
  }
}
```

### `get_store`

`get_store` returns the canonical persisted live-store JSON shape for one run.

Payload:

```json
{}
```

Success response:

```json
{
  "protocol_version": 1,
  "type": "get_store_ok",
  "request_id": "req_03",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "store_revision": 7,
    "store": { /* canonical persisted ACP live run-store JSON */ }
  }
}
```

### `get_projection`

`get_projection` returns the live control-room projection for one run.

Payload:

```json
{}
```

Success response:

```json
{
  "protocol_version": 1,
  "type": "get_projection_ok",
  "request_id": "req_04",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "store_revision": 7,
    "projection": { /* canonical live control-room projection JSON */ }
  }
}
```

## Subscription lifecycle

### `subscribe_run`

`subscribe_run` opens a long-lived stream for one run.

Payload:

```json
{
  "events": ["store_updated", "server_stopping"],
  "initial_snapshot": "projection"
}
```

The server responds once with:

```json
{
  "protocol_version": 1,
  "type": "subscribed",
  "request_id": "req_02",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "events": ["store_updated", "server_stopping"],
    "initial_snapshot": "projection",
    "current_store_revision": 7
  }
}
```

After that, the connection becomes server-streaming.

If `initial_snapshot` is:

- `none` — the server streams only future events
- `store` — the server immediately emits one `store_snapshot` event for `current_store_revision`
- `projection` — the server immediately emits one `projection_snapshot` event for `current_store_revision`

That bootstrap rule is binding. Clients must not have to guess whether a separate `get_store` / `get_projection` raced with subscription startup.

### Streamed event types

The first transport seam locks only two server events:

1. **`store_updated`** — emitted after a successful append changes the canonical run store
2. **`server_stopping`** — emitted during graceful shutdown before the stream closes

If `initial_snapshot != none`, one of these snapshot events is also emitted immediately after `subscribed`:

- `store_snapshot`
- `projection_snapshot`

`store_snapshot` payload:

```json
{
  "store_revision": 7,
  "store": { /* canonical persisted ACP live run-store JSON */ }
}
```

`projection_snapshot` payload:

```json
{
  "store_revision": 7,
  "projection": { /* canonical live control-room projection JSON */ }
}
```

`store_updated` payload:

```json
{
  "store_revision": 8,
  "latest_cursor": { "round": 3, "phase": "task_submission" },
  "open_await_count": 0,
  "projection_dirty": true
}
```

The event is intentionally summary-shaped. Clients that need the full store or full projection use `get_store`, `get_projection`, or the initial snapshot mechanism.

Every streamed event that represents current run state must carry the `store_revision` it reflects. If a client detects a revision gap or reconnects after disconnect, it must treat the stream as best-effort and recover from the latest store/projection snapshot rather than assuming event replay.

## Backpressure policy

Slow subscribers must **not** block canonical store appends.

The backpressure contract is:

1. append requests stay authoritative and complete independently of subscriber speed
2. subscription fan-out uses a bounded queue per subscriber
3. queue depth is implementation-defined but must be documented and should default to at least 64 events
4. if that queue fills, the server **disconnects that subscriber** with a terminal `stream_error` frame sent directly on the socket rather than through the bounded queue
5. the server closes the connection immediately after that terminal `stream_error`
6. append traffic still proceeds
7. reconnect + `get_store` / `get_projection` is the recovery path

This is a deliberate disconnect-on-full policy, not an accident.

The reason is operational: the live store remains authoritative, and replayable recovery already exists at the store/projection layer. A slow dashboard must not stall the run store.

`server_stopping` is best-effort and is sent regardless of the subscriber's requested event filter.

`server_stopping` payload:

```json
{
  "code": "server_stopping",
  "message": "server is shutting down",
  "retryable": true
}
```

## Error contract

All one-shot failures use one error shape:

```json
{
  "protocol_version": 1,
  "type": "error",
  "request_id": "req_01",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "code": "unknown_request",
    "message": "unsupported request type",
    "retryable": false
  }
}
```

The first transport seam must use documented `code` values at least for:

- `unsupported_protocol_version`
- `unknown_request`
- `invalid_payload`
- `unknown_run`
- `request_id_conflict`
- `slow_subscriber`
- `server_stopping`

Invalid JSON that cannot be decoded into one framed object is terminal for that connection and may close the connection without a protocol error frame, because `request_id` / `run_id` may not be recoverable.

Subscription-specific terminal failures use one stream error shape:

```json
{
  "protocol_version": 1,
  "type": "stream_error",
  "run_id": "run_demo_c5_seed_0001",
  "payload": {
    "code": "slow_subscriber",
    "message": "subscriber queue exceeded capacity",
    "retryable": true
  }
}
```

`stream_error` is terminal for that subscription connection and is not required to echo `request_id`.

## Shutdown semantics

Shutdown is part of the protocol, not just a process concern.

The shutdown order is locked:

1. stop accepting new connections
2. reject any one-shot request decoded after shutdown start with `server_stopping`
3. allow only requests already fully decoded before shutdown start to finish
4. emit `server_stopping` to active subscribers where possible
5. stop subscriber fan-out only after active senders are done
6. then close subscription connections and socket resources

The server must not close shared subscriber/event machinery before in-flight append handlers are guaranteed not to publish into it.

## Mapping and invariant rules

The transport is local IPC only. It does **not** redefine Kumite identity.

The invariant rules are:

1. **transport connection identity is ephemeral**
2. **`run_id`, `match_id`, `await_id`, round, and phase remain canonical**
3. **every append path still normalizes ACP envelopes before projection**
4. **every projection remains a derived view over the canonical store**
5. **provider-specific credentials, OAuth, and SDK details never appear on this socket**

If a transport message cannot be reduced into the same canonical store and live projection the file-backed adapters already use, it is out of spec.

## Out of scope

This spec does not lock:

- remote multi-host transport
- authentication beyond local process/file permissions
- provider-facing protocol details
- multiplexed multiple subscriptions per connection
- binary framing
- historical replay streaming beyond `get_store` / `get_projection`

Those may come later, but they are not phase-1 transport requirements.

## Decision summary

The first incremental live ingress transport is therefore:

- **local**
- **UDS**
- **newline-delimited JSON**
- **explicit request `type`**
- **one-shot requests plus optional run subscription**
- **disconnect-on-full subscriber backpressure**
- **graceful shutdown that waits senders before tearing down shared fan-out**

That is the seam the next implementation slice should build.

[^architecture]: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)
[^swift]: [`swift-control-room.md`](./swift-control-room.md)
[^awaiting]: [`awaiting-human-nudge-state.md`](./awaiting-human-nudge-state.md)
