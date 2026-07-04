"use client";

import { useForm, useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/checkout";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { createOrder } from "@/lib/actions/create-order";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState, useCallback, useRef } from "react";
import { formatPrice } from "@/lib/utils";
import { MapPin, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

async function npRequest(body: object) {
  try {
    const res = await fetch("/api/novaposhta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Сервіс Нової Пошти тимчасово недоступний");
    }
    return data.data ?? [];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Сервіс Нової Пошти тимчасово недоступний");
  }
}

type NPCity      = { Ref: string; Description: string };
type NPWarehouse = {
  Ref: string;
  Description: string;
  Number: string;
  ShortAddress?: string;
  TypeOfWarehouseRef?: string;
};

function useCitySearch() {
  const [cities, setCities]   = useState<NPCity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback((q: string) => {
    clearTimeout(timer.current);
    if (q.length < 2) { setCities([]); setError(null); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await npRequest({
          modelName: "Address",
          calledMethod: "searchSettlements",
          methodProperties: { CityName: q, Limit: 12, Page: 1 },
        });
        const addresses = data?.[0]?.Addresses ?? [];
        const flat: NPCity[] = addresses.map((a: { DeliveryCity: string; Present: string }) => ({
          Ref: a.DeliveryCity,
          Description: a.Present,
        }));
        setCities(flat);
        setError(null);
      } catch (requestError) {
        setCities([]);
        setError(requestError instanceof Error ? requestError.message : "Сервіс Нової Пошти тимчасово недоступний");
      } finally {
        setLoading(false);
      }
    }, 380);
  }, []);

  return { cities, loading, error, search, clear: () => { setCities([]); setError(null); } };
}

function useWarehouses() {
  const [warehouses, setWarehouses] = useState<NPWarehouse[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (
    cityRef: string,
    q: string,
    deliveryType: Extract<CheckoutInput["deliveryType"], "np_warehouse" | "np_parcel_locker">,
  ) => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (!cityRef || query.length < 1) {
      setWarehouses([]);
      setError(null);
      return;
    }

    timer.current = setTimeout(async () => {
      setLoading(false);
      try {
        const data: NPWarehouse[] = await npRequest({
          modelName: "Address",
          calledMethod: "getWarehouses",
          methodProperties: {
            CityRef: cityRef,
            FindByString: query,
            Limit: 50,
            Page: 1,
          },
        });
        setWarehouses(filterWarehousesByDelivery(data ?? [], deliveryType));
        setError(null);
      } catch (requestError) {
        setWarehouses([]);
        setError(requestError instanceof Error ? requestError.message : "РЎРµСЂРІС–СЃ РќРѕРІРѕС— РџРѕС€С‚Рё С‚РёРјС‡Р°СЃРѕРІРѕ РЅРµРґРѕСЃС‚СѓРїРЅРёР№");
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const load = useCallback(async (cityRef: string, typeRef?: string) => {
    if (!cityRef) return;
    setLoading(true);
    try {
      const data: NPWarehouse[] = await npRequest({
        modelName: "Address",
        calledMethod: "getWarehouses",
        methodProperties: {
          CityRef: cityRef,
          ...(typeRef ? { TypeOfWarehouseRef: typeRef } : {}),
          Limit: 100,
          Page: 1,
        },
      });
      setWarehouses(data ?? []);
      setError(null);
    } catch (requestError) {
      setWarehouses([]);
      setError(requestError instanceof Error ? requestError.message : "Сервіс Нової Пошти тимчасово недоступний");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    warehouses,
    loading,
    error,
    search,
    load,
    clear: () => {
      clearTimeout(timer.current);
      setWarehouses([]);
      setError(null);
    },
  };
}

// NP TypeOfWarehouseRef
const NP_WAREHOUSE_TYPE  = "9a68df70-0267-42a8-bb5c-37f427e36ee4";
const NP_LOCKER_TYPE     = "841339c7-591a-42e2-8233-7a0a00f0ed6f";

function getWarehouseText(w: NPWarehouse) {
  return `${w.Description ?? ""} ${w.ShortAddress ?? ""} ${w.TypeOfWarehouseRef ?? ""}`.toLowerCase();
}

function isParcelLocker(w: NPWarehouse) {
  const text = getWarehouseText(w);
  return w.TypeOfWarehouseRef === NP_LOCKER_TYPE || /поштомат|postomat|parcel locker/.test(text);
}

function isWarehouseBranch(w: NPWarehouse) {
  const text = getWarehouseText(w);
  return w.TypeOfWarehouseRef === NP_WAREHOUSE_TYPE || (/відділення|отделение|warehouse/.test(text) && !isParcelLocker(w));
}

function filterWarehousesByDelivery(
  warehouses: NPWarehouse[],
  deliveryType: Extract<CheckoutInput["deliveryType"], "np_warehouse" | "np_parcel_locker">,
) {
  return warehouses.filter((w) => (deliveryType === "np_parcel_locker" ? isParcelLocker(w) : isWarehouseBranch(w)));
}

// ─── Маленький компонент кнопки оплаты (чтобы не вызывать useWatch в map) ──
function PaymentBtn({
  id, label, icon, control, setValue,
}: {
  id: CheckoutInput["paymentMethod"];
  label: string;
  icon: string;
  control: Control<CheckoutInput>;
  setValue: (name: "paymentMethod", v: CheckoutInput["paymentMethod"]) => void;
}) {
  const current = useWatch({ control, name: "paymentMethod" });
  return (
    <button
      type="button"
      onClick={() => setValue("paymentMethod", id)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-medium transition-all",
        current === id
          ? "border-pink-500 bg-pink-50 text-pink-600"
          : "border-ink/10 bg-white text-ink/60 hover:border-pink-300"
      )}
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </button>
  );
}

// ─── Кнопка типа доставки ──────────────────────────────────────────
function DeliveryBtn({
  id, label, icon, control, setValue,
}: {
  id: CheckoutInput["deliveryType"];
  label: string;
  icon: string;
  control: Control<CheckoutInput>;
  setValue: (id: CheckoutInput["deliveryType"]) => void;
}) {
  const current = useWatch({ control, name: "deliveryType" });
  return (
    <button
      type="button"
      onClick={() => setValue(id)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-medium transition-all",
        current === id
          ? "border-pink-500 bg-pink-50 text-pink-600"
          : "border-ink/10 bg-white text-ink/60 hover:border-pink-300"
      )}
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </button>
  );
}

const inp =
  "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400 disabled:opacity-60";

const NUM_STYLES = "flex h-7 w-7 items-center justify-center rounded-full bg-pink-500 text-xs font-bold text-white";

function submitLiqPayForm(payment: { action: string; data: string; signature: string }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payment.action;
  form.acceptCharset = "utf-8";

  for (const [name, value] of Object.entries({ data: payment.data, signature: payment.signature })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export function CheckoutForm() {
  const { items, total, clear } = useCartStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const citySearch = useCitySearch();
  const wh = useWarehouses();

  const [cityText, setCityText] = useState("");
  const [cityPicked, setCityPicked] = useState(false);
  const [warehouseText, setWarehouseText] = useState("");
  const [warehousePicked, setWarehousePicked] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      deliveryType:  "np_warehouse",
      paymentMethod: "card_online",
    },
  });

  const deliveryType = useWatch({ control, name: "deliveryType" });
  const npCityRef    = useWatch({ control, name: "npCityRef" }) ?? "";
  const warehouseDeliveryType = deliveryType === "np_parcel_locker" ? "np_parcel_locker" : "np_warehouse";

  function pickCity(c: NPCity) {
    setValue("npCityRef",  c.Ref,         { shouldValidate: true });
    setValue("npCityName", c.Description, { shouldValidate: true });
    setValue("npWarehouseRef", "");
    setValue("npWarehouseAddress", "");
    setCityText(c.Description);
    setCityPicked(true);
    setWarehouseText("");
    setWarehousePicked(false);
    citySearch.clear();
    wh.clear();
    // Загружаем отделения в зависимости от выбранного типа
  }

  // При смене типа доставки — перезагружаем отделения если город уже выбран
  function changeDelivery(id: CheckoutInput["deliveryType"]) {
    setValue("deliveryType", id);
    setValue("npWarehouseRef", "");
    setValue("npWarehouseAddress", "");
    setWarehouseText("");
    setWarehousePicked(false);
    wh.clear();
  }

  function pickWarehouse(w: NPWarehouse) {
    const label = `${w.Number ? `№${w.Number} — ` : ""}${w.Description}`;
    setValue("npWarehouseRef", w.Ref, { shouldValidate: true });
    setValue("npWarehouseAddress", label, { shouldValidate: true });
    setWarehouseText(label);
    setWarehousePicked(true);
    wh.clear();
  }

  const onSubmit = async (data: CheckoutInput) => {
    setSubmitting(true);
    const result = await createOrder(data, items);
    setSubmitting(false);
    if (result.success) {
      clear();
      if (result.payment) {
        toast.success("Замовлення створено. Переходимо до оплати...");
        submitLiqPayForm(result.payment);
        return;
      }

      toast.success(result.emailSent ? "Замовлення оформлено, лист відправлено! 🎉" : "Замовлення оформлено! 🎉");
      router.push(`/checkout/success?order=${result.orderNumber}&email=${result.emailSent ? "sent" : "pending"}`);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* 1. Контактні дані */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>1</span> Контактні дані
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Ім&apos;я</label>
            <input placeholder="Олександр" className={inp} {...register("customerName")} />
            {errors.customerName && <p className="mt-1 text-xs text-pink-600">{errors.customerName.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Прізвище</label>
            <input placeholder="Іванченко" className={inp} {...register("customerSurname")} />
            {errors.customerSurname && <p className="mt-1 text-xs text-pink-600">{errors.customerSurname.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Телефон</label>
            <input placeholder="+380 XX XXX XX XX" className={inp} {...register("customerPhone")} />
            {errors.customerPhone && <p className="mt-1 text-xs text-pink-600">{errors.customerPhone.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Email</label>
            <input type="email" placeholder="you@example.com" className={inp} {...register("customerEmail")} />
            {errors.customerEmail && <p className="mt-1 text-xs text-pink-600">{errors.customerEmail.message}</p>}
          </div>
        </div>
      </section>

      {/* 2. Доставка */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>2</span> Доставка
        </h2>

        {/* Тип */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          <DeliveryBtn id="np_warehouse"     label="Відділення" icon="🏢" control={control} setValue={changeDelivery} />
          <DeliveryBtn id="np_parcel_locker" label="Поштомат"   icon="📦" control={control} setValue={changeDelivery} />
          <DeliveryBtn id="np_courier"       label="Кур'єр НП"  icon="🚚" control={control} setValue={changeDelivery} />
        </div>

        {/* Поиск города */}
        <div className="relative mb-4">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-ink/60">
            <MapPin size={12} /> Місто
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              value={cityText}
              onChange={(e) => {
                setCityText(e.target.value);
                setCityPicked(false);
                setValue("npCityRef", "");
                setValue("npCityName", e.target.value, { shouldValidate: true });
                setValue("npWarehouseRef", "");
                setValue("npWarehouseAddress", "");
                setWarehouseText("");
                setWarehousePicked(false);
                wh.clear();
                citySearch.search(e.target.value);
              }}
              placeholder="Почніть вводити місто..."
              className={cn(inp, "pl-9")}
              autoComplete="off"
            />
            {citySearch.loading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-pink-400" />
            )}
          </div>
          {errors.npCityName && <p className="mt-1 text-xs text-pink-600">{errors.npCityName.message}</p>}
          {citySearch.error && <p className="mt-1 text-xs text-pink-600">{citySearch.error}. Можна продовжити з ручним введенням.</p>}

          {citySearch.cities.length > 0 && !cityPicked && (
            <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-pink-100 bg-white shadow-lg">
              {citySearch.cities.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-pink-50"
                    onClick={() => pickCity(c)}
                  >
                    {c.Description}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Відділення / поштомат */}
        {(npCityRef || cityText.trim().length >= 2) && deliveryType !== "np_courier" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink/60">
              {deliveryType === "np_parcel_locker" ? "Поштомат" : "Відділення"}
            </label>
            {wh.loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/40">
                <Loader2 size={14} className="animate-spin text-pink-400" />
                Завантаження...
              </div>
            ) : wh.error || !npCityRef ? (
              <input
                className={inp}
                placeholder={deliveryType === "np_parcel_locker" ? "Введіть поштомат вручну" : "Введіть відділення вручну"}
                onChange={(e) => {
                  setValue("npWarehouseRef", e.target.value ? "manual" : "", { shouldValidate: true });
                  setValue("npWarehouseAddress", e.target.value, { shouldValidate: true });
                }}
              />
            ) : (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    value={warehouseText}
                    className={cn(inp, "pl-9")}
                    placeholder={
                      deliveryType === "np_parcel_locker"
                        ? "Почніть вводити адресу або номер поштомата..."
                        : "Почніть вводити адресу або номер відділення..."
                    }
                    autoComplete="off"
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setWarehouseText(nextValue);
                      setWarehousePicked(false);
                      setValue("npWarehouseRef", "");
                      setValue("npWarehouseAddress", nextValue, { shouldValidate: true });
                      wh.search(npCityRef, nextValue, warehouseDeliveryType);
                    }}
                  />
                  {wh.warehouses.length > 0 && !warehousePicked && (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-pink-100 bg-white shadow-lg">
                      {wh.warehouses.map((w) => (
                        <li key={w.Ref}>
                          <button
                            type="button"
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-pink-50"
                            onClick={() => pickWarehouse(w)}
                          >
                            {w.Number ? `№${w.Number} — ` : ""}{w.Description}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {warehouseText.trim().length > 0 && !wh.loading && !warehousePicked && wh.warehouses.length === 0 && !wh.error && (
                  <p className="mt-1 text-xs text-ink/40">Нічого не знайдено. Спробуйте іншу частину адреси або номер.</p>
                )}
              <select
                hidden
                className={inp}
                defaultValue=""
                onChange={(e) => {
                  const w = wh.warehouses.find((x) => x.Ref === e.target.value);
                  setValue("npWarehouseRef",     w?.Ref ?? "");
                  setValue("npWarehouseAddress", w?.Description ?? "");
                }}
              >
                <option value="" disabled>
                  {deliveryType === "np_parcel_locker" ? "Оберіть поштомат..." : "Оберіть відділення..."}
                </option>
                {wh.warehouses.map((w) => (
                  <option key={w.Ref} value={w.Ref}>
                    {w.Number ? `№${w.Number} — ` : ""}{w.Description}
                  </option>
                ))}
              </select>
              </>
            )}
            {wh.error && <p className="mt-1 text-xs text-pink-600">{wh.error}. Введіть дані вручну.</p>}
            {(errors.npWarehouseRef || errors.npWarehouseAddress) && (
              <p className="mt-1 text-xs text-pink-600">
                {errors.npWarehouseRef?.message || errors.npWarehouseAddress?.message}
              </p>
            )}
          </div>
        )}

        {deliveryType === "np_courier" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Адреса</label>
            <input
              placeholder="Вулиця, будинок, квартира"
              className={inp}
              {...register("npCourierAddress")}
            />
            {errors.npCourierAddress && <p className="mt-1 text-xs text-pink-600">{errors.npCourierAddress.message}</p>}
          </div>
        )}

        {/* Hidden fields */}
        <input type="hidden" {...register("npCityRef")} />
        <input type="hidden" {...register("npCityName")} />
        <input type="hidden" {...register("npWarehouseRef")} />
        <input type="hidden" {...register("npWarehouseAddress")} />
        <input type="hidden" {...register("deliveryType")} />

        <p className="mt-4 text-xs text-ink/40">
          📦 Вартість доставки розраховується за тарифами Нової Пошти
        </p>
      </section>

      {/* 3. Оплата */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>3</span> Оплата
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <PaymentBtn id="card_online"      label="Картка онлайн" icon="💳" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />
          <PaymentBtn id="cash_on_delivery" label="Накладений"    icon="💵" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />
          <PaymentBtn id="pay_on_pickup"    label="При отриманні" icon="🤝" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />
        </div>
        <input type="hidden" {...register("paymentMethod")} />
        <p className="mt-4 text-xs text-ink/40">
          💳 Інтеграція з LiqPay / WayForPay / Monobank — незабаром
        </p>
      </section>

      {/* 4. Коментар */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-4 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>4</span> Коментар
        </h2>
        <textarea
          placeholder="Побажання щодо доставки або пакування (необов'язково)"
          rows={3}
          className={inp}
          {...register("comment")}
        />
      </section>

      <Button type="submit" size="lg" className="w-full text-base" disabled={submitting}>
        {submitting ? (
          <><Loader2 size={18} className="animate-spin" /> Оформлюємо...</>
        ) : (
          <>🎉 Оформити замовлення — {formatPrice(total())}</>
        )}
      </Button>
    </form>
  );
}
