import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import {
  cardStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { TimeService } from "@/services/time/time-service";

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
  const [filters, setFilters] = useState({
    userId: "",
    jobId: "",
    dateFrom: "",
    dateTo: "",
  });

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
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
      }),
  });

  const report = reportQuery.data;

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Time</h1>
        <p style={subtitleStyle()}>
          Review all time entries in one place by date, worker, and job.
        </p>
      </header>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div style={sectionHeadingRow()}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Filters</h2>
            <p style={{ margin: "4px 0 0", color: "#5d6978" }}>
              Narrow entries by worker, job, or date range.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters({ userId: "", jobId: "", dateFrom: "", dateTo: "" })}
            style={secondaryButtonStyle()}
          >
            Clear Filters
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5d6978" }}>User</span>
            <select value={filters.userId} onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}>
              <option value="">All users</option>
              {(report?.userOptions ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5d6978" }}>Job</span>
            <select value={filters.jobId} onChange={(event) => setFilters((current) => ({ ...current, jobId: event.target.value }))}>
              <option value="">All jobs</option>
              {(report?.jobOptions ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5d6978" }}>Date From</span>
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#5d6978" }}>Date To</span>
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
          </label>
        </div>
      </section>

      {report ? (
        <section style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div style={cardStyle("#fafcff")}>
              <div style={{ color: "#5d6978", fontSize: "13px" }}>Total Hours</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.totalHours.toFixed(2)}h</strong>
            </div>
            <div style={cardStyle("#fafcff")}>
              <div style={{ color: "#5d6978", fontSize: "13px" }}>Workers</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.hoursByUser.length}</strong>
            </div>
            <div style={cardStyle("#fafcff")}>
              <div style={{ color: "#5d6978", fontSize: "13px" }}>Jobs</div>
              <strong style={{ fontSize: "26px" }}>{report.summary.hoursByJob.length}</strong>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            <section style={cardStyle()}>
              <h2 style={{ marginTop: 0, fontSize: "18px" }}>Hours by User</h2>
              <div style={{ display: "grid", gap: "8px" }}>
                {report.summary.hoursByUser.map((item) => (
                  <div key={item.userId} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <span>{item.userName}</span>
                    <strong>{item.hours.toFixed(2)}h</strong>
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle()}>
              <h2 style={{ marginTop: 0, fontSize: "18px" }}>Hours by Job</h2>
              <div style={{ display: "grid", gap: "8px" }}>
                {report.summary.hoursByJob.map((item) => (
                  <div key={item.jobId} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <span>{item.jobLabel}</span>
                    <strong>{item.hours.toFixed(2)}h</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section style={cardStyle()}>
            <div style={sectionHeadingRow()}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px" }}>Entries</h2>
                <p style={{ margin: "4px 0 0", color: "#5d6978" }}>
                  Payroll-friendly list of all matching time entries.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
              {report.entries.length === 0 ? (
                <div style={{ color: "#5d6978" }}>No time entries match the current filters.</div>
              ) : (
                report.entries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      border: "1px solid #e3e8e6",
                      borderRadius: "16px",
                      padding: "14px",
                      display: "grid",
                      gap: "6px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <strong>{entry.jobNumber} · {entry.jobTitle}</strong>
                      <strong>{entry.hours.toFixed(2)}h</strong>
                    </div>
                    <div style={{ color: "#5d6978", fontSize: "14px" }}>
                      {entry.date} · Worked by {entry.workedByName}
                      {entry.enteredByName ? ` · Entered by ${entry.enteredByName}` : ""}
                    </div>
                    <div style={{ color: "#5d6978", fontSize: "14px" }}>
                      Source: {entry.sourceLabel ?? "—"} · Status: {entry.status.replaceAll("_", " ")}
                    </div>
                    {entry.note ? <div style={{ color: "#172033" }}>{entry.note}</div> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      ) : reportQuery.isLoading ? (
        <section style={cardStyle()}>
          Loading time report…
        </section>
      ) : (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>Could not load time report.</div>
        </section>
      )}
    </section>
  );
}
