export const OWNER='ngocvietai@gmail.com',ADMIN='tamsua16@gmail.com';
export const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export const mail=s=>String(s||'').trim().toLowerCase();
export async function readBody(request){let text=await request.text();if(text.length>2000000)fail('Dữ liệu quá lớn.',413);try{return JSON.parse(text)}catch{fail('Dữ liệu không hợp lệ.');}}
