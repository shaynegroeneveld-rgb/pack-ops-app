import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import { pageStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";
import { TimeService } from "@/services/time/time-service";
import { Button, Card, Chip, Input, Select } from "@/ui";

function sectionHeadingRow() {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  } satisfies React.CSSProperties;
}

export function TimePage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    periodMode: "range" as "range" | "month",
    month: "",
    userId: "",
    jobId: "",
    dateFrom: "",
    dateTo: "",
  });
  const [hoursView, setHoursView] = useState<"user" | "job" | "day">("job");

  if (!currentUser) {
    return null;
  }

  const service = useMemo(
    () =>
      new TimeService(
        {
          orgId: currentUser.user.orgId,
          actorUserId: currentUser.user.id,
        },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const reportQuery = useQuery({
    queryKey: ["time-report", currentUser.user.id, filters],
    queryFn: () =>
      service.getTimeReport({
        userId: filters.userId || null,
        jobId: filters.jobId || null,
        dateFrom: filters.periodMode === "range" ? filters.dateFrom || null : null,
        dateTo: filters.periodMode === "range" ? filters.dateTo || null : null,
        month: filters.periodMode === "month" ? filters.month || null : null,
      }),
  });

  const approveTimeEntry = useMutation({
    mutationFn: (timeEntryId: string) => service.approveTimeEntry(timeEntryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["time-report", currentUser.user.id] });
    },
  });

  const report = reportQuery.data;
  const canApproveTime =
    Boolean(currentUser.user.canApproveTime) ||
    currentUser.user.role === "owner" ||
    currentUser.user.role === "office" ||
    currentUser.user.role === "bookkeeper";

  const hoursBreakdownTitle =
    hoursView === "job" ? "Hours by Job" : hoursView === "day" ? "Hours by Day" : "Hours by User";

  const hoursBreakdownRows =
    hoursView === "job"
      ? report?.summary.hoursByJob.map((item) => ({
          id: item.jobId,
          label: item.jobLabel,
          hours: item.hours,
        })) ?? []
      : hoursView === "day"
        ? report?.summary.hoursByDay.map((item) => ({
            id: item.date,
            label: item.date,
            hours: item.hours,
          })) ?? []
        : report?.summary.hoursByUser.map((item) => ({
            id: item.userId,
            label: item.userName,
            hours: item.hours,
          })) ?? [];

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Time</h1>
        <p style={subtitleStyle()}>
          Review all time entries in one place by date, worker, and job.
        </p>
      </header>

      <Card variant="surface" style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div style={sectionHeadingRow()}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Filters</h2>
            <p style={{ margin: "4px 0 0", color: "var(--color-text-soft)" }}>
              Narrow entries by worker, job, date range, or a single month for payroll review.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setFilters({ periodMode: "range", month: "", userId: "", jobId: "", dateFrom: "", dateTo: "" })}
          >
            Clear Filters
          </Button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Chip active={filters.periodMode === "range"} onClick={() => setFilters((current) => ({ ...current, periodMode: "range" }))}>
            Date Range
          </Chip>
          <Chip
            active={filters.periodMode === "month"}
            onClick={() => setFilters((current) => ({ ...current, periodMode: "month", dateFrom: "", dateTo: "" }))}
          >
            Monthly
          </Chip>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <Select
            label="User"
            value={filters.userId}
            onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
          >
            <option value="">All users</option>
            {(report?.userOptions ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label="Job"
            value={filters.jobId}
            onChange={(event) => setFilters((current) => ({ ...current, jobId: event.target.value }))}
          >
            <option value="">All jobs</option>
            {(report?.jobOptions ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>

          {filters.periodMode === "month" ? (
            <Input
              label="Month"
              type="month"
              value={filters.month}
              onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
            />
          ) : (
            <>
              <Input
                label="Date From"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              />
              <Input
                label="Date To"
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
              />
            </>
          )}
        </div>
      </Card>

      {report ? (
        <section style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <Card variant="soft">
              <div style={{ color: "var(--color-text-soft)", fontSize: "13px" }}>Reporting Period</div>
              <strong style={{ fontSize: "20px" }}>{report.appliedPeriodLabel}</strong>
            </Card>
            <Card variant="soft">
              <div style={{ color: "var(--color-text-soft)", fontSize: "13px" }}>Total Hours</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.totalHours.toFixed(2)}h</strong>
            </Card>
            <Card variant="soft">
              <div style={{ color: "var(--color-text-soft)", fontSize: "13px" }}>Workers</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.hoursByUser.length}</strong>
            </Card>
            <Card variant="soft">
              <div style={{ color: "var(--color-text-soft)", fontSize: "13px" }}>Jobs</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.hoursByJob.length}</strong>
            </Card>
          </div>

          <Card variant="surface">
            <div style={sectionHeadingRow()}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px" }}>{hoursBreakdownTitle}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-soft)" }}>
                  Switch the hours view without losing the filters above.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Chip active={hoursView === "job"} onClick={() => setHoursView("job")}>
                  By Job
                </Chip>
                <Chip active={hoursView === "day"} onClick={() => setHoursView("day")}>
                  By Day
                </Chip>
                <Chip active={hoursView === "user"} onClick={() => setHoursView("user")}>
                  By User
                </Chip>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
              {hoursBreakdownRows.length === 0 ? (
                <div style={{ color: "var(--color-text-soft)" }}>No hours match the current filters.</div>
              ) : (
                hoursBreakdownRows.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <span>{item.label}</span>
                    <strong>{item.hours.toFixed(2)}h</strong>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card variant="surface">
            <div style={sectionHeadingRow()}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px" }}>Entries</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-soft)" }}>
                  Payroll-friendly list of all matching time entries.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
              {report.entries.length === 0 ? (
                <div style={{ color: "var(--color-text-soft)" }}>No time entries match the current filters.</div>
              ) : (
                report.entries.map((entry) => (
                  <Card key={entry.id} variant="soft" style={{ display: "grid", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <strong>{entry.jobNumber} · {entry.jobTitle}</strong>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <strong>{entry.hours.toFixed(2)}h</strong>
                        {entry.status === "pending" && canApproveTime ? (
                          <Button
                            size="sm"
                            loading={approveTimeEntry.isPending && approveTimeEntry.variables === entry.id}
                            onClick={() => void approveTimeEntry.mutateAsync(entry.id)}
                          >
                            Approve
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ color: "var(--color-text-soft)", fontSize: "14px" }}>
                      {entry.date} · Worked by {entry.workedByName}
                      {entry.enteredByName ? ` · Entered by ${entry.enteredByName}` : ""}
                    </div>
                    <div style={{ color: "var(--color-text-soft)", fontSize: "14px" }}>
                      Source: {entry.sourceLabel ?? "—"} · Status: {entry.status.replaceAll("_", " ")}
                    </div>
                    {entry.note ? <div style={{ color: "var(--color-text)" }}>{entry.note}</div> : null}
                    {approveTimeEntry.isError && approveTimeEntry.variables === entry.id ? (
                      <div style={{ color: "var(--color-danger-strong)", fontSize: "14px" }}>
                        Could not approve this time entry.
                      </div>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          </Card>
        </section>
      ) : reportQuery.isLoading ? (
        <Card variant="surface">Loading time report…</Card>
      ) : (
        <Card variant="surface">
          <div style={{ color: "var(--color-danger-strong)" }}>Could not load time report.</div>
        </Card>
      )}
    </section>
  );
}
