import { useEffect, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceAccount, FinanceCategory } from "@/domain/finance/types";
import {
  brand,
  cardStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { usePayrollAssist } from "@/features/payroll/hooks/use-payroll-assist";
import {
  calculatePayrollEmployeePay,
  type PayrollAssistEmployeePay,
} from "@/services/payroll/payroll-assist-service";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultPayrollPeriod(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
}

function fieldLabel(label: string, children: React.ReactNode) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span style={{ fontSize: "13px", color: brand.textSoft }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={cardStyle("#fafcff")}>
      <div style={{ color: brand.textSoft, fontSize: "13px" }}>{label}</div>
      <strong style={{ fontSize: "24px" }}>{value}</strong>
    </div>
  );
}

export function PayrollAssistPage() {
  const { currentUser } = useAuthContext();
  const [period, setPeriod] = useState(getDefaultPayrollPeriod);
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  if (!currentUser) {
    return null;
  }

  const payroll = usePayrollAssist(currentUser, period);
  const workspace = payroll.workspaceQuery.data;

  useEffect(() => {
    if (!workspace) {
      return;
    }

    setRateOverrides((current) => {
      const next = { ...current };
      for (const employee of workspace.employees) {
        if (next[employee.userId] === undefined) {
          next[employee.userId] = employee.suggestedHourlyRate ? String(employee.suggestedHourlyRate) : "";
        }
      }
      return next;
    });

    setAccountId((current) => current || String(workspace.accounts[0]?.id ?? ""));
    setCategoryId((current) => current || String(workspace.wageCategories[0]?.id ?? ""));
  }, [workspace]);

  const rows = useMemo<PayrollAssistEmployeePay[]>(() => {
    return (workspace?.employees ?? []).map((employee) =>
      calculatePayrollEmployeePay(employee, Number(rateOverrides[employee.userId] || employee.suggestedHourlyRate || 0)),
    );
  }, [rateOverrides, workspace?.employees]);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => ({
        hours: sum.hours + row.totalHours,
        overtimeHours: sum.overtimeHours + row.overtimeHours,
        gross: sum.gross + row.grossPay,
        deductions: sum.deductions + row.totalDeductions,
        net: sum.net + row.netPay,
        unapprovedHours: sum.unapprovedHours + row.unapprovedHours,
      }),
      { hours: 0, overtimeHours: 0, gross: 0, deductions: 0, net: 0, unapprovedHours: 0 },
    );
  }, [rows]);

  const selectedAccount = workspace?.accounts.find((account) => String(account.id) === accountId) ?? null;
  const selectedCategory = workspace?.wageCategories.find((category) => String(category.id) === categoryId) ?? null;
  const canApprove = Boolean(selectedAccount && selectedCategory && rows.some((row) => row.netPay > 0));

  async function handleApprovePayroll() {
    if (!selectedAccount || !selectedCategory) {
      window.alert("Select a payment account and wage category before approving payroll.");
      return;
    }

    const confirmed = window.confirm(
      `Create ${rows.filter((row) => row.netPay > 0).length} payroll transaction(s) for ${formatMoney(totals.net)} net pay?`,
    );
    if (!confirmed) {
      return;
    }

    const transactions = await payroll.approvePayroll.mutateAsync({
      startDate: period.startDate,
      endDate: period.endDate,
      accountId: selectedAccount.id as FinanceAccount["id"],
      categoryId: selectedCategory.id as FinanceCategory["id"],
      rows,
    });
    setApprovalMessage(`Created ${transactions.length} payroll transaction${transactions.length === 1 ? "" : "s"}.`);
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Payroll Assist</h1>
          <p style={subtitleStyle()}>
            Estimate employee pay from approved job time and push net pay into finance transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={handleApprovePayroll}
          disabled={!canApprove || payroll.approvePayroll.isPending}
          style={{
            ...primaryButtonStyle(),
            opacity: !canApprove || payroll.approvePayroll.isPending ? 0.55 : 1,
          }}
        >
          {payroll.approvePayroll.isPending ? "Approving..." : "Approve Payroll"}
        </button>
      </header>

      {approvalMessage ? <div style={feedbackStyle("success")}>{approvalMessage}</div> : null}
      {payroll.approvePayroll.error ? (
        <div style={feedbackStyle("error")}>
          {payroll.approvePayroll.error instanceof Error ? payroll.approvePayroll.error.message : "Payroll approval failed."}
        </div>
      ) : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "14px", marginBottom: "16px" }}>
        <div>
          <h2 style={sectionTitleStyle()}>Period and posting</h2>
          <p style={{ margin: "5px 0 0", color: brand.textSoft }}>
            Approved time entries are included. Pending or rejected hours stay visible but are not paid here.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
          {fieldLabel(
            "Start date",
            <input
              type="date"
              value={period.startDate}
              onChange={(event) => {
                setApprovalMessage(null);
                setPeriod((current) => ({ ...current, startDate: event.target.value }));
              }}
            />,
          )}
          {fieldLabel(
            "End date",
            <input
              type="date"
              value={period.endDate}
              onChange={(event) => {
                setApprovalMessage(null);
                setPeriod((current) => ({ ...current, endDate: event.target.value }));
              }}
            />,
          )}
          {fieldLabel(
            "Payment account",
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Select account</option>
              {(workspace?.accounts ?? []).map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.name}
                </option>
              ))}
            </select>,
          )}
          {fieldLabel(
            "Wage category",
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Select category</option>
              {(workspace?.wageCategories ?? []).map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>,
          )}
        </div>
      </section>

      {workspace ? (
        <section style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            <SummaryMetric label="Employees" value={String(rows.length)} />
            <SummaryMetric label="Hours" value={`${totals.hours.toFixed(2)}h`} />
            <SummaryMetric label="Overtime" value={`${totals.overtimeHours.toFixed(2)}h`} />
            <SummaryMetric label="Gross Pay" value={formatMoney(totals.gross)} />
            <SummaryMetric label="Deductions" value={formatMoney(totals.deductions)} />
            <SummaryMetric label="Net Pay" value={formatMoney(totals.net)} />
          </div>

          {totals.unapprovedHours > 0 ? (
            <div style={feedbackStyle("error")}>
              {totals.unapprovedHours.toFixed(2)} unapproved hour{totals.unapprovedHours === 1 ? "" : "s"} exist in this period and are excluded.
            </div>
          ) : null}

          <section style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h2 style={sectionTitleStyle()}>Employee pay</h2>
                <p style={{ margin: "5px 0 0", color: brand.textSoft }}>
                  CPP, EI, and income tax are simple estimates for planning, not CRA remittance calculations.
                </p>
              </div>
              <button
                type="button"
                style={secondaryButtonStyle()}
                onClick={() => {
                  setRateOverrides({});
                  setApprovalMessage(null);
                }}
              >
                Reset Rates
              </button>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {rows.length === 0 ? (
                <div style={{ color: brand.textSoft }}>No approved employee time found for this period.</div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.userId}
                    style={{
                      border: `1px solid ${brand.border}`,
                      borderRadius: "16px",
                      background: "#fff",
                      padding: "14px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <strong>{row.name}</strong>
                        <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                          {row.entryCount} time entr{row.entryCount === 1 ? "y" : "ies"}
                          {row.unapprovedHours > 0 ? ` · ${row.unapprovedHours.toFixed(2)}h unapproved` : ""}
                        </div>
                      </div>
                      <strong>{formatMoney(row.netPay)} net</strong>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                      <div>
                        <div style={{ color: brand.textSoft, fontSize: "12px" }}>Hours</div>
                        <strong>{row.totalHours.toFixed(2)}h</strong>
                      </div>
                      <div>
                        <div style={{ color: brand.textSoft, fontSize: "12px" }}>Overtime</div>
                        <strong>{row.overtimeHours.toFixed(2)}h</strong>
                      </div>
                      <label style={{ display: "grid", gap: "5px" }}>
                        <span style={{ color: brand.textSoft, fontSize: "12px" }}>Hourly rate</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rateOverrides[row.userId] ?? ""}
                          onChange={(event) => {
                            setApprovalMessage(null);
                            setRateOverrides((current) => ({ ...current, [row.userId]: event.target.value }));
                          }}
                        />
                      </label>
                      <div>
                        <div style={{ color: brand.textSoft, fontSize: "12px" }}>Gross</div>
                        <strong>{formatMoney(row.grossPay)}</strong>
                      </div>
                      <div>
                        <div style={{ color: brand.textSoft, fontSize: "12px" }}>Deductions</div>
                        <strong>{formatMoney(row.totalDeductions)}</strong>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      ) : payroll.workspaceQuery.isLoading ? (
        <section style={cardStyle()}>Loading payroll assist...</section>
      ) : (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>Could not load payroll assist data.</div>
        </section>
      )}
    </section>
  );
}
