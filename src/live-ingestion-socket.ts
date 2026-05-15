import { unlink } from 'node:fs/promises';
import net from 'node:net';

import {
  appendAcpIngressEnvelopesToRunStore,
  currentAcpLiveControlRoomProjection,
  serializeAcpLiveRunStore,
  type AcpLiveRunStore,
} from './acp-live-run-store.js';
import type { AcpIngressEnvelope, PersistedAcpLiveRunStore } from './schema.js';
import type { LiveControlRoomProjection } from './projection.js';

const PROTOCOL_VERSION = 1;

type OneShotRequestType = 'append_ingress' | 'get_store' | 'get_projection';
type RequestType = OneShotRequestType | 'subscribe_run';
type ResponseType = 'append_ingress_ok' | 'get_store_ok' | 'get_projection_ok' | 'subscribed' | 'error';
type SubscriptionEventType = 'store_updated' | 'server_stopping' | 'store_snapshot' | 'projection_snapshot' | 'stream_error';
type SubscriptionFilterType = 'store_updated' | 'server_stopping';
type InitialSnapshotMode = 'none' | 'store' | 'projection';

export interface LiveSocketRequest {
  protocol_version: number;
  type: RequestType;
  request_id: string;
  run_id: string;
  payload: Record<string, unknown>;
}

export interface LiveSocketSuccessResponse {
  protocol_version: number;
  type: Exclude<ResponseType, 'error'>;
  request_id: string;
  run_id: string;
  payload: Record<string, unknown>;
}

export interface LiveSocketErrorResponse {
  protocol_version: number;
  type: 'error';
  request_id?: string;
  run_id?: string;
  payload: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface LiveSocketSubscriptionEvent {
  protocol_version: number;
  type: SubscriptionEventType;
  run_id: string;
  payload: Record<string, unknown>;
}

export type LiveSocketResponse = LiveSocketSuccessResponse | LiveSocketErrorResponse;
export type LiveSocketServerMessage = LiveSocketResponse | LiveSocketSubscriptionEvent;

export interface LiveIngestionSocketServerOptions {
  socketPath: string;
  initialStores?: readonly AcpLiveRunStore[];
  subscriberQueueCapacity?: number;
}

interface StoredResponseEntry {
  payloadKey: string;
  response: LiveSocketResponse;
}

interface Subscriber {
  socket: net.Socket;
  runId: string;
  requestedEvents: Set<SubscriptionFilterType>;
  queue: string[];
  flushing: boolean;
  closed: boolean;
  initialSnapshot: InitialSnapshotMode;
}

function encodeMessage(message: LiveSocketServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

function payloadKey(payload: unknown): string {
  return JSON.stringify(payload);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(line: string): LiveSocketRequest {
  const parsed = JSON.parse(line) as unknown;
  if (!isObjectRecord(parsed)) {
    throw new Error('request must be a JSON object');
  }

  const protocolVersion = parsed.protocol_version;
  const type = parsed.type;
  const requestId = parsed.request_id;
  const runId = parsed.run_id;
  const payload = parsed.payload;

  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('unsupported protocol version');
  }

  if (
    type !== 'append_ingress'
    && type !== 'get_store'
    && type !== 'get_projection'
    && type !== 'subscribe_run'
  ) {
    throw new Error('unknown request type');
  }

  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new Error('request_id must be a non-empty string');
  }

  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error('run_id must be a non-empty string');
  }

  if (!isObjectRecord(payload)) {
    throw new Error('payload must be an object');
  }

  return {
    protocol_version: protocolVersion,
    type,
    request_id: requestId,
    run_id: runId,
    payload,
  };
}

function parseSubscriptionFilterEvents(value: unknown): Set<SubscriptionFilterType> {
  if (!Array.isArray(value)) {
    throw new Error('subscribe_run payload.events must be an array');
  }

  const events = new Set<SubscriptionFilterType>();
  for (const item of value) {
    if (item !== 'store_updated' && item !== 'server_stopping') {
      throw new Error(`unsupported subscribe_run event ${String(item)}`);
    }
    events.add(item);
  }
  return events;
}

function parseInitialSnapshotMode(value: unknown): InitialSnapshotMode {
  if (value === undefined) {
    return 'none';
  }
  if (value === 'none' || value === 'store' || value === 'projection') {
    return value;
  }
  throw new Error('subscribe_run payload.initial_snapshot must be one of none, store, projection');
}

export class LiveIngestionSocketServer {
  private readonly socketPath: string;

  private readonly stores = new Map<string, AcpLiveRunStore>();

  private readonly storeRevisions = new Map<string, number>();

  private readonly appendRequestCache = new Map<string, StoredResponseEntry>();

  private readonly subscribersByRun = new Map<string, Set<Subscriber>>();

  private readonly subscriberQueueCapacity: number;

  private server: net.Server | null = null;

  private stopping = false;

  constructor(options: LiveIngestionSocketServerOptions) {
    this.socketPath = options.socketPath;
    this.subscriberQueueCapacity = options.subscriberQueueCapacity ?? 64;
    for (const store of options.initialStores ?? []) {
      this.registerStore(store);
    }
  }

  registerStore(store: AcpLiveRunStore): void {
    this.stores.set(store.manifest.runId, store);
    this.storeRevisions.set(store.manifest.runId, this.storeRevisions.get(store.manifest.runId) ?? 0);
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('live ingestion socket server already started');
    }

    this.stopping = false;
    await unlink(this.socketPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });

    this.server = net.createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.socketPath, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    this.stopping = true;
    this.broadcastServerStopping();

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await unlink(this.socketPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';
    let handled = false;

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      if (handled) {
        return;
      }

      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      handled = true;
      const line = buffer.slice(0, newlineIndex);
      void this.handleLine(socket, line);
    });
  }

  private async handleLine(socket: net.Socket, line: string): Promise<void> {
    let request: LiveSocketRequest;
    try {
      request = parseRequest(line);
    } catch {
      socket.end();
      return;
    }

    if (this.stopping) {
      socket.end(encodeMessage(this.errorResponse(request, 'server_stopping', 'server is shutting down', true)));
      return;
    }

    if (request.type === 'subscribe_run') {
      this.handleSubscribe(socket, request);
      return;
    }

    const response = this.handleOneShotRequest(request);
    socket.end(encodeMessage(response));
  }

  private handleOneShotRequest(request: LiveSocketRequest): LiveSocketResponse {
    if (request.type === 'append_ingress') {
      return this.handleAppendIngress(request);
    }

    if (request.type === 'get_store') {
      return this.handleGetStore(request);
    }

    return this.handleGetProjection(request);
  }

  private handleSubscribe(socket: net.Socket, request: LiveSocketRequest): void {
    const store = this.stores.get(request.run_id);
    if (!store) {
      socket.end(encodeMessage(this.errorResponse(request, 'unknown_run', `unknown run ${request.run_id}`, false)));
      return;
    }

    let requestedEvents: Set<SubscriptionFilterType>;
    let initialSnapshot: InitialSnapshotMode;
    try {
      requestedEvents = parseSubscriptionFilterEvents(request.payload.events);
      initialSnapshot = parseInitialSnapshotMode(request.payload.initial_snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      socket.end(encodeMessage(this.errorResponse(request, 'invalid_payload', message, false)));
      return;
    }

    const subscriber: Subscriber = {
      socket,
      runId: request.run_id,
      requestedEvents,
      queue: [],
      flushing: false,
      closed: false,
      initialSnapshot,
    };
    const runSubscribers = this.subscribersByRun.get(request.run_id) ?? new Set<Subscriber>();
    runSubscribers.add(subscriber);
    this.subscribersByRun.set(request.run_id, runSubscribers);

    socket.on('close', () => this.removeSubscriber(subscriber));
    socket.on('error', () => this.removeSubscriber(subscriber));

    this.enqueueSubscriberMessage(subscriber, {
      protocol_version: PROTOCOL_VERSION,
      type: 'subscribed',
      request_id: request.request_id,
      run_id: request.run_id,
      payload: {
        events: [...requestedEvents],
        initial_snapshot: initialSnapshot,
        current_store_revision: this.storeRevisions.get(request.run_id) ?? 0,
      },
    });

    if (initialSnapshot === 'store') {
      this.enqueueSubscriberMessage(subscriber, this.storeSnapshotEvent(request.run_id, store));
    } else if (initialSnapshot === 'projection') {
      this.enqueueSubscriberMessage(subscriber, this.projectionSnapshotEvent(request.run_id, store));
    }
  }

  private handleAppendIngress(request: LiveSocketRequest): LiveSocketResponse {
    const store = this.stores.get(request.run_id);
    if (!store) {
      return this.errorResponse(request, 'unknown_run', `unknown run ${request.run_id}`, false);
    }

    const envelopes = request.payload.envelopes;
    if (!Array.isArray(envelopes)) {
      return this.errorResponse(request, 'invalid_payload', 'append_ingress payload.envelopes must be an array', false);
    }

    const cacheKey = `${request.run_id}:append_ingress:${request.request_id}`;
    const nextPayloadKey = payloadKey(request.payload);
    const cached = this.appendRequestCache.get(cacheKey);
    if (cached) {
      if (cached.payloadKey !== nextPayloadKey) {
        return this.errorResponse(
          request,
          'request_id_conflict',
          `request_id ${request.request_id} was already used with a different payload`,
          false,
        );
      }
      return cached.response;
    }

    const updatedStore = appendAcpIngressEnvelopesToRunStore(
      store,
      envelopes as AcpIngressEnvelope[],
    );
    this.stores.set(request.run_id, updatedStore);
    const nextRevision = (this.storeRevisions.get(request.run_id) ?? 0) + 1;
    this.storeRevisions.set(request.run_id, nextRevision);

    const response: LiveSocketSuccessResponse = {
      protocol_version: PROTOCOL_VERSION,
      type: 'append_ingress_ok',
      request_id: request.request_id,
      run_id: request.run_id,
      payload: {
        appended_count: envelopes.length,
        store_revision: nextRevision,
        latest_cursor: updatedStore.state.matchState.current,
        open_await_count: updatedStore.state.matchState.openAwaitIds.length,
      },
    };
    this.appendRequestCache.set(cacheKey, { payloadKey: nextPayloadKey, response });
    this.publishStoreUpdated(request.run_id, updatedStore, nextRevision);
    return response;
  }

  private handleGetStore(request: LiveSocketRequest): LiveSocketResponse {
    const store = this.stores.get(request.run_id);
    if (!store) {
      return this.errorResponse(request, 'unknown_run', `unknown run ${request.run_id}`, false);
    }

    const serialized: PersistedAcpLiveRunStore = serializeAcpLiveRunStore(store);
    return {
      protocol_version: PROTOCOL_VERSION,
      type: 'get_store_ok',
      request_id: request.request_id,
      run_id: request.run_id,
      payload: {
        store_revision: this.storeRevisions.get(request.run_id) ?? 0,
        store: serialized,
      },
    };
  }

  private handleGetProjection(request: LiveSocketRequest): LiveSocketResponse {
    const store = this.stores.get(request.run_id);
    if (!store) {
      return this.errorResponse(request, 'unknown_run', `unknown run ${request.run_id}`, false);
    }

    const projection: LiveControlRoomProjection = currentAcpLiveControlRoomProjection(store);
    return {
      protocol_version: PROTOCOL_VERSION,
      type: 'get_projection_ok',
      request_id: request.request_id,
      run_id: request.run_id,
      payload: {
        store_revision: this.storeRevisions.get(request.run_id) ?? 0,
        projection,
      },
    };
  }

  private publishStoreUpdated(runId: string, store: AcpLiveRunStore, storeRevision: number): void {
    const subscribers = this.subscribersByRun.get(runId);
    if (!subscribers) {
      return;
    }

    const event: LiveSocketSubscriptionEvent = {
      protocol_version: PROTOCOL_VERSION,
      type: 'store_updated',
      run_id: runId,
      payload: {
        store_revision: storeRevision,
        latest_cursor: store.state.matchState.current,
        open_await_count: store.state.matchState.openAwaitIds.length,
        projection_dirty: true,
      },
    };

    for (const subscriber of subscribers) {
      if (subscriber.requestedEvents.has('store_updated')) {
        this.enqueueSubscriberMessage(subscriber, event);
      }
    }
  }

  private broadcastServerStopping(): void {
    for (const [, subscribers] of this.subscribersByRun) {
      for (const subscriber of subscribers) {
        this.enqueueSubscriberMessage(subscriber, {
          protocol_version: PROTOCOL_VERSION,
          type: 'server_stopping',
          run_id: subscriber.runId,
          payload: {
            code: 'server_stopping',
            message: 'server is shutting down',
            retryable: true,
          },
        });
        subscriber.socket.end();
      }
    }
  }

  private storeSnapshotEvent(runId: string, store: AcpLiveRunStore): LiveSocketSubscriptionEvent {
    return {
      protocol_version: PROTOCOL_VERSION,
      type: 'store_snapshot',
      run_id: runId,
      payload: {
        store_revision: this.storeRevisions.get(runId) ?? 0,
        store: serializeAcpLiveRunStore(store),
      },
    };
  }

  private projectionSnapshotEvent(runId: string, store: AcpLiveRunStore): LiveSocketSubscriptionEvent {
    return {
      protocol_version: PROTOCOL_VERSION,
      type: 'projection_snapshot',
      run_id: runId,
      payload: {
        store_revision: this.storeRevisions.get(runId) ?? 0,
        projection: currentAcpLiveControlRoomProjection(store),
      },
    };
  }

  private enqueueSubscriberMessage(subscriber: Subscriber, message: LiveSocketServerMessage): void {
    if (subscriber.closed) {
      return;
    }

    if (subscriber.queue.length >= this.subscriberQueueCapacity) {
      this.sendStreamError(subscriber, 'slow_subscriber', 'subscriber queue exceeded capacity', true);
      return;
    }

    subscriber.queue.push(encodeMessage(message));
    this.flushSubscriber(subscriber);
  }

  private flushSubscriber(subscriber: Subscriber): void {
    if (subscriber.flushing || subscriber.closed) {
      return;
    }

    subscriber.flushing = true;
    const writeNext = (): void => {
      if (subscriber.closed) {
        subscriber.flushing = false;
        return;
      }

      const next = subscriber.queue.shift();
      if (!next) {
        subscriber.flushing = false;
        return;
      }

      const writable = subscriber.socket.write(next);
      if (writable) {
        setImmediate(writeNext);
        return;
      }

      subscriber.socket.once('drain', writeNext);
    };
    writeNext();
  }

  private sendStreamError(subscriber: Subscriber, code: string, message: string, retryable: boolean): void {
    if (subscriber.closed) {
      return;
    }

    subscriber.socket.write(encodeMessage({
      protocol_version: PROTOCOL_VERSION,
      type: 'stream_error',
      run_id: subscriber.runId,
      payload: {
        code,
        message,
        retryable,
      },
    }));
    subscriber.socket.end();
    this.removeSubscriber(subscriber);
  }

  private removeSubscriber(subscriber: Subscriber): void {
    if (subscriber.closed) {
      return;
    }

    subscriber.closed = true;
    const subscribers = this.subscribersByRun.get(subscriber.runId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      this.subscribersByRun.delete(subscriber.runId);
    }
  }

  private errorResponse(
    request: Pick<LiveSocketRequest, 'request_id' | 'run_id'>,
    code: string,
    message: string,
    retryable: boolean,
  ): LiveSocketErrorResponse {
    return {
      protocol_version: PROTOCOL_VERSION,
      type: 'error',
      request_id: request.request_id,
      run_id: request.run_id,
      payload: {
        code,
        message,
        retryable,
      },
    };
  }
}
