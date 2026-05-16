import net from 'node:net';

import { readAcpIngressEnvelopeListFromFile } from './acp-ingress-file.js';
import { LIVE_INGESTION_SOCKET_PROTOCOL_VERSION } from './live-ingestion-socket.js';
import type { LiveControlRoomProjection } from './projection.js';
import type { AcpIngressEnvelope, PersistedAcpLiveRunStore } from './schema.js';
import type {
  LiveSocketErrorResponse,
  LiveSocketInitialSnapshotMode,
  LiveSocketRequest,
  LiveSocketResponse,
  LiveSocketServerMessage,
  LiveSocketSubscriptionEvent,
  LiveSocketSubscriptionFilterType,
  LiveSocketSuccessResponse,
} from './live-ingestion-socket.js';

export interface LiveIngestionSocketClientOptions {
  socketPath: string;
}

export interface AppendIngressRequestOptions extends LiveIngestionSocketClientOptions {
  runId: string;
  requestId?: string;
  envelopes: readonly AcpIngressEnvelope[];
}

export interface AppendIngressFromFileOptions extends LiveIngestionSocketClientOptions {
  runId: string;
  requestId?: string;
  ingressPath: string;
}

export interface GetLiveRunStoreRequestOptions extends LiveIngestionSocketClientOptions {
  runId: string;
  requestId?: string;
}

export interface GetLiveProjectionRequestOptions extends LiveIngestionSocketClientOptions {
  runId: string;
  requestId?: string;
}

export interface SubscribeToLiveRunOptions extends LiveIngestionSocketClientOptions {
  runId: string;
  requestId?: string;
  events: readonly LiveSocketSubscriptionFilterType[];
  initialSnapshot?: LiveSocketInitialSnapshotMode;
}

export interface LiveRunSubscription {
  nextMessage(): Promise<LiveSocketSuccessResponse | LiveSocketSubscriptionEvent>;
  close(): void;
}

interface PendingWaiter {
  resolve: (value: LiveSocketSuccessResponse | LiveSocketSubscriptionEvent) => void;
  reject: (reason?: unknown) => void;
}

export class LiveIngestionSocketProtocolError extends Error {
  readonly response: LiveSocketErrorResponse;

  constructor(response: LiveSocketErrorResponse) {
    super(response.payload.message);
    this.name = 'LiveIngestionSocketProtocolError';
    this.response = response;
  }
}

function nextRequestId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseServerMessage(line: string): LiveSocketServerMessage {
  const parsed = JSON.parse(line) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('live ingestion socket message must be a JSON object');
  }

  return parsed as LiveSocketServerMessage;
}

function isErrorResponse(message: LiveSocketResponse): message is LiveSocketErrorResponse {
  return message.type === 'error';
}

async function sendOneShotRequest(
  request: LiveSocketRequest,
  options: LiveIngestionSocketClientOptions,
): Promise<LiveSocketSuccessResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(options.socketPath);
    let buffer = '';
    let settled = false;

    const finishResolve = (value: LiveSocketSuccessResponse): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      socket.end();
    };

    const finishReject = (reason: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(reason);
      socket.destroy();
    };

    socket.setEncoding('utf8');
    socket.once('error', finishReject);
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      try {
        const response = parseServerMessage(buffer.slice(0, newlineIndex)) as LiveSocketResponse;
        if (isErrorResponse(response)) {
          finishReject(new LiveIngestionSocketProtocolError(response));
          return;
        }
        finishResolve(response);
      } catch (error) {
        finishReject(error);
      }
    });
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

export async function appendIngressViaLiveSocket(
  options: AppendIngressRequestOptions,
): Promise<LiveSocketSuccessResponse> {
  return sendOneShotRequest({
    protocol_version: LIVE_INGESTION_SOCKET_PROTOCOL_VERSION,
    type: 'append_ingress',
    request_id: options.requestId ?? nextRequestId('append'),
    run_id: options.runId,
    payload: {
      envelopes: [...options.envelopes],
    },
  }, options);
}

export async function appendIngressFileViaLiveSocket(
  options: AppendIngressFromFileOptions,
): Promise<LiveSocketSuccessResponse> {
  const envelopes = await readAcpIngressEnvelopeListFromFile(options.ingressPath);
  const request: AppendIngressRequestOptions = {
    socketPath: options.socketPath,
    runId: options.runId,
    envelopes,
    ...(options.requestId ? { requestId: options.requestId } : {}),
  };
  return appendIngressViaLiveSocket(request);
}

export async function getLiveRunStoreViaSocket(
  options: GetLiveRunStoreRequestOptions,
): Promise<PersistedAcpLiveRunStore> {
  const response = await sendOneShotRequest({
    protocol_version: LIVE_INGESTION_SOCKET_PROTOCOL_VERSION,
    type: 'get_store',
    request_id: options.requestId ?? nextRequestId('get_store'),
    run_id: options.runId,
    payload: {},
  }, options);

  return response.payload.store as PersistedAcpLiveRunStore;
}

export async function getLiveProjectionViaSocket(
  options: GetLiveProjectionRequestOptions,
): Promise<LiveControlRoomProjection> {
  const response = await sendOneShotRequest({
    protocol_version: LIVE_INGESTION_SOCKET_PROTOCOL_VERSION,
    type: 'get_projection',
    request_id: options.requestId ?? nextRequestId('get_projection'),
    run_id: options.runId,
    payload: {},
  }, options);

  return response.payload.projection as LiveControlRoomProjection;
}

export async function subscribeToLiveRun(
  options: SubscribeToLiveRunOptions,
): Promise<LiveRunSubscription> {
  const socket = net.createConnection(options.socketPath);
  let buffer = '';
  const received: Array<LiveSocketSuccessResponse | LiveSocketSubscriptionEvent> = [];
  const pending: PendingWaiter[] = [];
  let closedError: Error | null = null;

  const resolveNext = (message: LiveSocketSuccessResponse | LiveSocketSubscriptionEvent): void => {
    const waiter = pending.shift();
    if (waiter) {
      waiter.resolve(message);
      return;
    }
    received.push(message);
  };

  const rejectAll = (error: Error): void => {
    closedError = error;
    while (pending.length > 0) {
      pending.shift()?.reject(error);
    }
  };

  await new Promise<void>((resolve, reject) => {
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('error', (error) => {
      rejectAll(error instanceof Error ? error : new Error(String(error)));
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        try {
          const message = parseServerMessage(buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
          if (message.type === 'error') {
            const error = new LiveIngestionSocketProtocolError(message);
            rejectAll(error);
            if (received.length === 0 && pending.length === 0) {
              reject(error);
            }
            socket.destroy();
            return;
          }
          resolveNext(message);
        } catch (error) {
          const parsedError = error instanceof Error ? error : new Error(String(error));
          rejectAll(parsedError);
          reject(parsedError);
          socket.destroy();
          return;
        }
      }
    });
    socket.on('close', () => {
      rejectAll(closedError ?? new Error('live ingestion subscription closed'));
    });
    socket.once('connect', () => {
      socket.write(`${JSON.stringify({
        protocol_version: LIVE_INGESTION_SOCKET_PROTOCOL_VERSION,
        type: 'subscribe_run',
        request_id: options.requestId ?? nextRequestId('subscribe'),
        run_id: options.runId,
        payload: {
          events: [...options.events],
          initial_snapshot: options.initialSnapshot ?? 'none',
        },
      } satisfies LiveSocketRequest)}\n`);
      resolve();
    });
  });

  return {
    nextMessage: () => {
      const next = received.shift();
      if (next) {
        return Promise.resolve(next);
      }
      if (closedError) {
        return Promise.reject(closedError);
      }
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    close: () => socket.end(),
  };
}
