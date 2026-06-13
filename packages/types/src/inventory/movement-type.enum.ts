export enum MovementType {
  PURCHASE_IN = 'purchase_in',
  SALE_OUT = 'sale_out',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
  ADJUSTMENT_IN = 'adjustment_in',
  ADJUSTMENT_OUT = 'adjustment_out',
  RETURN_IN = 'return_in',
  RETURN_OUT = 'return_out',
  DAMAGE = 'damage',
  THEFT = 'theft',
  REPAIR_IN = 'repair_in',
  REPAIR_OUT = 'repair_out',
  INITIAL_STOCK = 'initial_stock',
  PHYSICAL_COUNT = 'physical_count',
}

export enum MovementDirection {
  IN = 1,
  OUT = -1,
}

export const MOVEMENT_DIRECTION_MAP: Record<MovementType, MovementDirection> = {
  [MovementType.PURCHASE_IN]: MovementDirection.IN,
  [MovementType.SALE_OUT]: MovementDirection.OUT,
  [MovementType.TRANSFER_IN]: MovementDirection.IN,
  [MovementType.TRANSFER_OUT]: MovementDirection.OUT,
  [MovementType.ADJUSTMENT_IN]: MovementDirection.IN,
  [MovementType.ADJUSTMENT_OUT]: MovementDirection.OUT,
  [MovementType.RETURN_IN]: MovementDirection.IN,
  [MovementType.RETURN_OUT]: MovementDirection.OUT,
  [MovementType.DAMAGE]: MovementDirection.OUT,
  [MovementType.THEFT]: MovementDirection.OUT,
  [MovementType.REPAIR_IN]: MovementDirection.IN,
  [MovementType.REPAIR_OUT]: MovementDirection.OUT,
  [MovementType.INITIAL_STOCK]: MovementDirection.IN,
  [MovementType.PHYSICAL_COUNT]: MovementDirection.IN,
};
