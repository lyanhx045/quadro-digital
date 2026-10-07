(() => {
 const bases=['atividades-proximas','carga-horaria','plataformas','configuracoes','calendario','drives'];
 const abas={calendario:'btn-calendario','atividades-proximas':'bnt-proximo','carga-horaria':'btn-material',drives:'btn-material',plataformas:'btn-material',configuracoes:'btn-config'};
 const materiais={'carga-horaria':'material-horario',drives:'material-drive',plataformas:'material-plataformas'};
 let restaurando=false,pendente=location.pathname!=='/',confirmacao=null,timer=0;
 const visivel=el=>el&&!el.hidden&&!el.classList.contains('oculto')&&getComputedStyle(el).display!=='none';
 function estado(){
  const aba=document.querySelector('.nav-btn.active')?.id;
  let base=Object.keys(abas).find(k=>abas[k]===aba)||'calendario';
  if(aba==='btn-material')base=Object.keys(materiais).find(k=>document.getElementById(materiais[k])?.classList.contains('material-aberto'))||'carga-horaria';
  let caminho=base,dia='';
  if(base==='calendario'&&visivel(document.querySelector('#painel-tarefas-dia'))){caminho+='-'+opcaoSelecionadaLocal;dia=dataSelecionadaStr;}
  const seletor=base==='calendario'?'#lista-atividades-dia':base==='atividades-proximas'?'#lista-atividades-proximas':null;
  const card=seletor&&document.querySelector(seletor+' .card-atividade.aberto');
  if(card){const item=todosDados.find(a=>String(a.id)===card.dataset.itemId);if(item){caminho=base+'-'+normalizarTexto(item.local)+'-'+item.id;dia='';}}
  if(confirmacao){const el=(confirmacao.tipo==='drives'?_overlayAcessarDrive:_overlayAcessarPlataforma);if(el?.classList.contains('aberto')){caminho=confirmacao.tipo+'-'+confirmacao.id;dia='';}else confirmacao=null;}
  if(document.querySelector('#modal-manual-overlay.aberto,.horario-professores'))caminho+='-funcao-de-uso';
  return {caminho:'/'+caminho,dia};
 }
 function atualizar(){if(restaurando||pendente||!window._salaAtual)return;const s=estado(),url=new URL(location.href);url.pathname=s.caminho;url.searchParams.delete('dia');if(s.dia)url.searchParams.set('dia',s.dia.replaceAll('/','-'));if(url.pathname+url.search!==location.pathname+location.search)history.pushState({},'',url.pathname+url.search);}
 function agendar(){clearTimeout(timer);timer=setTimeout(atualizar,100);}
 const driveOriginal=_exibirConfirmacaoAcessarDrive;
 _exibirConfirmacaoAcessarDrive=function(link,...args){const item=_drives.find(d=>d.link===link);confirmacao=item?{tipo:'drives',id:item.id}:null;const r=driveOriginal(link,...args);agendar();return r;};
 const portalOriginal=_exibirConfirmacaoAcessarPlataforma;
 _exibirConfirmacaoAcessarPlataforma=function(link,...args){const id=link==='https://www.sesieducacao.com.br/publico/index.php'?'portal-1':link==='https://sesigoias.com.br/portal-aluno/'?'portal-2':null;confirmacao=id?{tipo:'plataformas',id}:null;const r=portalOriginal(link,...args);agendar();return r;};
 const esperar=async teste=>{for(let i=0;i<60;i++){if(teste())return true;await new Promise(r=>setTimeout(r,50));}return false;};
 async function restaurar(){
  if(restaurando||!window._salaAtual)return;
  const caminho=decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g,'');
  const base=bases.find(b=>caminho===b||caminho.startsWith(b+'-'));if(!base){pendente=false;return;}
  restaurando=true;pendente=false;
  try{
   document.querySelectorAll('.card-atividade.aberto').forEach(el=>el.classList.remove('aberto'));
   if(abaTarefas)fecharPainelDia();document.getElementById('botao-fechar-manual')?.click();document.querySelector('.horario-professores .fechar')?.click();
   for(const el of [_overlayAcessarDrive,_overlayAcessarPlataforma]){if(el)_fecharModalConfirmacao(el);}confirmacao=null;
   const btn=document.getElementById(abas[base]);moverParaBtn(btn);atualizarNomeAbaSemTransicao(btn.id);renderAbaAtivaSemTransicao(btn.id);atualizarModoBotaoAcao(sessao?'admin':'aluno',btn.id);
   if(materiais[base]){await esperar(()=>document.getElementById(materiais[base]));const material=document.getElementById(materiais[base]);if(material&&!material.classList.contains('material-aberto'))material.click();}
   const manual=caminho.endsWith('-funcao-de-uso');let sufixo=caminho.slice(base.length).replace(/^-/, '').replace(/-?funcao-de-uso$/,'');
   if(base==='calendario'||base==='atividades-proximas'){
    const m=sufixo.match(/^(casa|sala)(?:-(.+))?$/);
    if(m){if(!todosDados.length)await carregarDadosAtividades();const item=m[2]?todosDados.find(a=>String(a.id)===m[2]):null;
     if(base==='calendario'){const data=item?.data||new URL(location.href).searchParams.get('dia')?.replaceAll('-','/')||[String(new Date().getDate()).padStart(2,'0'),String(new Date().getMonth()+1).padStart(2,'0'),new Date().getFullYear()].join('/');const [d,mes,ano]=data.split('/').map(Number);if(d&&mes&&ano){mesAtual=mes-1;anoAtual=ano;montarCalendario();await esperar(()=>document.querySelector('.grade-dias-mes li.tem-tarefa'));abrirPainelDia(d,mes-1,data);alternarFiltroLocal(m[1]);}}
     if(base==='atividades-proximas'){await esperar(()=>document.querySelector('#lista-atividades-proximas .card-atividade')); }
     if(item){await esperar(()=>document.querySelector('.card-atividade[data-item-id="'+CSS.escape(String(item.id))+'"]'));document.querySelector('.card-atividade[data-item-id="'+CSS.escape(String(item.id))+'"] .card-titulo')?.click();}
    }
   }else if(base==='drives'&&sufixo){await carregarDrives();const item=_drives.find(d=>String(d.id)===sufixo);if(item)_exibirConfirmacaoAcessarDrive(item.link,'Prof. '+item.professor,item.area);}
   else if(base==='plataformas'&&sufixo){const portais={'portal-1':['https://www.sesieducacao.com.br/publico/index.php','Portal SESI Educação'],'portal-2':['https://sesigoias.com.br/portal-aluno/','Portal do Estudante']};if(portais[sufixo])_exibirConfirmacaoAcessarPlataforma(...portais[sufixo]);}
   if(manual)abrirModalManual(btn.id);
  }finally{restaurando=false;}
 }
 new MutationObserver(()=>{if(pendente&&window._salaAtual)restaurar();else agendar();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 document.addEventListener('click',agendar);window.addEventListener('popstate',()=>{pendente=true;restaurar();});
 document.addEventListener('DOMContentLoaded',()=>{if(pendente)restaurar();else agendar();});
})();



