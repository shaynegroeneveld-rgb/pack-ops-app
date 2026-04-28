export const CAPABILITY_FLAGS = ["isForeman", "canApproveTime"] as const;
export type CapabilityFlag = (typeof CAPABILITY_FLAGS)[number];
