// Wrap very long JS lines so the read tool can show full content.
const fs=require('fs');
const file=process.argv[2],from=Number(process.argv[3]||1),to=Number(process.argv[4]||1e9),width=Number(process.argv[5]||150);
const lines=fs.readFileSync(file,'utf8').split('\n');
const out=[];
lines.forEach((line,i)=>{
  const n=i+1;if(n<from||n>to)return;
  if(line.length<=width){out.push(n+': '+line);return;}
  for(let k=0;k<line.length;k+=width)out.push((k===0?n+': ':`${n}+${k}: `)+line.slice(k,k+width));
});
process.stdout.write(out.join('\n')+'\n');
