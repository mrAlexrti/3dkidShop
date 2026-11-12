"use client";

import { useForm, useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getCheckoutSchema, type CheckoutInput } from "@/lib/validations/checkout";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { createOrder } from "@/lib/actions/create-order";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { formatPrice } from "@/lib/utils";
import { MapPin, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

import { useLangStore } from "@/store/lang-store";
import { useCitySearch, useWarehouses } from "./use-np-lookups";
import type { NPCity, NPWarehouse } from "@/lib/np-warehouse-types";

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
      aria-pressed={current === id}
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
      aria-pressed={current === id}
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

export function CheckoutForm({ onlineCardEnabled }: { onlineCardEnabled: boolean }) {
  const { t, locale } = useLangStore();
  const c = t.checkout;
  const schema = useMemo(() => getCheckoutSchema(locale), [locale]);
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
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryType:  "np_warehouse",
      paymentMethod: onlineCardEnabled ? "card_online" : "cash_on_delivery",
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

  }

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
    try {
      const result = await createOrder(data, items, locale);
      if (result.success) {
        if (result.payment) {
          toast.message(c.feedback.redirect);
          submitLiqPayForm(result.payment);
          clear();
          return;
        }
        clear();
        toast.success(result.emailSent ? c.feedback.emailed : c.feedback.created);
        router.push(result.resultUrl);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(c.feedback.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const errorText = (field: keyof CheckoutInput) => {
    const fields: Partial<Record<keyof CheckoutInput, keyof typeof c.validation>> = { customerName: "name", customerSurname: "surname", customerEmail: "email", customerPhone: "phone", npCityName: "city", npCourierAddress: "address" };
    const key = fields[field];
    return key ? c.validation[key] : deliveryType === "np_parcel_locker" ? c.validation.locker : c.validation.branch;
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="sf-checkout-form space-y-6">

      {/* 1. Контактні дані */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>1</span> {c.contact.title}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="customerName" className="mb-1 block text-xs font-medium text-ink/60">{c.contact.name}</label>
            <input placeholder={c.contact.name} className={inp} id="customerName" autoComplete="given-name" aria-invalid={!!errors.customerName} aria-describedby={errors.customerName ? "customerName-error" : undefined} {...register("customerName")} />
            {errors.customerName && <p id="customerName-error" role="alert" className="mt-1 text-xs text-pink-600">{errorText("customerName")}</p>}
          </div>
          <div>
            <label htmlFor="customerSurname" className="mb-1 block text-xs font-medium text-ink/60">{c.contact.surname}</label>
            <input placeholder={c.contact.surname} className={inp} id="customerSurname" autoComplete="family-name" aria-invalid={!!errors.customerSurname} aria-describedby={errors.customerSurname ? "customerSurname-error" : undefined} {...register("customerSurname")} />
            {errors.customerSurname && <p id="customerSurname-error" role="alert" className="mt-1 text-xs text-pink-600">{errorText("customerSurname")}</p>}
          </div>
          <div>
            <label htmlFor="customerPhone" className="mb-1 block text-xs font-medium text-ink/60">{c.contact.phone}</label>
            <input type="tel" placeholder="+380 XX XXX XX XX" className={inp} id="customerPhone" autoComplete="tel" aria-invalid={!!errors.customerPhone} aria-describedby={errors.customerPhone ? "customerPhone-error" : undefined} {...register("customerPhone")} />
            {errors.customerPhone && <p id="customerPhone-error" role="alert" className="mt-1 text-xs text-pink-600">{errorText("customerPhone")}</p>}
          </div>
          <div>
            <label htmlFor="customerEmail" className="mb-1 block text-xs font-medium text-ink/60">{c.contact.email}</label>
            <input type="email" placeholder="you@example.com" className={inp} id="customerEmail" autoComplete="email" aria-invalid={!!errors.customerEmail} aria-describedby={errors.customerEmail ? "customerEmail-error" : undefined} {...register("customerEmail")} />
            {errors.customerEmail && <p id="customerEmail-error" role="alert" className="mt-1 text-xs text-pink-600">{errorText("customerEmail")}</p>}
          </div>
        </div>
      </section>

      {/* 2. Доставка */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>2</span> {c.delivery.title}
        </h2>

        {/* Тип */}
        <div className="sf-delivery-options mb-5 grid grid-cols-3 gap-2">
          <DeliveryBtn id="np_warehouse"     label={c.delivery.warehouse} icon="🏢" control={control} setValue={changeDelivery} />
          <DeliveryBtn id="np_parcel_locker" label={c.delivery.locker}   icon="📦" control={control} setValue={changeDelivery} />
          <DeliveryBtn id="np_courier"       label={c.delivery.courier}  icon="🚚" control={control} setValue={changeDelivery} />
        </div>

        {/* Поиск города */}
        <div className="relative mb-4">
          <label htmlFor="np-city" className="mb-1 flex items-center gap-1 text-xs font-medium text-ink/60">
            <MapPin size={12} /> {c.delivery.city}
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
              id="np-city" placeholder={c.delivery.cityHint}
              className={cn(inp, "pl-9")}
              autoComplete="off"
            />
            {citySearch.loading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-pink-400" />
            )}
          </div>
          {errors.npCityName && <p className="mt-1 text-xs text-pink-600">{errorText("npCityName")}</p>}
          {citySearch.error && <p className="mt-1 text-xs text-pink-600">{c.lookup.unavailable}</p>}

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
            <label htmlFor="np-warehouse" className="mb-1 block text-xs font-medium text-ink/60">
              {deliveryType === "np_parcel_locker" ? c.delivery.locker : c.delivery.warehouse}
            </label>
            {wh.loading && <p role="status" className="mb-1 flex items-center gap-2 text-xs text-ink/60"><Loader2 size={14} className="animate-spin" />{c.delivery.loading}</p>}
            {wh.error || !npCityRef ? (
              <input
                className={inp}
                id="np-warehouse" placeholder={deliveryType === "np_parcel_locker" ? c.lookup.manualLocker : c.lookup.manualBranch}
                value={warehouseText}
                onChange={(e) => {
                  setWarehouseText(e.target.value);
                  setValue("npWarehouseRef", e.target.value ? "manual" : "", { shouldValidate: true });
                  setValue("npWarehouseAddress", e.target.value, { shouldValidate: true });
                }}
              />
            ) : (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    id="np-warehouse" value={warehouseText}
                    className={cn(inp, "pl-9")}
                    placeholder={
                      deliveryType === "np_parcel_locker"
                        ? c.lookup.lockerSearch
                        : c.lookup.branchSearch
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
                  <p className="mt-1 text-xs text-ink/40">{c.lookup.empty}</p>
                )}
              </>
            )}
            {wh.error && <p className="mt-1 text-xs text-pink-600">{c.lookup.unavailable}</p>}
            {(errors.npWarehouseRef || errors.npWarehouseAddress) && (
              <p className="mt-1 text-xs text-pink-600">
                {errorText("npWarehouseRef")}
              </p>
            )}
          </div>
        )}

        {deliveryType === "np_courier" && (
          <div>
            <label htmlFor="np-courier" className="mb-1 block text-xs font-medium text-ink/60">{c.delivery.address}</label>
            <input
              id="np-courier" placeholder={c.delivery.addressHint}
              className={inp}
              {...register("npCourierAddress")}
            />
            {errors.npCourierAddress && <p className="mt-1 text-xs text-pink-600">{errorText("npCourierAddress")}</p>}
          </div>
        )}

        {/* Hidden fields */}
        <input type="hidden" {...register("npCityRef")} />
        <input type="hidden" {...register("npCityName")} />
        <input type="hidden" {...register("npWarehouseRef")} />
        <input type="hidden" {...register("npWarehouseAddress")} />
        <input type="hidden" {...register("deliveryType")} />

        <p className="mt-4 text-xs text-ink/40">
          {c.delivery.npNote}
        </p>
      </section>

      {/* 3. Оплата */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-5 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>3</span> {c.payment.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {onlineCardEnabled && <PaymentBtn id="card_online"      label={c.payment.card} icon="💳" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />}
          <PaymentBtn id="cash_on_delivery" label={c.payment.cash}    icon="💵" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />
          <PaymentBtn id="pay_on_pickup"    label={c.payment.onPickup} icon="🤝" control={control} setValue={(_, v) => setValue("paymentMethod", v)} />
        </div>
        <input type="hidden" {...register("paymentMethod")} />
        <p className="mt-4 text-xs text-ink/40">
          {onlineCardEnabled ? c.payment.note : c.payment.unavailable}
        </p>
      </section>

      {/* 4. Коментар */}
      <section className="glass rounded-xl2 p-6 shadow-soft">
        <h2 className="mb-4 font-display text-xl flex items-center gap-2">
          <span className={NUM_STYLES}>4</span> {c.comment}
        </h2>
        <textarea
          aria-label={c.comment} placeholder={c.commentHint}
          rows={3}
          className={inp}
          {...register("comment")}
        />
      </section>

      <Button type="submit" size="lg" className="w-full text-base" disabled={submitting}>
        {submitting ? (
          <><Loader2 size={18} className="animate-spin" /> {c.submitting}</>
        ) : (
          <>{c.submit} — {formatPrice(total())}</>
        )}
      </Button>
    </form>
  );
}
