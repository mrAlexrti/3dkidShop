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
const longUa = "Рухома фігурка усміхненого дракона з крильцями та візерунком на хвості";
const longEn = "Articulated smiling dragon figurine with little wings and a patterned tail";

function checkCardAlignment(cards: HTMLElement[], from: string) {
  const rows = new Map<number, HTMLElement[]>();
  for (const card of cards) {
    const top = card.getBoundingClientRect().top;
    const row = rows.get(top) ?? [];
    row.push(card);
    rows.set(top, row);
  }
  let mixedRows = 0;
  for (const row of rows.values()) {
    check(row.length >= 2, "Catalog fixture did not exercise a multi-card row");
    const titleHeights = row.map((card) => card.querySelector("h3")!.getBoundingClientRect().height);
    if (Math.max(...titleHeights) > Math.min(...titleHeights)) mixedRows++;
    for (const selector of [null, ".sf-product-price", ".sf-product-add"]) {
      const edges = row.map((card) => (selector ? card.querySelector(selector)! : card).getBoundingClientRect().bottom);
      check(Math.max(...edges) - Math.min(...edges) < 1, `Catalog row footer is misaligned for ${selector ?? "card"}`);
    }
  }
  check(mixedRows >= 2, "Catalog fixture did not exercise wrapping titles in two rows");
  const price = (i: number) => cards[i].querySelector(".sf-product-price")!.textContent!.trim();
  check(price(3).startsWith(from + " ") && !price(2).startsWith(from + " "), "Localized from/regular price fixture is incorrect");
}

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
      <div id="cards-probe" className="sf-product-grid">{Array.from({length:8},(_,i)=><ProductCard key={i} id={`mobile_${i}`} slug={`mobile_${i}`}
        name={[3, 7].includes(i) ? longUa : `Card ${i}`} nameEn={[3, 7].includes(i) ? longEn : undefined}
        price={10} hasOptions={[3, 6].includes(i)} image="https://res.cloudinary.com/fixture/static.webp"
        images={[1, 2, 4].includes(i) ? [{ id: "first", url: "https://res.cloudinary.com/fixture/first.webp" }, { id: "second", url: "https://res.cloudinary.com/fixture/second.webp" }] : undefined}
        hoverGifUrl={[0, 1, 3, 4].includes(i) ? `https://example.invalid/card-${i}.gif` : null} isOrderable />)}</div>
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
  const saveReady = () => !form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled;
  await until(saveReady);
  const before=JSON.stringify([...new FormData(form).entries()]); form.requestSubmit();
  await until(() => saveCalls === 1 && saveReady() && control("slug").getAttribute("aria-invalid") === "true");
  check(JSON.stringify([...new FormData(form).entries()])===before,"Duplicate slug cleared materials/gallery/options");
  resultMode='network'; form.requestSubmit();
  await until(() => saveCalls === 2 && saveReady() && form.textContent!.includes(t.admin.validation.saveFailed));
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
  const cards=[...document.querySelectorAll<HTMLElement>('#cards-probe article')];
  checkCardAlignment(cards, t.product.from);
  cards[0].scrollIntoView({block:'center', behavior:'instant'}); await pause();
  const touch=matchMedia('(hover: none) and (pointer: coarse)').matches;
  const gif = (index: number) => cards[index].querySelector<HTMLImageElement>('img[data-media-source$=".gif"]');
  const cardControl = (index: number, label: string) => cards[index].querySelector<HTMLButtonElement>(`[aria-label="${label}: Card ${index}"]`)!;
  const next = cardControl(1, t.product.gallery.next);
  check(next.offsetWidth === 44 && next.offsetHeight === 44, "Arrow target is smaller than 44 px");
  check((next.firstElementChild as HTMLElement).offsetWidth === (innerWidth < 640 ? 24 : 32), "Visible arrow circle has incorrect size");
  check(next.querySelector("svg")?.getAttribute("width") === "16", "Chevron size incorrect");
  if(touch) {
    await until(() => gif(0)?.naturalWidth === 1 && gif(1)?.naturalWidth === 1);
    check(cards[0].offsetTop === cards[1].offsetTop && cards[0].offsetLeft < cards[1].offsetLeft, "Fixture is not a two-column row");
    cards[3].scrollIntoView({block:'center', behavior:'instant'});
    await until(() => gif(3)?.naturalWidth === 1);
    check(!gif(2), "GIF appeared on an unconfigured left card");
    cards[4].scrollIntoView({block:'center', behavior:'instant'});
    await until(() => gif(4)?.naturalWidth === 1);
    check(!gif(5), "GIF appeared on an unconfigured right card");
    cards[1].scrollIntoView({block:'center', behavior:'instant'});
    await until(() => Boolean(gif(0) && gif(1)));
    cardControl(1, t.product.gallery.pauseAnimation).click();
    await until(() => !gif(1));
    check(gif(0), "Pausing the right card affected the left card");
    cardControl(1, t.product.gallery.playAnimation).click();
    await until(() => Boolean(gif(1)));
    next.click();
    await until(() => !gif(1));
    check(cards[1].querySelector('[data-media-source$="second.webp"]') && fixture.pushes.length === 0, "Gallery arrow navigated or kept the GIF");
    cardControl(1, t.product.gallery.previous).click();
    await until(() => Boolean(gif(1)));
    const link = cards[1].querySelector("a")!;
    link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 120, clientY: 60 }));
    link.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 50, clientY: 61 }));
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    await until(() => !gif(1));
    check(!fixture.pushes.length && cards[1].querySelector('[data-media-source$="second.webp"]'), "Swipe leaked into product navigation");
    link.click();
    check(fixture.pushes.at(-1) === "/product/mobile_1", "Keyboard-style click was swallowed");
    Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'));
    await until(()=>!document.querySelector('img[data-media-source$=".gif"]'));
    Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange'));
    await until(()=>Boolean(gif(0)));
    document.querySelector('#materials-probe')!.scrollIntoView({ behavior: 'instant' }); await until(()=>!document.querySelector('img[data-media-source$=".gif"]'));
  } else {
    await new Promise((done)=>setTimeout(done,180)); check(!document.querySelector('img[data-media-source$=".gif"]'),"Desktop auto-animated without hover");
    cards[0].dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'})); await until(()=>Boolean(cards[0].querySelector('img[data-media-source$=".gif"]')));
    cards[0].dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse'})); await until(()=>!cards[0].querySelector('img[data-media-source$=".gif"]'));
  }
  check(document.documentElement.scrollWidth<=innerWidth,"Responsive addendum layout overflow");
  return `${locale}: responsive catalog footer alignment, Materials Unicode/paragraphs/live preview, preserved validation/network/gallery state, confirmation cancel/close/double-submit/archive, category feedback, ${touch?'independent touch GIFs with single/multiple photos, pause, arrows, swipe and navigation':'desktop hover without autoplay'} PASS`;
}
async function reduced() {
  document.querySelectorAll<HTMLElement>('#cards-probe article')[4].scrollIntoView({block:'center'});
  await new Promise((done)=>setTimeout(done,200)); check(!document.querySelector('img[data-media-source$=".gif"]'),"Reduced-motion request did not keep static images"); return true;
}
async function openDialog() { document.querySelector<HTMLButtonElement>('#delete-probe button')!.click(); await until(()=>Boolean(modal())); return document.activeElement?.textContent === language.getState().t.adminSafety.cancel; }
async function closedByKeyboard() { await until(()=>!modal()); return document.activeElement === document.querySelector('#delete-probe button'); }
const touchTrace: string[] = [];
async function realTouchTarget() {
  for (const type of ["pointerdown", "pointercancel", "pointerup", "click", "touchstart", "touchend"]) {
    document.addEventListener(type, (event) => touchTrace.push(`${type} ${(event.target as Element).closest("a")?.getAttribute("href")}`), { capture: true });
  }
  const card = document.querySelector<HTMLElement>('#cards-probe article')!;
  card.scrollIntoView({ block: "center", behavior: "instant" });
  await pause();
  const rect = card.querySelector("a")!.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2), y = Math.round(rect.top + rect.height / 2);
  check(document.elementFromPoint(x, y)?.closest("a") === card.querySelector("a"), "Touch target is not the card link");
  return { x, y };
}
function focusNext() {
  const card = document.querySelectorAll('#cards-probe article')[1];
  const label = language.getState().t.product.gallery.next;
  const button = card.querySelector<HTMLButtonElement>(`[aria-label="${label}: Card 1"]`)!;
  button.focus();
  return document.activeElement === button;
}
const secondPhoto = () => Boolean(document.querySelectorAll('#cards-probe article')[1].querySelector('[data-media-source$="second.webp"]'));
Object.assign(window,{addendumQA:{run,reduced,openDialog,closedByKeyboard,realTouchTarget,focusNext,secondPhoto,touchTrace,navigated: () => fixture.pushes.at(-1) === "/product/mobile_0"}});
