import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/data/supabase/types";

export interface GmailFinanceConnectionStatus {
  connected: boolean;
  gmailEmail: string | null;
  lastSyncAt: string | null;
  lastSuccessfulImportAt: string | null;
  lastImportStartedAt: string | null;
  lastImportCompletedAt: string | null;
  lastImportWindowStartAt: string | null;
  lastImportWindowEndAt: string | null;
  lastImportEmailsScanned: number;
  lastImportAttachmentsImported: number;
  lastImportItemsSkipped: number;
}

export interface GmailFinanceSyncResult {
  imported: number;
  skipped: number;
  emailsScanned: number;
  windowStartAt: string;
  windowEndAt: string;
}

export interface GmailFinanceSyncOverride {
  mode?: "default" | "today" | "last_3_days" | "custom";
  windowDays?: number;
}

export class GmailDocumentImportService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getStatus(): Promise<GmailFinanceConnectionStatus> {
    const { data, error } = await this.client.functions.invoke<GmailFinanceConnectionStatus>(
      "gmail-finance-import",
      { body: { action: "status" } },
    );
    if (error) {
      throw error;
    }
    return data ?? {
      connected: false,
      gmailEmail: null,
      lastSyncAt: null,
      lastSuccessfulImportAt: null,
      lastImportStartedAt: null,
      lastImportCompletedAt: null,
      lastImportWindowStartAt: null,
      lastImportWindowEndAt: null,
      lastImportEmailsScanned: 0,
      lastImportAttachmentsImported: 0,
      lastImportItemsSkipped: 0,
    };
  }

  async getConnectUrl(redirectTo: string): Promise<string> {
    const { data, error } = await this.client.functions.invoke<{ authUrl: string }>(
      "gmail-finance-import",
      { body: { action: "connect-url", redirectTo } },
    );
    if (error) {
      throw error;
    }
    if (!data?.authUrl) {
      throw new Error("Gmail authorization URL was not returned.");
    }
    return data.authUrl;
  }

  async sync(override?: GmailFinanceSyncOverride): Promise<GmailFinanceSyncResult> {
    const { data, error } = await this.client.functions.invoke<GmailFinanceSyncResult>(
      "gmail-finance-import",
      { body: { action: "sync", override } },
    );
    if (error) {
      throw error;
    }
    return data ?? {
      imported: 0,
      skipped: 0,
      emailsScanned: 0,
      windowStartAt: "",
      windowEndAt: "",
    };
  }

  async disconnect(): Promise<void> {
    const { error } = await this.client.functions.invoke(
      "gmail-finance-import",
      { body: { action: "disconnect" } },
    );
    if (error) {
      throw error;
    }
  }
}
