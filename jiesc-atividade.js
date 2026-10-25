// Datas civis em UTC evitam deslocamentos por horário de verão.
function dataCivilJiesc(texto){
 const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto||''));if(!m)return null;
 const d=+m[1],mes=+m[2],ano=+m[3];if(ano<1)return null;
 const date=new Date(0);date.setUTCFullYear(ano,mes-1,d);date.setUTCHours(0,0,0,0);
 return date.getUTCFullYear()===ano&&date.getUTCMonth()===mes-1&&date.getUTCDate()===d?date.getTime():null;
}
function periodoJiesc(item){
 const texto=String(item?.descricao_detalhes||''),matches=[...texto.matchAll(/!JIESC\(([^)]*)\)/gi)];
 if(matches.length!==1)return null;
 const inicio=dataCivilJiesc(item.data),fim=dataCivilJiesc(matches[0][1]);
 return inicio!==null&&fim!==null&&fim>=inicio&&fim-inicio<=13*86400000?{inicio,fim,comando:matches[0][0]}:null;
}
function atividadeNoDia(item,data){const p=periodoJiesc(item),dia=dataCivilJiesc(data);return p?dia!==null&&dia>=p.inicio&&dia<=p.fim:item.data===data;}
function itemVisualJiesc(item){const p=periodoJiesc(item);return p?{...item,descricao_detalhes:item.descricao_detalhes.replace(p.comando,'')}:item;}
function rotuloPeriodoJiesc(item){
 const p=periodoJiesc(item);if(!p)return '';
 const inicio=new Date(p.inicio),fim=new Date(p.fim),dois=n=>String(n).padStart(2,'0');
 const data=d=>dois(d.getUTCDate())+'/'+dois(d.getUTCMonth()+1);
 if(inicio.getUTCFullYear()!==fim.getUTCFullYear())return data(inicio)+'/'+inicio.getUTCFullYear()+' a '+data(fim)+'/'+fim.getUTCFullYear();
 return (inicio.getUTCMonth()===fim.getUTCMonth()?dois(inicio.getUTCDate()):data(inicio))+' a '+data(fim);
}
(() => {
 const corretorOriginal=new WeakMap();
 function atualizarComandoEditor(input){
  const temComando=/!(?:halloween|minecraft|jiesc)\b/i.test(input.value);
  if(temComando){if(!corretorOriginal.has(input))corretorOriginal.set(input,input.getAttribute('spellcheck'));input.spellcheck=false;}
  else if(corretorOriginal.has(input)){const original=corretorOriginal.get(input);if(original===null)input.removeAttribute('spellcheck');else input.setAttribute('spellcheck',original);corretorOriginal.delete(input);}
  const preview=input.parentElement?.querySelector('.preview-detalhes');if(!preview)return;
  const data=['dia','mes','ano'].map(id=>document.getElementById(id)?.value||'').join('/');
  const valido=!!periodoJiesc({data,descricao_detalhes:input.value});
  preview.querySelectorAll('.jiesc-comando').forEach(span=>span.classList.toggle('jiesc-comando-valido',valido));
  const walker=document.createTreeWalker(preview,NodeFilter.SHOW_TEXT),nos=[];while(walker.nextNode())nos.push(walker.currentNode);
  for(const no of nos){
   if(no.parentElement.closest('.jiesc-comando'))continue;
   const re=/!JIESC\([^)]*\)/gi,frag=document.createDocumentFragment();let m,ultimo=0,achou=false;
   while((m=re.exec(no.textContent))){achou=true;frag.append(document.createTextNode(no.textContent.slice(ultimo,m.index)));const span=document.createElement('span');span.className='jiesc-comando'+(valido?' jiesc-comando-valido':'');span.textContent=m[0];frag.append(span);ultimo=m.index+m[0].length;}
   if(achou){frag.append(document.createTextNode(no.textContent.slice(ultimo)));no.replaceWith(frag);}
  }
 }
 let frameComando=0;function agendarComandoEditor(){if(frameComando)return;frameComando=requestAnimationFrame(()=>{frameComando=0;document.querySelectorAll('textarea[name="entrada-detalhes"]').forEach(atualizarComandoEditor);});}
 document.addEventListener('input',agendarComandoEditor);
 document.addEventListener('change',agendarComandoEditor);
 document.addEventListener('focusin',agendarComandoEditor);
 new MutationObserver(agendarComandoEditor).observe(document.body,{childList:true,subtree:true,characterData:true});
 function cabecalho(card,item){if(!periodoJiesc(item))return;card.querySelector('.card-materia').textContent='JIESC';card.querySelector('.card-prof').textContent=rotuloPeriodoJiesc(item);}
 const proxima=criarCardAtividadeProxima;criarCardAtividadeProxima=function(item){const card=proxima(itemVisualJiesc(item));cabecalho(card,item);if(periodoJiesc(item))card.querySelector('.tag-tipo').textContent=item.tipo||'Outros';return card;};
 const dia=criarCardAtividadeDia;criarCardAtividadeDia=function(item){const resultado=dia(itemVisualJiesc(item));cabecalho(containerAtividades.lastElementChild,item);return resultado;};
 window._aplicarJiescPrevia=(card,texto)=>{
  const data=['dia','mes','ano'].map(id=>document.getElementById(id)?.value||'').join('/');const item={data,descricao_detalhes:texto};
  if(!periodoJiesc(item))return;
  cabecalho(card,item);const detalhes=card.querySelector('.texto-detalhes');const limpo=itemVisualJiesc(item).descricao_detalhes;
  detalhes.innerHTML=limpo.trim()?formatarTextoDescricao(limpo):'sem detalhes';
 };
 document.addEventListener('input',e=>{
  const input=e.target;if(!input.matches('textarea[name="entrada-detalhes"]')||e.isComposing)return;
  const pos=input.selectionStart,antes=input.value.slice(0,pos);if(!/!JIESC$/i.test(antes)||input.value[pos]==='(')return;
  input.setRangeText('(dd/mm/aaaa)',pos,pos,'end');input.setSelectionRange(pos+1,pos+3);input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 document.addEventListener('keydown',e=>{
  const input=e.target;if(!input.matches('textarea[name="entrada-detalhes"]')||!/^\d$/.test(e.key)||e.ctrlKey||e.metaKey||e.altKey)return;
  const pos=input.selectionStart,start=input.value.toUpperCase().lastIndexOf('!JIESC(',pos),end=input.value.indexOf(')',pos);if(start<0||end<0||pos<start+7||pos>=end)return;
  const trecho=input.value.slice(start+7,end);if(!/^[\dd]{2}\/[\dm]{2}\/[\da]{4}$/.test(trecho))return;
  e.preventDefault();let at=pos;if(input.value[at]==='/')at++;
  input.setRangeText(e.key,at,at+1,'end');let proximo=at+1;if(input.value[proximo]==='/')proximo++;
  input.setSelectionRange(proximo,proximo<end?proximo+1:proximo);input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const ns='http://www.w3.org/2000/svg';let seq=0,coresDias=[];
 function atualizarCorDia(d){const secundario=d.outros.length?d.outros[d.indice%d.outros.length]:d.base;d.cell.dataset.jiescTipos=d.base+','+secundario;d.stop?.style.setProperty('stop-color',`rgb(var(--cor-${secundario}-claro))`);d.cell.style.setProperty('--jiesc-brilho',`color-mix(in srgb, rgb(var(--cor-${d.base}-claro)) 50%, rgb(var(--cor-${secundario}-claro)))`);d.cell.style.setProperty('--jiesc-letra',`color-mix(in srgb, rgb(var(--cor-${d.base}-escuro)) 50%, rgb(var(--cor-${secundario}-escuro)))`);}
 setInterval(()=>{if(document.hidden)return;for(const d of coresDias){if(d.outros.length>1){d.indice++;atualizarCorDia(d);}}},3000);
 window.desenharFaixasJiesc=function(calendario){
  const grade=containerDias;if(!grade)return;grade.querySelector('.jiesc-faixas')?.remove();const anteriores=new Map(coresDias.map(d=>[d.cell.dataset.dataCompleta,d.indice]));coresDias=[];
  const cells=[...grade.children].filter(el=>el.tagName==='LI');cells.forEach(c=>c.classList.remove('jiesc-dia'));
  const visivel=a=>['evento','prova'].includes(normalizarTexto(a.tipo))||_filtroExibicao[normalizarTexto(a.local)];
  const periodos=todosDados.filter(a=>periodoJiesc(a)&&visivel(a));if(!periodos.length)return;
  const grupos=[];let grupo=[];
  calendario.forEach((cell,i)=>{const atuais=periodos.filter(a=>atividadeNoDia(a,cell.dataCompleta));const anterior=i?periodos.filter(a=>atividadeNoDia(a,calendario[i-1].dataCompleta)):[];
   const pode=atuais.length&&!cells[i]?.classList.contains('ativo');
   const conecta=pode&&i%7!==0&&grupo.length&&cell.tipo===calendario[i-1].tipo&&atuais.some(a=>anterior.includes(a));
   if(!conecta&&grupo.length){grupos.push(grupo);grupo=[];}if(pode){grupo.push(i);cells[i].classList.add('jiesc-dia');}
  });if(grupo.length)grupos.push(grupo);if(!grupos.length)return;
  const svg=document.createElementNS(ns,'svg');svg.classList.add('jiesc-faixas');svg.setAttribute('aria-hidden','true');const defs=document.createElementNS(ns,'defs');svg.append(defs);grade.append(svg);
  const bounds=grade.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
  for(const indices of grupos){const first=cells[indices[0]].getBoundingClientRect(),last=cells[indices.at(-1)].getBoundingClientRect(),x=first.left-bounds.left,y=first.top-bounds.top,w=last.right-first.left,h=first.height;
   const grad=document.createElementNS(ns,'linearGradient'),id='jiesc-grad-'+(++seq);grad.id=id;grad.setAttribute('x2','100%');
   for(const i of indices){
    const atividades=todosDados.filter(a=>atividadeNoDia(a,calendario[i].dataCompleta)&&visivel(a));
    const base=normalizarTexto(periodos.find(a=>atividadeNoDia(a,calendario[i].dataCompleta)).tipo);
    const outros=[...new Set(atividades.map(a=>normalizarTexto(a.tipo)))].filter(t=>t!==base&&['evento','prova','teste','tarefa','projeto'].includes(t));
    const r=cells[i].getBoundingClientRect(),centro=r.left+r.width/2-first.left;
    const stop=(pos,tipo)=>{const el=document.createElementNS(ns,'stop');el.setAttribute('offset',Math.max(0,Math.min(1,pos/w)));el.style.stopColor=`rgb(var(--cor-${tipo}-claro))`;grad.append(el);return el;};
    stop(centro-h/3,base);const variavel=stop(centro+h/3,base);
    const d={cell:cells[i],base,outros,indice:anteriores.get(calendario[i].dataCompleta)||0,stop:variavel};coresDias.push(d);atualizarCorDia(d);
    // O ciclo comum não deve disputar a cor fixa do JIESC.
    cells[i].classList.remove('dia-com-multiplos-tipos');
   }
   defs.append(grad);
   if(!cells[indices[0]].classList.contains('inativo')){
    const rect=document.createElementNS(ns,'rect');for(const [k,v]of Object.entries({x,y,width:w,height:h,rx:h/2,fill:`url(#${id})`}))rect.setAttribute(k,v);svg.append(rect);
   }
  }
 };
 const render=renderizarCalendario;renderizarCalendario=function(calendario){render(calendario);desenharFaixasJiesc(calendario);window._ultimoCalendarioJiesc=calendario;};
 const navegar=navegarEntreMeses;let trocaFaixas=[];
 navegarEntreMeses=function(dir){
  trocaFaixas.forEach(({animacao,elemento,antigo})=>{animacao.cancel();if(antigo)elemento.remove();});trocaFaixas=[];
  const anterior=containerDias?.querySelector('.jiesc-faixas')?.cloneNode(true);
  const resultado=navegar(dir);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return resultado;
  const atual=containerDias?.querySelector('.jiesc-faixas');
  const animar=(elemento,frames,antigo)=>{const animacao=elemento.animate(frames,{duration:240,easing:'ease-out',fill:'both'});const registro={animacao,elemento,antigo};trocaFaixas.push(registro);animacao.finished.then(()=>{if(antigo)elemento.remove();animacao.cancel();trocaFaixas=trocaFaixas.filter(r=>r!==registro);}).catch(()=>{});};
  if(anterior){anterior.classList.replace('jiesc-faixas','jiesc-faixas-saindo');containerDias.append(anterior);animar(anterior,[{opacity:1,translate:'0px'},{opacity:0,translate:(-dir*6)+'px'}],true);}
  if(atual)animar(atual,[{opacity:0,translate:(dir*6)+'px'},{opacity:1,translate:'0px'}],false);
  return resultado;
 };
 let frame=0;new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(window._ultimoCalendarioJiesc)desenharFaixasJiesc(window._ultimoCalendarioJiesc);});}).observe(document.documentElement);
})();
