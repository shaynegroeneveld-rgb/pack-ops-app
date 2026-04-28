import { ENTITY_TYPES, type EntityType } from "@/domain/enums";

export function isEntityType(value: string): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
}
