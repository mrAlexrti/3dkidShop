import * as React from "react";
import { createRoot } from "react-dom/client";
import { ProductOptions } from "../../src/components/product/product-options";
import { ProductCard } from "../../src/components/product/product-card";
import { ProductForm } from "../../src/components/admin/product-form";
import { createLangStore, LangStoreContext } from "../../src/store/lang-store";
import { useCartStore } from "../../src/store/cart-store";
import { fixture } from "./gallery-admin-environment";
import type { ProductConfiguration } from "../../src/lib/product-configuration";
import type { AdminFormResult } from "../../src/lib/admin-form-validation";
import { formatPrice } from "../../src/lib/utils";
const root=createRoot(document.getElementById("root")!);
const ids={red:"c1111111111111111111111111",white:"c2222222222222222222222222",small:"c3333333333333333333333333",large:"c4444444444444444444444444",rs:"c5555555555555555555555555",wl:"c6666666666666666666666666"};
const config:ProductConfiguration={mode:"COLOR_SIZE",values:[
  {id:ids.red,optionId:"colors",kind:"COLOR",labelUa:"Червоний",labelEn:"Red",noteUa:null,noteEn:null,retired:false},
  {id:ids.white,optionId:"colors",kind:"COLOR",labelUa:"Білий",labelEn:"White",noteUa:null,noteEn:null,retired:false},
  {id:ids.small,optionId:"sizes",kind:"SIZE",labelUa:"Малий",labelEn:"Small",noteUa:null,noteEn:null,retired:false},
  {id:ids.large,optionId:"sizes",kind:"SIZE",labelUa:"Великий",labelEn:"Large",noteUa:null,noteEn:null,retired:false},
],combinations:[{id:ids.rs,values:{COLOR:ids.red,SIZE:ids.small},price:"199.00",isAvailable:true,retired:false},{id:ids.wl,values:{COLOR:ids.white,SIZE:ids.large},price:"299.00",isAvailable:true,retired:false}]};
const settle=()=>new Promise<void>((done)=>requestAnimationFrame(()=>requestAnimationFrame(()=>done())));
function check(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function until(test:()=>boolean){const end=performance.now()+5000;while(!test()){check(performance.now()<end,"Native browser fixture timed out");await settle();}}
function button(scope:Element,text:string){const found=[...scope.querySelectorAll<HTMLButtonElement>("button")].find((v)=>v.textContent===text);check(found,`Missing button ${text}`);return found;}
function field(name:string){const node=document.querySelector<HTMLInputElement>(`[name="${name}"]`);check(node,`Missing field ${name}`);return node;}
function input(name:string,value:string){const node=field(name);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));}
async function run(locale:"ua"|"en"){
  const language=createLangStore(locale), t=language.getState().t;useCartStore.getState().clear();let calls=0;let failure:"field"|"stale"|"network"="field";
  const save=async():Promise<AdminFormResult>=>{calls++;if(failure==="network")throw new Error("SYNTHETIC_NETWORK_FAILURE");return {error:"validation",fieldErrors:failure==="stale"?{configuration:"stale"}:{"configuration.values.0.labelUa":"invalid"}};};
  const render=(node:React.ReactNode)=>root.render(<LangStoreContext.Provider value={language}>{node}</LangStoreContext.Provider>);
  render(<div className="p-3"><ProductCard id="native" name="Fixture" slug="fixture" price={199} image="/placeholder.svg" isOrderable hasOptions hasColorOptions/><ProductOptions productId="native" name="Fixture" slug="fixture" image="/placeholder.svg" basePrice={1} variants={[]} isOrderable configuration={config}/></div>);
  await until(()=>Boolean(document.querySelector(".sf-product-options")));
  const card=document.querySelector(".sf-product-card")!, detail=document.querySelector(".sf-product-options")!;
  check(card.querySelectorAll(".sf-product-add").length===1&&!card.querySelector(".sf-quantity-control"),"Catalog got a quantity stepper or duplicate cart button");
  (card.querySelector(".sf-product-add") as HTMLButtonElement).click();check(fixture.pushes.at(-1)==="/product/fixture"&&useCartStore.getState().items.length===0,"Option card did not route before add");
  const add=()=>button(detail,t.product.addToCart);
  check(button(detail,t.variantConfig.choose).disabled,"Native choices were preselected");
  button(detail,locale==="ua"?"Червоний":"Red").click();await settle();
  check(button(detail,locale==="ua"?"Великий":"Large").disabled,"Missing red/large pair was selectable");
  button(detail,locale==="ua"?"Малий":"Small").click();await settle();check(!add().disabled,"Valid red/small stayed blocked");
  add().click();add().click();await settle();check(useCartStore.getState().items[0].quantity===2,"Same combination did not merge");
  button(detail,locale==="ua"?"Білий":"White").click();await settle();check(button(detail,t.variantConfig.choose).disabled&&detail.textContent?.includes(t.variantConfig.cleared),"Incompatible size was silently substituted");
  button(detail,locale==="ua"?"Великий":"Large").click();await settle();
  (detail.querySelector(`[aria-label="${t.cart.increase}"]`) as HTMLButtonElement).click();await settle();check(detail.textContent?.includes(formatPrice(598,"UAH")),"Quantity total did not update");
  add().click();await settle();check(useCartStore.getState().items.length===2&&useCartStore.getState().items[1].quantity===2,"Colors merged or quantity was lost");
  for(const mode of ["SIZE","COLOR"] as const){
    const one:ProductConfiguration={...config,mode,values:config.values.filter((v)=>v.kind===mode),combinations:[{...config.combinations[0],values:mode==="SIZE"?{SIZE:ids.small}:{COLOR:ids.red}}]};
    render(<ProductOptions key={mode} productId={`native_${mode}`} name="Fixture" slug="fixture" image="/placeholder.svg" basePrice={1} variants={[]} isOrderable configuration={one}/>);await settle();
    const area=document.querySelector(".sf-product-options")!;check(area.querySelectorAll("fieldset").length===1,"Wrong dimension displayed");
    button(area,mode==="COLOR"?(locale==="ua"?"Червоний":"Red"):(locale==="ua"?"Малий":"Small")).click();await settle();button(area,t.product.addToCart).click();await settle();
    const added=useCartStore.getState().items.at(-1)!;check(mode==="SIZE"?added.variant?.id===ids.small:added.selection?.values.COLOR===ids.red,"Single-dimension serialization mismatch");
  }
  render(<ProductForm allowNative categories={[{id:"category",name:"Category",nameEn:"Category",slug:"category",imageUrl:null,order:0,children:[]}]} action={save} defaults={{optionMode:"COLOR_SIZE",variantRevision:7,configuration:config,name:"Fixture",nameEn:"Fixture",slug:"fixture",description:"Description",descriptionEn:"Description",price:1,categoryId:"category",isOrderable:true,images:[{id:"c7777777777777777777777777",url:"https://res.cloudinary.com/fixture/photo.webp",alt:"Fixture"}]}}/>);
  await until(()=>Boolean(document.querySelector('[name="configuration"]'))&&!document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);
  const form=document.querySelector("form")!;
  input("configuration.values.0.labelUa","Нова назва");input("configuration.combinations.0.price","219.00");await settle();
  const snapshot=()=>JSON.stringify([...new FormData(form).entries()]);const before=snapshot();
  form.requestSubmit();await settle();await until(()=>calls===1&&!document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);await settle();
  check(snapshot()===before,"Server error lost native inputs/IDs");check(document.activeElement===field("configuration.values.0.labelUa"),"Server error did not focus native field");
  failure="network";form.requestSubmit();await settle();await until(()=>calls===2&&!document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);await settle();check(snapshot()===before,"Network error reset native fields/gallery");
  failure="stale";form.requestSubmit();await settle();await until(()=>calls===3&&!document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);await settle();check(form.textContent?.includes(t.admin.validation.stale)&&snapshot()===before,"Stale editor did not retain draft or explain conflict");
  const row=document.querySelector('[data-field-name="configuration.combinations.0"]')!;
  async function confirmDialog(label:string){await until(()=>Boolean(document.querySelector('dialog[open]')));button(document.querySelector('dialog[open]')!,label).click();await until(()=>!document.querySelector('dialog[open]'));}
  button(row,t.variantConfig.retire).click();await confirmDialog(t.variantConfig.retire);await settle();check(JSON.parse(field("configuration").value).combinations[0].retired,"Retirement failed");
  button(row,t.variantConfig.restore).click();await settle();check(JSON.parse(field("configuration").value).combinations[0].id===ids.rs,"Restore regenerated ID");
  input("configuration.combinations.0.price","");await settle();const previous=calls;form.requestSubmit();await settle();check(calls===previous&&document.activeElement===field("configuration.combinations.0.price"),"Missing price not focused/blocked");
  input("configuration.combinations.0.price","219.00");await settle();
  const useSize=[...form.querySelectorAll<HTMLLabelElement>("label")].find((v)=>v.textContent===t.variantConfig.useSize)!.querySelector<HTMLInputElement>("input")!;
  useSize.click();await confirmDialog(t.adminSafety.cancel);await settle();check(JSON.parse(field("configuration").value).mode==="COLOR_SIZE","Cancelled dimension change mutated data");
  useSize.click();await confirmDialog(t.adminSafety.apply);await settle();const switched=JSON.parse(field("configuration").value);check(switched.mode==="COLOR"&&switched.combinations.every((v:{retired:boolean})=>v.retired),"Dimension change generated or silently reassigned combinations");
  check(document.documentElement.scrollWidth<=innerWidth+1,"Native editor overflows mobile viewport");
  root.unmount();return `${locale}: explicit sparse color/size choices, price/quantity, card routing, separate cart lines, native form errors/network/stale retention, retirement/restore IDs and mobile layout PASS`;
}
Object.assign(window,{variantsQA:{run}});
