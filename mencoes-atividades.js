(() => {
 const portais=[{id:'portal-1',nome:'Portal SESI Educação',url:'https://www.sesieducacao.com.br/publico/index.php'},{id:'portal-2',nome:'Portal do Estudante',url:'https://sesigoias.com.br/portal-aluno/'}];
 const drives=()=>typeof _drives!=="undefined"?_drives:[];
 const corMencao=(tipo,id)=>tipo==='plataforma'?(id==='portal-2'?'estudante':'integrado'):(drives().find(d=>String(d.id)===String(id))?.area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const nomeVisivel=(tipo,id,nome)=>tipo==='drive'?'@Drive-Prof-'+(drives().find(d=>String(d.id)===String(id))?.professor||nome.replace(/^Prof\.\s*/, '')).trim().replace(/\s+/g,'-'):(id==='portal-1'?'@Plataforma-SESI-Educação':'@Plataforma-Portal-do-Estudante');
 const referencias=new Map();
 function prepararSetasData(){
  document.querySelectorAll('.entrada-data:not([data-setas-dia])').forEach(container=>{
   const dia=container.querySelector('[name="dia"]'),mes=container.querySelector('[name="mes"]'),ano=container.querySelector('[name="ano"]');
   if(!dia||!mes||!ano)return;container.dataset.setasDia='1';for(const campo of [dia,mes,ano]){const slot=document.createElement('span');slot.className='numero-data-slot '+(campo===ano?'numero-data-ano':'');campo.before(slot);slot.append(campo);}
   for(const sentido of [-1,1]){const botao=document.createElement('button');botao.type='button';botao.className='seta-data '+(sentido<0?'data-anterior':'data-proxima');botao.setAttribute('aria-label',sentido<0?'Dia anterior':'Próximo dia');
    const icone=document.querySelector('#icone-seta-tipo')?.cloneNode(true);if(icone){icone.removeAttribute('id');botao.append(icone);}
    botao.onclick=()=>{const hoje=new Date();const d=Number(dia.value)||hoje.getDate(),m=Number(mes.value)||(typeof mesAtual!=='undefined'?mesAtual+1:hoje.getMonth()+1),a=Number(ano.value)||(typeof anoAtual!=='undefined'?anoAtual:hoje.getFullYear());let data=new Date(a,m-1,d,12);const invalida=data.getFullYear()!==a||data.getMonth()!==m-1||data.getDate()!==d||(dia.value.trim()!==''&&Number(dia.value)<1)||(mes.value.trim()!==''&&Number(mes.value)<1)||(ano.value.trim()!==''&&Number(ano.value)<1);const anteriores=[dia.value,mes.value,ano.value];if(invalida)data=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate(),12);else data.setDate(data.getDate()+sentido);dia.value=String(data.getDate()).padStart(2,'0');mes.value=String(data.getMonth()+1).padStart(2,'0');ano.value=String(data.getFullYear());for(const [indice,campo] of [dia,mes,ano].entries()){if(campo.value!==anteriores[indice]){campo.getAnimations().forEach(animacao=>animacao.cancel());const slot=campo.parentElement;slot.querySelectorAll('.numero-data-anterior').forEach(el=>el.remove());const copia=campo.cloneNode();copia.removeAttribute('id');copia.removeAttribute('name');copia.className='numero-data-anterior';copia.value=anteriores[indice];copia.readOnly=true;copia.tabIndex=-1;copia.setAttribute('aria-hidden','true');slot.append(copia);const deslocamento=-sentido*12;const saida=copia.animate([{opacity:1,translate:'0px'},{opacity:0,translate:deslocamento+'px'}],{duration:120,easing:'ease-in',fill:'both'});saida.finished.then(()=>copia.remove()).catch(()=>copia.remove());campo.animate([{opacity:0,translate:(-deslocamento)+'px'},{opacity:1,translate:'0px'}],{delay:120,duration:220,easing:'ease-out',fill:'backwards'});}campo.dispatchEvent(new Event('input',{bubbles:true}));campo.dispatchEvent(new Event('change',{bubbles:true}));}botao.focus();};
    container.append(botao);
   }
  });
 }
 new MutationObserver(prepararSetasData).observe(document.body,{childList:true,subtree:true});prepararSetasData();
 const registrar=(tipo,id,nome)=>{const visivel=nomeVisivel(tipo,id,nome);referencias.set(visivel,{tipo,id,nome});return visivel;};
 const restaurar=text=>String(text).replace(/@(Drive-Prof|Plataforma)-[\p{L}\p{N}-]+/gu,tag=>{const ref=referencias.get(tag);return ref?`@${ref.tipo}[${ref.id}|${ref.nome}]`:tag;});
 let salaDrivesCarregada=null,carregamentoDrives=null;
 const originalFetch=window.fetch;
 window.fetch=async function(input,opcoes){
  if(String(input).startsWith("/api/atividades?")&&window._salaAtual?.id){const salaId=window._salaAtual.id;if(salaDrivesCarregada!==salaId){if(!carregamentoDrives)carregamentoDrives=carregarDrives().then(()=>{salaDrivesCarregada=salaId;}).finally(()=>carregamentoDrives=null);await carregamentoDrives;}}
  if(opcoes?.body instanceof FormData){const body=new FormData();for(const [chave,valor] of opcoes.body.entries())body.append(chave,typeof valor==='string'&&chave==='entrada-detalhes'?restaurar(valor):valor);opcoes={...opcoes,body};}
  if(typeof opcoes?.body==='string'&&String(input).startsWith('/api/atividades/')){try{const dados=JSON.parse(opcoes.body);if(typeof dados.descricao_detalhes==='string')opcoes={...opcoes,body:JSON.stringify({...dados,descricao_detalhes:restaurar(dados.descricao_detalhes)})};}catch{}}
  return originalFetch.call(this,input,opcoes);
 };
 function colorirEditor(input){
  const preview=input.parentElement.querySelector('.preview-detalhes');if(!preview)return;
  const walker=document.createTreeWalker(preview,NodeFilter.SHOW_TEXT),textos=[];while(walker.nextNode())textos.push(walker.currentNode);
  for(const node of textos){if(node.parentElement.closest('.mencao-editor'))continue;const re=/@[\p{L}\p{N}_-]*/gu;let match,ultimo=0;const frag=document.createDocumentFragment();let encontrou=false;
   while((match=re.exec(node.textContent))){const ref=referencias.get(match[0]);const digitando=match[0].slice(1).toLowerCase();if(!ref&&!['drive','plataforma'].some(tipo=>tipo.startsWith(digitando)))continue;encontrou=true;frag.append(document.createTextNode(node.textContent.slice(ultimo,match.index)));const span=document.createElement('span');span.className='mencao-editor';span.dataset.mencaoCor=ref?corMencao(ref.tipo,ref.id):'principal';span.textContent=match[0];span.dataset.mencaoTexto=match[0];frag.append(span);ultimo=match.index+match[0].length;}
   if(encontrou){frag.append(document.createTextNode(node.textContent.slice(ultimo)));node.replaceWith(frag);}
  }
 }
 document.addEventListener('focusin',e=>{if(e.target.matches('textarea[name="entrada-detalhes"],textarea#entrada-detalhes')){const antes=e.target.value;e.target.value=antes.replace(/@(drive|plataforma)\[([^|\]]+)\|([^\]]+)\]/g,(_,tipo,id,nome)=>registrar(tipo,id,nome));if(antes!==e.target.value)e.target.dispatchEvent(new Event('input',{bubbles:true}));colorirEditor(e.target);}});
 document.addEventListener('input',e=>{if(e.target.matches('textarea[name="entrada-detalhes"],textarea#entrada-detalhes'))colorirEditor(e.target);});
 document.addEventListener('beforeinput',e=>{
  const input=e.target;if(!input.matches('textarea[name="entrada-detalhes"],textarea#entrada-detalhes')||!e.inputType.startsWith('delete'))return;
  let inicio=input.selectionStart,fim=input.selectionEnd;if(inicio===fim){if(e.inputType.includes('Backward'))inicio=Math.max(0,inicio-1);else if(e.inputType.includes('Forward'))fim++;else return;}
  let atingiu=false;for(const m of input.value.matchAll(/@(Drive-Prof|Plataforma)-[\p{L}\p{N}-]+/gu)){if(referencias.has(m[0])&&inicio<m.index+m[0].length&&fim>m.index){inicio=Math.min(inicio,m.index);fim=Math.max(fim,m.index+m[0].length);atingiu=true;}}
  if(atingiu){e.preventDefault();input.setRangeText('',inicio,fim,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}
 },true);
 const original=formatarTextoDescricao;
 formatarTextoDescricao=function(texto){
  const partes=restaurar(texto||'').split(/(@(?:drive|plataforma)\[[^\]\n]+\])/g);
  return partes.map(parte=>{const m=parte.match(/^@(drive|plataforma)\[([^|\]]+)\|([^\]]+)\]$/);if(!m)return original(parte);return `<button type="button" class="texto-link mencao-acesso" data-mencao-cor="${corMencao(m[1],m[2])}" data-mencao-texto="${esc(nomeVisivel(m[1],m[2],m[3]))}" data-mencao-tipo="${m[1]}" data-mencao-id="${esc(m[2])}">${esc(nomeVisivel(m[1],m[2],m[3]))}</button>`;}).join('');
 };
 document.addEventListener('click',e=>{
  const botao=e.target.closest('.mencao-acesso');if(!botao)return;e.preventDefault();e.stopPropagation();
  if(botao.dataset.mencaoTipo==='drive'){const drive=drives().find(d=>String(d.id)===botao.dataset.mencaoId);if(drive)_exibirConfirmacaoAcessarDrive(drive.link,`Prof. ${drive.professor} (${drive.area})`,drive.area);else botao.title='Este drive não está mais disponível';}
  else {const portal=portais.find(p=>p.id===botao.dataset.mencaoId);if(portal)_exibirConfirmacaoAcessarPlataforma(portal.url,portal.nome);}
 },true);
 const menu=document.createElement('div');menu.className='menu-mencoes ativo';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Mencionar acesso');document.body.append(menu);
 let campo,inicio,fim,selecionado=0,opcoes=[];
 const normal=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let fechamentoMenu;
 function fechar(){campo?.setAttribute('aria-expanded','false');if(menu.hidden)return;menu.classList.add('saindo','estado-fechando');clearTimeout(fechamentoMenu);fechamentoMenu=setTimeout(()=>{menu.hidden=true;menu.classList.remove('saindo','estado-fechando');},250);}
 function escolher(i){const opcao=opcoes[i];if(!campo||!opcao)return;const token=registrar(opcao.tipo,opcao.id,opcao.nome);campo.setRangeText(token,inicio,fim,'end');campo.dispatchEvent(new Event('input',{bubbles:true}));fechar();campo.focus();}
 function mostrar(input){
  if(window._salaAtual?.id&&salaDrivesCarregada!==window._salaAtual.id&&!carregamentoDrives){const salaId=window._salaAtual.id;carregamentoDrives=carregarDrives().then(()=>{salaDrivesCarregada=salaId;if(document.activeElement===input)mostrar(input);}).finally(()=>carregamentoDrives=null);}
  campo=input;const pos=input.selectionStart,texto=input.value.slice(0,pos),m=texto.match(/@([a-z]+)(?:\s+([^@\n\[\]]*))?$/i);if(!m||!['drive','plataforma'].some(tipo=>tipo.startsWith(m[1].toLowerCase()))){fechar();return;}
  inicio=pos-m[0].length;fim=pos;const tipo=m[1].toLowerCase().startsWith('d')?'drive':'plataforma',busca=normal(m[2]||'');
  opcoes=(tipo==='drive'?drives().map(d=>({id:String(d.id),nome:`Prof. ${d.professor}`,tipo})):portais.map(p=>({...p,tipo}))).filter(p=>normal(p.nome).includes(busca));
  clearTimeout(fechamentoMenu);menu.classList.remove('saindo','estado-fechando');menu.replaceChildren();selecionado=0;
  if(!opcoes.length){const aviso=document.createElement('div');aviso.textContent='Nenhum acesso encontrado';menu.append(aviso);}
  opcoes.forEach((p,i)=>{
   const b=document.querySelector('#lista-opcoes .opcao-roxa').cloneNode(true);b.dataset.mencaoCor=corMencao(p.tipo,p.id);
   const texto=b.querySelector('[id^="texto-opcao-"]');b.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));texto.id='texto-opcao-mencao-'+i;texto.textContent=p.nome;texto.dataset.mencaoTexto=p.nome;
   const cor=b.dataset.mencaoCor,raiz=getComputedStyle(document.documentElement),rgb=raiz.getPropertyValue(cor==='estudante'?'--tom-azul-claro':'--cor-'+(cor==='integrado'?'humanas':cor)).trim();
   if(rgb){b.style.setProperty('--cor-op',rgb);const valores=rgb.split(',').map(Number);b.style.setProperty('--cor-op-claro',valores.map(v=>Math.round(v*.35+255*.65)).join(','));}
   b.style.animationDelay=(i*.08)+'s';b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===0));b.onpointerdown=e=>e.preventDefault();b.onclick=()=>escolher(i);menu.append(b);
  });
  const r=input.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-288))+'px';menu.style.top=Math.min(r.bottom+6,innerHeight-190)+'px';menu.style.width=Math.min(Math.max(r.width,260),innerWidth-16)+'px';menu.hidden=false;const primeira=menu.querySelector('.opcao');if(primeira){const estilo=getComputedStyle(menu);const altura=primeira.getBoundingClientRect().height;const gap=parseFloat(estilo.rowGap)||0;const padding=parseFloat(estilo.paddingTop)+parseFloat(estilo.paddingBottom);menu.style.maxHeight=(altura*3+gap*2+padding)+'px';}input.setAttribute('aria-expanded','true');
 }
 document.addEventListener('input',e=>{if(e.target.matches('textarea[name="entrada-detalhes"],textarea#entrada-detalhes'))mostrar(e.target);});
 document.addEventListener('keydown',e=>{if(menu.hidden||e.target!==campo)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fechar();}else if(['ArrowDown','ArrowUp'].includes(e.key)&&opcoes.length){e.preventDefault();e.stopPropagation();selecionado=(selecionado+(e.key==='ArrowDown'?1:-1)+opcoes.length)%opcoes.length;Array.from(menu.querySelectorAll('.opcao')).forEach((b,i)=>b.setAttribute('aria-selected',String(i===selecionado)));}else if(['Enter','Tab'].includes(e.key)&&opcoes.length){e.preventDefault();e.stopPropagation();escolher(selecionado);}},true);
 document.addEventListener('pointerdown',e=>{if(e.target!==campo&&!menu.contains(e.target))fechar();});
 window.addEventListener('resize',fechar);document.addEventListener('scroll',e=>{if(!menu.contains(e.target))fechar();},true);
})();










