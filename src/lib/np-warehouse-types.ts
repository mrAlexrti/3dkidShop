export type NPCity = { Ref: string; Description: string };
export type NPWarehouse = { Ref: string; Description: string; Number: string; ShortAddress?: string; TypeOfWarehouse?: string; TypeOfWarehouseRef?: string };
export const NP_WAREHOUSE_TYPE = "9a68df70-0267-42a8-bb5c-37f427e36ee4";
const NP_POSTAL_BRANCH_TYPE = "841339c7-591a-42e2-8233-7a0a00f0ed6f";
export const NP_LOCKER_TYPE = "f9316480-5f2d-425d-bc2c-ac7cd29decf0";

export function isParcelLocker(warehouse: NPWarehouse) {
  const text = `${warehouse.Description ?? ""} ${warehouse.ShortAddress ?? ""}`.toLowerCase();
  return (warehouse.TypeOfWarehouse ?? warehouse.TypeOfWarehouseRef) === NP_LOCKER_TYPE || /поштомат|postomat|parcel locker/.test(text);
}

export function filterWarehousesByDelivery(warehouses: NPWarehouse[], deliveryType: "np_warehouse" | "np_parcel_locker") {
  return warehouses.filter((warehouse) => {
    const locker = isParcelLocker(warehouse);
    const type = warehouse.TypeOfWarehouse ?? warehouse.TypeOfWarehouseRef;
    if (deliveryType === "np_parcel_locker") return locker;
    const text = `${warehouse.Description ?? ""} ${warehouse.ShortAddress ?? ""}`.toLowerCase();
    return !locker && (type === NP_WAREHOUSE_TYPE || type === NP_POSTAL_BRANCH_TYPE || /відділення|отделение|warehouse/.test(text));
  });
}
