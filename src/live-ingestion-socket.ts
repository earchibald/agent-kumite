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

type RequestType = 'append_ingress' | 'get_store' | 'get_projection';
type ResponseType = 'append_ingress_ok' | 'get_store_ok' | 'get_projection_ok' | 'error';

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

export type LiveSocketResponse = LiveSocketSuccessResponse | LiveSocketErrorResponse;

export interface LiveIngestionSocketServerOptions {
  socketPath: string;
  initialStores?: readonly AcpLiveRunStore[];
}

interface StoredResponseEntry {
  payloadKey: string;
  response: LiveSocketResponse;
}

function encodeMessage(message: LiveSocketResponse): string {
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

  if (type !== 'append_ingress' && type !== 'get_store' && type !== 'get_projection') {
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

export class LiveIngestionSocketServer {
  private readonly socketPath: string;

  private readonly stores = new Map<string, AcpLiveRunStore>();

  private readonly storeRevisions = new Map<string, number>();

  private readonly appendRequestCache = new Map<string, StoredResponseEntry>();

  private server: net.Server | null = null;

  constructor(options: LiveIngestionSocketServerOptions) {
    this.socketPath = options.socketPath;
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
    } catch (error) {
      socket.end();
      return;
    }

    const response = this.handleRequest(request);
    socket.end(encodeMessage(response));
  }

  private handleRequest(request: LiveSocketRequest): LiveSocketResponse {
    if (request.type === 'append_ingress') {
      return this.handleAppendIngress(request);
    }

    if (request.type === 'get_store') {
      return this.handleGetStore(request);
    }

    return this.handleGetProjection(request);
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
        return this.errorResponse(request, 'request_id_conflict', `request_id ${request.request_id} was already used with a different payload`, false);
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
