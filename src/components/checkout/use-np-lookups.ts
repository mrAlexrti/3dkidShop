"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { filterWarehousesByDelivery, type NPCity, type NPWarehouse } from "@/lib/np-warehouse-types";

function useLookup<T>(delay: number) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const controller = useRef<AbortController>();
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimeout(timer.current);
    controller.current?.abort();
  }, []);
  const clear = useCallback(() => {
    cancel(); setItems([]); setLoading(false); setError(false);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);

  const search = useCallback((body: object | null, map: (data: unknown[]) => T[]) => {
    clear();
    if (!body) return;
    setLoading(true);
    const requestGeneration = generation.current;
    timer.current = setTimeout(async () => {
      const request = new AbortController();
      controller.current = request;
      try {
        const response = await fetch("/api/novaposhta", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: request.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.data)) throw new Error("NP_LOOKUP_FAILED");
        if (!request.signal.aborted && requestGeneration === generation.current) setItems(map(data.data));
      } catch {
        if (!request.signal.aborted && requestGeneration === generation.current) setError(true);
      } finally {
        if (!request.signal.aborted && requestGeneration === generation.current) setLoading(false);
      }
    }, delay);
  }, [clear, delay]);
  return { items, loading, error, search, clear };
}

export function useCitySearch() {
  const lookup = useLookup<NPCity>(380);
  return { ...lookup, cities: lookup.items, search: (value: string) => {
    const query = value.trim();
    lookup.search(query.length < 2 ? null : {
      modelName: "Address", calledMethod: "searchSettlements",
      methodProperties: { CityName: query, Limit: 12, Page: 1 },
    }, (data) => {
      const addresses = (data[0] as { Addresses?: { DeliveryCity: string; Present: string }[] })?.Addresses ?? [];
      return addresses.map((address) => ({ Ref: address.DeliveryCity, Description: address.Present }));
    });
  } };
}

export function useWarehouses() {
  const lookup = useLookup<NPWarehouse>(350);
  return { ...lookup, warehouses: lookup.items, search: (cityRef: string, value: string, deliveryType: "np_warehouse" | "np_parcel_locker") => {
    const query = value.trim();
    lookup.search(!cityRef || query.length < 1 ? null : {
      modelName: "Address", calledMethod: "getWarehouses",
      methodProperties: { CityRef: cityRef, FindByString: query, Limit: 50, Page: 1 },
    }, (data) => filterWarehousesByDelivery(data as NPWarehouse[], deliveryType));
  } };
}
