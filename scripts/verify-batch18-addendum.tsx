// Pure/static regressions only; PostgreSQL and browser execution are separate suites.
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { motifSchema, materialsFields, localizedMaterials, dividerCount } from "../src/lib/product-materials";
import { ProductMaterials } from "../src/components/product/product-materials";
import { preferredAnimation, visibleAnimationCandidate } from "../src/lib/mobile-card-animation";
import { translations } from "../src/lib/i18n";

let groups=0; const pass=(s:string)=>console.log(`PASS ADDENDUM ${++groups}: ${s}`);
for(const value of ['✦','✧','✿','❀','♥','⭐','✦❀','👩🏽‍🚀','👨‍👩‍👧‍👦','🇺🇦','❤️','a\u0301','नमस्ते']) assert.equal(motifSchema.safeParse(value).success,true,value);
for(const value of ['✦'.repeat(9),'x'.repeat(129),'✦\n✦','\u0000','a'+'\u0301'.repeat(130)]) assert.equal(motifSchema.safeParse(value).success,false);
assert.deepEqual(z.object(materialsFields).parse({materials:'',materialsEn:'',materialsDivider:''}),{materials:null,materialsEn:null,materialsDivider:null});
assert.deepEqual(z.object(materialsFields).parse({}),{});
assert.equal(z.object(materialsFields).safeParse({materials:'x'.repeat(12001)}).success,false);
pass('arbitrary Unicode, ZWJ/skin tone/flags/VS/combining graphemes accepted; bounded inputs and optional clears preserve legacy callers');
for(const width of [0,1,16,48,128,288,358,700,1280])for(const motifWidth of [8,21,42,80]){
 const count=dividerCount(width,motifWidth,motifWidth+8); assert.ok(count>=0&&count<=128);
 if(count)assert.ok(count*motifWidth+(count-1)*8<=width-1);
}
assert.equal(dividerCount(Infinity,10,15),0);assert.equal(dividerCount(10,20,25),0);assert.equal(dividerCount(100,0,0),0);
pass('responsive repeat geometry fits only whole motifs across narrow/mobile/desktop widths with bounded work');
const value={materials:'UA\n\nрядок\nдва <script>literal</script>',materialsEn:'EN\n\nline\ntwo',materialsDivider:'👩🏽‍🚀'};
assert.equal(localizedMaterials({...value,materialsEn:'   '},'en'),value.materials);
assert.equal(localizedMaterials(value,'en'),value.materialsEn); assert.equal(localizedMaterials(value,'ua'),value.materials);
assert.equal(renderToStaticMarkup(<ProductMaterials product={{materials:'   ',materialsDivider:'✦'}} locale="ua"/>),'');
for(const locale of ['ua','en'] as const){const html=renderToStaticMarkup(<ProductMaterials product={value} locale={locale}/>);assert.ok(html.includes(translations[locale].materials.heading));assert.ok(html.includes('font-bold'));assert.equal((html.match(/<p /g)??[]).length,2);assert.ok(!html.includes('<script>'));}
pass('UA/EN fallback, paragraphs/line breaks, bold heading, safe plain text and empty-section hiding');
const a={},b={};assert.equal(preferredAnimation([{id:a,ratio:.59,distance:0},{id:b,ratio:.61,distance:80}],null,800),b);
assert.equal(preferredAnimation([{id:a,ratio:.8,distance:90},{id:b,ratio:.8,distance:45}],a,800),a);
assert.equal(preferredAnimation([{id:a,ratio:.8,distance:180},{id:b,ratio:.8,distance:45}],a,800),b);
assert.equal(preferredAnimation([{id:a,ratio:.1,distance:0}],a,800),null);
const tall={getBoundingClientRect:()=>({top:-600,bottom:1200,left:0,right:300,width:300,height:1800})} as HTMLElement;
assert.equal(visibleAnimationCandidate(tall,600,320).ratio,1);
pass('60% visibility, one preferred center candidate, hysteresis, static reset and tall-card constrained viewport eligibility');
const root='docs/review/archive/batch18-before-addendum/';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(hash(root+'batch-1.8-production-candidate.sql'),'691e3774c2e5eaade02e864d14fd8518bdb5e61bf7a86a8731d9c32a9fa4c702');
assert.equal(hash(root+'batch-1.8-variants.sql'),'a7046eadc6eebc858b139ff8b9fa1c9247e3663ba372f035be1cf31d8cbf1569');
const previous=readFileSync(root+'batch-1.8-variants.sql','utf8'),combined=readFileSync('docs/review/batch-1.8-variants.sql','utf8');
const guards=(s:string)=>s.slice(s.indexOf('-- All functions are invoker-rights;'),s.lastIndexOf('COMMIT;')).trim();
assert.equal(guards(previous),guards(combined));
assert.match(combined,/CREATE TYPE public\."ProductOptionMode"/);assert.match(combined,/CREATE TYPE public\."ProductOptionKind"/);
assert.match(combined,/ALTER TABLE public\."Category" ADD CONSTRAINT "Category_parentId_fkey"[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE/);
assert.match(combined,/"materials" TEXT/);assert.match(combined,/"materialsEn" TEXT/);assert.match(combined,/"materialsDivider" VARCHAR\(128\)/);
assert.doesNotMatch(combined,/\bUPDATE public\."Product" SET (?:"?materials|description)/);
pass('exact archived pre-addendum artifacts and all variant SQL guards preserved; combined nullable fields and qualified RESTRICT FK without data backfill');
console.log(`PASS addendum pure/static: ${groups} groups. No DB, network or Production effects.`);
