import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import {
  brand,
  cardStyle,
  feedbackStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { SettingsService } from "@/services/settings/settings-service";

const SETTINGS_UPDATED_EVENT = "pack-settings-updated";

function sectionHeader(title: string, description: string) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <h2 style={{ margin: 0, fontSize: "20px" }}>{title}</h2>
      <p style={{ margin: 0, color: brand.textSoft }}>{description}</p>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    minHeight: "44px",
    borderRadius: "14px",
    border: `1px solid ${brand.border}`,
    padding: "12px 14px",
    fontSize: "16px",
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: brand.text,
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "grid",
    gap: "6px",
    fontSize: "14px",
    color: brand.textMuted,
  };
}

export function SettingsPage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [companyDraft, setCompanyDraft] = useState({
    companyName: "",
    companyPhone: "",
    companyEmail: "",
    companyAddressLine1: "",
    companyAddressLine2: "",
    companyCity: "",
    companyRegion: "",
    companyPostalCode: "",
  });
  const [numberingDraft, setNumberingDraft] = useState({
    jobNumberPrefix: "",
    jobNumberIncludeYear: true,
    quoteNumberPrefix: "Q",
    quoteNumberIncludeYear: false,
  });
  const [pricingDraft, setPricingDraft] = useState({
    defaultTaxRate: "0.05",
    defaultLaborCostRate: "65",
    defaultLaborSellRate: "95",
    defaultMaterialMarkup: "30",
  });
  const [inviteDraft, setInviteDraft] = useState({
    fullName: "",
    email: "",
    role: "field" as "owner" | "field",
  });
  const [resetConfirmation, setResetConfirmation] = useState("");

  if (!currentUser) {
    return null;
  }

  const isOwner = currentUser.user.role === "owner";
  const service = useMemo(
    () =>
      new SettingsService(
        {
          orgId: currentUser.user.orgId,
          actorUserId: currentUser.user.id,
        },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const settingsQuery = useQuery({
    queryKey: ["settings", currentUser.user.id, currentUser.user.orgId],
    queryFn: () => service.getSettings(),
    enabled: isOwner,
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setCompanyDraft({
      companyName: settingsQuery.data.companyName,
      companyPhone: settingsQuery.data.company.companyPhone,
      companyEmail: settingsQuery.data.company.companyEmail,
      companyAddressLine1: settingsQuery.data.company.companyAddressLine1,
      companyAddressLine2: settingsQuery.data.company.companyAddressLine2,
      companyCity: settingsQuery.data.company.companyCity,
      companyRegion: settingsQuery.data.company.companyRegion,
      companyPostalCode: settingsQuery.data.company.companyPostalCode,
    });
    setNumberingDraft({
      jobNumberPrefix: settingsQuery.data.numbering.jobNumberPrefix,
      jobNumberIncludeYear: settingsQuery.data.numbering.jobNumberIncludeYear,
      quoteNumberPrefix: settingsQuery.data.numbering.quoteNumberPrefix,
      quoteNumberIncludeYear: settingsQuery.data.numbering.quoteNumberIncludeYear,
    });
    setPricingDraft({
      defaultTaxRate: String(settingsQuery.data.pricing.defaultTaxRate),
      defaultLaborCostRate: String(settingsQuery.data.pricing.defaultLaborCostRate),
      defaultLaborSellRate: String(settingsQuery.data.pricing.defaultLaborSellRate),
      defaultMaterialMarkup: String(settingsQuery.data.pricing.defaultMaterialMarkup),
    });
  }, [settingsQuery.data]);

  const invalidateSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: ["settings", currentUser.user.id, currentUser.user.orgId] });
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
  };

  const saveCompany = useMutation({
    mutationFn: () => service.saveCompany(companyDraft),
    onSuccess: async () => {
      await invalidateSettings();
      setFeedback({ tone: "success", text: "Company settings saved." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not save company settings." });
    },
  });

  const saveNumbering = useMutation({
    mutationFn: () => service.saveNumbering(numberingDraft),
    onSuccess: async () => {
      await invalidateSettings();
      setFeedback({ tone: "success", text: "Numbering defaults saved." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not save numbering defaults." });
    },
  });

  const savePricing = useMutation({
    mutationFn: () =>
      service.savePricingDefaults({
        defaultTaxRate: Number(pricingDraft.defaultTaxRate || 0),
        defaultLaborCostRate: Number(pricingDraft.defaultLaborCostRate || 0),
        defaultLaborSellRate: Number(pricingDraft.defaultLaborSellRate || 0),
        defaultMaterialMarkup: Number(pricingDraft.defaultMaterialMarkup || 0),
      }),
    onSuccess: async () => {
      await invalidateSettings();
      setFeedback({ tone: "success", text: "Pricing defaults saved." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not save pricing defaults." });
    },
  });

  const inviteUser = useMutation({
    mutationFn: () => service.inviteUser(inviteDraft),
    onSuccess: async () => {
      await invalidateSettings();
      setInviteDraft({ fullName: "", email: "", role: "field" });
      setFeedback({ tone: "success", text: "Invite sent." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not invite user." });
    },
  });

  const resetWorkspace = useMutation({
    mutationFn: () => service.resetWorkspaceData(),
    onSuccess: async () => {
      setResetConfirmation("");
      await queryClient.invalidateQueries();
      setFeedback({ tone: "success", text: "Workspace data reset. Jobs, quotes, leads, time, scheduling, and attachments were cleared." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not reset workspace data." });
    },
  });

  async function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await service.saveBrandingLogo(typeof reader.result === "string" ? reader.result : null);
        await invalidateSettings();
        setFeedback({ tone: "success", text: "Logo updated." });
      } catch (error) {
        setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not save logo." });
      } finally {
        if (logoInputRef.current) {
          logoInputRef.current.value = "";
        }
      }
    };
    reader.readAsDataURL(file);
  }

  if (!isOwner) {
    return (
      <section style={pageStyle()}>
        <section style={cardStyle()}>
          <h1 style={titleStyle()}>Settings</h1>
          <p style={subtitleStyle()}>Only owners can access business defaults and team setup.</p>
        </section>
      </section>
    );
  }

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Settings</h1>
        <p style={subtitleStyle()}>
          Manage company defaults, numbering, branding, and simple team setup.
        </p>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      {settingsQuery.isLoading ? (
        <section style={cardStyle()}>Loading settings…</section>
      ) : settingsQuery.error ? (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>
            {settingsQuery.error instanceof Error ? settingsQuery.error.message : "Could not load settings."}
          </div>
        </section>
      ) : settingsQuery.data ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Company", "Basic company info used across the app and customer-facing output.")}
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
              {settingsQuery.data.logoDataUrl ? (
                <img
                  src={settingsQuery.data.logoDataUrl}
                  alt="Company logo"
                  style={{ maxHeight: "56px", maxWidth: "160px", objectFit: "contain", display: "block" }}
                />
              ) : (
                <div style={{ color: brand.textSoft }}>No logo uploaded yet.</div>
              )}
              <button type="button" style={secondaryButtonStyle()} onClick={() => logoInputRef.current?.click()}>
                Upload Logo
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} style={{ display: "none" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <label style={labelStyle()}>
                <span>Company Name</span>
                <input style={inputStyle()} value={companyDraft.companyName} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyName: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Phone</span>
                <input style={inputStyle()} value={companyDraft.companyPhone} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyPhone: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Email</span>
                <input style={inputStyle()} value={companyDraft.companyEmail} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyEmail: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Address Line 1</span>
                <input style={inputStyle()} value={companyDraft.companyAddressLine1} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyAddressLine1: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Address Line 2</span>
                <input style={inputStyle()} value={companyDraft.companyAddressLine2} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyAddressLine2: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>City</span>
                <input style={inputStyle()} value={companyDraft.companyCity} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyCity: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Region / State</span>
                <input style={inputStyle()} value={companyDraft.companyRegion} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyRegion: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Postal Code</span>
                <input style={inputStyle()} value={companyDraft.companyPostalCode} onChange={(event) => setCompanyDraft((current) => ({ ...current, companyPostalCode: event.target.value }))} />
              </label>
            </div>
            <div>
              <button type="button" style={primaryButtonStyle()} onClick={() => saveCompany.mutate()} disabled={saveCompany.isPending}>
                {saveCompany.isPending ? "Saving..." : "Save Company"}
              </button>
            </div>
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Numbering / Format", "These defaults only affect future jobs and quotes. Existing numbers stay unchanged.")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <label style={labelStyle()}>
                <span>Job Number Prefix</span>
                <input style={inputStyle()} value={numberingDraft.jobNumberPrefix} onChange={(event) => setNumberingDraft((current) => ({ ...current, jobNumberPrefix: event.target.value }))} placeholder="Optional" />
              </label>
              <label style={labelStyle()}>
                <span>Quote Number Prefix</span>
                <input style={inputStyle()} value={numberingDraft.quoteNumberPrefix} onChange={(event) => setNumberingDraft((current) => ({ ...current, quoteNumberPrefix: event.target.value }))} />
              </label>
              <label style={{ ...labelStyle(), alignContent: "end" }}>
                <span>Job Number Includes Year</span>
                <input type="checkbox" checked={numberingDraft.jobNumberIncludeYear} onChange={(event) => setNumberingDraft((current) => ({ ...current, jobNumberIncludeYear: event.target.checked }))} />
              </label>
              <label style={{ ...labelStyle(), alignContent: "end" }}>
                <span>Quote Number Includes Year</span>
                <input type="checkbox" checked={numberingDraft.quoteNumberIncludeYear} onChange={(event) => setNumberingDraft((current) => ({ ...current, quoteNumberIncludeYear: event.target.checked }))} />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div style={{ ...cardStyle(brand.surfaceAlt), padding: "14px" }}>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>Next Job Number</div>
                <strong>{settingsQuery.data.numbering.nextJobNumberPreview}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px", marginTop: "4px" }}>
                  Current counter: {settingsQuery.data.numbering.currentJobCounter ?? 0}
                </div>
              </div>
              <div style={{ ...cardStyle(brand.surfaceAlt), padding: "14px" }}>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>Next Quote Number</div>
                <strong>{settingsQuery.data.numbering.nextQuoteNumberPreview}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px", marginTop: "4px" }}>
                  Current counter: {settingsQuery.data.numbering.currentQuoteCounter ?? 0}
                </div>
              </div>
            </div>
            <div>
              <button type="button" style={primaryButtonStyle()} onClick={() => saveNumbering.mutate()} disabled={saveNumbering.isPending}>
                {saveNumbering.isPending ? "Saving..." : "Save Numbering"}
              </button>
            </div>
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Pricing Defaults", "Future quotes start from these business defaults.")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <label style={labelStyle()}>
                <span>Default Tax Rate</span>
                <input style={inputStyle()} type="number" step="0.01" value={pricingDraft.defaultTaxRate} onChange={(event) => setPricingDraft((current) => ({ ...current, defaultTaxRate: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Default Labor Cost Rate</span>
                <input style={inputStyle()} type="number" step="0.01" value={pricingDraft.defaultLaborCostRate} onChange={(event) => setPricingDraft((current) => ({ ...current, defaultLaborCostRate: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Default Labor Sell Rate</span>
                <input style={inputStyle()} type="number" step="0.01" value={pricingDraft.defaultLaborSellRate} onChange={(event) => setPricingDraft((current) => ({ ...current, defaultLaborSellRate: event.target.value }))} />
              </label>
              <label style={labelStyle()}>
                <span>Default Material Markup %</span>
                <input style={inputStyle()} type="number" step="0.1" value={pricingDraft.defaultMaterialMarkup} onChange={(event) => setPricingDraft((current) => ({ ...current, defaultMaterialMarkup: event.target.value }))} />
              </label>
            </div>
            <div>
              <button type="button" style={primaryButtonStyle()} onClick={() => savePricing.mutate()} disabled={savePricing.isPending}>
                {savePricing.isPending ? "Saving..." : "Save Pricing Defaults"}
              </button>
            </div>
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Users", "List your current team and invite new owner or field users into this org.")}
            <div style={{ display: "grid", gap: "10px" }}>
              {settingsQuery.data.users.map((user) => (
                <div key={user.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "14px", padding: "14px", display: "grid", gap: "4px" }}>
                  <strong>{user.fullName}</strong>
                  <div style={{ color: brand.textSoft }}>{user.email}</div>
                  <div style={{ color: brand.textSoft, fontSize: "14px" }}>
                    {user.role} · {user.status}
                  </div>
                </div>
              ))}
              {settingsQuery.data.pendingInvites.map((invite) => (
                <div key={invite.id} style={{ border: `1px dashed ${brand.border}`, borderRadius: "14px", padding: "14px", display: "grid", gap: "4px", background: brand.surfaceAlt }}>
                  <strong>{invite.fullName}</strong>
                  <div style={{ color: brand.textSoft }}>{invite.email}</div>
                  <div style={{ color: brand.textSoft, fontSize: "14px" }}>
                    {invite.role} · {invite.status}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...cardStyle(brand.surfaceAlt), display: "grid", gap: "12px", padding: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px" }}>Add New User</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                <label style={labelStyle()}>
                  <span>Name</span>
                  <input style={inputStyle()} value={inviteDraft.fullName} onChange={(event) => setInviteDraft((current) => ({ ...current, fullName: event.target.value }))} />
                </label>
                <label style={labelStyle()}>
                  <span>Email</span>
                  <input style={inputStyle()} type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label style={labelStyle()}>
                  <span>Role</span>
                  <select style={inputStyle()} value={inviteDraft.role} onChange={(event) => setInviteDraft((current) => ({ ...current, role: event.target.value as "owner" | "field" }))}>
                    <option value="field">Field</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
              </div>
              <div>
                <button type="button" style={primaryButtonStyle()} onClick={() => inviteUser.mutate()} disabled={inviteUser.isPending}>
                  {inviteUser.isPending ? "Sending..." : "Invite User"}
                </button>
              </div>
            </div>
          </section>

          <section style={{ ...cardStyle("#fff6f3"), display: "grid", gap: "14px", border: "1px solid #f1c9bf" }}>
            {sectionHeader("Reset Workspace Data", "This will permanently delete all jobs, quotes, leads, time, scheduling data, and job attachments. Materials, assemblies, settings, and users are preserved.")}
            <div style={{ color: "#8f1d1d", fontSize: "14px", lineHeight: 1.5 }}>
              Type <strong>RESET</strong> to confirm. This cannot be undone.
            </div>
            <label style={labelStyle()}>
              <span>Confirmation</span>
              <input
                style={inputStyle()}
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder="Type RESET"
              />
            </label>
            <div>
              <button
                type="button"
                style={{
                  ...primaryButtonStyle(),
                  background: resetConfirmation === "RESET" ? "#b42318" : "#e7b7b1",
                  boxShadow: "none",
                }}
                onClick={() => {
                  if (resetConfirmation !== "RESET") {
                    setFeedback({ tone: "error", text: 'Type "RESET" to confirm the workspace reset.' });
                    return;
                  }
                  void resetWorkspace.mutate();
                }}
                disabled={resetWorkspace.isPending}
              >
                {resetWorkspace.isPending ? "Resetting..." : "Reset Workspace Data"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
