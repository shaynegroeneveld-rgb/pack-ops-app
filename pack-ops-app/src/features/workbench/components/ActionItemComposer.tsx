import { useState } from "react";

export interface ActionItemComposerProps {
  canCreateActionItem: boolean;
  isPending: boolean;
  onCreate: (input: { title: string; description: string }) => Promise<unknown>;
}

export function ActionItemComposer({
  canCreateActionItem,
  isPending,
  onCreate,
}: ActionItemComposerProps) {
  const [title, setTitle] = useState("Follow up");
  const [description, setDescription] = useState("");

  return (
    <div style={{ marginBottom: "20px" }}>
      <h3>Add Action Item</h3>
      <div style={{ display: "grid", gap: "8px", maxWidth: "520px" }}>
        <p style={{ margin: 0, color: "#5b6475" }}>
          Use one clear follow-up title so the next action is easy to scan.
        </p>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional detail or reminder"
          rows={2}
        />
        <button
          disabled={!canCreateActionItem || isPending || !title}
          onClick={async () => {
            try {
              await onCreate({ title, description });
              setTitle("Follow up");
              setDescription("");
            } catch {
              return;
            }
          }}
        >
          {isPending ? "Adding..." : "Add Action Item"}
        </button>
      </div>
    </div>
  );
}
