export interface PullScope {
  table: string;
  since?: string;
}

export interface PullSyncPort {
  pull(scopes: PullScope[]): Promise<void>;
}

export class PullSyncService {
  constructor(private readonly port: PullSyncPort) {}

  async refresh(scopes: PullScope[]): Promise<void> {
    await this.port.pull(scopes);
  }
}
