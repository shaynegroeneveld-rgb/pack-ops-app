import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";

import { APP_ROUTES } from "@/app/router/routes";
import { useAuthContext } from "@/app/contexts/auth-context";
import { useUiStore } from "@/app/store/ui-store";
import { localDb } from "@/data/dexie/db";
import { getSupabaseClient } from "@/data/supabase/client";
import { AgingSummaryPage } from "@/features/finance/components/AgingSummaryPage";
import { ExpenseByCategoryPage } from "@/features/finance/components/ExpenseByCategoryPage";
import { FinanceMoneyPage } from "@/features/finance/components/FinanceMoneyPage";
import { FinanceReconciliationPage } from "@/features/finance/components/FinanceReconciliationPage";
import { FinanceReviewPage } from "@/features/finance/components/FinanceReviewPage";
import { GstSummaryPage } from "@/features/finance/components/GstSummaryPage";
import { JobProfitabilityPage } from "@/features/finance/components/JobProfitabilityPage";
import { MonthEndPage } from "@/features/finance/components/MonthEndPage";
import { ProfitLossPage } from "@/features/finance/components/ProfitLossPage";
import { ReceivablesPayablesPage } from "@/features/finance/components/ReceivablesPayablesPage";
import { LeadsPage } from "@/features/leads/components/LeadsPage";
import { MaterialsPage } from "@/features/materials/components/MaterialsPage";
import { PayrollAssistPage } from "@/features/payroll/components/PayrollAssistPage";
import { QuotesPage } from "@/features/quotes/components/QuotesPage";
import { JobPerformancePage } from "@/features/reports/components/JobPerformancePage";
import { SchedulingPage } from "@/features/scheduling/components/SchedulingPage";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import {
  brand,
  chipStyle,
  secondaryButtonStyle,
} from "@/features/shared/ui/mobile-styles";
import { TimePage } from "@/features/time/components/TimePage";
import { WorkbenchPage } from "@/features/workbench/components/WorkbenchPage";
import { WorkbenchService, type WorkbenchFailedSyncItem } from "@/services/workbench/workbench-service";

const NAV_ITEMS = [
  { label: "Leads", route: APP_ROUTES.leads },
  { label: "Quotes", route: APP_ROUTES.quotes },
  { label: "Materials", route: APP_ROUTES.materials },
  { label: "Job Performance", route: APP_ROUTES.jobPerformance },
  { label: "Time", route: APP_ROUTES.time },
  { label: "Workbench", route: APP_ROUTES.workbench },
  { label: "Scheduling", route: APP_ROUTES.scheduling },
  { label: "Settings", route: APP_ROUTES.settings },
] as const;

const FINANCE_NAV_ITEMS = [
  { label: "Review", route: APP_ROUTES.financeReview },
  { label: "Money", route: APP_ROUTES.financeMoney },
  { label: "Receivables & Payables", route: APP_ROUTES.financeReceivablesPayables },
  { label: "Reconciliation", route: APP_ROUTES.financeReconciliation },
  { label: "Month End", route: APP_ROUTES.financeMonthlyClose },
  { label: "Payroll Assist", route: APP_ROUTES.financePayrollAssist },
] as const;

const FIELD_VISIBLE_ROUTES = [APP_ROUTES.workbench, APP_ROUTES.scheduling] as const;
const FINANCE_ROUTES = [
  APP_ROUTES.financeTransactions,
  APP_ROUTES.financeReview,
  APP_ROUTES.financeMoney,
  APP_ROUTES.financeReceivablesPayables,
  APP_ROUTES.financeAccountsReceivable,
  APP_ROUTES.financeAccountsPayable,
  APP_ROUTES.financeArAging,
  APP_ROUTES.financeApAging,
  APP_ROUTES.financeProfitLoss,
  APP_ROUTES.financeExpenseCategories,
  APP_ROUTES.financeJobProfitability,
  APP_ROUTES.financeGstSummary,
  APP_ROUTES.financePayrollAssist,
  APP_ROUTES.financeReviewQueue,
  APP_ROUTES.financeReconciliation,
  APP_ROUTES.financeMonthlyClose,
  APP_ROUTES.financeImports,
  APP_ROUTES.financeDocumentInbox,
  APP_ROUTES.financeContacts,
  APP_ROUTES.financeCategories,
  APP_ROUTES.financeAccounts,
] as const;
const SETTINGS_UPDATED_EVENT = "pack-settings-updated";
const MOBILE_SHELL_MAX_WIDTH = 820;

interface SyncIndicatorState {
  pendingCount: number;
  failedCount: number;
  processingCount: number;
  lastError: string | null;
  failedItems: WorkbenchFailedSyncItem[];
}

function getSyncIndicatorPresentation(input: SyncIndicatorState & { isOffline: boolean }): {
  label: string;
  background: string;
  color: string;
  borderColor: string;
} {
  if (input.isOffline) {
    return {
      label: "Offline",
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (input.failedCount > 0) {
    return {
      label: `Failed (${input.failedCount})`,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fda4af",
    };
  }

  if (input.processingCount > 0) {
    return {
      label: "Syncing",
      background: "#eef4ff",
      color: "#163fcb",
      borderColor: "#b9ccff",
    };
  }

  if (input.pendingCount > 0) {
    return {
      label: `Pending (${input.pendingCount})`,
      background: brand.primarySoft,
      color: brand.primaryDark,
      borderColor: "#a7d8cf",
    };
  }

  return {
    label: "Synced",
    background: "#effaf3",
    color: "#166534",
    borderColor: "#bbf7d0",
  };
}

export function AppShell() {
  const { currentUser } = useAuthContext();
  const activeRoute = useUiStore((state) => state.activeRoute);
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Pack Electric");
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [isMobileShellLayout, setIsMobileShellLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_SHELL_MAX_WIDTH : false,
  );
  const [syncIndicator, setSyncIndicator] = useState<SyncIndicatorState>({
    pendingCount: 0,
    failedCount: 0,
    processingCount: 0,
    lastError: null,
    failedItems: [],
  });
  const [isSyncPanelOpen, setIsSyncPanelOpen] = useState(false);
  const [financeBadgeCounts, setFinanceBadgeCounts] = useState({
    review: 0,
    monthEnd: 0,
    receivablesPayables: 0,
  });
  const [syncActionState, setSyncActionState] = useState<{
    type: "retry" | "discard";
    outboxId: string;
  } | null>(null);
  const client = getSupabaseClient(import.meta.env);
  const isFieldUser = currentUser?.user.role === "field";
  const isOwner = currentUser?.user.role === "owner";
  const canSeeFinance = currentUser
    ? currentUser.user.role === "owner" || currentUser.user.role === "office" || currentUser.user.role === "bookkeeper"
    : false;
  const workbenchService = useMemo(
    () =>
      currentUser
        ? new WorkbenchService(
            {
              orgId: currentUser.user.orgId,
              actorUserId: currentUser.user.id,
            },
            currentUser.user,
            client,
          )
        : null,
    [client, currentUser],
  );
  const navItems = isFieldUser
    ? NAV_ITEMS.filter((item) => FIELD_VISIBLE_ROUTES.includes(item.route as (typeof FIELD_VISIBLE_ROUTES)[number]))
    : NAV_ITEMS.filter((item) => item.route !== APP_ROUTES.settings || isOwner);
  const shouldUseStickyHeader = !isMobileShellLayout;

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const entries = await localDb.syncQueue.toArray();
      return {
        pendingCount: entries.filter((entry) => entry.status === "pending").length,
        failedCount: entries.filter((entry) => entry.status === "failed").length,
        processingCount: entries.filter((entry) => entry.status === "processing").length,
        lastError: entries.find((entry) => entry.status === "failed")?.lastError ?? null,
        failedItems: entries
          .filter((entry) => entry.status === "failed")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map((entry) => ({
            id: entry.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
            operation: entry.operation,
            createdAt: entry.createdAt,
            retryCount: entry.retryCount,
            lastError: entry.lastError,
          })),
      };
    }).subscribe({
      next: (value) => setSyncIndicator(value),
      error: (error) => {
        console.error("[AppShell] sync indicator subscription failed", error);
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!canSeeFinance) {
      setFinanceBadgeCounts({ review: 0, monthEnd: 0, receivablesPayables: 0 });
      return;
    }

    const subscription = liveQuery(async () => {
      const [
        imports,
        documents,
        arInvoices,
        apBills,
        monthlyCloses,
      ] = await Promise.all([
        localDb.importedTransactions.toArray(),
        localDb.financeDocumentIntake.toArray(),
        localDb.financeArInvoices.toArray(),
        localDb.financeApBills.toArray(),
        localDb.financeMonthlyCloses.toArray(),
      ]);

      const review = imports.filter((row) =>
        row.deletedAt === null &&
        (row.status === "new" || row.status === "needs_review" || row.receiptStatus === "missing"),
      ).length + documents.filter((document) =>
        document.deletedAt === null && (document.status === "new" || document.status === "needs_review"),
      ).length;

      const monthEnd = monthlyCloses
        .filter((close) => close.deletedAt === null && close.status !== "closed")
        .reduce((sum, close) => sum +
          close.unreconciledImportsCount +
          close.missingReceiptsCount +
          close.draftTransactionsCount +
          close.possibleDuplicatesCount +
          close.snoozedReviewItemsCount,
        0);

      const receivablesPayables = arInvoices.filter((invoice) => invoice.deletedAt === null && invoice.status === "overdue").length +
        apBills.filter((bill) => bill.deletedAt === null && bill.status === "overdue").length;

      return { review, monthEnd, receivablesPayables };
    }).subscribe({
      next: setFinanceBadgeCounts,
      error: (error) => console.error("[AppShell] finance badge subscription failed", error),
    });

    return () => subscription.unsubscribe();
  }, [canSeeFinance]);

  useEffect(() => {
    function handleResize() {
      setIsMobileShellLayout(window.innerWidth <= MOBILE_SHELL_MAX_WIDTH);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (currentUser.user.role === "field" && !FIELD_VISIBLE_ROUTES.includes(activeRoute as (typeof FIELD_VISIBLE_ROUTES)[number])) {
      setActiveRoute(APP_ROUTES.workbench);
    }

    if (FINANCE_ROUTES.includes(activeRoute as (typeof FINANCE_ROUTES)[number]) && !canSeeFinance) {
      setActiveRoute(APP_ROUTES.workbench);
    }

    if (activeRoute === APP_ROUTES.settings && currentUser.user.role !== "owner") {
      setActiveRoute(APP_ROUTES.workbench);
    }
  }, [activeRoute, canSeeFinance, currentUser, setActiveRoute]);

  useEffect(() => {
    let isMounted = true;
    const orgId = currentUser?.user.orgId ?? null;

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

    if (!orgId) {
      setLogoDataUrl(null);
      setCompanyName("Pack Electric");
      return;
    }

    async function loadBranding() {
      try {
        const [{ data: settingsData }, { data: orgData }] = await Promise.all([
          client.from("app_settings").select("logo_b64").maybeSingle(),
          client.from("orgs").select("name").eq("id", orgId).maybeSingle(),
        ]);
        if (!isMounted) {
          return;
        }
        setLogoDataUrl(buildLogoDataUrl(settingsData?.logo_b64 ?? null));
        setCompanyName(orgData?.name?.trim() || "Pack Electric");
      } catch {
        if (!isMounted) {
          return;
        }
        setLogoDataUrl(null);
        setCompanyName("Pack Electric");
      }
    }

    const handleSettingsUpdated = () => {
      void loadBranding();
    };

    void loadBranding();
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, [client, currentUser?.user.orgId]);

  const syncPresentation = getSyncIndicatorPresentation({
    ...syncIndicator,
    isOffline,
  });
  const syncTitle = isOffline
    ? "You are offline. Changes will stay local until the connection returns."
    : syncIndicator.failedCount > 0
      ? syncIndicator.lastError
        ? `Sync failed: ${syncIndicator.lastError}`
        : "At least one sync item failed."
      : syncIndicator.processingCount > 0
        ? "Sync is in progress."
        : syncIndicator.pendingCount > 0
          ? `${syncIndicator.pendingCount} item${syncIndicator.pendingCount === 1 ? "" : "s"} waiting to sync.`
          : "All changes are synced.";

  async function handleRetrySyncItem(outboxId: string) {
    if (!workbenchService) {
      return;
    }

    try {
      setSyncActionState({ type: "retry", outboxId });
      await workbenchService.retrySyncItem(outboxId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setSyncActionState(null);
    }
  }

  async function handleDiscardSyncItem(outboxId: string) {
    if (!workbenchService) {
      return;
    }

    const confirmed = window.confirm("Discard this failed sync item? Local unsynced changes for it will be removed.");
    if (!confirmed) {
      return;
    }

    try {
      setSyncActionState({ type: "discard", outboxId });
      await workbenchService.discardSyncItem(outboxId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Discard failed.");
    } finally {
      setSyncActionState(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: brand.surfaceAlt }}>
      <nav
        style={{
          display: "flex",
          gap: "12px",
          padding: "14px 18px",
          borderBottom: `1px solid ${brand.border}`,
          background: "#ffffff",
          position: shouldUseStickyHeader ? "sticky" : "static",
          top: shouldUseStickyHeader ? 0 : undefined,
          zIndex: shouldUseStickyHeader ? 10 : undefined,
          flexWrap: "wrap",
          alignItems: "center",
          boxShadow: "0 10px 24px rgba(23, 32, 51, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginRight: "12px", minWidth: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {logoDataUrl ? (
              <img
                src={logoDataUrl}
                alt="Pack Electric logo"
                style={{
                  height: "34px",
                  width: "auto",
                  maxWidth: "112px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})`,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                PE
              </div>
            )}
            <div style={{ display: "grid", lineHeight: 1.05 }}>
              <strong style={{ fontSize: "17px", letterSpacing: "-0.02em", color: brand.text }}>{companyName}</strong>
              <span style={{ fontSize: "12px", color: brand.textSoft }}>Operations</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsSyncPanelOpen(true)}
          title={syncTitle}
          style={{
            borderRadius: "999px",
            border: `1px solid ${syncPresentation.borderColor}`,
            background: syncPresentation.background,
            color: syncPresentation.color,
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 700,
            minHeight: "36px",
            display: "inline-flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {syncPresentation.label}
        </button>
        {navItems.map((item) => {
          const isActive = activeRoute === item.route;

          return (
            <button
              key={item.route}
              onClick={() => setActiveRoute(item.route)}
              style={chipStyle(isActive)}
            >
              {item.label}
            </button>
          );
        })}
        {canSeeFinance ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 800, padding: "0 2px" }}>Finance</span>
            {FINANCE_NAV_ITEMS.map((item) => {
              const isActive = activeRoute === item.route;
              const badgeCount = item.route === APP_ROUTES.financeReview
                ? financeBadgeCounts.review
                : item.route === APP_ROUTES.financeMonthlyClose
                  ? financeBadgeCounts.monthEnd
                  : item.route === APP_ROUTES.financeReceivablesPayables
                    ? financeBadgeCounts.receivablesPayables
                    : 0;

              return (
                <button
                  key={item.route}
                  onClick={() => setActiveRoute(item.route)}
                  style={chipStyle(isActive)}
                >
                  {item.label}
                  {badgeCount > 0 ? (
                    <span style={{ marginLeft: "8px", borderRadius: "999px", background: "#fff7ed", color: "#9a3412", padding: "2px 7px", fontSize: "11px" }}>
                      {badgeCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </nav>

      {activeRoute === APP_ROUTES.leads ? (
        <LeadsPage />
      ) : activeRoute === APP_ROUTES.materials ? (
        <MaterialsPage />
      ) : activeRoute === APP_ROUTES.financeReview ? (
        <FinanceReviewPage />
      ) : activeRoute === APP_ROUTES.financeImports ? (
        <FinanceReviewPage initialTab="imports" />
      ) : activeRoute === APP_ROUTES.financeDocumentInbox ? (
        <FinanceReviewPage initialTab="documents" />
      ) : activeRoute === APP_ROUTES.financeReviewQueue ? (
        <FinanceReviewPage initialTab="queue" />
      ) : activeRoute === APP_ROUTES.financeMoney ? (
        <FinanceMoneyPage />
      ) : activeRoute === APP_ROUTES.financeTransactions ? (
        <FinanceMoneyPage initialTab="transactions" />
      ) : activeRoute === APP_ROUTES.financeContacts ? (
        <FinanceMoneyPage initialTab="contacts" />
      ) : activeRoute === APP_ROUTES.financeCategories ? (
        <FinanceMoneyPage initialTab="categories" />
      ) : activeRoute === APP_ROUTES.financeAccounts ? (
        <FinanceMoneyPage initialTab="accounts" />
      ) : activeRoute === APP_ROUTES.financeReceivablesPayables ? (
        <ReceivablesPayablesPage />
      ) : activeRoute === APP_ROUTES.financeAccountsReceivable ? (
        <ReceivablesPayablesPage initialTab="receivables" />
      ) : activeRoute === APP_ROUTES.financeAccountsPayable ? (
        <ReceivablesPayablesPage initialTab="payables" />
      ) : activeRoute === APP_ROUTES.financeArAging ? (
        <AgingSummaryPage type="ar" />
      ) : activeRoute === APP_ROUTES.financeApAging ? (
        <AgingSummaryPage type="ap" />
      ) : activeRoute === APP_ROUTES.financeProfitLoss ? (
        <ProfitLossPage />
      ) : activeRoute === APP_ROUTES.financeExpenseCategories ? (
        <ExpenseByCategoryPage />
      ) : activeRoute === APP_ROUTES.financeJobProfitability ? (
        <JobProfitabilityPage />
      ) : activeRoute === APP_ROUTES.financeGstSummary ? (
        <GstSummaryPage />
      ) : activeRoute === APP_ROUTES.financeReconciliation ? (
        <FinanceReconciliationPage />
      ) : activeRoute === APP_ROUTES.financeMonthlyClose ? (
        <MonthEndPage initialTab="close" />
      ) : activeRoute === APP_ROUTES.financePayrollAssist ? (
        <PayrollAssistPage />
      ) : activeRoute === APP_ROUTES.quotes ? (
        <QuotesPage />
      ) : activeRoute === APP_ROUTES.jobPerformance ? (
        <JobPerformancePage />
      ) : activeRoute === APP_ROUTES.time ? (
        <TimePage />
      ) : activeRoute === APP_ROUTES.settings ? (
        <SettingsPage />
      ) : activeRoute === APP_ROUTES.scheduling ? (
        <SchedulingPage />
      ) : (
        <WorkbenchPage />
      )}

      {isSyncPanelOpen ? (
        <div
          role="presentation"
          onClick={() => setIsSyncPanelOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            zIndex: 30,
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Sync status"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "22px",
              padding: "18px",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
              <div>
                <strong style={{ display: "block", fontSize: "18px", color: brand.text }}>Sync Status</strong>
                <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                  {syncTitle}
                </span>
              </div>
              <button type="button" onClick={() => setIsSyncPanelOpen(false)} style={secondaryButtonStyle()}>
                Close
              </button>
            </div>

            {syncIndicator.failedItems.length === 0 ? (
              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "16px",
                  padding: "16px",
                  background: brand.surfaceAlt,
                  color: brand.textSoft,
                }}
              >
                No failed sync items right now.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {syncIndicator.failedItems.map((item) => {
                  const isRetrying = syncActionState?.type === "retry" && syncActionState.outboxId === item.id;
                  const isDiscarding = syncActionState?.type === "discard" && syncActionState.outboxId === item.id;

                  return (
                    <article
                      key={item.id}
                      style={{
                        border: "1px solid #f3c4c9",
                        borderRadius: "16px",
                        padding: "14px",
                        background: "#fff8f8",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <strong style={{ color: brand.text }}>
                            {item.entityType} · {item.operation}
                          </strong>
                          <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                            {item.entityId}
                          </span>
                        </div>
                        <span style={{ color: brand.textSoft, fontSize: "12px" }}>
                          Retry {item.retryCount}
                        </span>
                      </div>
                      <div style={{ color: "#8f1d1d", fontSize: "13px", lineHeight: 1.45 }}>
                        {item.lastError ?? "Sync failed."}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => void handleRetrySyncItem(item.id)}
                          disabled={Boolean(syncActionState)}
                          style={secondaryButtonStyle()}
                        >
                          {isRetrying ? "Retrying..." : "Retry"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDiscardSyncItem(item.id)}
                          disabled={Boolean(syncActionState)}
                          style={secondaryButtonStyle()}
                        >
                          {isDiscarding ? "Discarding..." : "Discard"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
