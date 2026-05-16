import type { LiveSocketSubscriptionFilterType, LiveSocketInitialSnapshotMode } from './live-ingestion-socket.js';
import {
  appendIngressFileViaLiveSocket,
  getLiveProjectionViaSocket,
  getLiveRunStoreViaSocket,
  subscribeToLiveRun,
} from './live-ingestion-socket-client.js';

type InspectCommand = 'get-store' | 'get-projection' | 'append-ingress' | 'subscribe';

interface BaseInspectCliOptions {
  command: InspectCommand;
  socketPath: string;
  runId: string;
  requestId?: string;
  pretty: boolean;
}

export interface LiveSocketInspectGetStoreCliOptions extends BaseInspectCliOptions {
  command: 'get-store';
}

export interface LiveSocketInspectGetProjectionCliOptions extends BaseInspectCliOptions {
  command: 'get-projection';
}

export interface LiveSocketInspectAppendIngressCliOptions extends BaseInspectCliOptions {
  command: 'append-ingress';
  ingressPath: string;
}

export interface LiveSocketInspectSubscribeCliOptions extends BaseInspectCliOptions {
  command: 'subscribe';
  events: readonly LiveSocketSubscriptionFilterType[];
  initialSnapshot: LiveSocketInitialSnapshotMode;
  limit?: number;
}

export type LiveSocketInspectCliOptions =
  | LiveSocketInspectGetStoreCliOptions
  | LiveSocketInspectGetProjectionCliOptions
  | LiveSocketInspectAppendIngressCliOptions
  | LiveSocketInspectSubscribeCliOptions;

export function parseLiveSocketInspectCliArgs(args: readonly string[]): LiveSocketInspectCliOptions {
  const command = args[0];
  if (
    command !== 'get-store'
    && command !== 'get-projection'
    && command !== 'append-ingress'
    && command !== 'subscribe'
  ) {
    throw new Error('missing required command: get-store, get-projection, append-ingress, or subscribe');
  }

  let socketPath: string | undefined;
  let runId: string | undefined;
  let requestId: string | undefined;
  let ingressPath: string | undefined;
  let pretty = false;
  const events: LiveSocketSubscriptionFilterType[] = [];
  let initialSnapshot: LiveSocketInitialSnapshotMode = 'none';
  let limit: number | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--socket') {
      socketPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--run-id') {
      runId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--request-id') {
      requestId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--ingress') {
      ingressPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--event') {
      const event = args[index + 1];
      if (event !== 'store_updated' && event !== 'server_stopping') {
        throw new Error(`unsupported --event ${String(event)}`);
      }
      events.push(event);
      index += 1;
      continue;
    }

    if (arg === '--initial-snapshot') {
      const value = args[index + 1];
      if (value !== 'none' && value !== 'store' && value !== 'projection') {
        throw new Error('--initial-snapshot must be one of none, store, projection');
      }
      initialSnapshot = value;
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const value = Number.parseInt(args[index + 1] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      limit = value;
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!socketPath) {
    throw new Error('missing required --socket <live-ingestion.sock>');
  }

  if (!runId) {
    throw new Error('missing required --run-id <run-id>');
  }

  const base = {
    socketPath,
    runId,
    pretty,
    ...(requestId ? { requestId } : {}),
  };

  if (command === 'append-ingress') {
    if (!ingressPath) {
      throw new Error('missing required --ingress <acp-ingress.json>');
    }
    return { ...base, command: 'append-ingress', ingressPath };
  }

  if (command === 'subscribe') {
    return {
      ...base,
      command: 'subscribe',
      events: events.length > 0 ? events : ['store_updated', 'server_stopping'],
      initialSnapshot,
      ...(limit ? { limit } : {}),
    };
  }

  if (command === 'get-store') {
    return { ...base, command: 'get-store' };
  }

  return { ...base, command: 'get-projection' };
}

function formatMessage(value: unknown, pretty: boolean): string {
  return `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;
}

export async function runLiveSocketInspectCommand(
  options: LiveSocketInspectCliOptions,
  write: (chunk: string) => void,
): Promise<void> {
  switch (options.command) {
    case 'get-store':
      write(formatMessage(await getLiveRunStoreViaSocket(options), options.pretty));
      return;
    case 'get-projection':
      write(formatMessage(await getLiveProjectionViaSocket(options), options.pretty));
      return;
    case 'append-ingress':
      write(formatMessage(await appendIngressFileViaLiveSocket(options), options.pretty));
      return;
    case 'subscribe': {
      const subscriptionRequest = {
        socketPath: options.socketPath,
        runId: options.runId,
        events: options.events,
        initialSnapshot: options.initialSnapshot,
        ...(options.requestId ? { requestId: options.requestId } : {}),
      };
      const subscription = await subscribeToLiveRun(subscriptionRequest);
      let count = 0;
      try {
        while (options.limit === undefined || count < options.limit) {
          const message = await subscription.nextMessage();
          write(formatMessage(message, options.pretty));
          count += 1;
        }
      } finally {
        subscription.close();
      }
    }
  }
}

export function liveSocketInspectUsageText(): string {
  return 'Usage: agent-kumite-live-inspect <get-store|get-projection|append-ingress|subscribe> --socket <live-ingestion.sock> --run-id <run-id> [--request-id <id>] [--pretty] [--ingress <acp-ingress.json>] [--event <store_updated|server_stopping>] [--initial-snapshot <none|store|projection>] [--limit <count>]';
}
