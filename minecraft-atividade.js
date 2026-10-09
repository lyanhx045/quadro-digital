
(() => {
const especial=texto=>typeof texto==='string'&&/!minecraft\b/i.test(texto);
const originalFormato=formatarTextoDescricao;
formatarTextoDescricao=texto=>originalFormato(typeof texto==='string'?texto.replace(/!minecraft\b/gi,''):texto);
const texturas={};let texturasProntas=false;
Promise.all(['grass_side_carried','dirt','stone','deepslate','bedrock','diamond_ore','gold_ore','coal_ore','gravel','stone_andesite','stone_granite','iron_ore','copper_ore','redstone_ore','lapis_ore','tuff','deepslate_diamond_ore','deepslate_iron_ore'].map(nome=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{texturas[nome]=img;resolve()};img.onerror=()=>reject(new Error('Textura não carregada: '+nome));img.src='minecraft-texturas/'+nome+'.png'}))).then(()=>{texturasProntas=true;document.querySelectorAll('.mc-terreno').forEach(canvas=>{canvas.width=0;pintar(canvas,0)})});
function pintar(canvas,tipo,animar=false){
 const w=Math.round(canvas.clientWidth),h=Math.ceil(_vhFixoEmPx(15)+33.5+17+8.5+11.75+(canvas.parentElement.classList.contains('estado-com-anexo')?76.75+6.75:0));if(!texturasProntas||!w||(!animar&&canvas.width===w&&canvas.height===h))return;if(canvas.width!==w)canvas.width=w;canvas.height=h;canvas.style.height=h+'px';
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const sky=c.createLinearGradient(0,0,0,80);sky.addColorStop(0,'#77a6f7');sky.addColorStop(1,'#c8dcf3');c.fillStyle=sky;c.fillRect(0,0,w,h);
 const deslocamento=performance.now()/1000*3;
 c.fillStyle='#dce9fa';for(const nuvem of [[w-97,20,68],[90,35,44]]){const x=((nuvem[0]+deslocamento+100)%(w+100))-100;for(const copia of [x,x-w-100]){c.fillRect(Math.floor(copia),nuvem[1],nuvem[2],10);c.fillRect(Math.floor(copia+18),nuvem[1]-8,13,8)}}
 c.fillStyle='#bcd3f5';c.fillRect(18,12,29,29);c.fillStyle='#e4eefc';c.fillRect(22,16,21,21);c.fillStyle='#fff';c.fillRect(26,20,13,13);
 const tamanho=16,ultimaLinha=Math.floor((h-1)/tamanho);
 const hash=(x,y,s=0)=>{let n=Math.imul(x+31,374761393)^Math.imul(y+71,668265263)^Math.imul(s+11,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296};
 const bolsao=(x,y,s)=>hash(Math.floor(x/3),Math.floor(y/2),s);
 for(let coluna=0;coluna*tamanho<w;coluna++){
  const superficie=4+(Math.sin(coluna*.24)>.65?1:0),terra=5+Math.round(Math.sin(coluna*.49)+Math.cos(coluna*.21)),profundidade=ultimaLinha-5+Math.round(Math.sin(coluna*.29)*1.5);
  for(let linha=superficie;linha*tamanho<h;linha++){
   let textura='stone';const r=hash(coluna,linha,5),patch=bolsao(coluna,linha,2);
   if(linha===superficie)textura='grass_side_carried';
   else if(linha<superficie+terra)textura='dirt';
   else if(linha===superficie+terra&&r<.48)textura='dirt';
   else if(linha>=profundidade){textura='deepslate';if(linha===profundidade&&r<.5)textura='stone';else if(patch<.18)textura='tuff';else if(r<.045)textura='deepslate_diamond_ore';else if(r>.93)textura='deepslate_iron_ore';}
   else if(patch<.12)textura='gravel';else if(patch<.25)textura='stone_andesite';else if(patch<.37)textura='stone_granite';
   if(textura==='stone'){const veio=bolsao(coluna,linha,9);if(r<.25){if(veio<.17)textura='coal_ore';else if(veio<.31)textura='iron_ore';else if(veio<.44)textura='copper_ore';else if(veio<.52&&linha>9)textura='gold_ore';else if(veio<.59&&linha>10)textura='lapis_ore';else if(veio<.64&&linha>10)textura='redstone_ore';}}
   if(linha>=ultimaLinha||(linha===ultimaLinha-1&&r<.78)||(linha===ultimaLinha-2&&r<.25))textura='bedrock';
   c.drawImage(texturas[textura],coluna*tamanho,linha*tamanho,tamanho,tamanho);
  }
 }
}

const preparados=new Map();
function aplicar(card,texto){
 if(!card)return card;
 if(!especial(texto)){if(card.classList.contains('mc-card')){card.classList.remove('mc-card');card.querySelector('.mc-terreno')?.remove();window._definirPixelCard?.(card,false);}return card;}
 card.classList.add('mc-card');
 if(!card.querySelector('.mc-terreno')){const canvas=document.createElement('canvas');canvas.className='mc-terreno';canvas.setAttribute('aria-hidden','true');card.prepend(canvas);}
 if(!preparados.has(card)){
  let aberto=false;
  const observer=new MutationObserver(()=>{const atual=card.classList.contains('aberto')&&card.classList.contains('mc-card');if(atual!==aberto){aberto=atual;window._definirPixelCard?.(card,atual);}});observer.observe(card,{attributes:true,attributeFilter:['class']});
  const resize=new ResizeObserver(()=>{const canvas=card.querySelector('.mc-terreno');if(canvas)pintar(canvas,0);});resize.observe(card);
  preparados.set(card,{observer,resize});
 }
 const canvas=card.querySelector('.mc-terreno');pintar(canvas,0);
 if(card.classList.contains('aberto'))window._definirPixelCard?.(card,true);
 return card;
}
window._aplicarMinecraftPrevia=aplicar;
const proxima=criarCardAtividadeProxima;criarCardAtividadeProxima=item=>aplicar(proxima(item),item?.descricao_detalhes);
const dia=criarCardAtividadeDia;criarCardAtividadeDia=function(item){const resultado=dia(item);aplicar(containerAtividades?.querySelector('.card-atividade:last-child'),item?.descricao_detalhes);return resultado;};
function editor(input){const preview=input.parentElement?.querySelector('.preview-detalhes');if(!preview)return;const walker=document.createTreeWalker(preview,NodeFilter.SHOW_TEXT),nos=[];while(walker.nextNode())nos.push(walker.currentNode);for(const no of nos){if(no.parentElement.closest('.mc-comando'))continue;const re=/!minecraft\b/gi;let m,ultimo=0,achou=false;const frag=document.createDocumentFragment();while((m=re.exec(no.textContent))){achou=true;frag.append(document.createTextNode(no.textContent.slice(ultimo,m.index)));const span=document.createElement('span');span.className='mc-comando';span.textContent=m[0];frag.append(span);ultimo=m.index+m[0].length;}if(achou){frag.append(document.createTextNode(no.textContent.slice(ultimo)));no.replaceWith(frag);}}}
let frame=0;new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;document.querySelectorAll('textarea[name="entrada-detalhes"]').forEach(editor);for(const [card,observers]of preparados){if(!card.isConnected){observers.observer.disconnect();observers.resize.disconnect();preparados.delete(card);window._definirPixelCard?.(card,false);}}});}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('input',e=>{if(e.target.matches('textarea[name="entrada-detalhes"]'))editor(e.target);});
setInterval(()=>{if(document.hidden)return;for(const card of preparados.keys()){const canvas=card.querySelector('.mc-terreno');if(card.isConnected&&canvas)pintar(canvas,0,true);}},100);
})();
