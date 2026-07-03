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

// ─── Нова Пошта API ───────────────────────────────────────────────
const NP_API = "https://api.novaposhta.ua/v2.0/json/";

async function npRequest(body: object) {
  const key = process.env.NEXT_PUBLIC_NP_API_KEY ?? "";
  try {
    const res = await fetch(NP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: key, ...body }),
    });
    const data = await res.json();
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}

type NPCity      = { Ref: string; Description: string };
type NPWarehouse = { Ref: string; Description: string; Number: string };

function useCitySearch() {
  const [cities, setCities]   = useState<NPCity[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback((q: string) => {
    clearTimeout(timer.current);
    if (q.length < 2) { setCities([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
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
      setLoading(false);
    }, 380);
  }, []);

  return { cities, loading, search, clear: () => setCities([]) };
}

function useWarehouses() {
  const [warehouses, setWarehouses] = useState<NPWarehouse[]>([]);
  const [loading, setLoading]       = useState(false);

  const load = useCallback(async (cityRef: string, typeRef?: string) => {
    if (!cityRef) return;
    setLoading(true);
    const data: NPWarehouse[] = await npRequest({
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: {
        CityRef: cityRef,
        ...(typeRef ? { TypeOfWarehouseRef: typeRef } : {}),
        Limit: 300,
        Page: 1,
      },
    });
    setWarehouses(data ?? []);
    setLoading(false);
  }, []);

  return { warehouses, loading, load, clear: () => setWarehouses([]) };
}

// NP TypeOfWarehouseRef
const NP_WAREHOUSE_TYPE  = "9a68df70-0267-42a8-bb5c-37f427e36ee4";
const NP_LOCKER_TYPE     = "841339c7-591a-42e2-8233-7a0a00f0ed6f";

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

export function CheckoutForm() {
  const { items, total, clear } = useCartStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const citySearch = useCitySearch();
  const wh = useWarehouses();

  const [cityText, setCityText] = useState("");
  const [cityPicked, setCityPicked] = useState(false);

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

  function pickCity(c: NPCity) {
    setValue("npCityRef",  c.Ref,         { shouldValidate: true });
    setValue("npCityName", c.Description, { shouldValidate: true });
    setCityText(c.Description);
    setCityPicked(true);
    citySearch.clear();
    wh.clear();
    // Загружаем отделения в зависимости от выбранного типа
    const typeRef = deliveryType === "np_parcel_locker" ? NP_LOCKER_TYPE : NP_WAREHOUSE_TYPE;
    wh.load(c.Ref, typeRef);
  }

  // При смене типа доставки — перезагружаем отделения если город уже выбран
  function changeDelivery(id: CheckoutInput["deliveryType"]) {
    setValue("deliveryType", id);
    setValue("npWarehouseRef", "");
    setValue("npWarehouseAddress", "");
    if (npCityRef) {
      const typeRef = id === "np_parcel_locker" ? NP_LOCKER_TYPE : NP_WAREHOUSE_TYPE;
      if (id !== "np_courier") wh.load(npCityRef, typeRef);
    }
  }

  const onSubmit = async (data: CheckoutInput) => {
    setSubmitting(true);
    const result = await createOrder(data, items);
    setSubmitting(false);
    if (result.success) {
      clear();
      toast.success("Замовлення оформлено! 🎉");
      router.push(`/checkout/success?order=${result.orderNumber}`);
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
            <label className="mb-1 block text-xs font-medium text-ink/60">Ім'я</label>
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
        {npCityRef && deliveryType !== "np_courier" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink/60">
              {deliveryType === "np_parcel_locker" ? "Поштомат" : "Відділення"}
            </label>
            {wh.loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/40">
                <Loader2 size={14} className="animate-spin text-pink-400" />
                Завантаження...
              </div>
            ) : (
              <select
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
