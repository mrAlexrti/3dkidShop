// Invoked only inside the owned-cluster rehearsal. Actual application actions and
// SQL helpers; authentication/Blob/Mono delivery/cache effects are explicit fakes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { verifyFilamentFlow } from "./verify-batch181-filament-flow";
import { sourceModule } from "./source-module";
import * as configuration from "../src/lib/product-configuration";
import * as admin from "../src/lib/product-configuration-admin";
import * as guards from "../src/lib/variant-transaction";
import * as sizeAdmin from "../src/lib/product-size-admin";
import * as variants from "../src/lib/product-variants";
import * as cart from "../src/lib/cart-items";
import * as validation from "../src/lib/admin-form-validation";
import * as media from "../src/lib/product-media";
import * as gallery from "../src/lib/product-gallery-admin";
import * as galleryDomain from "../src/lib/gallery";
import * as slug from "../src/lib/product-slug";
import * as checkout from "../src/lib/validations/checkout";
import * as money from "../src/lib/payments/money";
import * as numbers from "../src/lib/order-number";
import * as orderStatus from "../src/lib/order-status";
import * as flags from "../src/lib/payments/initialization-state";
import { publicProductInclude } from "../src/lib/product-query";
import { translations } from "../src/lib/i18n";
import type { CartItem } from "../src/types";
import { z } from "zod";

export async function verifyApplication(db: PrismaClient, verifyFilaments = false) {
  assert.equal(new URL(process.env.BATCH18_QA_DATABASE_URL!).hostname,"127.0.0.1");
  let passed=0;
  const pass=(text:string)=>console.log(`PASS APP-PG ${++passed}: ${text}`);
  const noEffect=()=>{throw new Error("EXTERNAL_EFFECT_FORBIDDEN");};
  const originalFetch=globalThis.fetch; globalThis.fetch=async()=>noEffect();
  const actionDb={product:db.product,order:db.order,$transaction:async(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options?:{timeout?:number;isolationLevel?:Prisma.TransactionIsolationLevel})=>{
    try{return await db.$transaction(callback,options);}catch(error){console.log("Synthetic action transaction diagnostic:",String(error));throw error;}
  }};
  const common:Record<string,unknown>={zod:{z},"@/lib/variant-rollout":{nativeVariantWritesEnabled:()=>true},"@/lib/payments/money":money,"@/lib/prisma":{prisma:actionDb},"@/lib/product-configuration":configuration,"@/lib/product-configuration-admin":admin,
    "@/lib/variant-transaction":guards,"@/lib/product-size-admin":sizeAdmin,"@/lib/product-variants":variants,"@/lib/cart-items":cart,
    "@/lib/admin-form-validation":validation,"@/lib/product-media":media,"@/lib/product-gallery-admin":gallery,"@/lib/gallery":galleryDomain,"@/lib/product-slug":slug,
    "next/cache":{revalidatePath:()=>{}},"@/lib/actions/require-admin":{requireAdmin:async()=>{}},
    "@/lib/media-cleanup-after":{scheduleProductMediaCleanup:()=>{}},
    "@/lib/media-lifecycle-policy":{RetiredMediaError:class extends Error{}},
    "@/lib/media-lifecycle":{lockMediaWrites:async(tx:Prisma.TransactionClient)=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(175501,1)`;},assertMediaAttachable:async()=>{},enqueueSupersededMedia:async()=>{},MEDIA_TRANSACTION_OPTIONS:{isolationLevel:"ReadCommitted",timeout:15000}},
  };
  const actions=sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts",common);
  const config:admin.ConfigurationInput={mode:"COLOR_SIZE",values:[
    {key:"red",kind:"COLOR",labelUa:"Червоний",labelEn:"Red",noteUa:"",noteEn:"",retired:false},
    {key:"white",kind:"COLOR",labelUa:"Білий",labelEn:"White",noteUa:"",noteEn:"",retired:false},
    {key:"small",kind:"SIZE",labelUa:"Малий",labelEn:"Small",noteUa:"",noteEn:"",retired:false},
    {key:"large",kind:"SIZE",labelUa:"Великий",labelEn:"Large",noteUa:"",noteEn:"",retired:false},
  ],combinations:[{color:"red",size:"small",price:"199.00",isAvailable:true,retired:false},{color:"white",size:"small",price:"249.00",isAvailable:false,retired:false},{color:"white",size:"large",price:"299.00",isAvailable:true,retired:false}]};
  function form(data:admin.ConfigurationInput, revision=0) {
    const f=new FormData();
    for(const [key,value] of Object.entries({name:"Local native fixture",nameEn:"Local native fixture",slug:"local-native-fixture",description:"Synthetic description",descriptionEn:"Synthetic description",price:"1.00",oldPrice:"",categoryId:"qa_category",isOrderable:"on",isActive:"on",hoverGifUrl:"",configuration:JSON.stringify(data),variantRevision:String(revision),images:JSON.stringify([{url:"https://res.cloudinary.com/fixture/image/upload/photo.webp",alt:"Fixture"}])}))f.set(key,value);
    return f;
  }
  const include={options:{include:{values:true}},variants:{include:{selections:true}},images:true} as const;
  try {
    const disabled=sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts",{...common,"@/lib/variant-rollout":{nativeVariantWritesEnabled:()=>false}});
    assert.equal((await disabled.createProduct(form(config)))?.fieldErrors?.configuration,"nativeDisabled");
    const invalidPrice=form(config);invalidPrice.set("price","1.005");assert.equal((await actions.createProduct(invalidPrice))?.fieldErrors?.price,"invalid");
    assert.equal(await actions.createProduct(form(config)),undefined);
    let saved=await db.product.findUniqueOrThrow({where:{slug:"local-native-fixture"},include});
    assert.equal(saved.optionMode,"COLOR_SIZE");assert.equal(saved.variants.length,3);
    const dto=configuration.productConfiguration(saved); const row=dto.combinations.find((v)=>v.price==="199") ?? dto.combinations.find((v)=>v.price==="199.00")!;
    const line:CartItem={id:`${saved.id}:variant:${row.id}`,productId:saved.id,name:"Forged",slug:saved.slug,image:"/images/placeholder.svg",price:199,quantity:2,selection:{version:2,variantId:row.id,values:{COLOR:row.values.COLOR!,SIZE:row.values.SIZE}}};
    assert.equal(configuration.productOffer(saved).price,199);assert.equal(configuration.productOffer(saved).oldPrice,null);
    pass("actual createProduct writes three explicit combinations, absolute price and IDs; missing fourth pair is not generated");
    const lookup=sourceModule<typeof import("../src/lib/actions/reconcile-cart")>("src/lib/actions/reconcile-cart.ts",{...common,zod:await import("zod"),"@/lib/cart-limits":await import("../src/lib/cart-limits")});
    const reconciled=await lookup.lookupCartProducts({version:2,lines:[{productId:saved.id,selection:line.selection}]});
    assert.equal(reconciled[0].configuration!.combinations.length,1);assert.equal(reconciled[0].optionMode,"COLOR_SIZE");
    assert.equal((await lookup.lookupCartProducts([saved.id]))[0].isOrderable,false);
    pass("actual bounded reconciliation returns selected native combination; legacy lookup fails closed for colors");
    const toInput=():admin.ConfigurationInput=>({mode:saved.optionMode as admin.ConfigurationInput["mode"],values:configuration.productConfiguration(saved).values.map((v)=>({key:v.id,id:v.id,kind:v.kind,labelUa:v.labelUa,labelEn:v.labelEn??"",noteUa:v.noteUa??"",noteEn:v.noteEn??"",retired:v.retired})),combinations:configuration.productConfiguration(saved).combinations.map((v)=>({id:v.id,color:v.values.COLOR,size:v.values.SIZE,price:v.price,isAvailable:v.isAvailable,retired:v.retired}))});
    const edited=toInput();edited.values[0].labelUa="Нова назва";edited.combinations[0].price="209.00";
    const imageIds=saved.images.map((v)=>v.id);const variantIds=saved.variants.map((v)=>v.id).sort();
    const update=form(edited,saved.variantRevision);update.set("images",JSON.stringify(saved.images.map(({id,url,alt})=>({id,url,alt}))));
    assert.equal(await actions.updateProduct(saved.id,update),undefined);
    const stale=await actions.updateProduct(saved.id,update);assert.equal(stale?.fieldErrors?.configuration,"stale");
    saved=await db.product.findUniqueOrThrow({where:{id:saved.id},include});
    assert.deepEqual(saved.images.map((v)=>v.id),imageIds);assert.deepEqual(saved.variants.map((v)=>v.id).sort(),variantIds);
    const broken=sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts",{...common,"@/lib/product-configuration-admin":{...admin,syncProductConfiguration:async(tx:Prisma.TransactionClient,pid:string,input:admin.ConfigurationInput)=>{
      await admin.syncProductConfiguration(tx,pid,input);await tx.$executeRaw`INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"updatedAt") VALUES ('injected_deferred_bad',${pid},'FORGED',199,now())`;
    }}});
    const badForm=form(toInput(),saved.variantRevision);badForm.set("name","Should roll back");badForm.set("images",JSON.stringify(saved.images.map(({id,url,alt})=>({id,url,alt}))));
    const failure=await broken.updateProduct(saved.id,badForm);assert.equal(failure?.error,"saveFailed");
    assert.equal((await db.product.findUniqueOrThrow({where:{id:saved.id}})).name,saved.name);
    pass("actual update preserves gallery/variant IDs, rejects stale revision, and catches deferred error before success/cache effects");

    let invoiceCount=0,notifications=0;
    const identity=sourceModule<typeof import("../src/lib/payments/checkout-identity")>("src/lib/payments/checkout-identity.ts",{"node:crypto":crypto,"@/lib/cart-items":cart,"@/lib/server-env":{getAuthSecret:()=>"synthetic-local-only"}});
    const checkoutAction=sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts",{...common,"node:crypto":crypto,"@prisma/client":{Prisma},"@/lib/i18n":{translations},"@/lib/validations/checkout":checkout,"@/lib/payments/checkout-identity":identity,
      "@/lib/payments/online-payment":{getOnlinePaymentConfig:()=>({provider:"mono",mode:"live"})},"@/lib/payments/order-result":{getOrderResultPath:(id:string)=>`/fixture/${id}`,getAttemptResultPath:(id:string)=>`/fixture/${id}`},
      "@/lib/payments/retry":{verifiedPaymentRetry:noEffect},"@/lib/notifications/orders":{notifyOrderCreated:async()=>{notifications++;return false;}},"@/lib/order-status":orderStatus,"@/lib/payments/money":money,"@/lib/order-number":numbers,"@/lib/payments/initialization-state":flags,
      "@/lib/payments/mono":{MONO_VALIDITY_SECONDS:3600,MonoError:class extends Error{},logMonoInitializationError:()=>{},createMonoInvoice:async()=>({invoiceId:`synthetic_invoice_${++invoiceCount}`,pageUrl:"https://pay.mbnk.biz/synthetic-fixture"})},
      "@/lib/payments/transitions":{acceptPaymentInvoice:async(ref:string,id:string,expiry:Date,pageUrl:string)=>({order:await db.order.update({where:{paymentReference:ref},data:{paymentInvoiceId:id,paymentExpiresAt:expiry,paymentPageUrl:pageUrl}})})},
      "@/lib/payments/initialization":{recoverUnacceptedInvoice:noEffect},
    });
    const data={customerName:"Synthetic",customerSurname:"Fixture",customerEmail:"qa@example.invalid",customerPhone:"+380000000000",deliveryType:"np_warehouse",npCityName:"Local city",npWarehouseRef:"fixture",npWarehouseAddress:"Local fixture",paymentMethod:"card_online"};
    // Reload current price; fake client amount must never win.
    const currentRow=configuration.productConfiguration(saved).combinations.find((v)=>v.id===row.id)!;line.price=Number(currentRow.price);
    const wrong=await checkoutAction.createOrder(data,[{...line,price:0.01}],"en",randomUUID(),undefined,true);assert.equal(wrong.success,false);assert.equal(invoiceCount,0);
    const key=randomUUID();const first=await checkoutAction.createOrder(data,[line],"en",key,undefined,true);assert.equal(first.success,true);assert.equal(invoiceCount,1);assert.equal(notifications,0);
    const stored=await db.order.findFirstOrThrow({where:{checkoutKeyHash:identity.checkoutIdentity(key,data as object,[line]).checkoutKeyHash},include:{items:true}});
    assert.equal(stored.items[0].productVariantId,row.id);assert.equal(JSON.parse(stored.items[0].optionsJson!).version,2);
    const originalSnapshot=stored.items[0].optionsJson;
    await db.$transaction(async(tx)=>{await guards.lockProductConfiguration(tx,saved.id);await tx.productVariant.update({where:{id:row.id},data:{retiredAt:new Date()}});await guards.flushVariantConstraints(tx);});
    const again=await checkoutAction.createOrder(data,[line],"en",key,undefined,true);assert.equal(again.success,true);assert.equal(invoiceCount,1);
    const other={...line,selection:{...line.selection!,values:{COLOR:configuration.productConfiguration(saved).values.find((v)=>v.labelEn==="White")!.id,SIZE:row.values.SIZE}}};
    const collision=await checkoutAction.createOrder(data,[other],"en",key,undefined,true);assert.equal(collision.success,false);assert.equal(invoiceCount,1);
    assert.equal((await db.orderItem.findUniqueOrThrow({where:{id:stored.items[0].id}})).optionsJson,originalSnapshot);
    pass("actual createOrder snapshots native FK/price, rejects stale quote, replays Mono attempt after retirement without second invoice, rejects changed-color retry; delivery is mocked");

    const restore=toInput();restore.combinations.find((v)=>v.id===row.id)!.retired=false;
    await db.$transaction(async(tx)=>{await guards.lockProductConfiguration(tx,saved.id);await admin.syncProductConfiguration(tx,saved.id,restore);await guards.flushVariantConstraints(tx);});
    assert.equal((await db.productVariant.findUniqueOrThrow({where:{id:row.id}})).retiredAt,null);
    const duplicate={...restore,combinations:[...restore.combinations,restore.combinations[0]]};assert.equal(admin.configurationInputSchema.safeParse(duplicate).success,false);
    const listing=sourceModule<typeof import("../src/lib/catalog-products")>("src/lib/catalog-products.ts",{"@prisma/client":{Prisma},"./prisma":{prisma:db},"./product-query":{publicProductInclude}});
    const where={id:{in:[saved.id,"legacy_simple"]},isActive:true};
    // Isolate price-sort fixtures with a dedicated category so SQL WHERE and count match.
    const category=await db.category.create({data:{name:"Sort",nameEn:"Sort",slug:"native-sort-fixture"}});
    await db.product.updateMany({where:{id:{in:[saved.id,"legacy_simple"]}},data:{categoryId:category.id}});
    const ascending=await listing.catalogProducts({where:{...where,categoryId:category.id},categoryIds:[category.id],orderBy:{price:"asc"},sort:"price_asc",page:1,pageSize:1});
    const next=await listing.catalogProducts({where:{...where,categoryId:category.id},categoryIds:[category.id],orderBy:{price:"asc"},sort:"price_asc",page:2,pageSize:1});
    assert.equal(ascending.products[0].id,"legacy_simple");assert.equal(next.products[0].id,saved.id);assert.equal(ascending.total,2);
    pass("actual catalog SQL uses effective minimum price before pagination/count and restore keeps original variant ID");

    await db.$executeRawUnsafe('CREATE ROLE batch18_app_fixture NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO batch18_app_fixture');
    await db.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO batch18_app_fixture');
    await db.$executeRawUnsafe('REVOKE DELETE ON public."Order",public."OrderItem",public."OrderNotification" FROM batch18_app_fixture');
    await db.$executeRawUnsafe('REVOKE UPDATE ON public."OrderItem" FROM batch18_app_fixture');
    await db.$executeRawUnsafe('CREATE SCHEMA shadow');await db.$executeRawUnsafe('CREATE TABLE shadow."Product" (id text)');
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA shadow TO batch18_app_fixture');
    await db.$transaction(async(tx)=>{
      await tx.$executeRawUnsafe('SET LOCAL ROLE batch18_app_fixture');await tx.$executeRawUnsafe('SET LOCAL search_path=shadow,public');
      await guards.lockProductConfiguration(tx,saved.id);
      await tx.productVariant.update({where:{id:row.id},data:{price:"219.00"}});
      await guards.flushVariantConstraints(tx);
    });
    await assert.rejects(()=>db.$transaction(async(tx)=>{await tx.$executeRawUnsafe('SET LOCAL ROLE batch18_app_fixture');await tx.$executeRawUnsafe('CREATE TABLE public.forbidden_fixture(id int)');}),/permission denied/);
    await assert.rejects(()=>db.$transaction(async(tx)=>{await tx.$executeRawUnsafe('SET LOCAL ROLE batch18_app_fixture');await tx.$executeRawUnsafe('DELETE FROM public."OrderItem"');}),/permission denied/);
    assert.equal(Number((await db.productVariant.findUniqueOrThrow({where:{id:row.id}})).price),219);
    pass("qualified guards withstand shadow search_path under a nonowner app role; schema creation and order-history deletion denied");
    const cod=await checkoutAction.createOrder({...data,paymentMethod:"cash_on_delivery"},[{...line,price:0.01}],"en");
    assert.equal(cod.success,true);assert.equal(invoiceCount,1);assert.equal(notifications,1);
    pass("actual COD accepts native selection at authoritative DB price without changing Mono invoice count; notification delivery mocked");
    if (verifyFilaments) await verifyFilamentFlow({ db, line: { ...line, price: 219 }, lookup: lookup.lookupCartProducts, createOrder: checkoutAction.createOrder, data, listing: listing.catalogProducts });
    const legacySeed=await db.product.create({data:{name:"Legacy compatibility",nameEn:"Legacy compatibility",slug:"legacy-application-fixture",description:"Legacy fixture",descriptionEn:"Legacy fixture",price:1,categoryId:"qa_category",isActive:true,isOrderable:true,
      images:{create:{url:"https://res.cloudinary.com/fixture/legacy.webp"}},options:{create:{name:"Size",values:{create:{value:"Малий",valueEn:"Small",price:"199.00",priceModifier:"987.65"}}}}}});
    const legacyProduct=await db.product.findUniqueOrThrow({where:{id:legacySeed.id},include});const legacyValue=legacyProduct.options[0].values[0];
    const conversion:admin.ConfigurationInput={mode:"SIZE",values:[{key:legacyValue.id,id:legacyValue.id,kind:"SIZE",labelUa:legacyValue.value,labelEn:legacyValue.valueEn??"",noteUa:"",noteEn:"",retired:false}],combinations:[{size:legacyValue.id,price:"199.00",isAvailable:true,retired:false}]};
    const convertedForm=form(conversion,legacyProduct.variantRevision);convertedForm.set("slug",legacyProduct.slug);convertedForm.set("images",JSON.stringify(legacyProduct.images.map(({id,url,alt})=>({id,url,alt}))));
    assert.equal(await actions.updateProduct(legacyProduct.id,convertedForm),undefined);
    const converted=await db.product.findUniqueOrThrow({where:{id:legacyProduct.id},include});assert.equal(converted.options[0].values[0].id,legacyValue.id);assert.equal(converted.options[0].id,legacyProduct.options[0].id);assert.equal(Number(converted.options[0].values[0].priceModifier),987.65);
    const sizeLine:CartItem={id:`${converted.id}-${legacyValue.id}`,productId:converted.id,name:"Untrusted",slug:converted.slug,image:"/images/placeholder.svg",price:0.01,quantity:1,variant:{id:legacyValue.id,labelUa:"Untrusted",labelEn:null}};
    const sizeOrder=await checkoutAction.createOrder({...data,paymentMethod:"cash_on_delivery"},[sizeLine],"en");assert.equal(sizeOrder.success,true);
    const sizeLookup=await lookup.lookupCartProducts([converted.id]);assert.equal(sizeLookup[0].variants[0].id,legacyValue.id);assert.equal(sizeLookup[0].variants[0].price,199);
    pass("actual explicit LEGACY->SIZE Save preserves group/value IDs and ignores modifier; old size wire remains orderable and old lookup receives native full price");
    assert.equal((await actions.deleteProduct(saved.id))?.error,"orderHistory");
    assert.equal(await actions.archiveProduct(saved.id),undefined);
    assert.equal((await db.orderItem.findUniqueOrThrow({where:{id:stored.items[0].id}})).optionsJson,originalSnapshot);
    const deletable=form({mode:"COLOR",values:[config.values[0]],combinations:[{color:"red",price:"100.00",isAvailable:true,retired:false}]});deletable.set("slug","deletable-native-fixture");
    assert.equal(await actions.createProduct(deletable),undefined);const toDelete=await db.product.findUniqueOrThrow({where:{slug:"deletable-native-fixture"}});
    assert.equal(await actions.deleteProduct(toDelete.id),undefined);assert.equal(await db.productVariant.count({where:{productId:toDelete.id}}),0);
    pass("actual deleteProduct cascades complete native configuration without orders; actual archive preserves protected orders and snapshots");
    console.log(`PASS Batch 1.8 application PostgreSQL integration: ${passed} groups; only owned synthetic DB and mocked provider effects.`);
  } finally {globalThis.fetch=originalFetch;}
}
