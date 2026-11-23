// Actual pure implementation and actual Zustand source with isolated storage/lookup.
import assert from "node:assert/strict";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { sourceModule } from "./source-module";
import * as config from "../src/lib/product-configuration";
import * as cart from "../src/lib/cart-items";
import * as reconciliation from "../src/lib/cart-reconciliation";
import * as limits from "../src/lib/cart-limits";
import * as persistence from "../src/lib/cart-persistence";
import { snapshotSize, orderSizeLabel } from "../src/lib/product-variants";
import { configurationInputSchema } from "../src/lib/product-configuration-admin";
import { variantHistoryPage } from "../src/lib/admin-variant-history";
import { nativeVariantWritesEnabled } from "../src/lib/variant-rollout";
import type { CartItem } from "../src/types";
import type { useCartStore } from "../src/store/cart-store";
const dto:config.ProductConfiguration={mode:"COLOR_SIZE",values:[
  {id:"red",optionId:"colors",kind:"COLOR",labelUa:"Червоний",labelEn:"Red",noteUa:null,noteEn:null,retired:false},
  {id:"white",optionId:"colors",kind:"COLOR",labelUa:"Білий",labelEn:"White",noteUa:null,noteEn:null,retired:false},
  {id:"small",optionId:"sizes",kind:"SIZE",labelUa:"Малий",labelEn:"Small",noteUa:null,noteEn:null,retired:false},
],combinations:[{id:"red_small",values:{COLOR:"red",SIZE:"small"},price:"199.00",isAvailable:true,retired:false},{id:"white_small",values:{COLOR:"white",SIZE:"small"},price:"249.00",isAvailable:true,retired:false}]};
const base:CartItem={id:"p",productId:"p",name:"Old",slug:"old",price:1,image:"/old.webp",quantity:1};
const red:CartItem={...base,id:"p:variant:red_small",selection:{version:2,variantId:"red_small",values:{COLOR:"red",SIZE:"small"}}};
const white:CartItem={...red,id:"p:variant:white_small",selection:{version:2,variantId:"white_small",values:{COLOR:"white",SIZE:"small"}}};
let passed=0;const pass=(message:string)=>console.log(`PASS IMPL ${++passed}: ${message}`);
async function verify(){
  const priorFlag=process.env.PRODUCT_VARIANTS_ENABLED;
  try {delete process.env.PRODUCT_VARIANTS_ENABLED;assert.equal(nativeVariantWritesEnabled(),false);process.env.PRODUCT_VARIANTS_ENABLED="true";assert.equal(nativeVariantWritesEnabled(),true);}finally{if(priorFlag===undefined)delete process.env.PRODUCT_VARIANTS_ENABLED;else process.env.PRODUCT_VARIANTS_ENABLED=priorFlag;}
  const normalized=cart.normalizeCartItems([red,red,white]);assert.equal(normalized.length,2);assert.equal(normalized[0].quantity,2);
  assert.equal(cart.normalizeCartItems([{...red,selection:{...red.selection,version:3}}]).length,0);
  assert.equal(cart.normalizeCartItems([{...red,selection:undefined}]).length,0);
  assert.notDeepEqual(cart.checkoutSelectionLines([red]),cart.checkoutSelectionLines([white]));
  assert.deepEqual(cart.checkoutSelectionLines([base]),[{productId:"p",size:null,quantity:1}]);
  assert.deepEqual(cart.checkoutSelectionLines([{...base,id:"p-small",variant:{id:"small",labelUa:"Малий",labelEn:"Small"}}]),[{productId:"p",size:"small",quantity:1}]);
  assert.equal(cart.cartAfterAddition([{...red,quantity:limits.MAX_QUANTITY}],red),null);
  pass("actual canonical line merge, separate colors, strict unknown/missing selection rejection, unchanged simple/size hash material and overflow");
  const p:reconciliation.CartProduct={id:"p",name:"Current",nameEn:"Current",slug:"current",price:1,image:"/current.webp",isOrderable:true,variants:[],optionMode:"COLOR_SIZE",configuration:dto};
  const result=reconciliation.reconcileCart([red,white],[p],"en");assert.equal(result.items[0].price,199);assert.equal(result.items[1].price,249);assert.equal(result.items[0].selectionLabels!.COLOR.labelEn,"Red");assert.equal(result.changed.length,2);
  for(const rows of [[],dto.combinations.map((r)=>({...r,isAvailable:false})),dto.combinations.map((r)=>({...r,retired:true}))]){
    const bad=reconciliation.reconcileCart([red],[{...p,configuration:{...dto,combinations:rows}}],"en");assert.equal(bad.issues[red.id],"variantUnavailable");assert.equal(bad.items[0].id,red.id);
  }
  assert.equal(reconciliation.reconcileCart([red],[],"ua").items[0].image,reconciliation.CART_IMAGE_PLACEHOLDER);
  pass("authoritative reconciliation updates full prices/UA-EN labels and blocks absent/unavailable/retired pairs without losing identity");
  const memory=new Map<string,string>();const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}};
  memory.set("stikr-cart",JSON.stringify({version:1,state:{items:[{...base,id:"p-small",variant:{id:"small",labelUa:"S",labelEn:"Small"}}],checkoutRevision:7,priceChanges:["p-small"]}}));
  const rawSource=memory.get("stikr-cart");const migrated=JSON.parse(persistence.migratedCart(storage)!);assert.equal(migrated.state.items[0].id,"p-small");assert.deepEqual(migrated.state.priceChanges,["p-small"]);assert.equal(memory.get("stikr-cart"),rawSource);
  const target=JSON.stringify({version:2,state:{items:[red,white],legacyImported:true}});memory.set("stikr-cart-v2",target);memory.set("stikr-cart","corrupt old tab");assert.equal(persistence.migratedCart(storage),target);
  memory.set("stikr-cart-v2",JSON.stringify({version:2,state:{items:[],legacyImported:true}}));assert.equal(JSON.parse(persistence.migratedCart(storage)!).state.items.length,0);
  memory.delete("stikr-cart-v2");memory.set("stikr-cart",JSON.stringify({state:{items:Array.from({length:101},(_,i)=>({...base,id:`p${i}`,productId:`p${i}`}))}}));
  const tooLarge=memory.get("stikr-cart");assert.equal(JSON.parse(persistence.migratedCart(storage)!).state.migrationError,true);assert.equal(memory.get("stikr-cart"),tooLarge);assert.equal(memory.has("stikr-cart-v2"),false);
  pass("actual migration preserves old selection/price-review source, isolates old tabs, honors empty target and refuses partial 101-line import");
  let products=[p];let offline=false;
  const store=sourceModule<{useCartStore:typeof useCartStore}>("src/store/cart-store.ts",{zustand:{create},"zustand/middleware":{persist:(fn:Parameters<typeof persist>[0],opts:Parameters<typeof persist>[1])=>persist(fn,{...opts,storage:createJSONStorage(()=>storage)})},"@/lib/cart-items":cart,"@/lib/cart-reconciliation":reconciliation,"@/lib/cart-limits":limits,"@/lib/actions/reconcile-cart":{lookupCartProducts:async()=>{if(offline)throw new Error("OFFLINE");return products;}}}).useCartStore;
  store.getState().clear();store.getState().addItem(red);assert.equal(store.getState().ready(),false);await store.getState().verifyCart("en",true);assert.equal(store.getState().ready(),false);store.getState().reviewPrices();assert.equal(store.getState().ready(),true);
  store.getState().addItem({...red,price:209});assert.ok(store.getState().priceChanges.includes(red.id));assert.equal(store.getState().ready(),false);
  offline=true;await store.getState().verifyCart("en",true);assert.equal(store.getState().ready(),false);assert.equal(store.getState().items[0].id,red.id);
  offline=false;products=[{...p,configuration:{...dto,combinations:[]}}];await store.getState().verifyCart("en",true);assert.equal(store.getState().ready(),false);
  pass("actual Zustand native readiness requires verification/review; offline and retired/missing combinations preserve selections and block checkout");
  const snapshot=config.snapshotCombination(dto,dto.combinations[0]);assert.equal(orderSizeLabel(snapshot,"en"),"Red, Small");assert.equal(orderSizeLabel(snapshot,"ua"),"Червоний, Малий");
  assert.equal(orderSizeLabel(snapshotSize({id:"small",labelUa:"Малий",labelEn:"Small",price:1,noteUa:null,noteEn:null}),"en"),"Small");assert.equal(orderSizeLabel('{"Size":"Historical"}'),"Historical");assert.equal(orderSizeLabel('{"version":999,"variantId":"secret-id"}'),"");
  assert.equal(config.selectedCombination({...dto,mode:"COLOR"},undefined,red.selection),null);assert.equal(config.selectedCombination({...dto,mode:"SIZE"},"small",red.selection),null);
  assert.equal(configurationInputSchema.safeParse({mode:"COLOR_SIZE",values:[],combinations:[]}).success,true);
  pass("actual versioned snapshots preserve v1/flat/UA-EN compatibility; strict modes reject extra dimensions and permit explicitly unavailable empty configuration");
  const history=variantHistoryPage({...dto,values:[...dto.values,...Array.from({length:450},(_,i)=>({...dto.values[2],id:`old_size_${i}`,retired:true}))],combinations:[...dto.combinations,...Array.from({length:450},(_,i)=>({...dto.combinations[0],id:`retired_${i}`,values:{COLOR:"red",SIZE:`old_size_${i}`},retired:true}))]},2);
  assert.equal(history.configuration.combinations.length,22);assert.equal(history.pages,23);assert.equal(history.page,2);
  pass("retired history pages keep all active combinations and a bounded retired page without lifetime payload exhaustion");
  const previousStorage=globalThis.localStorage;globalThis.localStorage=storage as Storage;
  try {
    const future=JSON.stringify({version:3,state:{items:[{...red,selection:{...red.selection,version:3}}]}});memory.set("stikr-cart-v2",future);
    const futureStore=sourceModule<{useCartStore:typeof useCartStore}>("src/store/cart-store.ts",{zustand:{create},"zustand/middleware":{persist,createJSONStorage},"@/lib/cart-items":cart,"@/lib/cart-reconciliation":reconciliation,"@/lib/cart-limits":limits,"@/lib/actions/reconcile-cart":{lookupCartProducts:async()=>[]}}).useCartStore;
    await futureStore.persist.rehydrate();assert.equal(futureStore.getState().migrationError,true);assert.equal(futureStore.getState().ready(),false);assert.equal(memory.get("stikr-cart-v2"),future);
  } finally {globalThis.localStorage=previousStorage;}
  pass("unknown future persistence version is blocked and its entire original record is retained, never downgraded or overwritten");
  console.log(`PASS Batch 1.8 implementation isolated: ${passed} groups.`);
}
verify().catch((error)=>{console.error(error);process.exitCode=1;});
