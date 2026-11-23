// Actual legacy source regressions + explicit REVIEW-ONLY future contract fixtures.
// No PrismaClient, .env, DB, providers or production dependencies are loaded.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { sourceModule } from "./source-module";
import * as cart from "../src/lib/cart-items";
import * as variants from "../src/lib/product-variants";
import * as money from "../src/lib/payments/money";
import * as ref from "./fixtures/batch18-variant-reference";
import type { CartItem } from "../src/types";

let passed=0;
const pass=(label:string)=>console.log(`PASS ARCH ${++passed}: ${label}`);
const secret="synthetic-architecture-fixture-secret-only";
const actual=sourceModule<typeof import("../src/lib/payments/checkout-identity")>("src/lib/payments/checkout-identity.ts",{
  "node:crypto":crypto,"@/lib/server-env":{getAuthSecret:()=>secret},"@/lib/cart-items":cart,
});
const key="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const data={customerName:"Synthetic QA",delivery:"Fixture"};
const simple:CartItem={id:"product",productId:"product",name:"QA",slug:"qa",price:1,image:"/images/placeholder.svg",quantity:2};
const size:CartItem={...simple,id:"product-small",variant:{id:"small",labelUa:"Маленький",labelEn:"Small"}};
const red:ref.Wire={...simple,id:"product:variant:red_small",selection:{version:2,variantId:"red_small",values:{COLOR:"red",SIZE:"small"}}};
const white:ref.Wire={...red,id:"product:variant:white_small",selection:{version:2,variantId:"white_small",values:{COLOR:"white",SIZE:"small"}}};
const hmac=(lines:unknown)=>crypto.createHmac("sha256",secret).update(JSON.stringify({data,lines})).digest("hex");
for(const [line,expected] of [[simple,[{productId:"product",size:null,quantity:2}]],[size,[{productId:"product",size:"small",quantity:2}]]] as const){
  assert.equal(actual.checkoutIdentity(key,data,[line]).checkoutPayloadHash,hmac(expected));
  assert.equal(hmac(ref.identityLines([line])),hmac(expected));
}
pass("actual simple/size server hash material and review adapter match the exact original JSON identity");
assert.notEqual(actual.checkoutIdentity(key,data,[red]).checkoutPayloadHash,actual.checkoutIdentity(key,data,[white]).checkoutPayloadHash);
assert.notEqual(hmac(ref.identityLines([red])),hmac(ref.identityLines([white])));
assert.notEqual(hmac(ref.identityLines([red])),hmac(ref.identityLines([{...red,quantity:3}])));
assert.deepEqual(ref.identityLines([simple,size]),ref.identityLines([size,simple]));
console.log("FIXED native reuse: current payment hash distinguishes color selections.");
pass("actual color identities and corrected tagged reference differ by color/quantity and canonicalize line order");
assert.equal(cart.normalizeCartItems([red,white]).length,2);
assert.equal(cart.normalizeCartItems([red,white])[0].id,"product:variant:red_small");
console.log("FIXED native reuse: current normalizer preserves both combination selections.");
const map=new Map<string,string>();
const storage={getItem:(name:string)=>map.get(name)??null,setItem:(name:string,value:string)=>{map.set(name,value);}};
map.set("stikr-cart",JSON.stringify({version:1,state:{items:[simple,size],checkoutRevision:7}}));
const migrated=ref.importLegacy(storage);
assert.deepEqual(migrated.state.items.map((line:CartItem)=>[line.id,line.quantity]),[["product",2],["product-small",2]]);
assert.equal(migrated.state.checkoutRevision,7);
const newRecord={...migrated,state:{...migrated.state,items:[red,white]}};
map.set("stikr-cart-v2",JSON.stringify(newRecord));
map.set("stikr-cart",JSON.stringify({version:1,state:{items:[simple]}}));
assert.deepEqual(ref.importLegacy(storage),newRecord);
map.set("stikr-cart-v2",JSON.stringify({...newRecord,state:{items:[]}}));
assert.equal(ref.importLegacy(storage).state.items.length,0,"An intentionally empty new cart must not import old purchases again");
const sourceBefore=map.get("stikr-cart"); map.delete("stikr-cart-v2");
assert.throws(()=>ref.importLegacy({...storage,setItem:()=>{throw new Error("STORAGE_FULL");}}),/STORAGE_FULL/);
assert.equal(map.get("stikr-cart"),sourceBefore); assert.equal(map.has("stikr-cart-v2"),false);
map.set("stikr-cart",JSON.stringify({version:0,state:{items:Array.from({length:101},(_,i)=>({...simple,id:`p_${i}`,productId:`p_${i}`}))}}));
const overLimit=map.get("stikr-cart");
assert.throws(()=>ref.importLegacy(storage),/LEGACY_CART_REQUIRES_REVIEW/);
assert.equal(map.get("stikr-cart"),overLimit);assert.equal(map.has("stikr-cart-v2"),false);
map.set("stikr-cart",JSON.stringify({version:0,state:{items:[size],checkoutRevision:"untrusted"}}));
assert.equal(ref.importLegacy(storage).state.checkoutRevision,0);
pass("review-only storage contract: one-time legacy import, same IDs/quantities/revision, old-tab isolation, empty-cart marker and storage failure preservation");
for(const invalid of [{...red.selection,version:3},{...red.selection,values:{COLOR:"red",MATERIAL:"pla"}},{...red.selection,values:{COLOR:"red;SIZE=small"}}]) assert.throws(()=>ref.selection(invalid),/INVALID_SELECTION/);
assert.throws(()=>ref.identityLines([{...red,variant:size.variant}]),/AMBIGUOUS_SELECTION/);
assert.throws(()=>ref.combinationKey("COLOR_SIZE",{color:"red"}),/DIMENSION_MISMATCH/);
assert.throws(()=>ref.combinationKey("COLOR",{color:"red",size:"small"}),/DIMENSION_MISMATCH/);
assert.equal(ref.combinationKey("COLOR_SIZE",{color:"red",size:"small"}),"COLOR=red;SIZE=small");
pass("review-only structural validation rejects unknown versions, extra/missing dimensions, delimiter injection and mixed legacy/new identities");
const rows:ref.Variant[]=[{id:"red_small",productId:"product",color:"red",size:"small",price:"199.00",available:true,retired:false},{id:"white_small",productId:"product",color:"white",size:"small",price:"249.00",available:false,retired:false}];
const product={id:"product",mode:"COLOR_SIZE" as const,price:"1.00",active:true,orderable:true,variants:rows};
assert.equal(ref.quote(product,red),19900); assert.equal(ref.minimumPrice(rows),19900);
for(const p of [{...product,variants:[]},{...product,active:false},{...product,orderable:false},{...product,variants:rows.map((v)=>({...v,retired:true}))}]) assert.throws(()=>ref.quote(p,red),/UNAVAILABLE/);
assert.throws(()=>ref.quote(product,white),/UNAVAILABLE/);
assert.equal(ref.minimumPrice(rows.map((v)=>({...v,available:false}))),null);
assert.equal(ref.quote({...product,mode:"SIMPLE",variants:[]},simple),100);
assert.equal(ref.quote({...product,mode:"SIZE",variants:[{...rows[0],color:undefined}]},size),19900);
const colorOnly:ref.Wire={...red,selection:{version:2,variantId:"red_small",values:{COLOR:"red"}}};
assert.equal(ref.quote({...product,mode:"COLOR",variants:[{...rows[0],size:undefined}]},colorOnly),19900);
for(const invalid of ["1.005","NaN","1e2","-1","100000000.00"]) assert.equal(money.moneyMinorUnits(invalid),null);
assert.equal(money.moneyMinorUnits("99999999.99"),9999999999);
pass("review-only four-mode prices, no native base fallback, sparse/unavailable/retired combinations, catalog minimum and actual strict cent parser");
const old=variants.snapshotSize({id:"small",labelUa:"Маленький",labelEn:"Small",price:199,noteUa:null,noteEn:null});
assert.equal(variants.orderSizeLabel(old,"ua"),"Маленький"); assert.equal(variants.orderSizeLabel(old,"en"),"Small");
assert.equal(variants.orderSizeLabel(JSON.stringify({Size:"Historical small"}),"en"),"Historical small");
const snap=JSON.stringify({version:2,variantId:"red_small",dimensions:[{kind:"COLOR",labelUa:"Червоний",labelEn:"Red"},{kind:"SIZE",labelUa:"Маленький",labelEn:"Small"}]});
assert.equal(variants.orderSizeLabel(snap,"en"),"Red, Small");
assert.equal(ref.snapshotLabel(snap,"ua"),"Червоний, Маленький"); assert.equal(ref.snapshotLabel(snap,"en"),"Red, Small");
assert.equal(ref.snapshotLabel(JSON.stringify({version:999,variantId:"private-id"}),"en"),"");
rows[0].price="299.00"; rows[0].retired=true;
assert.equal(ref.snapshotLabel(snap,"en"),"Red, Small");
console.log("FIXED native reuse: current snapshot reader supports v2 bilingual labels.");
pass("actual v1/flat readers unchanged; review-only v2 labels use frozen text and never live catalog labels or unknown-version IDs");
const catalog=readFileSync("src/app/(shop)/catalog/page.tsx","utf8");
assert.match(catalog,/price_asc[\s\S]*?price: "asc"/); assert.match(catalog,/productOffer\(p\)/); assert.match(readFileSync("src/lib/catalog-products.ts","utf8"),/ORDER BY offer.price/);
const mismatch=[{id:"base_low",price:1,shown:999},{id:"base_high",price:100,shown:100}].sort((a,b)=>a.price-b.price);
assert.ok(mismatch[0].shown>mismatch[1].shown);
pass("historical base-price sorting counterexample retained; current catalog delegates effective-price ordering before pagination");
async function browserIdentity() {
  const originalStorage=globalThis.localStorage, originalWindow=globalThis.window;
  const memory=new Map<string,string>();
  globalThis.localStorage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}} as Storage;
  globalThis.window={location:{origin:"https://example.invalid"}} as Window & typeof globalThis;
  try {
    const session=sourceModule<typeof import("../src/lib/payments/checkout-session")>("src/lib/payments/checkout-session.ts",{"@/lib/cart-items":cart});
    const original=await session.onlineCheckoutKey(data,[size],7);
    assert.equal(await session.onlineCheckoutKey(data,[{...size,name:"Changed display",price:123}],7),original);
    const reference="pay_"+"a".repeat(32);
    session.rememberCheckoutResult(original,`/checkout/success?attempt=${reference}`);
    let cleared=0; session.completeCheckoutCart(reference,"pending",[size],()=>{cleared++;},7); assert.equal(cleared,0);
    session.completeCheckoutCart(reference,"paid",[size],()=>{cleared++;},8); assert.equal(cleared,0);
    const colorKey=await session.onlineCheckoutKey(data,[red],7);
    assert.notEqual(await session.onlineCheckoutKey(data,[white],7),colorKey,"Different colors require different identities");
    memory.set("3dkid-online-checkout-v3",JSON.stringify({key:"new-combination-identity"}));
    await session.onlineCheckoutKey(data,[simple],8);
    assert.equal(JSON.parse(memory.get("3dkid-online-checkout-v3")!).key,"new-combination-identity");
  } finally { globalThis.localStorage=originalStorage;globalThis.window=originalWindow; }
  pass("actual browser size retry identity/paid-clear revision safety retained; colors have distinct identities; separate new pending key survives old writer");
}
browserIdentity().then(()=>console.log(`PASS architecture review fixtures: ${passed} groups. Native application integration is verified by the separate owned PostgreSQL suite.`)).catch((error)=>{console.error(error);process.exitCode=1;});
