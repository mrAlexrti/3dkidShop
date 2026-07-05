const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

type MoneyLike = number | string | { toString(): string };

export type NovaPoshtaOrderInput = {
  id: string;
  number: string;
  customerName: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerPhone: string;
  paymentMethod: string;
  total: MoneyLike;
  deliveryMethod?: string | null;
  novaPoshtaCity?: string | null;
  novaPoshtaCityRef?: string | null;
  novaPoshtaBranch?: string | null;
  novaPoshtaBranchRef?: string | null;
};

type NovaPoshtaApiResponse<T> = {
  success: boolean;
  data?: T[];
  errors?: string[];
  warnings?: string[];
  info?: unknown;
};

type WaybillData = {
  IntDocNumber?: string;
  Ref?: string;
};

type StatusData = {
  Number?: string;
  Status?: string;
  StatusCode?: string;
  ActualDeliveryDate?: string;
  DateScan?: string;
  Redelivery?: string;
  RedeliverySum?: string;
  RedeliveryStatus?: string;
  RedeliveryStatusCode?: string;
  RedeliveryNum?: string;
  RedeliveryPaymentCardDescription?: string;
  AfterpaymentOnGoodsCost?: string;
};

export type NovaPoshtaWaybillResult =
  | { success: true; ttn: string; ref: string; status?: string; statusCode?: string }
  | { success: false; error: string; missingFields?: string[] };

export type NovaPoshtaDocumentStatus = {
  ttn: string;
  status: string;
  statusCode: string;
  deliveredAt: Date | null;
  codStatus: string;
  codStatusCode: string;
  codAmount: number | null;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function numberFromMoney(value: MoneyLike) {
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `380${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `38${digits}`;
  return digits;
}

function isCashOnDelivery(paymentMethod: string) {
  const normalized = paymentMethod.toLowerCase();
  return normalized.includes("наклад") || normalized.includes("cash_on_delivery") || normalized.includes("cod");
}

function parseNovaPoshtaMoney(value: string | number | undefined) {
  if (!value) return null;

  const parsed = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNovaPoshtaDate(value: string | undefined) {
  if (!value) return null;

  const normalized = value.trim();
  const parsedDate = normalized.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (parsedDate) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = parsedDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRedeliveryStatus(data: StatusData) {
  if (data.RedeliveryStatus) return data.RedeliveryStatus;
  if (data.RedeliveryPaymentCardDescription) return data.RedeliveryPaymentCardDescription;
  if (data.Redelivery === "1" || data.RedeliveryNum) return "Очікується післяплата";
  return "";
}

function getConfig() {
  return {
    apiKey: readEnv("NP_API_KEY"),
    senderRef: readEnv("NP_SENDER_REF"),
    contactSenderRef: readEnv("NP_CONTACT_SENDER_REF"),
    senderCityRef: readEnv("NP_SENDER_CITY_REF"),
    senderAddressRef: readEnv("NP_SENDER_ADDRESS_REF"),
    senderPhone: readEnv("NP_SENDER_PHONE"),
    payerType: readEnv("NP_PAYER_TYPE") || "Recipient",
    paymentMethod: readEnv("NP_PAYMENT_METHOD") || "Cash",
    weight: readEnv("NP_DEFAULT_WEIGHT") || "0.5",
    serviceType: readEnv("NP_DEFAULT_SERVICE_TYPE") || "WarehouseWarehouse",
    cargoType: readEnv("NP_DEFAULT_CARGO_TYPE") || "Parcel",
    seatsAmount: readEnv("NP_DEFAULT_SEATS_AMOUNT") || "1",
    description: readEnv("NP_DESCRIPTION") || "3D printed goods",
  };
}

export function validateNovaPoshtaConfig() {
  const config = getConfig();
  const missingFields = [
    !config.apiKey ? "NP_API_KEY" : null,
    !config.senderRef ? "NP_SENDER_REF" : null,
    !config.contactSenderRef ? "NP_CONTACT_SENDER_REF" : null,
    !config.senderCityRef ? "NP_SENDER_CITY_REF" : null,
    !config.senderAddressRef ? "NP_SENDER_ADDRESS_REF" : null,
    !config.senderPhone ? "NP_SENDER_PHONE" : null,
  ].filter(Boolean) as string[];

  return { ok: missingFields.length === 0, missingFields, config };
}

function validateOrder(order: NovaPoshtaOrderInput) {
  const missingFields = [
    !order.customerName ? "customerName" : null,
    !order.customerPhone ? "customerPhone" : null,
    !order.novaPoshtaCityRef ? "novaPoshtaCityRef" : null,
    !order.novaPoshtaBranchRef ? "novaPoshtaBranchRef" : null,
    numberFromMoney(order.total) <= 0 ? "total" : null,
  ].filter(Boolean) as string[];

  return missingFields;
}

async function callNovaPoshta<T>(apiKey: string, modelName: string, calledMethod: string, methodProperties: Record<string, unknown>) {
  const response = await fetch(NOVA_POSHTA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
    cache: "no-store",
  });
  const data = (await response.json()) as NovaPoshtaApiResponse<T>;

  if (!response.ok || data.success === false) {
    return {
      success: false as const,
      error: data.errors?.join("; ") || "Nova Poshta API request failed.",
    };
  }

  return { success: true as const, data: data.data ?? [] };
}

function buildBackwardDeliveryData(order: NovaPoshtaOrderInput) {
  if (!isCashOnDelivery(order.paymentMethod)) return undefined;

  return [
    {
      PayerType: "Recipient",
      CargoType: "Money",
      RedeliveryString: numberFromMoney(order.total).toFixed(2),
    },
  ];
}

function normalizeDocumentStatus(data: StatusData, fallbackTtn: string): NovaPoshtaDocumentStatus {
  return {
    ttn: data.Number || fallbackTtn,
    status: data.Status || "",
    statusCode: data.StatusCode || "",
    deliveredAt: parseNovaPoshtaDate(data.ActualDeliveryDate || (data.StatusCode === "9" ? data.DateScan : undefined)),
    codStatus: normalizeRedeliveryStatus(data),
    codStatusCode: data.RedeliveryStatusCode || "",
    codAmount: parseNovaPoshtaMoney(data.RedeliverySum || data.AfterpaymentOnGoodsCost),
  };
}

export async function createNovaPoshtaWaybill(order: NovaPoshtaOrderInput): Promise<NovaPoshtaWaybillResult> {
  const configValidation = validateNovaPoshtaConfig();
  if (!configValidation.ok) {
    return {
      success: false,
      error: `Nova Poshta env is missing: ${configValidation.missingFields.join(", ")}`,
      missingFields: configValidation.missingFields,
    };
  }

  const missingOrderFields = validateOrder(order);
  if (missingOrderFields.length > 0) {
    return {
      success: false,
      error: `Order is missing Nova Poshta data: ${missingOrderFields.join(", ")}`,
      missingFields: missingOrderFields,
    };
  }

  const { config } = configValidation;
  const recipientName = order.customerName.trim();
  const recipientPhone = normalizePhone(order.customerPhone);
  const cost = numberFromMoney(order.total).toFixed(2);
  const methodProperties: Record<string, unknown> = {
    PayerType: config.payerType,
    PaymentMethod: config.paymentMethod,
    DateTime: new Intl.DateTimeFormat("uk-UA").format(new Date()),
    CargoType: config.cargoType,
    Weight: config.weight,
    ServiceType: config.serviceType,
    SeatsAmount: config.seatsAmount,
    Description: `${config.description} ${order.number}`.trim(),
    Cost: cost,
    CitySender: config.senderCityRef,
    Sender: config.senderRef,
    SenderAddress: config.senderAddressRef,
    ContactSender: config.contactSenderRef,
    SendersPhone: normalizePhone(config.senderPhone),
    CityRecipient: order.novaPoshtaCityRef,
    RecipientCityName: order.novaPoshtaCity,
    RecipientAddress: order.novaPoshtaBranchRef,
    RecipientAddressName: order.novaPoshtaBranch,
    RecipientType: "PrivatePerson",
    RecipientsPhone: recipientPhone,
    RecipientName: recipientName,
    NewAddress: "1",
    BackwardDeliveryData: buildBackwardDeliveryData(order),
  };

  const result = await callNovaPoshta<WaybillData>(config.apiKey, "InternetDocument", "save", methodProperties);
  if (!result.success) return result;

  const createdDocument = result.data[0];
  if (!createdDocument?.IntDocNumber || !createdDocument.Ref) {
    return { success: false, error: "Nova Poshta did not return TTN number or document Ref." };
  }

  return {
    success: true,
    ttn: createdDocument.IntDocNumber,
    ref: createdDocument.Ref,
  };
}

export async function getNovaPoshtaDocumentStatuses(ttns: string[]) {
  const uniqueTtns = Array.from(new Set(ttns.map((ttn) => ttn.trim()).filter(Boolean)));
  if (uniqueTtns.length === 0) {
    return { success: true as const, statuses: [] as NovaPoshtaDocumentStatus[] };
  }

  const configValidation = validateNovaPoshtaConfig();
  if (!configValidation.ok) {
    return {
      success: false as const,
      error: `Nova Poshta env is missing: ${configValidation.missingFields.join(", ")}`,
    };
  }

  const result = await callNovaPoshta<StatusData>(configValidation.config.apiKey, "TrackingDocument", "getStatusDocuments", {
    Documents: uniqueTtns.map((ttn) => ({ DocumentNumber: ttn })),
  });
  if (!result.success) return result;

  return {
    success: true as const,
    statuses: result.data.map((status, index) => normalizeDocumentStatus(status, uniqueTtns[index] ?? "")),
  };
}

export async function getNovaPoshtaDocumentStatus(ttn: string) {
  const result = await getNovaPoshtaDocumentStatuses([ttn]);
  if (!result.success) return result;

  const status = result.statuses[0];
  return {
    success: true as const,
    ttn: status?.ttn ?? ttn,
    status: status?.status ?? "",
    statusCode: status?.statusCode ?? "",
    codStatus: status?.codStatus ?? "",
    codStatusCode: status?.codStatusCode ?? "",
    codAmount: status?.codAmount ?? null,
    deliveredAt: status?.deliveredAt ?? null,
  };
}