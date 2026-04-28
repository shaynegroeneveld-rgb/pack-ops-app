import type { User } from "@/domain/users/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { RowToDomainMapper } from "@/data/mappers/shared";

type UserRow = TableRow<"users">;

export const usersMapper: RowToDomainMapper<UserRow, User> = {
  toDomain(row) {
    return {
      id: row.id as User["id"],
      orgId: row.org_id as User["orgId"],
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      isForeman: row.is_foreman,
      canApproveTime: row.can_approve_time,
      lastSeenAt: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};
