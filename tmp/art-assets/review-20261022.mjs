import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='D:/Projects/mihuayou/gamehack2026';
const path=root+'/outputs/01a0bf14-7f85-7282-bb8d-672064556a58/美术资产清单.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
console.log((await wb.inspect({kind:'workbook,sheet,table',maxChars:3500,tableMaxRows:2,tableMaxCols:9})).ndjson);
const dump={};
for(let i=0;i<wb.worksheets.items.length;i++){const s=wb.worksheets.getItemAt(i);dump[s.name]=s.getUsedRange().values;}
await fs.writeFile(root+'/tmp/art-assets/review-before.json',JSON.stringify(dump,null,2));
for(const [name,rows] of Object.entries(dump)){console.log(name,JSON.stringify(rows.slice(0,6)));if(name==='美术资产清单')console.log(JSON.stringify(rows.slice(5).map(r=>[r[0],r[1],r[2],r[4],r[8]])));}
const image=await wb.render({sheetName:'美术资产清单',range:'A120:I125',scale:1,format:'png'});
await fs.writeFile(root+'/tmp/art-assets/review-before.png',new Uint8Array(await image.arrayBuffer()));
