const [route, json] = process.argv.slice(2);
const result = await fetch(`http://127.0.0.1:17388${route}`, json ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json } : {});
console.log(await result.text());
if (!result.ok) process.exitCode = 1;
