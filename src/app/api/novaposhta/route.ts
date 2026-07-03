import { NextResponse } from "next/server";

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NP_WAREHOUSE_TYPE = "9a68df70-0267-42a8-bb5c-37f427e36ee4";
const NP_LOCKER_TYPE = "841339c7-591a-42e2-8233-7a0a00f0ed6f";
const ALLOWED_WAREHOUSE_TYPES = new Set([NP_WAREHOUSE_TYPE, NP_LOCKER_TYPE]);

type NovaPoshtaRequestBody = {
  modelName?: unknown;
  calledMethod?: unknown;
  methodProperties?: unknown;
};

type MethodProperties = Record<string, unknown>;

function getMethodProperties(body: NovaPoshtaRequestBody): MethodProperties {
  if (!body.methodProperties || typeof body.methodProperties !== "object" || Array.isArray(body.methodProperties)) {
    return {};
  }

  return body.methodProperties as MethodProperties;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function makeSearchSettlementsRequest(body: NovaPoshtaRequestBody) {
  const source = getMethodProperties(body);
  const cityName = readString(source.CityName);

  if (cityName.length < 2) {
    return { error: "CityName must contain at least 2 characters." };
  }

  return {
    methodProperties: {
      CityName: cityName,
      Limit: readPositiveInt(source.Limit, 12, 20),
      Page: readPositiveInt(source.Page, 1, 100),
    },
  };
}

function makeWarehousesRequest(body: NovaPoshtaRequestBody) {
  const source = getMethodProperties(body);
  const cityRef = readString(source.CityRef);
  const typeOfWarehouseRef = readString(source.TypeOfWarehouseRef);

  if (!cityRef) {
    return { error: "CityRef is required for warehouse search." };
  }

  if (typeOfWarehouseRef && !ALLOWED_WAREHOUSE_TYPES.has(typeOfWarehouseRef)) {
    return { error: "Unsupported warehouse type." };
  }

  return {
    methodProperties: {
      CityRef: cityRef,
      ...(typeOfWarehouseRef ? { TypeOfWarehouseRef: typeOfWarehouseRef } : {}),
      Limit: readPositiveInt(source.Limit, 300, 500),
      Page: readPositiveInt(source.Page, 1, 100),
    },
  };
}

function makeAllowedRequest(body: NovaPoshtaRequestBody, apiKey: string) {
  if (body.modelName !== "Address") {
    return { error: "Unsupported Nova Poshta model." };
  }

  if (body.calledMethod === "searchSettlements") {
    const result = makeSearchSettlementsRequest(body);
    if ("error" in result) return result;

    return {
      request: {
        apiKey,
        modelName: "Address",
        calledMethod: "searchSettlements",
        methodProperties: result.methodProperties,
      },
    };
  }

  if (body.calledMethod === "getWarehouses") {
    const result = makeWarehousesRequest(body);
    if ("error" in result) return result;

    return {
      request: {
        apiKey,
        modelName: "Address",
        calledMethod: "getWarehouses",
        methodProperties: result.methodProperties,
      },
    };
  }

  return { error: "Unsupported Nova Poshta method." };
}

export async function POST(req: Request) {
  const apiKey = process.env.NP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "NP_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: NovaPoshtaRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const allowedRequest = makeAllowedRequest(body, apiKey);
  if (!("request" in allowedRequest)) {
    return NextResponse.json({ success: false, error: allowedRequest.error }, { status: 400 });
  }

  try {
    const response = await fetch(NOVA_POSHTA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allowedRequest.request),
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.errors?.[0] || "Nova Poshta API request failed.",
          errors: data.errors || [],
        },
        { status: response.ok ? 502 : response.status },
      );
    }

    return NextResponse.json({
      success: true,
      data: data.data || [],
      warnings: data.warnings || [],
      info: data.info || [],
    });
  } catch {
    return NextResponse.json({ success: false, error: "Nova Poshta API is unavailable." }, { status: 502 });
  }
}
