import type { UserRole } from "@/domain/enums";
import type { OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface User extends AuditedEntity {
  id: UserId;
  orgId: OrgId;
  email: string;
  fullName: string;
  role: UserRole;
  isForeman: boolean;
  canApproveTime: boolean;
  lastSeenAt: string | null;
}

export interface AuthenticatedUser {
  user: User;
  accessToken: string;
}
