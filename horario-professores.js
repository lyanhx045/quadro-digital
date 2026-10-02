(() => {
 const original=abrirModalManual;
 abrirModalManual=function(aba,...args){
  if((aba==='btn-material'||!aba)&&document.querySelector('#material-horario.material-aberto'))return carregarEAbrir();
  return original(aba,...args);
 };
 let carregando=false;
 async function carregarEAbrir(){
  if(carregando)return;carregando=true;
  try{const resposta=await fetch('/api/grade-aulas');if(!resposta.ok)throw Error('Não foi possível carregar os horários');const grade=await resposta.json();abrir(grade);}
  catch(erro){console.error(erro);original('btn-material');}
  finally{carregando=false;}
 }
 function abrir(grade){
  document.getElementById('horario-professores-overlay')?.remove();

  const nomes=[...new Set(grade.filter(a=>a.professor?.trim()).map(a=>a.professor.trim()))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  let dia=_diaUtilHoje(),indice=0;
  const overlay=document.createElement('div');overlay.id='horario-professores-overlay';overlay.className='modal-overlay aberto';
  // Clona o cabeçalho do modal e as setas existentes no horário.
  original('btn-material');
  const nativo=document.querySelector('#modal-manual-overlay');
  const topo=nativo.querySelector('.topo-modal-manual').cloneNode(true);
  nativo.querySelector('#botao-fechar-manual').click();
  topo.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  topo.querySelector('button').classList.add('hp-fechar');topo.querySelector('button').setAttribute('aria-label','Fechar');
  overlay.innerHTML='<section class="modal-manual horario-professores" role="dialog" aria-modal="true" aria-label="Horário dos professores"><main class="hp-conteudo"><ul class="hp-lista"></ul></main></section>';
  const modal=overlay.firstElementChild,listaModal=modal.querySelector('.hp-lista');listaModal.append(topo);
  for(const [tipo,anterior,proximo] of [['dias','Dia anterior','Próximo dia'],['professores','Professor anterior','Próximo professor']]){
   const linha=document.createElement('li');linha.className='hp-seletor hp-'+tipo;
   for(const [id,label] of [['btn-dia-prev',anterior],['btn-dia-next',proximo]]){
    const btn=document.getElementById(id).cloneNode(true);btn.removeAttribute('id');btn.setAttribute('aria-label',label);linha.append(btn);
    if(id==='btn-dia-prev'){const h=document.createElement('h3');linha.append(h)}
   }
   listaModal.append(linha);
  }
  const linhas=document.createElement('li');linhas.className='hp-grade';listaModal.append(linhas);
  const painel=document.createElement('li');painel.className='hp-painel manual-atividade';
  Array.from(listaModal.children).filter(el=>el!==topo).forEach(el=>painel.append(el));listaModal.append(painel);
  document.body.append(overlay);
  const ajustarSetas=()=>{const base=document.getElementById("btn-dia-prev");if(!base)return;const estilo=getComputedStyle(base);overlay.querySelectorAll(".hp-seletor .btn-dia").forEach(btn=>{btn.style.width=estilo.width;btn.style.minWidth=estilo.width;btn.style.maxWidth=estilo.width;btn.style.flexBasis=estilo.width;btn.style.height="30px";});};
  ajustarSetas(); const tamanhoSetas=new ResizeObserver(ajustarSetas);tamanhoSetas.observe(document.getElementById("btn-dia-prev"));

  const fechar=()=>{tamanhoSetas.disconnect();modal.classList.add('saindo');overlay.classList.add('saindo');setTimeout(()=>overlay.remove(),250);document.removeEventListener('keydown',tecla);document.getElementById('botao-acao-topo')?.focus()};
  function tecla(e){if(e.key==='Escape')fechar()};document.addEventListener('keydown',tecla);
  modal.querySelector('.hp-fechar').onclick=fechar;overlay.onclick=e=>{if(e.target===overlay)fechar()};
  const trocar=(grupo,dir)=>{if(grupo==='dia')dia=(dia-1+dir+5)%5+1;else if(nomes.length)indice=(indice+dir+nomes.length)%nomes.length;render(dir,grupo)};
  for(const [selector,grupo] of [['.hp-dias','dia'],['.hp-professores','professor']]){
   const el=modal.querySelector(selector);const buttons=el.querySelectorAll('button');buttons[0].onclick=()=>trocar(grupo,-1);buttons[1].onclick=()=>trocar(grupo,1);
   el.tabIndex=0;el.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();trocar(grupo,e.key==='ArrowLeft'?-1:1)}};
   let origem;el.addEventListener('pointerdown',e=>{origem=e.clientX});el.addEventListener('pointerup',e=>{if(origem!=null&&Math.abs(e.clientX-origem)>35)trocar(grupo,e.clientX<origem?1:-1);origem=null});el.addEventListener('pointercancel',()=>origem=null);
  }
  function animar(el,antes,dir){
   if(!dir||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
   el.getAnimations().filter(a=>!('animationName' in a)).forEach(a=>a.cancel());
   el.parentElement.querySelectorAll(':scope > .hp-saindo').forEach(e=>e.remove());
   const titulo=el.tagName==='H3',entrada=titulo?30:55,saida=titulo?30:75;
   const pai=el.parentElement,caixa=el.getBoundingClientRect(),origem=pai.getBoundingClientRect();
   antes.classList.add('hp-saindo');antes.setAttribute('aria-hidden','true');
   Object.assign(antes.style,{position:'absolute',left:(caixa.left-origem.left)+'px',top:(caixa.top-origem.top)+'px',width:caixa.width+'px',height:caixa.height+'px',margin:'0',pointerEvents:'none'});
   pai.append(antes);
   const paletaAtual=el.getAnimations().find(a=>a.animationName==='hp-paleta-editor');
   const paletaSaindo=antes.getAnimations().find(a=>a.animationName==='hp-paleta-editor');
   if(paletaAtual&&paletaSaindo)paletaSaindo.currentTime=paletaAtual.currentTime;
   const antiga=antes.animate([{transform:'translateX(0) scale(1)',opacity:1},{transform:`translateX(${-dir*saida}%) scale(.5)`,opacity:0}],{duration:380,easing:'cubic-bezier(.4,0,.2,1)'});
   antiga.onfinish=()=>antes.remove();
   el.animate([{transform:`translateX(${dir*entrada}%) scale(.5)`,opacity:0},{transform:'translateX(0) scale(1)',opacity:1}],{duration:380,easing:'cubic-bezier(.4,0,.2,1)'});
  }
  function render(dir=0,grupo){
   const tituloAnterior=modal.querySelector('.hp-professores h3'),professorAnterior=tituloAnterior.cloneNode(true),estiloAnterior=getComputedStyle(tituloAnterior);
   for(const propriedade of ['background-color','background-image','background-size','background-position','text-shadow'])professorAnterior.style.setProperty(propriedade,estiloAnterior.getPropertyValue(propriedade),'important');
   professorAnterior.style.transition='none';
   const contagem=new Map();grade.filter(a=>a.professor?.trim()===nomes[indice]).forEach(a=>{const area=(a.area||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');if(area)contagem.set(area,(contagem.get(area)||0)+1);});
   const dominante=[...contagem].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'principal-escuro';
   const seletorProfessor=modal.querySelector('.hp-professores');seletorProfessor.dataset.area=dominante;seletorProfessor.querySelector('h3').dataset.textoBrilho=nomes[indice]||'';seletorProfessor.style.setProperty('--cor-professor',`var(--cor-${dominante})`);

   if(grupo==='professor'){tituloAnterior.style.transition='none';requestAnimationFrame(()=>requestAnimationFrame(()=>tituloAnterior.style.removeProperty('transition')));}
   for(const [selector,texto,tipo] of [['.hp-dias h3',_NOMES_DIA[dia-1],'dia'],['.hp-professores h3',nomes[indice]||'nenhum professor','professor']]){
    const el=modal.querySelector(selector),antes=tipo==='professor'?professorAnterior:el.cloneNode(true);if(el.textContent!==texto){el.textContent=texto;if(grupo===tipo)animar(el,antes,dir)}
   }
   modal.querySelectorAll('.hp-professores button').forEach(b=>b.disabled=nomes.length<2);
   const lista=modal.querySelector('.hp-grade');
   _HORARIOS.forEach((hora,i)=>{
    let row=lista.children[i];if(!row){row=document.createElement('div');row.className='hp-linha';const h=document.createElement('span');h.textContent=hora;h.className='hp-hora';row.append(h);const slot=document.createElement('div');slot.className='hp-aula-slot';slot.append(document.createElement('span'));row.append(slot);lista.append(row)}
    const aula=row.querySelector('.hp-aula-slot > span:not(.hp-saindo)'),antes=aula.cloneNode(true);let classe='aula-span',texto='aula vaga',area='';
    if(i===_POS_INTERVALO){texto='INTERVALO';classe='aula-intervalo-slot'}else{
     const pos=i<_POS_INTERVALO?i+1:i;const aulas=grade.filter(a=>Number(a.dia_semana)===dia&&Number(a.posicao)===pos&&a.professor?.trim()===nomes[indice]);
     if(aulas.length){area=aulas[0].area;classe+=' aula-'+area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');texto=aulas.map(a=>a.sala_nome||'sala').join(' / ')}
    }
    if(aula.textContent!==texto||aula.className!==classe){aula.className=classe;aula.textContent=texto;aula.dataset.area=area;const medida=document.createRange();medida.selectNodeContents(aula);aula.style.setProperty('--hp-largura-paleta',(Math.max(24,medida.getBoundingClientRect().width)*2)+'px');if(antes.textContent!==texto)animar(aula,antes,dir)}
   });
  }
  const seletorBusca=modal.querySelector('.hp-professores'),tituloBusca=seletorBusca.querySelector('h3');
  const campoBusca=document.createElement('input');campoBusca.className='hp-busca-professor';campoBusca.type='text';campoBusca.autocomplete='off';campoBusca.setAttribute('aria-label','Buscar professor');
  const visorBusca=document.createElement('div');visorBusca.className='hp-visor-busca input-focado';visorBusca.setAttribute('aria-hidden','true');
  seletorBusca.append(campoBusca,visorBusca);let sugestaoBusca='';
  const normalizarNome=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  function atualizarBusca(){
   const texto=campoBusca.value;sugestaoBusca=texto.trim()?nomes.find(n=>normalizarNome(n).startsWith(normalizarNome(texto)))||'':'';
   visorBusca.replaceChildren();const digitado=document.createElement('span');digitado.className='texto-digitado';digitado.textContent=texto;const cursor=document.createElement('span');cursor.className='cursor-falso';const completar=document.createElement('span');completar.className='texto-sugestao';completar.textContent=sugestaoBusca.slice(texto.length);visorBusca.append(digitado,cursor,completar);
  }
  function confirmarBusca(){const encontrado=sugestaoBusca||nomes.find(n=>normalizarNome(n)===normalizarNome(campoBusca.value));if(encontrado){const novoIndice=nomes.indexOf(encontrado),sentido=novoIndice>=indice?1:-1;indice=novoIndice;render(sentido,'professor');}campoBusca.blur();}
  campoBusca.addEventListener('focus',()=>{seletorBusca.classList.add('hp-editando');campoBusca.value='';atualizarBusca();});
  campoBusca.addEventListener('input',atualizarBusca);
  campoBusca.addEventListener('blur',()=>{seletorBusca.classList.remove('hp-editando');campoBusca.value=nomes[indice]||'';});
  campoBusca.addEventListener('keydown',e=>{e.stopPropagation();if(['Enter','Tab','ArrowRight'].includes(e.key)&&sugestaoBusca){e.preventDefault();confirmarBusca();}else if(e.key==='Enter'){e.preventDefault();confirmarBusca();}else if(e.key==='Escape'){e.preventDefault();campoBusca.blur();}});
  campoBusca.addEventListener('pointerdown',e=>e.stopPropagation());campoBusca.addEventListener('pointerup',e=>e.stopPropagation());
  render();modal.querySelector('.hp-fechar').focus();
 }
})();

