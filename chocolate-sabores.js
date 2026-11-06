// Lista opcional de sabores do comando !chocolate.
(() => {
 const normalizar = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
 window._lerChocolate = function(texto) {
  texto=String(texto||'');
  const comando=/!chocolate\b/gi,entradas=[],partes=[];
  let m,ultimo=0;
  while((m=comando.exec(texto))){
   let fim=comando.lastIndex;
   const abertura=/^\s*:\s*\(\s*/.exec(texto.slice(fim));
   if(abertura){
    let pos=fim+abertura[0].length;const itens=[];
    while(pos<=texto.length){
     const fechamento=/^\s*\.?\s*\)/.exec(texto.slice(pos));
     if(fechamento){fim=pos+fechamento[0].length;entradas.push(...itens);break;}
     const par=/^\s*("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*/.exec(texto.slice(pos));
     if(!par)break;
     try{const nome=JSON.parse(par[1]).trim(),sabor=JSON.parse(par[2]).trim();if(!nome||!sabor)break;itens.push({nome,sabor});}catch{break;}
     pos+=par[0].length;
     if(texto[pos]===';')pos++;
     else if(!/^\s*\.?\s*\)/.test(texto.slice(pos)))break;
    }
   }
   partes.push(texto.slice(ultimo,m.index));ultimo=fim;comando.lastIndex=fim;
  }
  partes.push(texto.slice(ultimo));
  return {texto:partes.join(''),entradas};
 };
 let atual=null;
 window._mostrarSaboresChocolate = function(card,entradas) {
  if(!entradas?.length)return;
  atual?.fechar(false);
  const origem=card.querySelector('.card-titulo');
  const overlay=document.createElement('div');overlay.className='modal-overlay aberto ch-sabores-overlay';
  overlay.innerHTML=`<div class="modal-manual ch-sabores" role="dialog" aria-modal="true" aria-labelledby="ch-sabores-titulo">
   <div class="ch-sabores-container"><header class="topo-modal-manual">
    <button class="fechar" type="button" aria-label="Fechar sabores"><svg class="icone-fechar" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    <h2 id="ch-sabores-titulo">sabores</h2></header>
    <div class="ch-nome-campo"><input class="ch-nome" type="text" placeholder="seu amigo chocolate" aria-label="Seu amigo chocolate" autocomplete="off" spellcheck="false" aria-describedby="ch-sabor-resultado"><div class="ch-nome-visor" aria-hidden="true"></div></div>
    <p id="ch-sabor-resultado" class="ch-sabor-resultado" role="status" aria-live="polite">Gosto de chocolate...</p>
   </div></div>`;
  const input=overlay.querySelector('input'),visor=overlay.querySelector('.ch-nome-visor'),saida=overlay.querySelector('.ch-sabor-resultado'),painel=overlay.firstElementChild,botao=overlay.querySelector('.fechar');
  let sugestao=null,fechado=false;
  function atualizar(){
   const digitado=input.value,chave=normalizar(digitado),focado=document.activeElement===input;
   sugestao=chave?entradas.find(item=>normalizar(item.nome).startsWith(chave)):null;
   const encontrado=entradas.find(item=>normalizar(item.nome)===chave);
   saida.textContent=encontrado?encontrado.sabor:chave&&!sugestao?'Nenhum sabor informado para esse nome.':'Gosto de chocolate...';
   visor.replaceChildren();visor.classList.toggle('input-focado',focado);
   if(!digitado){const span=document.createElement('span');span.className='texto-sugestao';span.textContent=input.placeholder;visor.append(span);return;}
   const span=document.createElement('span');span.className='texto-digitado';
   const cursor=input.selectionStart??digitado.length;
   span.append(document.createTextNode(digitado.slice(0,cursor)));
   if(focado){const caret=document.createElement('span');caret.className='cursor-falso';span.append(caret);}
   span.append(document.createTextNode(digitado.slice(cursor)));visor.append(span);
   if(sugestao){const resto=document.createElement('span');resto.className='texto-sugestao';resto.textContent=sugestao.nome.slice(digitado.length);visor.append(resto);}
  }
  function completar(){if(sugestao){input.value=sugestao.nome;input.setSelectionRange(input.value.length,input.value.length);}atualizar();}
  const selecionar=()=>{if(document.activeElement===input)atualizar();};
  function fechar(restaurar=true){
   if(fechado)return;fechado=true;
   overlay.classList.remove('aberto');painel.classList.add('saindo');
   document.removeEventListener('selectionchange',selecionar);
   if(atual?.overlay===overlay)atual=null;
   setTimeout(()=>overlay.remove(),300);
   if(restaurar&&origem.isConnected)origem.focus({preventScroll:true});
  }
  input.addEventListener('input',atualizar);input.addEventListener('focus',atualizar);input.addEventListener('blur',completar);
  input.addEventListener('keydown',e=>{
   if((e.key==='Enter'||e.key==='Tab'||(e.key==='ArrowRight'&&input.selectionStart===input.value.length))&&sugestao){if(e.key!=='Tab')e.preventDefault();completar();}
  });
  overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fechar();}
   if(e.key==='Tab'){
    if(e.shiftKey&&document.activeElement===botao){e.preventDefault();input.focus();}
    else if(!e.shiftKey&&document.activeElement===input){e.preventDefault();botao.focus();}
   }
  });
  botao.addEventListener('click',()=>fechar());overlay.addEventListener('click',e=>{if(e.target===overlay)fechar();});
  document.addEventListener('selectionchange',selecionar);
  document.body.append(overlay);atual={overlay,fechar,card};atualizar();
  requestAnimationFrame(()=>{if(!fechado)input.focus({preventScroll:true});});
 };
 window._fecharSaboresChocolate = card => {if(atual?.card===card)atual.fechar(false);};
})();
