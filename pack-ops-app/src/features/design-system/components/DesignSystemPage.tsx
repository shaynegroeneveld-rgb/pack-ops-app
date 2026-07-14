import { useEffect, useState } from "react";

import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import { Button, Card, Chip, Input, Modal, Select, useToast } from "@/ui";

type ThemeName = "office" | "field";

function sectionStyle(): React.CSSProperties {
  return { display: "grid", gap: "12px" };
}

function rowStyle(): React.CSSProperties {
  return { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" };
}

function sectionTitleStyle(): React.CSSProperties {
  return { margin: 0, fontSize: "20px" };
}

export function DesignSystemPage() {
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const [theme, setTheme] = useState<ThemeName>("office");
  const [isCenterModalOpen, setIsCenterModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    // Toast portals to document.body via the app-root ToastProvider, outside this
    // page's own themed div, so previewing the toggle here also needs to mirror
    // onto <html> (AppShell does the equivalent based on the active route).
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      if (previousTheme === undefined) {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = previousTheme;
      }
    };
  }, [theme]);

  return (
    <div
      data-theme={theme === "field" ? "field" : undefined}
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: theme === "field" ? "var(--color-surface)" : "var(--color-surface-alt)",
        color: "var(--color-text)",
      }}
    >
      <div style={{ maxWidth: "920px", margin: "0 auto", display: "grid", gap: "28px" }}>
        <header style={{ display: "grid", gap: "8px" }}>
          <div style={rowStyle()}>
            <Button variant="ghost" onClick={() => setActiveRoute(APP_ROUTES.settings)}>
              ← Back to Settings
            </Button>
          </div>
          <h1 style={{ margin: 0, fontSize: "31px" }}>Pack Design System</h1>
          <p style={{ margin: 0, color: "var(--color-text-soft)", maxWidth: "60ch" }}>
            Every shared primitive and its states, in one place. This page is only reachable from Settings
            (owner-only) and isn&apos;t part of the app&apos;s navigation.
          </p>
          <div style={rowStyle()}>
            <Chip active={theme === "office"} onClick={() => setTheme("office")}>
              Office theme
            </Chip>
            <Chip active={theme === "field"} onClick={() => setTheme("field")}>
              Field theme
            </Chip>
          </div>
        </header>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Button</h2>
          <Card variant="soft" style={{ display: "grid", gap: "16px" }}>
            <div style={rowStyle()}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div style={rowStyle()}>
              <Button variant="primary" size="sm">
                Small
              </Button>
              <Button variant="primary" loading>
                Loading
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" fullWidth style={{ maxWidth: "220px" }}>
                Full width
              </Button>
            </div>
            <p style={{ margin: 0, color: "var(--color-text-soft)", fontSize: "13px" }}>
              Tab to a button to see the focus-visible ring; click and hold to see the pressed state.
            </p>
          </Card>
        </section>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Input &amp; Select</h2>
          <Card variant="soft" style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Input label="Job name" placeholder="e.g. Smith Reno" value={inputValue} onChange={(event) => setInputValue(event.target.value)} />
            <Input label="With hint" placeholder="123 Main St" hint="Used for scheduling and invoices." />
            <Input label="With error" defaultValue="not-an-email" error="Enter a valid email address." />
            <Input label="Disabled" defaultValue="Locked field" disabled />
            <Select label="Role" defaultValue="field" hint="Controls what this user can see.">
              <option value="field">Field</option>
              <option value="office">Office</option>
              <option value="owner">Owner</option>
            </Select>
            <Select label="With error" error="Choose a job before saving.">
              <option value="">Select a job…</option>
            </Select>
          </Card>
        </section>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Card</h2>
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Card variant="surface">Surface card — default page content.</Card>
            <Card variant="soft">Soft card — nested/grouped content.</Card>
            <Card variant="elevated">Elevated card — modals, popovers, callouts.</Card>
          </div>
        </section>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Chip</h2>
          <Card variant="soft" style={rowStyle()}>
            <Chip>Default</Chip>
            <Chip active>Active</Chip>
            <Chip badgeCount={3}>With badge</Chip>
            <Chip disabled>Disabled</Chip>
          </Card>
        </section>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Toast</h2>
          <Card variant="soft" style={rowStyle()}>
            <Button variant="secondary" onClick={() => showToast("Saved successfully.", "success")}>
              Trigger success
            </Button>
            <Button variant="secondary" onClick={() => showToast("Could not save changes.", "error")}>
              Trigger error
            </Button>
            <Button variant="secondary" onClick={() => showToast("Sync is in progress.", "info")}>
              Trigger info
            </Button>
          </Card>
        </section>

        <section style={sectionStyle()}>
          <h2 style={sectionTitleStyle()}>Modal</h2>
          <Card variant="soft" style={rowStyle()}>
            <Button variant="secondary" onClick={() => setIsCenterModalOpen(true)}>
              Open centered dialog
            </Button>
            <Button variant="secondary" onClick={() => setIsSheetModalOpen(true)}>
              Open bottom sheet
            </Button>
          </Card>
        </section>
      </div>

      <Modal
        open={isCenterModalOpen}
        onClose={() => setIsCenterModalOpen(false)}
        theme={theme}
        title="Delete quote?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCenterModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setIsCenterModalOpen(false)}>
              Delete
            </Button>
          </>
        }
      >
        This replaces a native <code>window.confirm</code>. Press Escape or click outside to close.
      </Modal>

      <Modal
        open={isSheetModalOpen}
        onClose={() => setIsSheetModalOpen(false)}
        theme={theme}
        placement="bottom"
        title="Finish timer"
        footer={
          <Button variant="primary" onClick={() => setIsSheetModalOpen(false)}>
            Save time entry
          </Button>
        }
      >
        This is the bottom-sheet placement used for Field Mode flows like finishing a timer.
      </Modal>
    </div>
  );
}
