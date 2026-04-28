import type { ActionItem } from "@/domain/action-items/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface ActionItemFilter {
  entityId?: ActionItem["entityId"];
  entityType?: ActionItem["entityType"];
  assignedTo?: ActionItem["assignedTo"];
  statuses?: ActionItem["status"][];
}

export interface CreateActionItemInput {
  entityType: ActionItem["entityType"];
  entityId: ActionItem["entityId"];
  category: ActionItem["category"];
  title: ActionItem["title"];
  description?: ActionItem["description"];
  assignedTo?: ActionItem["assignedTo"];
  priority?: ActionItem["priority"];
  dueAt?: ActionItem["dueAt"];
  createdBy?: ActionItem["createdBy"];
}

export interface UpdateActionItemInput {
  status?: ActionItem["status"];
  assignedTo?: ActionItem["assignedTo"];
  snoozedUntil?: ActionItem["snoozedUntil"];
  resolvedAt?: ActionItem["resolvedAt"];
  resolvedBy?: ActionItem["resolvedBy"];
  dismissedAt?: ActionItem["dismissedAt"];
  dismissedBy?: ActionItem["dismissedBy"];
  deletedAt?: string | null;
}

export type ActionItemsRepository = Repository<
  ActionItem,
  CreateActionItemInput,
  UpdateActionItemInput,
  ActionItemFilter
>;
