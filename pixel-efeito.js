// Filtro de pixels baseado nas primitivas PixelateSvgFilter do Fancy Components.
// https://www.fancycomponents.dev/r/pixelate-svg-filter.json
(() => {
 const ns='http://www.w3.org/2000/svg',cards=new Set(),livres=new Set();
 let manual=false,ligado=false,overlay=null,defs=null,frame=0,ciclo=0,geometria=0;
 function tamanho(valor){const medidas=[[valor,valor],[valor/2,valor],[valor,valor/2]];defs?.querySelectorAll('feComposite[operator="arithmetic"]').forEach((no,i)=>{no.setAttribute('width',medidas[i][0]);no.setAttribute('height',medidas[i][1]);});defs?.querySelectorAll('feMorphology').forEach(no=>no.setAttribute('radius',valor/2));}
 function recortar(){
  if(!overlay)return;
  let caminho=`M0 0H${innerWidth}V${innerHeight}H0Z`;
  for(const card of livres){if(!card.isConnected){livres.delete(card);continue;}const r=card.getBoundingClientRect(),a=Math.min(20,r.width/2,r.height/2);caminho+=`M${r.left+a} ${r.top}H${r.right-a}Q${r.right} ${r.top} ${r.right} ${r.top+a}V${r.bottom-a}Q${r.right} ${r.bottom} ${r.right-a} ${r.bottom}H${r.left+a}Q${r.left} ${r.bottom} ${r.left} ${r.bottom-a}V${r.top+a}Q${r.left} ${r.top} ${r.left+a} ${r.top}Z`;}
  overlay.style.clipPath=livres.size?`path(evenodd, '${caminho}')`:'';
 }
 function criar(){if(overlay)return;defs=document.createElementNS(ns,'svg');defs.id='pixel-live-defs';defs.setAttribute('aria-hidden','true');const camada=(w,h,nome)=>'<feConvolveMatrix in="SourceGraphic" kernelMatrix="1 1 1 1 1 1 1 1 1" result="AVG"/><feFlood x="1" y="1" width="1" height="1"/><feComposite operator="arithmetic" k1="0" k2="1" k3="0" k4="0" width="'+w+'" height="'+h+'"/><feTile result="TILE"/><feComposite in="AVG" in2="TILE" operator="in"/><feMorphology operator="dilate" radius="1" result="'+nome+'"/>';
  defs.innerHTML='<defs><filter id="pixel-live-fancy" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'+camada(2,2,'NORMAL')+camada(1,2,'FALLBACKX')+camada(2,1,'FALLBACKY')+'<feMerge><feMergeNode in="FALLBACKX"/><feMergeNode in="FALLBACKY"/><feMergeNode in="NORMAL"/></feMerge></filter></defs>';document.body.append(defs);overlay=document.createElement('div');overlay.id='pixel-live-overlay';overlay.setAttribute('aria-hidden','true');document.body.append(overlay);recortar();
 }
 function remover(){overlay?.remove();defs?.remove();overlay=null;defs=null;livres.clear();cancelAnimationFrame(geometria);delete document.documentElement.dataset.pixelTransicao;}
 function transicao(saida,card){
  cancelAnimationFrame(frame);const atual=++ciclo,inicio=performance.now();
  const duracoes=getComputedStyle(card||document.querySelector('.card-atividade')||document.body).transitionDuration.split(',').map(t=>parseFloat(t)*(t.trim().endsWith('ms')?1:1000));const total=Math.max(500,...duracoes)+300;
  document.documentElement.dataset.pixelTransicao=saida?'saindo':'entrando';
  const fim=()=>{tamanho(2);delete document.documentElement.dataset.pixelTransicao;if(saida&&!ligado)remover();else{for(const c of livres)if(!cards.has(c))livres.delete(c);recortar();}};
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){fim();return;}
  const suave=t=>t*t*(3-2*t);let ultimo=-100;
  function animar(agora){if(atual!==ciclo)return;const t=(agora-inicio)/total,v=t<.475?2+10*suave(t/.475):t<.525?12:12-10*suave(Math.min(1,(t-.525)/.475));if(agora-ultimo>=30||t>=1){tamanho(v);ultimo=agora;}recortar();if(t<1)frame=requestAnimationFrame(animar);else fim();}
  frame=requestAnimationFrame(animar);
 }
 function conferir(card){for(const c of cards)if(!c.isConnected)cards.delete(c);const proximo=manual||cards.size>0;recortar();if(proximo===ligado)return;ligado=proximo;if(ligado)criar();if(overlay)transicao(!ligado,card);}
 window._definirPixelCard=(card,aberto)=>{if(aberto){cards.add(card);livres.add(card);}else cards.delete(card);conferir(card);if(ligado){for(const c of livres)if(!cards.has(c))livres.delete(c);recortar();}};
 function acompanhar(){if(!overlay)return;recortar();if(livres.size)geometria=requestAnimationFrame(acompanhar);}
 const definirOriginal=window._definirPixelCard;window._definirPixelCard=(card,aberto)=>{definirOriginal(card,aberto);cancelAnimationFrame(geometria);if(livres.size)geometria=requestAnimationFrame(acompanhar);};
 function loginPixel(e){if(document.getElementById('campo-usuario-login')?.value.trim().toLowerCase()!=='pixel')return;e.preventDefault();e.stopImmediatePropagation();manual=!manual;conferir();}
 document.addEventListener('click',e=>{if(e.target.closest('#botao-entrar-login'))loginPixel(e);},true);
 document.addEventListener('submit',e=>{if(e.target.id==='form-login-admin')loginPixel(e);},true);
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest('#form-login-admin'))loginPixel(e);},true);
 const fecharOriginal=fecharModalLogin;fecharModalLogin=function(sucesso){const resultado=fecharOriginal(sucesso);if(sucesso&&manual){manual=false;conferir();}return resultado;};
 addEventListener('resize',recortar);document.addEventListener('scroll',recortar,true);
})();
