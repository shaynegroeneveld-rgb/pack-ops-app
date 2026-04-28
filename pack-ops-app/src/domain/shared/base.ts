export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletable {
  deletedAt: string | null;
}

export interface OrgScoped {
  orgId: string;
}

export interface AuditedEntity extends Timestamped, SoftDeletable, OrgScoped {
  id: string;
}

export interface UserStamped {
  createdBy: string | null;
  updatedBy: string | null;
}
