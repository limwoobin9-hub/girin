import { assessmentKey } from "@/lib/ranking";

type Item = { id: number; kind:"hw"|"exam"; title:string; due_at:string|null; open_at:string|null; score:number|null };
type RankBatch = {
  scores:Record<string,number[]>; assigned:Record<string,number>; submitted:Record<string,number>;
  checked:number; unavailable:number; totalBatches:number; totalStudents:number;
};
export type RankCollection = {
  scores:Record<string,number[]>; assigned:Record<string,number>; submitted:Record<string,number>;
  unavailable:number; totalStudents:number; checked:number;
};
const cache = new Map<string, { until:number; value:RankCollection }>();
export async function loadProfileRankings(items:Item[],onProgress:(done:number,total:number)=>void):Promise<RankCollection>{
  const keys=[...new Set(items.map(assessmentKey))].sort();
  const cacheKey=keys.join("|");
  const memo=cache.get(cacheKey);
  if(memo && memo.until>Date.now()){onProgress(memo.value.checked,memo.value.totalStudents);return memo.value;}
  const storageKey="girin:profile-rankings:"+cacheKey;
  if(typeof window!=="undefined")try{
    const raw=sessionStorage.getItem(storageKey);
    if(raw){
      const saved=JSON.parse(raw) as { until:number;value:RankCollection };
      if(saved.until>Date.now() && saved.value?.scores){
        cache.set(cacheKey,saved);onProgress(saved.value.checked,saved.value.totalStudents);return saved.value;
      }
    }
  }catch{}
  if(!keys.length)return {scores:{},assigned:{},submitted:{},unavailable:0,totalStudents:0,checked:0};
  const groups:string[][]=[];
  for(let i=0;i<keys.length;i+=100)groups.push(keys.slice(i,i+100));
  const output:RankCollection={scores:Object.fromEntries(keys.map(k=>[k,[]])),
    assigned:Object.fromEntries(keys.map(k=>[k,0])),submitted:Object.fromEntries(keys.map(k=>[k,0])),
    unavailable:0,totalStudents:0,checked:0};
  let groupsProcessed=0;
  for(const group of groups){
    let batches=1,next=0,done=0,unavailable=0,total=0;
    const fetchBatch=async(batch:number)=>{
      const response=await fetch("/api/rankings/batch",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:"__profile__",batch,keys:group}),cache:"no-store"});
      const data=await response.json() as RankBatch & {error?:string};
      if(!response.ok)throw new Error(data.error||"성적 분석을 불러오지 못했습니다.");
      if(!Number.isInteger(data.totalBatches)||data.totalBatches<1||data.totalBatches>100 ||
         !Number.isInteger(data.checked)||!data.scores||typeof data.scores!=="object")throw new Error("성적 자료 형식 오류");
      for(const key of group){
        if(!Array.isArray(data.scores[key]))throw new Error("문항 점수 목록 오류");
        output.scores[key].push(...data.scores[key]);
        output.assigned[key]+=(data.assigned[key]??0);
        output.submitted[key]+=(data.submitted[key]??0);
      }
      unavailable+=data.unavailable;done+=data.checked;total=data.totalStudents;
      onProgress(groupsProcessed*total+done,groups.length*total);
      return data.totalBatches;
    };
    batches=await fetchBatch(0);
    next=1;
    await Promise.all(Array.from({length:Math.min(5,batches-1)},async()=>{
      while(next<batches)await fetchBatch(next++);
    }));
    output.unavailable=Math.max(output.unavailable,unavailable);
    output.totalStudents=total;output.checked=done;
    groupsProcessed++;
  }
  const item={until:Date.now()+3*60*1000,value:output};
  cache.set(cacheKey,item);
  if(typeof window!=="undefined")try{sessionStorage.setItem(storageKey,JSON.stringify(item));}catch{}
  return output;
}
