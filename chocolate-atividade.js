// Card de chocolate e sua lista opcional de sabores.
(() => {
 const especial = texto => typeof texto === 'string' && /!chocolate\b/i.test(texto);
 const ativos = new Map();
 const listas = new WeakMap(), vinculados = new WeakSet(), timers = new WeakMap();
 const formato = formatarTextoDescricao;
 formatarTextoDescricao = texto => formato(typeof texto === 'string' ? _lerChocolate(texto).texto : texto);
 const contar = _contarCaracteresUteis;
 _contarCaracteresUteis = (texto,ignorarComandos=false) => contar(ignorarComandos?_lerChocolate(texto).texto:texto,ignorarComandos);
 function remover(card) {
  clearTimeout(timers.get(card));timers.delete(card);
  window._fecharSaboresChocolate(card);
  const host = ativos.get(card);
  host?.pararGotas?.();
  host?.remove();
  card.querySelector(':scope > .ch-decor')?.remove();
  card.classList.remove('ch-card','ch-derretido');
  ativos.delete(card);
 }
 function aplicar(card, texto) {
  if (!card) return card;
  if (!especial(texto)) { if (ativos.has(card)) remover(card); return card; }
  card.classList.add('ch-card','ch-derretido');
  card.querySelector('.card-materia').textContent = 'AMIGO CHOCOLATE';
  card.querySelector('.card-prof').textContent = 'quem será seu amigo?';
  listas.set(card,_lerChocolate(texto).entradas);
  if(!vinculados.has(card)){
   vinculados.add(card);
   const titulo=card.querySelector('.card-titulo');let abrindo=false;
   titulo.addEventListener('click',()=>{abrindo=card.classList.contains('ch-card')&&!card.classList.contains('aberto');},true);
   titulo.addEventListener('click',()=>{
    clearTimeout(timers.get(card));timers.delete(card);
    if(abrindo&&card.classList.contains('aberto')&&listas.get(card)?.length){
     timers.set(card,setTimeout(()=>{
      timers.delete(card);
      if(card.isConnected&&card.classList.contains('ch-card')&&card.classList.contains('aberto')&&listas.get(card)?.length)window._mostrarSaboresChocolate(card,listas.get(card));
     },500));
    }
    else if(!card.classList.contains('aberto'))window._fecharSaboresChocolate(card);
   });
  }
  if (!ativos.has(card)) {
   const decor = document.createElement('div');
   decor.className = 'ch-decor'; decor.setAttribute('aria-hidden','true');
   decor.innerHTML = '<div class="ch-decor ch-tablete">' + '<i></i>'.repeat(30) + '</div>';
   const gotas = document.createElement('div');
   gotas.className = 'ch-pingos-fora'; gotas.setAttribute('aria-hidden','true');
   card.prepend(decor); card.append(gotas);
   ativos.set(card,gotas); prepararGotasChocolate(gotas);
  }
  return card;
 }
 window._aplicarChocolatePrevia = aplicar;
 // A área visual não gera camadas animadas de integrado por baixo do chocolate.
 const visual = item => especial(item?.descricao_detalhes) ? {...item,area:'HUMANAS'} : item;
 const proxima = criarCardAtividadeProxima;
 criarCardAtividadeProxima = item => aplicar(proxima(visual(item)),item?.descricao_detalhes);
 const dia = criarCardAtividadeDia;
 criarCardAtividadeDia = function(item) {
  const resultado = dia(visual(item));
  aplicar(containerAtividades?.querySelector('.card-atividade:last-child'),item?.descricao_detalhes);
  return resultado;
 };
 function editor(input) {
  const preview = input.parentElement?.querySelector('.preview-detalhes');
  if (!preview) return;
  const walker = document.createTreeWalker(preview,NodeFilter.SHOW_TEXT),nos=[];
  while (walker.nextNode()) nos.push(walker.currentNode);
  for (const no of nos) {
   if (no.parentElement.closest('.ch-comando')) continue;
   const regex=/!chocolate\b/gi,frag=document.createDocumentFragment();
   let m,ultimo=0,achou=false;
   while ((m=regex.exec(no.textContent))) {
    achou=true; frag.append(document.createTextNode(no.textContent.slice(ultimo,m.index)));
    const span=document.createElement('span');span.className='ch-comando';span.textContent=m[0];
    span.spellcheck=false;frag.append(span);ultimo=m.index+m[0].length;
   }
   if (achou) {frag.append(document.createTextNode(no.textContent.slice(ultimo)));no.replaceWith(frag);}
  }
 }
 let frame=0;
 new MutationObserver(() => {
  if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;
   for(const card of ativos.keys()) if(!card.isConnected)remover(card);
   document.querySelectorAll('textarea[name="entrada-detalhes"]').forEach(editor);
  });
 }).observe(document.body,{subtree:true,childList:true,characterData:true});
 document.addEventListener('input',e=>{if(e.target.matches('textarea[name="entrada-detalhes"]'))editor(e.target);});
})();
