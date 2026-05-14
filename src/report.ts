import type { ArtifactBundle, FinalScoreRow, ReplayMarker } from './schema.js';

export interface AftermathStanding {
  agentId: string;
  total: number;
  winnerShare: number;
}

export interface EliminationBeat {
  round: number;
  agentId: string;
}

export interface RoundScoreSummary {
  round: number;
  deltas: Record<string, number>;
}

export interface CountSummary {
  total: number;
  byType: Record<string, number>;
}

export interface ReplayMarkerSummary {
  total: number;
  byType: Record<string, number>;
  labels: string[];
}

export interface DivergenceSummary {
  total: number;
  byComparison: Record<string, number>;
  byOutcome: Record<string, number>;
}

export interface AftermathReport {
  runId: string;
  matchId: string;
  condition: ArtifactBundle['manifest']['condition'];
  winners: AftermathStanding[];
  standings: AftermathStanding[];
  eliminations: EliminationBeat[];
  interventionSummary: CountSummary;
  divergenceSummary: DivergenceSummary;
  replayMarkerSummary: ReplayMarkerSummary;
  roundScores: RoundScoreSummary[];
}

function sortStandings(rows: readonly FinalScoreRow[]): AftermathStanding[] {
  return [...rows]
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      return left.agentId.localeCompare(right.agentId);
    })
    .map((row) => ({
      agentId: row.agentId,
      total: row.total,
      winnerShare: row.winnerShare,
    }));
}

function countByType<T extends string>(values: readonly T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeReplayMarkers(markers: readonly ReplayMarker[]): ReplayMarkerSummary {
  return {
    total: markers.length,
    byType: countByType(markers.map((marker) => marker.markerType)),
    labels: markers.map((marker) => marker.label),
  };
}

function summarizeRoundScores(bundle: ArtifactBundle): RoundScoreSummary[] {
  return bundle.publicEvents
    .filter((event) => event.kind === 'score_delta')
    .map((event) => ({
      round: event.cursor.round,
      deltas: (event.payload.deltas as Record<string, number> | undefined) ?? {},
    }))
    .sort((left, right) => left.round - right.round);
}

function summarizeEliminations(bundle: ArtifactBundle): EliminationBeat[] {
  return bundle.publicEvents
    .filter((event) => event.kind === 'elimination')
    .flatMap((event) =>
      event.actorAgentIds.map((agentId) => ({
        round: event.cursor.round,
        agentId,
      })),
    )
    .sort((left, right) => left.round - right.round);
}

export function createAftermathReport(bundle: ArtifactBundle): AftermathReport {
  const standings = sortStandings(bundle.finalScores);
  const winners = standings.filter((row) => row.winnerShare > 0);

  return {
    runId: bundle.manifest.runId,
    matchId: bundle.manifest.matchId,
    condition: bundle.manifest.condition,
    winners,
    standings,
    eliminations: summarizeEliminations(bundle),
    interventionSummary: {
      total: bundle.interventions.length,
      byType: countByType(bundle.interventions.map((record) => record.kind)),
    },
    divergenceSummary: {
      total: bundle.commitmentDivergences.length,
      byComparison: countByType(bundle.commitmentDivergences.map((record) => record.comparison)),
      byOutcome: countByType(bundle.commitmentDivergences.map((record) => record.outcome)),
    },
    replayMarkerSummary: summarizeReplayMarkers(bundle.replayBundle.markers),
    roundScores: summarizeRoundScores(bundle),
  };
}

export function renderAftermathReport(report: AftermathReport): string {
  const lines: string[] = [];

  lines.push(`Run: ${report.runId} (${report.condition})`);
  lines.push(`Match: ${report.matchId}`);
  lines.push('');
  lines.push(`Winners: ${report.winners.map((winner) => `${winner.agentId} (${winner.total})`).join(', ') || 'none'}`);
  lines.push(
    `Eliminations: ${
      report.eliminations.map((beat) => `r${beat.round}:${beat.agentId}`).join(', ') || 'none'
    }`,
  );
  lines.push(`Interventions: ${report.interventionSummary.total}`);
  lines.push(`Divergences: ${report.divergenceSummary.total}`);
  lines.push(
    `Replay markers: ${report.replayMarkerSummary.total}${
      report.replayMarkerSummary.labels.length > 0 ? ` (${report.replayMarkerSummary.labels.join(' | ')})` : ''
    }`,
  );
  lines.push('');
  lines.push('Standings:');
  report.standings.forEach((standing, index) => {
    lines.push(`${index + 1}. ${standing.agentId} — ${standing.total}${standing.winnerShare > 0 ? ' [winner]' : ''}`);
  });

  lines.push('');
  lines.push('Round score deltas:');
  if (report.roundScores.length === 0) {
    lines.push('none');
  } else {
    for (const roundScore of report.roundScores) {
      const summary = Object.entries(roundScore.deltas)
        .map(([agentId, delta]) => `${agentId}:${delta >= 0 ? '+' : ''}${delta}`)
        .join(', ');
      lines.push(`r${roundScore.round} ${summary}`);
    }
  }

  return lines.join('\n');
}
