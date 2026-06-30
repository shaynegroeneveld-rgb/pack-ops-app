export type RoomType =
  | "bedroom"
  | "kitchen"
  | "dining_room"
  | "living_room"
  | "bathroom"
  | "ensuite"
  | "hallway"
  | "laundry"
  | "mechanical_room"
  | "garage"
  | "porch_exterior"
  | "office_den"
  | "closet"
  | "pantry"
  | "unfinished_storage"
  | "other";

export type DeviceStatus = "suggested" | "approved" | "rejected";
export type DeviceInclusionStatus = "included" | "optional" | "excluded";

export interface PlanCoordinate {
  x: number;
  y: number;
}

export interface WallSegment {
  id: string;
  start: PlanCoordinate;
  end: PlanCoordinate;
  roomId: string;
}

export interface DoorOpening {
  id: string;
  wallSegmentId: string;
  center: PlanCoordinate;
  width: number;
  notes?: string;
}

export interface PlanPage {
  id: string;
  pageNumber: number;
  name: string;
  sourceUrl?: string;
  width: number;
  height: number;
}

export interface Room {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  roomName: string;
  roomType: RoomType;
  floorLevel: string;
  polygon: PlanCoordinate[];
  wallSegments: WallSegment[];
  detectedBy: "manual" | "ocr";
  notes?: string;
}

export interface DeviceCatalogItem {
  id: string;
  name: string;
  category: string;
  symbol: string;
  defaultVoltage: string;
  defaultCircuitType: string;
  roughInBoxType: string;
  defaultLaborUnit: number;
  materialAllowance: number;
  notes: string;
}

export interface ElectricalDevice {
  id: string;
  planPageId: string;
  pdfPageNumber: number;
  roomId?: string;
  catalogItemId: string;
  position: PlanCoordinate;
  status: DeviceStatus;
  inclusionStatus: DeviceInclusionStatus;
  circuitCategory: string;
  notes?: string;
}

export interface PlacementRule {
  id: string;
  name: string;
  roomTypes: RoomType[];
  catalogItemId: string;
  strategy: "room_center" | "wall_spacing" | "near_entry" | "placeholder";
  enabled: boolean;
  spacingFeet?: number;
  notes: string;
}

export interface TakeoffSummary {
  catalogItemId: string;
  deviceType: string;
  quantity: number;
  room: string;
  circuitCategory: string;
  notes: string;
  inclusionStatus: DeviceInclusionStatus;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  planPages: PlanPage[];
  rooms: Room[];
  devices: ElectricalDevice[];
  placementRules: PlacementRule[];
}
