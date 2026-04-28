import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type { User } from "@/domain/users/types";
import {
  buildNextNumberPreview,
  getNumberingConfig,
  mergeOrgBusinessSettings,
  readOrgBusinessSettings,
  type OrgBusinessSettings,
} from "@/services/settings/org-settings";

const JOB_ATTACHMENTS_BUCKET = "job-attachments";

function chunk<T>(items: T[], size: number): T[][];
function chunk<T>(items: T[], size: number): Array<T[]> {
  const groups: Array<T[]> = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function canManageSettings(user: User): boolean {
  return user.role === "owner";
}

function buildLogoDataUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

export interface SettingsUserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

export interface SettingsInviteRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: "Invited";
  createdAt: string;
}

export interface SettingsData {
  companyName: string;
  company: Pick<
    OrgBusinessSettings,
    | "companyPhone"
    | "companyEmail"
    | "companyAddressLine1"
    | "companyAddressLine2"
    | "companyCity"
    | "companyRegion"
    | "companyPostalCode"
  >;
  numbering: Pick<
    OrgBusinessSettings,
    "jobNumberPrefix" | "jobNumberIncludeYear" | "quoteNumberPrefix" | "quoteNumberIncludeYear"
  > & {
    nextJobNumberPreview: string;
    nextQuoteNumberPreview: string;
    currentJobCounter: number | null;
    currentQuoteCounter: number | null;
  };
  pricing: Pick<
    OrgBusinessSettings,
    "defaultTaxRate" | "defaultLaborCostRate" | "defaultLaborSellRate" | "defaultMaterialMarkup"
  >;
  logoDataUrl: string | null;
  users: SettingsUserRow[];
  pendingInvites: SettingsInviteRow[];
}

export class SettingsService {
  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {}

  private assertCanManageSettings() {
    if (!canManageSettings(this.currentUser)) {
      throw new Error("You cannot access settings.");
    }
  }

  async getSettings(): Promise<SettingsData> {
    this.assertCanManageSettings();

    const [
      { data: org, error: orgError },
      { data: appSettings },
      { data: counters, error: countersError },
      { data: users, error: usersError },
      { data: invites, error: invitesError },
    ] = await Promise.all([
      this.client.from("orgs").select("id, name, settings").eq("id", this.context.orgId).single(),
      this.client.from("app_settings").select("id, logo_b64").maybeSingle(),
      this.client.from("org_counters").select("counter_type, last_value").eq("org_id", this.context.orgId),
      this.client
        .from("users")
        .select("id, full_name, email, role, is_active")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true }),
      this.client
        .from("user_invites")
        .select("id, full_name, email, role, created_at")
        .eq("org_id", this.context.orgId)
        .is("accepted_at", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (orgError) throw orgError;
    if (countersError) throw countersError;
    if (usersError) throw usersError;
    if (invitesError) throw invitesError;

    const settings = readOrgBusinessSettings(org.settings);
    const jobNumbering = getNumberingConfig("job", settings);
    const quoteNumbering = getNumberingConfig("quote", settings);
    const counterByType = new Map((counters ?? []).map((row) => [row.counter_type, row.last_value]));

    return {
      companyName: org.name,
      company: {
        companyPhone: settings.companyPhone,
        companyEmail: settings.companyEmail,
        companyAddressLine1: settings.companyAddressLine1,
        companyAddressLine2: settings.companyAddressLine2,
        companyCity: settings.companyCity,
        companyRegion: settings.companyRegion,
        companyPostalCode: settings.companyPostalCode,
      },
      numbering: {
        jobNumberPrefix: settings.jobNumberPrefix,
        jobNumberIncludeYear: settings.jobNumberIncludeYear,
        quoteNumberPrefix: settings.quoteNumberPrefix,
        quoteNumberIncludeYear: settings.quoteNumberIncludeYear,
        currentJobCounter: counterByType.get(jobNumbering.counterType) ?? null,
        currentQuoteCounter: counterByType.get(quoteNumbering.counterType) ?? null,
        nextJobNumberPreview: buildNextNumberPreview(
          jobNumbering.prefix,
          counterByType.get(jobNumbering.counterType) ?? null,
        ),
        nextQuoteNumberPreview: buildNextNumberPreview(
          quoteNumbering.prefix,
          counterByType.get(quoteNumbering.counterType) ?? null,
        ),
      },
      pricing: {
        defaultTaxRate: settings.defaultTaxRate,
        defaultLaborCostRate: settings.defaultLaborCostRate,
        defaultLaborSellRate: settings.defaultLaborSellRate,
        defaultMaterialMarkup: settings.defaultMaterialMarkup,
      },
      logoDataUrl: buildLogoDataUrl(appSettings?.logo_b64 ?? null),
      users: (users ?? []).map((user) => ({
        id: String(user.id),
        fullName: user.full_name,
        email: user.email,
        role: String(user.role),
        status: user.is_active ? "Active" : "Inactive",
      })),
      pendingInvites: (invites ?? []).map((invite) => ({
        id: String(invite.id),
        fullName: invite.full_name,
        email: invite.email,
        role: String(invite.role),
        status: "Invited",
        createdAt: invite.created_at,
      })),
    };
  }

  async saveCompany(input: {
    companyName: string;
    companyPhone: string;
    companyEmail: string;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyCity: string;
    companyRegion: string;
    companyPostalCode: string;
  }): Promise<void> {
    this.assertCanManageSettings();

    const { data: org, error: orgError } = await this.client
      .from("orgs")
      .select("settings")
      .eq("id", this.context.orgId)
      .single();
    if (orgError) throw orgError;

    const settings = mergeOrgBusinessSettings(org.settings, {
      companyPhone: input.companyPhone.trim(),
      companyEmail: input.companyEmail.trim(),
      companyAddressLine1: input.companyAddressLine1.trim(),
      companyAddressLine2: input.companyAddressLine2.trim(),
      companyCity: input.companyCity.trim(),
      companyRegion: input.companyRegion.trim(),
      companyPostalCode: input.companyPostalCode.trim(),
      phone: input.companyPhone.trim(),
      email: input.companyEmail.trim(),
      addressLine1: input.companyAddressLine1.trim(),
      addressLine2: input.companyAddressLine2.trim(),
      city: input.companyCity.trim(),
      region: input.companyRegion.trim(),
      postalCode: input.companyPostalCode.trim(),
    });

    const { error } = await this.client
      .from("orgs")
      .update({
        name: input.companyName.trim(),
        settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.context.orgId);
    if (error) throw error;
  }

  async saveBrandingLogo(logoDataUrl: string | null): Promise<void> {
    this.assertCanManageSettings();

    const { data: existing } = await this.client.from("app_settings").select("id").maybeSingle();
    const payload = {
      id: existing?.id ?? "default",
      logo_b64: logoDataUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client.from("app_settings").upsert(payload);
    if (error) throw error;
  }

  async saveNumbering(input: {
    jobNumberPrefix: string;
    jobNumberIncludeYear: boolean;
    quoteNumberPrefix: string;
    quoteNumberIncludeYear: boolean;
  }): Promise<void> {
    this.assertCanManageSettings();

    const { data: org, error: orgError } = await this.client
      .from("orgs")
      .select("settings")
      .eq("id", this.context.orgId)
      .single();
    if (orgError) throw orgError;

    const settings = mergeOrgBusinessSettings(org.settings, {
      jobNumberPrefix: input.jobNumberPrefix.trim(),
      jobNumberIncludeYear: input.jobNumberIncludeYear,
      quoteNumberPrefix: input.quoteNumberPrefix.trim(),
      quoteNumberIncludeYear: input.quoteNumberIncludeYear,
    });

    const { error } = await this.client
      .from("orgs")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", this.context.orgId);
    if (error) throw error;
  }

  async savePricingDefaults(input: {
    defaultTaxRate: number;
    defaultLaborCostRate: number;
    defaultLaborSellRate: number;
    defaultMaterialMarkup: number;
  }): Promise<void> {
    this.assertCanManageSettings();

    const { data: org, error: orgError } = await this.client
      .from("orgs")
      .select("settings")
      .eq("id", this.context.orgId)
      .single();
    if (orgError) throw orgError;

    const settings = mergeOrgBusinessSettings(org.settings, {
      defaultTaxRate: input.defaultTaxRate,
      defaultLaborCostRate: input.defaultLaborCostRate,
      defaultLaborSellRate: input.defaultLaborSellRate,
      defaultMaterialMarkup: input.defaultMaterialMarkup,
    });

    const { error } = await this.client
      .from("orgs")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", this.context.orgId);
    if (error) throw error;
  }

  async inviteUser(input: { fullName: string; email: string; role: "owner" | "field" }): Promise<void> {
    this.assertCanManageSettings();

    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (!email || !fullName) {
      throw new Error("Name and email are required.");
    }

    const { data: existingUser } = await this.client
      .from("users")
      .select("id")
      .eq("org_id", this.context.orgId)
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingUser) {
      throw new Error("That user is already in this org.");
    }

    const { data: existingInvite } = await this.client
      .from("user_invites")
      .select("id")
      .eq("org_id", this.context.orgId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("deleted_at", null)
      .maybeSingle();

    const { error: inviteError } = await this.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
        },
      },
    });
    if (inviteError) throw inviteError;

    if (existingInvite) {
      const { error } = await this.client
        .from("user_invites")
        .update({
          full_name: fullName,
          role: input.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInvite.id);
      if (error) throw error;
      return;
    }

    const { error } = await this.client.from("user_invites").insert({
      org_id: this.context.orgId,
      email,
      full_name: fullName,
      role: input.role,
      invited_by: this.context.actorUserId,
    });
    if (error) throw error;
  }

  async resetWorkspaceData(): Promise<void> {
    this.assertCanManageSettings();

    const { data: documents, error: documentsError } = await this.client
      .from("documents")
      .select("id, storage_path")
      .eq("org_id", this.context.orgId)
      .eq("entity_type", "jobs")
      .is("deleted_at", null);

    if (documentsError) {
      throw documentsError;
    }

    const storagePaths = Array.from(
      new Set((documents ?? []).map((document) => document.storage_path).filter(Boolean)),
    );

    for (const batch of chunk(storagePaths, 50)) {
      const { error } = await this.client.storage.from(JOB_ATTACHMENTS_BUCKET).remove(batch);
      if (error) {
        throw new Error(`Could not remove attachment files from storage: ${error.message}`);
      }
    }

    const { error: resetError } = await this.client.rpc("fn_reset_workspace_data", {
      p_org_id: this.context.orgId,
    });

    if (resetError) {
      throw resetError;
    }

    await Promise.all([
      localDb.leads.clear(),
      localDb.quotes.clear(),
      localDb.jobs.clear(),
      localDb.jobAssignments.clear(),
      localDb.scheduleBlocks.clear(),
      localDb.workerUnavailability.clear(),
      localDb.timeEntries.clear(),
      localDb.documents.clear(),
      localDb.notes.clear(),
      localDb.actionItems.clear(),
      localDb.activeTimers.clear(),
      localDb.syncQueue.clear(),
      localDb.syncCursor.clear(),
    ]);
  }
}
