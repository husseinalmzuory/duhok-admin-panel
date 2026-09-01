import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json; charset=utf-8'}})
const BUCKET='place-images'

function parseEwkbPoint(hex:any){
  try{
    if(!hex||typeof hex!=='string')return {latitude:null,longitude:null}
    let h=hex.startsWith('\\x')?hex.slice(2):hex
    if(!/^[0-9a-f]+$/i.test(h)||h.length<42)return {latitude:null,longitude:null}
    const bytes=new Uint8Array(h.match(/../g)!.map(x=>parseInt(x,16))); const dv=new DataView(bytes.buffer); const le=bytes[0]===1
    let off=1; let type=dv.getUint32(off,le); off+=4
    const hasSrid=(type&0x20000000)!==0; if(hasSrid)off+=4
    const x=dv.getFloat64(off,le); off+=8; const y=dv.getFloat64(off,le)
    if(!Number.isFinite(x)||!Number.isFinite(y))return {latitude:null,longitude:null}; return {longitude:x,latitude:y}
  }catch{return {latitude:null,longitude:null}}
}
function pointFromAny(c:any){
  if(c&&typeof c==='object'&&Array.isArray(c.coordinates))return {longitude:Number(c.coordinates[0]),latitude:Number(c.coordinates[1])}
  if(typeof c==='string'){
    const m=c.match(/POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)/i); if(m)return {longitude:Number(m[1]),latitude:Number(m[2])}
    return parseEwkbPoint(c)
  }
  return {latitude:null,longitude:null}
}
function slug(v:string){return String(v||'place').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'place'}
function extFrom(file:File){const n=file.name.toLowerCase();if(n.endsWith('.png'))return'png';if(n.endsWith('.webp'))return'webp';return'jpg'}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors})
  const expected = Deno.env.get('DUHOK_ADMIN_SECRET'), supplied = req.headers.get('x-admin-secret')
  if (!expected || !supplied || supplied !== expected) return json({error:'Unauthorized'},401)
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, serviceKey, {auth:{persistSession:false}})
  const action = new URL(req.url).searchParams.get('action') || 'bootstrap'

  async function deleteOnePlace(id:string){
    const placeRes=await sb.from('places').select('image_path').eq('id',id).maybeSingle(); if(placeRes.error)throw placeRes.error
    const imgs=await sb.from('place_images').select('image_path').eq('place_id',id); if(imgs.error)throw imgs.error
    const paths=new Set<string>(); if(placeRes.data?.image_path)paths.add(placeRes.data.image_path); for(const x of(imgs.data||[]))if(x.image_path)paths.add(x.image_path)
    for(const table of ['place_ratings','user_favorites','place_images']){const r=await sb.from(table).delete().eq('place_id',id);if(r.error)throw r.error}
    const del=await sb.from('places').delete().eq('id',id);if(del.error)throw del.error
    if(paths.size){const rr=await sb.storage.from(BUCKET).remove([...paths]);if(rr.error)console.warn(rr.error)}
  }
  async function imagePathFor(placeId:string,kind:string,file:File){
    const p=await sb.from('places').select('id,name_ar,name_en,district_id,subdistrict_id').eq('id',placeId).single();if(p.error)throw p.error
    let dist:any=null,sub:any=null
    if(p.data.district_id){const r=await sb.from('districts').select('name_ar,name_en').eq('id',p.data.district_id).maybeSingle();if(r.error)throw r.error;dist=r.data}
    if(p.data.subdistrict_id){const r=await sb.from('subdistricts').select('name_ar,name_en').eq('id',p.data.subdistrict_id).maybeSingle();if(r.error)throw r.error;sub=r.data}
    const dslug=slug(dist?.name_en||dist?.name_ar||'district-center'), sslug=slug(sub?.name_en||sub?.name_ar||'district-center'), pslug=slug(p.data.name_en||p.data.name_ar||placeId.slice(0,8))
    const stamp=Date.now(),rnd=crypto.randomUUID().slice(0,8),ext=extFrom(file),prefix=kind==='cover'?'cover':'gallery'
    return `duhok/${dslug}/${sslug}/${pslug}/${prefix}_${stamp}_${rnd}.${ext}`
  }

  try {
    if(action==='bootstrap'){
      const [g,d,s,p,imgs]=await Promise.all([
        sb.from('governorates').select('id,name_ar,name_ku,name_en,created_at').order('name_ar'),
        sb.from('districts').select('id,governorate_id,name_ar,name_ku,name_en,created_at').order('name_ar'),
        sb.from('subdistricts').select('id,district_id,name_ar,name_ku,name_en,created_at').order('name_ar'),
        sb.from('places').select('*').order('priority_score',{ascending:false}).order('name_ar'),
        sb.from('place_images').select('*').order('sort_order')
      ])
      for(const r of[g,d,s,p,imgs])if(r.error)throw r.error
      const places=(p.data||[]).map((x:any)=>({...x,...pointFromAny(x.coordinates)})); const categories=[...new Set((p.data||[]).map((x:any)=>x.category).filter(Boolean))].sort()
      return json({governorates:g.data||[],districts:d.data||[],subdistricts:s.data||[],places,categories,images:imgs.data||[]})
    }
    if(req.method!=='POST')return json({error:'Method not allowed'},405)

    if(action==='upload-image'){
      const form=await req.formData(),placeId=String(form.get('place_id')||''),kind=String(form.get('kind')||'gallery'),file=form.get('file')
      if(!placeId||!(file instanceof File))return json({error:'place_id و file مطلوبان'},400)
      if(file.size>5*1024*1024)return json({error:'حجم الصورة يجب ألا يتجاوز 5MB'},400)
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))return json({error:'نوع الصورة غير مدعوم'},400)
      const path=await imagePathFor(placeId,kind,file),up=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error
      const max=await sb.from('place_images').select('sort_order').eq('place_id',placeId).order('sort_order',{ascending:false}).limit(1);if(max.error)throw max.error;const sort=((max.data?.[0]?.sort_order)||0)+1
      if(kind==='cover'){
        const a=await sb.from('place_images').update({is_cover:false}).eq('place_id',placeId);if(a.error)throw a.error
        const ins=await sb.from('place_images').insert({place_id:placeId,image_path:path,sort_order:0,is_cover:true}).select('*').single();if(ins.error)throw ins.error
        const u=await sb.from('places').update({image_path:path,updated_at:new Date().toISOString()}).eq('id',placeId);if(u.error)throw u.error
        return json({ok:true,image:ins.data})
      }
      const ins=await sb.from('place_images').insert({place_id:placeId,image_path:path,sort_order:sort,is_cover:false}).select('*').single();if(ins.error)throw ins.error
      return json({ok:true,image:ins.data})
    }

    const body=await req.json()
    if(action==='create'||action==='update'){
      const place=body.place||{},required=['name_ar','name_ku','name_en','description_ar','description_ku','description_en','category'];for(const k of required)if(!String(place[k]||'').trim())return json({error:`الحقل ${k} مطلوب`},400)
      if(place.priority_score!=null&&(place.priority_score<0||place.priority_score>100))return json({error:'الأولوية يجب أن تكون بين 0 و100'},400)
      if((place.latitude==null)!==(place.longitude==null))return json({error:'يجب إدخال Latitude و Longitude معًا'},400)
      if(place.latitude!=null&&(place.latitude<-90||place.latitude>90))return json({error:'Latitude غير صحيح'},400)
      if(place.longitude!=null&&(place.longitude<-180||place.longitude>180))return json({error:'Longitude غير صحيح'},400)
      const db:any={...place};delete db.latitude;delete db.longitude;if(place.latitude!=null&&place.longitude!=null)db.coordinates=`POINT(${place.longitude} ${place.latitude})`;else if(place.latitude==null&&place.longitude==null)db.coordinates=null;db.updated_at=new Date().toISOString()
      let r:any;if(action==='create')r=await sb.from('places').insert(db).select('id').single();else{if(!body.id)return json({error:'id مطلوب للتعديل'},400);r=await sb.from('places').update(db).eq('id',body.id).select('id').single()}if(r.error)throw r.error;return json({ok:true,id:r.data.id})
    }
    if(action==='delete'){if(!body.id)return json({error:'id مطلوب'},400);await deleteOnePlace(body.id);return json({ok:true})}
    if(action==='bulk-status'){const ids=Array.isArray(body.ids)?body.ids:[];if(!ids.length)return json({error:'لا توجد عناصر محددة'},400);const r=await sb.from('places').update({is_active:!!body.is_active,updated_at:new Date().toISOString()}).in('id',ids);if(r.error)throw r.error;return json({ok:true,count:ids.length})}
    if(action==='bulk-delete'){const ids=Array.isArray(body.ids)?body.ids:[];if(!ids.length)return json({error:'لا توجد عناصر محددة'},400);let deleted=0;for(const id of ids){await deleteOnePlace(id);deleted++}return json({ok:true,deleted})}
    if(action==='images'){if(!body.place_id)return json({error:'place_id مطلوب'},400);const r=await sb.from('place_images').select('*').eq('place_id',body.place_id).order('is_cover',{ascending:false}).order('sort_order');if(r.error)throw r.error;return json({images:r.data||[]})}
    if(action==='set-cover'){
      const r=await sb.from('place_images').select('*').eq('id',body.image_id).eq('place_id',body.place_id).single();if(r.error)throw r.error
      const a=await sb.from('place_images').update({is_cover:false}).eq('place_id',body.place_id);if(a.error)throw a.error
      const b=await sb.from('place_images').update({is_cover:true,sort_order:0}).eq('id',body.image_id);if(b.error)throw b.error
      const c=await sb.from('places').update({image_path:r.data.image_path,updated_at:new Date().toISOString()}).eq('id',body.place_id);if(c.error)throw c.error;return json({ok:true})
    }
    if(action==='delete-image'){
      const r=await sb.from('place_images').select('*').eq('id',body.image_id).eq('place_id',body.place_id).single();if(r.error)throw r.error
      const del=await sb.from('place_images').delete().eq('id',body.image_id);if(del.error)throw del.error
      const rm=await sb.storage.from(BUCKET).remove([r.data.image_path]);if(rm.error)console.warn(rm.error)
      if(r.data.is_cover){const next=await sb.from('place_images').select('*').eq('place_id',body.place_id).order('sort_order').limit(1).maybeSingle();if(next.error)throw next.error;if(next.data){await sb.from('place_images').update({is_cover:true,sort_order:0}).eq('id',next.data.id);await sb.from('places').update({image_path:next.data.image_path,updated_at:new Date().toISOString()}).eq('id',body.place_id)}else await sb.from('places').update({image_path:null,updated_at:new Date().toISOString()}).eq('id',body.place_id)}
      return json({ok:true})
    }
    if(action==='reorder-images'){const ids=Array.isArray(body.ordered_ids)?body.ordered_ids:[];for(let i=0;i<ids.length;i++){const r=await sb.from('place_images').update({sort_order:i+1}).eq('id',ids[i]).eq('place_id',body.place_id);if(r.error)throw r.error}return json({ok:true})}

    const typeMap:any={governorate:{table:'governorates',parent:null},district:{table:'districts',parent:'governorate_id'},subdistrict:{table:'subdistricts',parent:'district_id'}}
    if(action==='unit-create'||action==='unit-update'){
      const cfg=typeMap[body.type];if(!cfg)return json({error:'نوع المنطقة غير صحيح'},400);for(const k of['name_ar','name_ku','name_en'])if(!String(body[k]||'').trim())return json({error:'الأسماء الثلاثة مطلوبة'},400)
      const db:any={name_ar:body.name_ar.trim(),name_ku:body.name_ku.trim(),name_en:body.name_en.trim()};if(cfg.parent){if(!body.parent_id)return json({error:'المنطقة الأم مطلوبة'},400);db[cfg.parent]=body.parent_id}
      const r=action==='unit-create'?await sb.from(cfg.table).insert(db):await sb.from(cfg.table).update(db).eq('id',body.id);if(r.error)throw r.error;return json({ok:true})
    }
    if(action==='unit-delete'){
      const cfg=typeMap[body.type];if(!cfg||!body.id)return json({error:'بيانات الحذف غير مكتملة'},400)
      if(body.type==='governorate'){const a=await sb.from('districts').select('id',{count:'exact',head:true}).eq('governorate_id',body.id);const b=await sb.from('places').select('id',{count:'exact',head:true}).eq('governorate_id',body.id);if((a.count||0)+(b.count||0)>0)return json({error:'لا يمكن حذف المحافظة لوجود أقضية أو أماكن مرتبطة بها'},409)}
      if(body.type==='district'){const a=await sb.from('subdistricts').select('id',{count:'exact',head:true}).eq('district_id',body.id);const b=await sb.from('places').select('id',{count:'exact',head:true}).eq('district_id',body.id);if((a.count||0)+(b.count||0)>0)return json({error:'لا يمكن حذف القضاء لوجود نواحٍ أو أماكن مرتبطة به'},409)}
      if(body.type==='subdistrict'){const b=await sb.from('places').select('id',{count:'exact',head:true}).eq('subdistrict_id',body.id);if((b.count||0)>0)return json({error:'لا يمكن حذف الناحية لوجود أماكن مرتبطة بها'},409)}
      const r=await sb.from(cfg.table).delete().eq('id',body.id);if(r.error)throw r.error;return json({ok:true})
    }
    return json({error:'Unknown action'},404)
  } catch (e:any) { console.error(e); return json({error:e?.message || String(e)},500) }
})
