import * as React from "react";
import { createRoot } from "react-dom/client";
import { ProductCard } from "../../src/components/product/product-card";
import { ProductForm } from "../../src/components/admin/product-form";
import { ProductMaterials } from "../../src/components/product/product-materials";
import { DeleteButton } from "../../src/components/admin/delete-button";
import { createLangStore, LangStoreContext } from "../../src/store/lang-store";
import { fixture } from "./gallery-admin-environment";

const root = createRoot(document.getElementById("root")!);
const pause = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean) { const end = performance.now()+5000; while (!test()) { check(performance.now()<end,"Addendum browser did not settle"); await pause(); } }
const modal = () => document.querySelector<HTMLDialogElement>('dialog[open]');
const press = (text: string, scope: ParentNode = document) => { const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text); check(button,`Button missing: ${text}`); button.click(); };
let deleteCalls = 0, saveCalls = 0, release = () => {}, resultMode = "deferred", archiveCalls = 0;
let language: ReturnType<typeof createLangStore>;
async function run(locale: "ua" | "en") {
  deleteCalls=0; saveCalls=0; archiveCalls=0; resultMode="deferred"; fixture.pushes=[];
  language=createLangStore(locale); const t=language.getState().t;
  root.render(<React.StrictMode><LangStoreContext.Provider value={language}>
    <div className="storefront container-shop">
      <div id="materials-probe"><ProductMaterials locale={locale} product={{materials:"PLA\n\nДругий абзац\nрядок <script>literal</script>",materialsEn:"PLA\n\nSecond paragraph\nline <script>literal</script>",materialsDivider:"👩🏽‍🚀✦❀"}} /></div>
      <div id="form-probe"><ProductForm action={async () => { saveCalls++; return resultMode === "network" ? Promise.reject(new Error("SYNTHETIC_OFFLINE")) : {error:"slugDuplicate"}; }} categories={[{id:"c",slug:"c",name:"Category",nameEn:"Category",order:0,imageUrl:null,children:[]}]}
        defaults={{ name:"Товар",nameEn:"Product",slug:"product",description:"Original description",descriptionEn:"Original English",price:10,categoryId:"c",materials:"PLA\n\nДва абзаци",materialsEn:"PLA\n\nTwo paragraphs",materialsDivider:"✦",
          images:[{id:"a",url:"https://res.cloudinary.com/fixture/a.webp",alt:"A"},{id:"b",url:"https://res.cloudinary.com/fixture/b.webp",alt:"B"}], variants:[{id:"size_saved",labelUa:"Малий",labelEn:"Small",price:20,noteUa:null,noteEn:null}] }} /></div>
      <div id="delete-probe"><DeleteButton recordName="Печивко Oreo" action={async () => { deleteCalls++; if(resultMode === "deferred") await new Promise<void>((done)=>{release=done;}); return resultMode === "failure" ? {error:"orderHistory"} : undefined; }} archiveAction={async()=>{archiveCalls++;}} /></div>
      <div id="category-probe"><DeleteButton recordKind="category" recordName="Брелоки" disabledReason={t.admin.deletion.categoryProducts.replace("{name}","Брелоки")} action={async()=>{throw Error("DISABLED_ACTION_REACHED");}} /></div>
      <div style={{height:950}} />
      <div id="cards-probe" className="sf-product-grid">{Array.from({length:8},(_,i)=><ProductCard key={i} id={`mobile_${i}`} slug={`mobile_${i}`} name={`Card ${i}`} price={10} image="https://res.cloudinary.com/fixture/static.webp" hoverGifUrl={`https://example.invalid/card-${i}.gif`} isOrderable />)}</div>
      <div style={{height:950}} />
    </div>
  </LangStoreContext.Provider></React.StrictMode>);
  await until(()=>Boolean(document.querySelector('#form-probe form'))); await document.fonts.ready; await pause();
  check(!document.querySelector('script:not([src])'),"Stored materials interpreted as markup");
  check(document.querySelector('#materials-probe h2')?.textContent === t.materials.heading,"Materials heading locale incorrect");
  check(document.querySelectorAll('#materials-probe p').length === 2,"Materials paragraphs collapsed");
  check(getComputedStyle(document.querySelector('#materials-probe h2')!).fontWeight === "700","Materials heading not bold");
  const form=document.querySelector<HTMLFormElement>('#form-probe form')!;
  const control=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
  function input(name:string,value:string) { const node=control(name); Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(node,value); node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); }
  input('materialsDivider','✦'.repeat(9)); await pause();
  check(control('materialsDivider').value === '✦'.repeat(9) && control('materialsDivider').getAttribute('aria-invalid') === 'true', 'Invalid motif was truncated or lost its validation feedback');
  input('materialsDivider','👩🏽‍🚀✦❀'); await pause();
  const separator=form.querySelector<HTMLElement>('[data-materials-divider]')!;
  await until(()=>Boolean(separator.querySelector('span.whitespace-pre:not(.invisible)')));
  const visible=separator.querySelector<HTMLElement>('span.whitespace-pre:not(.invisible)')!;
  check(visible.getBoundingClientRect().width <= separator.clientWidth,"Divider overflows at actual width");
  check(visible.textContent!.split('\u00a0\u00a0').every((value)=>value==='👩🏽‍🚀✦❀'),"Divider split grapheme cluster");
  const before=JSON.stringify([...new FormData(form).entries()]); form.requestSubmit(); await until(()=>saveCalls===1); await pause();
  check(JSON.stringify([...new FormData(form).entries()])===before,"Duplicate slug cleared materials/gallery/options");
  resultMode='network'; form.requestSubmit(); await until(()=>saveCalls===2); await pause();
  check(JSON.stringify([...new FormData(form).entries()])===before,"Network failure cleared materials/gallery/options");
  const galleryBefore=control('images').value;
  form.querySelector<HTMLButtonElement>(`button[aria-label="${t.admin.gallery.remove}: 2"]`)!.click(); await until(()=>Boolean(modal()));
  check(document.activeElement?.textContent === t.adminSafety.cancel,"Cancel must be the safe initial focus");
  press(t.adminSafety.cancel,modal()!); await until(()=>!modal()); check(control('images').value===galleryBefore,"Cancelled persisted-image removal mutated form");
  form.querySelector<HTMLButtonElement>(`button[aria-label="${t.admin.gallery.remove}: 2"]`)!.click(); await until(()=>Boolean(modal())); press(t.adminSafety.delete,modal()!); await until(()=>!modal());
  check(JSON.parse(control('images').value).length===1 && control('materialsDivider').value==='👩🏽‍🚀✦❀' && control('variants')===null,"Saved-image removal lost unrelated form state or mutated untouched size editor");
  const deleting=document.querySelector<HTMLButtonElement>('#delete-probe button')!;
  deleting.click(); await until(()=>Boolean(modal())); check(modal()!.textContent!.includes('Печивко Oreo'),"Delete confirmation omits record name");
  modal()!.dispatchEvent(new Event('cancel',{cancelable:true})); await until(()=>!modal()); check(deleteCalls===0,"Closing dialog executed deletion");
  deleting.click(); await until(()=>Boolean(modal())); press(t.adminSafety.cancel,modal()!); await until(()=>!modal()); check(deleteCalls===0,"Cancel executed deletion");
  resultMode='deferred'; deleting.click(); await until(()=>Boolean(modal()));
  const confirm=[...modal()!.querySelectorAll<HTMLButtonElement>('button')].find((node)=>node.textContent===t.adminSafety.delete)!; confirm.click(); confirm.click(); await pause();
  check(Number(deleteCalls)===1 && [...modal()!.querySelectorAll('button')].every((node)=>node.disabled),"Duplicate delete allowed or controls not disabled");
  release(); await until(()=>!modal()); check(fixture.refreshes>0,"Successful delete did not refresh");
  resultMode='failure'; deleting.click(); await until(()=>Boolean(modal())); press(t.adminSafety.delete,modal()!); await until(()=>!modal());
  check(document.querySelector('#delete-probe')!.textContent!.includes(t.admin.deletion.orderHistory),"Failed deletion lacks localized historical protection message");
  press(t.admin.deletion.archive,document.querySelector('#delete-probe')!); await until(()=>Boolean(modal())); press(t.admin.deletion.archive,modal()!); await until(()=>!modal()); check(archiveCalls===1,"Explicit archive confirmation failed");
  check(document.querySelector<HTMLButtonElement>('#category-probe button')!.disabled,"Known category dependency not disabled");
  check(!document.querySelector('img[data-media-source$=".gif"]'),"GIF downloaded before viewport eligibility");
  const cards=[...document.querySelectorAll<HTMLElement>('#cards-probe article')]; cards[0].scrollIntoView({block:'center'}); await pause();
  const touch=matchMedia('(hover: none) and (pointer: coarse)').matches;
  if(touch) {
    await until(()=>document.querySelectorAll('img[data-media-source$=".gif"]').length===1);
    cards[4].scrollIntoView({block:'center'}); await until(()=>Boolean(document.querySelector('img[data-media-source="https://example.invalid/card-4.gif"]')));
    check(document.querySelectorAll('img[data-media-source$=".gif"]').length===1,"Multiple mobile GIFs active");
    cards[4].querySelector<HTMLAnchorElement>('a')!.click(); await pause(); check(fixture.pushes.at(-1)==='/product/mobile_4',"Single tap does not navigate");
    Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); await until(()=>!document.querySelector('img[data-media-source$=".gif"]'));
    Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange')); await until(()=>document.querySelectorAll('img[data-media-source$=".gif"]').length===1);
    document.querySelector('#materials-probe')!.scrollIntoView(); await until(()=>!document.querySelector('img[data-media-source$=".gif"]'));
  } else {
    await new Promise((done)=>setTimeout(done,180)); check(!document.querySelector('img[data-media-source$=".gif"]'),"Desktop auto-animated without hover");
    cards[0].dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'})); await until(()=>Boolean(cards[0].querySelector('img[data-media-source$=".gif"]')));
    cards[0].dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse'})); await until(()=>!cards[0].querySelector('img[data-media-source$=".gif"]'));
  }
  check(document.documentElement.scrollWidth<=innerWidth,"Responsive addendum layout overflow");
  return `${locale}: Materials Unicode/paragraphs/live preview, preserved validation/network/gallery state, confirmation cancel/close/double-submit/archive, category feedback, ${touch?'touch single-GIF center switching/navigation/visibility':'desktop hover without autoplay'} PASS`;
}
async function reduced() {
  document.querySelectorAll<HTMLElement>('#cards-probe article')[4].scrollIntoView({block:'center'});
  await new Promise((done)=>setTimeout(done,200)); check(!document.querySelector('img[data-media-source$=".gif"]'),"Reduced-motion request did not keep static images"); return true;
}
async function openDialog() { document.querySelector<HTMLButtonElement>('#delete-probe button')!.click(); await until(()=>Boolean(modal())); return document.activeElement?.textContent === language.getState().t.adminSafety.cancel; }
async function closedByKeyboard() { await until(()=>!modal()); return document.activeElement === document.querySelector('#delete-probe button'); }
Object.assign(window,{addendumQA:{run,reduced,openDialog,closedByKeyboard}});
