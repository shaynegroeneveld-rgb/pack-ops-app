import { useEffect, useState } from "react";

import type { WorkbenchContactOption } from "@/services/workbench/workbench-service";

export interface CreateJobPanelProps {
  canCreateJob: boolean;
  contacts: WorkbenchContactOption[];
  defaultContactId?: string | null;
  isPending: boolean;
  isCreatingContact: boolean;
  onCreate: (input: { title: string; description: string; contactId: string; estimatedHours?: number | null }) => Promise<unknown>;
  onCreateContact: (input: { displayName: string; email?: string; phone?: string }) => Promise<WorkbenchContactOption>;
}

export function CreateJobPanel({
  canCreateJob,
  contacts,
  defaultContactId,
  isPending,
  isCreatingContact,
  onCreate,
  onCreateContact,
}: CreateJobPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  const [showDetails, setShowDetails] = useState(false);
  const [showQuickContact, setShowQuickContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  const selectedContact = contacts.find((contact) => contact.id === contactId) ?? null;

  useEffect(() => {
    if (!contactId) {
      setContactId(defaultContactId ?? "");
    }
  }, [contactId, defaultContactId]);

  useEffect(() => {
    if (!contactId && contacts.length === 1) {
      const soleContact = contacts[0];
      if (soleContact) {
        setContactId(soleContact.id);
      }
    }
  }, [contactId, contacts]);

  return (
    <section style={{ border: "1px solid #d9dfeb", borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
      <h2 style={{ marginTop: 0 }}>Create Job</h2>
      <p style={{ color: "#5b6475" }}>
        Create a job fast, attach it to a contact, and fill in extra detail only if you need it right now.
      </p>
      <div style={{ display: "grid", gap: "10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: "8px", alignItems: "start" }}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={selectedContact ? `Job for ${selectedContact.label}` : "Job title"}
          />
          <select
            value={contactId}
            onChange={(event) => {
              const nextContactId = event.target.value;
              const nextContact = contacts.find((contact) => contact.id === nextContactId) ?? null;
              setContactId(nextContactId);

              if (!title && nextContact) {
                setTitle(`Job for ${nextContact.label}`);
              }
            }}
          >
            <option value="">Select a contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
          <button
            disabled={!canCreateJob || isPending || isSubmittingCreate || !title || !contactId}
            onClick={async () => {
              if (isPending || isSubmittingCreate) {
                console.info("[CreateJobPanel] create ignored while pending", {
                  isPending,
                  isSubmittingCreate,
                });
                return;
              }

              try {
                const normalizedEstimatedHours = estimatedHours.trim();
                const createPayload = {
                  title,
                  description,
                  contactId,
                  ...(normalizedEstimatedHours ? { estimatedHours: Number(normalizedEstimatedHours) } : {}),
                };
                console.info("[CreateJobPanel] create job submit", createPayload);
                setIsSubmittingCreate(true);
                await onCreate({
                  ...createPayload,
                });
                setTitle("");
                setDescription("");
                setEstimatedHours("");
              } catch {
                return;
              } finally {
                setIsSubmittingCreate(false);
              }
            }}
          >
            {isPending || isSubmittingCreate ? "Creating..." : "Create Job"}
          </button>
        </div>
        {selectedContact?.subtitle ? (
          <p style={{ margin: 0, color: "#5b6475" }}>Contact: {selectedContact.subtitle}</p>
        ) : null}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setShowDetails((value) => !value)} disabled={!canCreateJob}>
            {showDetails ? "Hide Details" : "Add Details"}
          </button>
          <button onClick={() => setShowQuickContact((value) => !value)} disabled={!canCreateJob}>
            {showQuickContact ? "Hide Quick Contact" : "Quick Create Contact"}
          </button>
        </div>
        {showDetails ? (
          <div style={{ display: "grid", gap: "10px" }}>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={estimatedHours}
              onChange={(event) => setEstimatedHours(event.target.value)}
              placeholder="Estimated hours (optional)"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional job notes or site details"
              rows={3}
            />
          </div>
        ) : (
          <p style={{ margin: 0, color: "#5b6475" }}>
            Keep it moving: title and contact are enough to open the job. Add details like estimated hours later if needed.
          </p>
        )}
        {contacts.length === 0 ? (
          <p style={{ margin: 0, color: "#5b6475" }}>
            No contacts are loaded yet. Use the quick contact option below to keep moving.
          </p>
        ) : null}
        {showQuickContact ? (
          <div style={{ display: "grid", gap: "8px", border: "1px dashed #d9dfeb", padding: "12px", borderRadius: "12px" }}>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Contact name"
            />
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Email"
            />
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="Phone"
            />
            <button
              disabled={!canCreateJob || isCreatingContact || !contactName}
              onClick={async () => {
                try {
                  const createContactInput = {
                    displayName: contactName,
                    ...(contactEmail ? { email: contactEmail } : {}),
                    ...(contactPhone ? { phone: contactPhone } : {}),
                  };
                  console.info("[CreateJobPanel] quick contact form payload", createContactInput);
                  const contact = await onCreateContact({
                    ...createContactInput,
                  });
                  setContactId(contact.id);
                  setShowQuickContact(false);
                  setContactName("");
                  setContactEmail("");
                  setContactPhone("");
                } catch (error) {
                  console.error("[CreateJobPanel] quick contact creation failed", error);
                  return;
                }
              }}
            >
              Create Contact and Use It
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
