// Only user-visible answer content counts toward the first-answer / stall deadlines.
export function answerProgress(){
 const decoder=new TextDecoder();let pending='';
 return chunk=>{
  pending+=decoder.decode(chunk,{stream:true});let progressed=false,index;
  while((index=pending.indexOf('\n'))!==-1){
   const line=pending.slice(0,index).trim();pending=pending.slice(index+1);
   if(!line.startsWith('data:'))continue;
   const data=line.slice(5).trim();if(data==='[DONE]')continue;
   try{const event=JSON.parse(data);const content=event.choices?.[0]?.delta?.content??event.response;if(typeof content==='string'&&content.length)progressed=true;}catch{/* Incomplete or malformed events cannot count as an answer. */}
  }return progressed;
 };
}
