/* ╔══════════════════════════════════════════════════════════════╗
   ║                                                              ║
   ║   ░░░  P A R T E   1  —  B A C K E N D  ░░░                 ║
   ║                                                              ║
   ║   Comunicação com servidor e banco de dados:                 ║
   ║   • Autenticação / login do representante (/api/login)       ║
   ║   • Busca de atividades via API REST (/api/atividades)       ║
   ║   • Busca de URL assinada para anexos  (/api/anexo)          ║
   ║                                                              ║
   ╚══════════════════════════════════════════════════════════════╝ */

/* ══════════════════════════════════════════════════════════
   Ícone de carregamento — usa --cor-principal-* do tema
   ══════════════════════════════════════════════════════════ */
function _criarIconeCarregandoHTML() {
  return (
    '<div class="icone-carregando">' +
    '<svg class="svg-carregando" width="85" height="85" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">' +
    '<g class="spin-logo">' +
    '<path class="arco-escuro" d="M 50,110 A 60,60 0 1 1 110,170" fill="none" stroke-width="28" stroke-linecap="round"/>' +
    '<path class="arco-claro"  d="M 110,50 A 60,60 0 0 1 170,110" fill="none" stroke-width="34" stroke-linecap="round"/>' +
    '<circle class="bola-claro" cx="110" cy="170" r="17"/>' +
    '</g>' +
    '<circle class="bola-escuro pulse-logo" cx="110" cy="110" r="17"/>' +
    '</svg>' +
    '</div>'
  );
}

/* Garante tempo mínimo de exibição do ícone antes de executar o callback */
function _comTempoMinimo(promessa, ms, callback) {
  const inicio = Date.now();
  promessa.then(function() {
    const decorrido = Date.now() - inicio;
    const restante  = ms - decorrido;
    if (restante > 0) {
      setTimeout(callback, restante);
    } else {
      callback();
    }
  }).catch(function(e) {
    console.error('Erro durante carregamento:', e);
    callback();
  });
}



/* ══════════════════════════════════════════════════════════
   Lógica de login
   ══════════════════════════════════════════════════════════ */
function definirErroLogin(mensagem, erroUsuario) {
  const campoUsuario = document.getElementById('campo-usuario-login');
  const campoSenha   = document.getElementById('campo-senha-login');

  campoSenha.classList.toggle('login-erro', true);
  campoUsuario.classList.toggle('login-erro', !!erroUsuario);
}

function limparErroLogin() {
  document.getElementById('campo-usuario-login').classList.remove('login-erro');
  document.getElementById('campo-senha-login').classList.remove('login-erro');
}

async function executarLoginRepre() {
  const username    = document.getElementById('campo-usuario-login').value.trim();
  const senha       = document.getElementById('campo-senha-login').value;
  const botaoEntrar = document.getElementById('botao-entrar-login');

  if (!username) {
    definirErroLogin('Usuário não encontrado.', true);
    return;
  }

  limparErroLogin();
  botaoEntrar.disabled = true;

  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, senha }),
    });
    const data = await r.json();

    if (!r.ok) {
      if (data.error === 'senha_incorreta') {
        definirErroLogin('Senha incorreta.', false);
      } else {
        definirErroLogin('Usuário não encontrado.', true);
      }
      return;
    }

    const salaIdUsuario = Number(data.sala_id);
    const salaIdAtual   = window._salaAtual ? Number(window._salaAtual.id) : null;
    if (salaIdUsuario !== 0 && salaIdUsuario !== salaIdAtual) {
      definirErroLogin('Usuário não encontrado.', true);
      return;
    }

    localStorage.setItem(
      'usuarioLogado',
      JSON.stringify({
        id:       data.id,
        username: data.username,
        role:     data.role,
        sala_id:  data.sala_id,
      })
    );

    aplicarSessaoRepre(data);

  } catch (erro) {
    console.error('Erro no login:', erro);
    definirErroLogin('Erro ao tentar fazer login.', true);
  } finally {
    botaoEntrar.disabled = false;
  }
}


/* ══════════════════════════════════════════════════════════
   Busca de atividades — API REST
   ══════════════════════════════════════════════════════════ */
async function carregarDadosAtividades() {
  if (!window._salaAtual) { todosDados = []; return; }
  try {
    const salaId = window._salaAtual.id;
    const url = `/api/atividades?sala_id=${salaId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao carregar dados');
    const data = await response.json();
    todosDados = (data || []).map((item) => {
      if (item.data && typeof item.data === 'string' && item.data.includes('-')) {
        const [ano, mes, dia] = item.data.split('-');
        item.data = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
      }
      return item;
    });
  } catch (error) {
    console.error('Erro lendo banco:', error);
    todosDados = [];
  }
}


/* ══════════════════════════════════════════════════════════
   Busca de URL assinada para anexos — API REST
   ══════════════════════════════════════════════════════════ */
async function obterUrlAssinadaArquivo(path) {
  const r = await fetch(`/api/anexo?path=${encodeURIComponent(path)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Erro ao obter link do anexo');
  return j.url;
}




/* ══════════════════════════════════════════════════════════
   Busca de professores — API REST
   ══════════════════════════════════════════════════════════ */
async function carregarDadosProfessores() {
  try {
    const response = await fetch('/api/professores');
    if (!response.ok) throw new Error('Erro ao carregar professores');
    const data = await response.json();
    // data = [{ id, nome, ativo }, ...]
    const ativos = (data || []).filter(p => p.ativo !== false && p.nome);
    const nomes = ativos.map(p => p.nome);
    // Expõe globalmente para o autocomplete do formulário de atividade
    window._listaProfessores = nomes;
    // Mapa nome → id para resolver professor_id nos envios
    window._mapaProfessoresId = {};
    ativos.forEach(p => { window._mapaProfessoresId[p.nome] = p.id; });
    // Atualiza a referência usada pelos modais de drive / horário
    NOMES_AUTORES_DRIVE = nomes;
  } catch (error) {
    console.error('Erro ao carregar professores:', error);
    window._listaProfessores = window._listaProfessores || [];
    window._mapaProfessoresId = window._mapaProfessoresId || {};
  }
}


/* ╔══════════════════════════════════════════════════════════════╗
   ║                                                              ║
   ║   ░░░  P A R T E   2  —  F R O N T E N D  ░░░               ║
   ║                                                              ║
   ║   Interface, estado e lógica de apresentação:               ║
   ║   • Estado de sessão e variáveis globais                     ║
   ║   • Utilitários (normalização, formatação de texto)          ║
   ║   • Navbar — movimento do indicator, troca de abas           ║
   ║   • Nomes e roteamento de abas (aluno vs representante)      ║
   ║   • Modal de login (abrir/fechar, typewriter, senha)         ║
   ║   • Após login — aplica sessão e troca botão +               ║
   ║   • Bola de cristal (canvas animado)                         ║
   ║   • Camada de desfoque (overlay compartilhado)               ║
   ║   • Aba "próximo" — painel de atividades próximas            ║
   ║   • Aba "calendário" — grade mensal e painel do dia          ║
   ║   • Cards de atividade (dia e próximas)                      ║
   ║                                                              ║
   ╚══════════════════════════════════════════════════════════════╝ */


/* ══════════════════════════════════════════════════════════
   Estado de sessão
   ══════════════════════════════════════════════════════════ */
let sessao = null; // null = aluno | { username, role } = representante

/* ══════════════════════════════════════════════════════════
   Botão de ação contextual — circuito base
   ══════════════════════════════════════════════════════════

   Mapa de comportamento:
     calendário      → aluno: manual  | admin: editor
     atividades prox → aluno: manual  | admin: manual
     adicionar       → aluno: n/a     | admin: manual
     materiais       → aluno: manual  | admin: manual
     configurações   → aluno: manual  | admin: manual

   Ícones (#icone-manual / #icone-editor) criados via JS,
   empilhados dentro de #botao-acao-topo.
   Animação 100% CSS via .funcao-manual / .funcao-editor no botão pai.

   Gatilhos de atualização:
     • troca de aba  (listener de navegação)
     • troca de user (aplicarSessaoRepre)
   ══════════════════════════════════════════════════════════ */

// ── Mapa estático aba → modo por tipo de usuário ──────────────────
const _mapaModoBotao = {
  'btn-calendario':         { aluno: 'manual', admin: 'editor' },
  'bnt-proximo':            { aluno: 'manual', admin: 'manual' },
  'botao-navbar-adicionar': { aluno: null,     admin: 'manual' },
  'btn-material':           { aluno: 'manual', admin: 'manual' }, // dinâmico: vira 'editor' quando card aberto
  'btn-config':             { aluno: 'manual', admin: 'manual' },
};

// ── Recalcula modo do botão na aba material conforme card aberto ──
function _atualizarModoBotaoMaterial() {
  if (!sessao) return;
  const horarioAberto = document.querySelector('#material-horario.material-aberto');
  const driveAberto   = document.querySelector('#material-drive.material-aberto');
  const temEditor = !!(horarioAberto || driveAberto);
  const botao = document.getElementById('botao-acao-topo');
  if (!botao) return;
  botao.classList.remove('funcao-manual', 'funcao-editor');
  botao.style.display = '';
  botao.classList.add(temEditor ? 'funcao-editor' : 'funcao-manual');
}

// ── Injeta os dois SVGs no botão (executado uma única vez) ──
(function montarIconesBotaoAcao() {
  const botao = document.getElementById('botao-acao-topo');
  if (!botao) return;

  // ── #icone-manual — interrogação (fill, sem stroke) ───────────────
  const svgManual = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgManual.id = 'icone-manual';
  svgManual.setAttribute('viewBox', '0 0 24 24');
  svgManual.setAttribute('fill', 'none');
  const pManual = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pManual.setAttribute('d', 'M9.186207 14.731034q0-1.853793.827586-3.144828.926897-1.224828 2.747586-2.052414 2.383448-1.05931 2.383448-2.846897 0-1.224828-.827586-1.853793Q13.489655 4.171033 12 4.171033q-3.144828 0-3.343448 2.88H3.922759Q4.088276 3.773792 6.24 1.886895 8.358621 0 12.033103 0q3.641379 0 5.826207 1.853793 2.217931 1.787586 2.217931 4.8 0 3.707586-3.93931 5.693793Q13.92 13.44 13.92 15.161379v.628966H9.186207Zm-.695172 6.289655q0-1.357241.86069-2.151724.827586-.86069 2.217931-.86069t2.217931.86069q.86069.794483.86069 2.151724 0 1.291034-.86069 2.151724-.827586.827586-2.217931.827586t-2.217931-.827586q-.86069-.86069-.86069-2.151724');
  svgManual.appendChild(pManual);
  botao.appendChild(svgManual);

  // ── #icone-editor — lápis (stroke, sem fill) ──────────────────────
  const svgEditor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEditor.id = 'icone-editor';
  svgEditor.setAttribute('viewBox', '0 0 24 24');
  svgEditor.setAttribute('fill', 'none');
  svgEditor.setAttribute('stroke', 'white');
  svgEditor.setAttribute('stroke-linecap', 'round');
  svgEditor.setAttribute('stroke-linejoin', 'round');
  [
    'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    'm15 5 4 4',
  ].forEach(d => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svgEditor.appendChild(p);
  });
  botao.appendChild(svgEditor);
})();

/**
 * atualizarModoBotaoAcao(tipoUsuario, abaAtual)
 *
 * Função central responsável pelo estado do botão de ação contextual.
 *   tipoUsuario — 'aluno' | 'admin'
 *   abaAtual    — id do botão de navbar ativo (string)
 *
 * A animação é inteiramente gerida pelo CSS:
 *   .funcao-manual  → #icone-manual visível, #icone-editor oculto
 *   .funcao-editor  → #icone-editor visível, #icone-manual oculto
 */
function atualizarModoBotaoAcao(tipoUsuario, abaAtual) {
  const botao = document.getElementById('botao-acao-topo');
  if (!botao) return;

  const regra = _mapaModoBotao[abaAtual];
  const modo  = regra ? regra[tipoUsuario] : 'manual';

  botao.classList.remove('funcao-manual', 'funcao-editor');

  if (!modo) {
    botao.style.display = 'none';
    return;
  }

  botao.style.display = '';
  botao.classList.add('funcao-' + modo);
}

/* ══════════════════════════════════════════════════════════
   Editor do calendário — estado e painel
   ══════════════════════════════════════════════════════════

   modoEditorCalendario: 'nenhum' | 'adicionar' | 'editar' | 'apagar'

   O painel (#painel-editor-calendario) é criado sob demanda
   e inserido no body. Só fica visível para admin na aba calendário.
   ══════════════════════════════════════════════════════════ */

let modoEditorCalendario = 'nenhum';
let _painelEditorCal     = null; // referência ao elemento DOM do painel

// ── Cria o painel uma única vez ───────────────────────────
function _garantirPainelEditorCalendario() {
  if (_painelEditorCal) return;

  _painelEditorCal = document.createElement('div');
  _painelEditorCal.id = 'painel-editor-calendario';

  const btnM = document.createElement('button');
  btnM.id        = 'editor-cal-btn-adicionar';
  btnM.type      = 'button';
  btnM.className = 'editor-cal-btn';
  btnM.innerHTML = `<svg id="icone-funcao-adicionar" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

  const btnE = document.createElement('button');
  btnE.id        = 'editor-cal-btn-editar';
  btnE.type      = 'button';
  btnE.className = 'editor-cal-btn';
  btnE.innerHTML = `<svg id="icone-funcao-editar" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;

  const btnL = document.createElement('button');
  btnL.id        = 'editor-cal-btn-apagar';
  btnL.type      = 'button';
  btnL.className = 'editor-cal-btn';
  btnL.innerHTML = `<svg id="icone-funcao-apagar" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`;

  _painelEditorCal.appendChild(btnM);
  _painelEditorCal.appendChild(btnE);
  _painelEditorCal.appendChild(btnL);
  document.body.appendChild(_painelEditorCal);

  btnM.addEventListener('click', () => {
    // Se o painel do dia já estiver aberto com uma data selecionada,
    // dispara o formulário diretamente — sem precisar clicar num <li>
    const painelAberto = abaTarefas && !abaTarefas.classList.contains('oculto');
    if (painelAberto && dataSelecionadaStr) {
      _painelEditorCal.classList.remove('aberto');
      modoEditorCalendario = 'nenhum';
      _sincronizarEstadoEditorUI();
      _abrirFormularioComData(dataSelecionadaStr);
      return;
    }
    _ativarModoEditor('adicionar');
  });
  btnE.addEventListener('click', () => _ativarModoEditor('editar'));
  btnL.addEventListener('click', () => _ativarModoEditor('apagar'));
}

// ── Ativa um modo; clique no mesmo botão desativa ─────────
function _ativarModoEditor(modo) {
  modoEditorCalendario = (modoEditorCalendario === modo) ? 'nenhum' : modo;
  _sincronizarEstadoEditorUI();
}

// ── Sincroniza classes visuais dos botões ─────────────────
function _sincronizarEstadoEditorUI() {
  if (!_painelEditorCal) return;
  const mapa = { adicionar: 'editor-cal-btn-adicionar', editar: 'editor-cal-btn-editar', apagar: 'editor-cal-btn-apagar' };
  _painelEditorCal.querySelectorAll('.editor-cal-btn').forEach(btn => {
    btn.classList.remove('ativo');
  });
  if (modoEditorCalendario !== 'nenhum') {
    const id = mapa[modoEditorCalendario];
    const el = document.getElementById(id);
    if (el) el.classList.add('ativo');
  }

  // Cursor do calendário reflete o modo ativo
  const grade = document.querySelector('.grade-dias-mes');
  if (grade) {
    grade.classList.remove('editor-modo-adicionar', 'editor-modo-editar', 'editor-modo-apagar');
    if (modoEditorCalendario !== 'nenhum')
      grade.classList.add(`editor-modo-${modoEditorCalendario}`);
  }

  // Cursor do painel lateral do dia também reflete o modo ativo
  const painelDia = document.getElementById('painel-tarefas-dia');
  if (painelDia) {
    painelDia.classList.remove('editor-modo-adicionar', 'editor-modo-editar', 'editor-modo-apagar');
    if (modoEditorCalendario !== 'nenhum')
      painelDia.classList.add(`editor-modo-${modoEditorCalendario}`);
  }
}

// ── Abre / fecha o painel do editor ──────────────────────
function abrirEditorCalendario() {
  _garantirPainelEditorCalendario();
  const aberto = _painelEditorCal.classList.contains('aberto');
  if (aberto) {
    fecharEditorCalendario();
  } else {
    _painelEditorCal.classList.add('aberto');
    _sincronizarEstadoEditorUI();
  }
}

function fecharEditorCalendario() {
  if (!_painelEditorCal) return;
  _painelEditorCal.classList.remove('aberto');
  modoEditorCalendario = 'nenhum';
  _sincronizarEstadoEditorUI();
}

// ── Fecha e reseta o editor (troca de aba / logout) ──────
function resetarEditorCalendario() {
  modoEditorCalendario = 'nenhum';
  if (!_painelEditorCal) return;
  _painelEditorCal.classList.remove('aberto');
  _sincronizarEstadoEditorUI();
}


/* ══════════════════════════════════════════════════════════
   Editor de materiais — horário e drive
   ══════════════════════════════════════════════════════════

   Dois painéis independentes, mesma estrutura do editor do
   calendário:
     #painel-editor-horario  → aparece quando #material-horario.material-aberto
     #painel-editor-drive    → aparece quando #material-drive.material-aberto

   Botões:
     horário → adicionar aula | editar aula | apagar aula
     drive   → adicionar drive | editar drive | apagar drive

   Gatilhos:
     • abertura de .card-material (listener injetado em _renderEstruturaMateriais)
     • clique no #botao-acao-topo (funcao-editor) na aba material
     • troca de aba / logout → resetarEditorMaterial()
   ══════════════════════════════════════════════════════════ */

let modoEditorMaterialHorario = 'nenhum'; // 'nenhum' | 'adicionar' | 'editar' | 'apagar'
let modoEditorMaterialDrive   = 'nenhum';
let _painelEditorHorario = null;
let _painelEditorDrive   = null;

// ── Cria o painel de horário uma única vez ────────────────
function _garantirPainelEditorHorario() {
  if (_painelEditorHorario) return;

  _painelEditorHorario = document.createElement('div');
  _painelEditorHorario.id = 'painel-editor-horario';

  const _criarBtn = (id, svgPaths, label) => {
    const btn = document.createElement('button');
    btn.id = id; btn.type = 'button'; btn.className = 'editor-cal-btn';
    btn.innerHTML = `<svg id="icone-funcao-${label}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg>`;
    return btn;
  };

  const btnE = _criarBtn('editor-hor-btn-editar',
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    'editar-hor');

  _painelEditorHorario.appendChild(btnE);
  document.body.appendChild(_painelEditorHorario);

  btnE.addEventListener('click', () => _ativarModoEditorMaterial('horario', 'editar'));
}

// ── Cria o painel de drive uma única vez ──────────────────
function _garantirPainelEditorDrive() {
  if (_painelEditorDrive) return;

  _painelEditorDrive = document.createElement('div');
  _painelEditorDrive.id = 'painel-editor-drive';

  const _criarBtn = (id, svgPaths, label) => {
    const btn = document.createElement('button');
    btn.id = id; btn.type = 'button'; btn.className = 'editor-cal-btn';
    btn.innerHTML = `<svg id="icone-funcao-${label}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg>`;
    return btn;
  };

  const btnA = _criarBtn('editor-drv-btn-adicionar',
    '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'adicionar-drv');
  const btnE = _criarBtn('editor-drv-btn-editar',
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    'editar-drv');
  const btnL = _criarBtn('editor-drv-btn-apagar',
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    'apagar-drv');

  _painelEditorDrive.appendChild(btnA);
  _painelEditorDrive.appendChild(btnE);
  _painelEditorDrive.appendChild(btnL);
  document.body.appendChild(_painelEditorDrive);

  btnA.addEventListener('click', () => {
    // Adicionar: abre o modal diretamente (não entra em modo de seleção)
    fecharEditorMaterial();
    _abrirModalDrive(null, false);
  });
  btnE.addEventListener('click', () => _ativarModoEditorMaterial('drive', 'editar'));
  btnL.addEventListener('click', () => _ativarModoEditorMaterial('drive', 'apagar'));
}

// ── Ativa um modo; clique no mesmo botão desativa ─────────
function _ativarModoEditorMaterial(tipo, modo) {
  if (tipo === 'horario') {
    modoEditorMaterialHorario = (modoEditorMaterialHorario === modo) ? 'nenhum' : modo;
    _sincronizarEstadoEditorMaterialUI('horario');
  } else {
    modoEditorMaterialDrive = (modoEditorMaterialDrive === modo) ? 'nenhum' : modo;
    _sincronizarEstadoEditorMaterialUI('drive');
  }
}

// ── Sincroniza classes visuais dos botões ─────────────────
function _sincronizarEstadoEditorMaterialUI(tipo) {
  const painel = tipo === 'horario' ? _painelEditorHorario : _painelEditorDrive;
  const modo   = tipo === 'horario' ? modoEditorMaterialHorario : modoEditorMaterialDrive;
  const prefixo = tipo === 'horario' ? 'editor-hor-btn' : 'editor-drv-btn';
  if (!painel) return;

  painel.querySelectorAll('.editor-cal-btn').forEach(btn => btn.classList.remove('ativo'));
  if (modo !== 'nenhum') {
    const el = painel.querySelector(`#${prefixo}-${modo}`);
    if (el) el.classList.add('ativo');
  }

  // Cursor na coluna mostrada do horário
  if (tipo === 'horario') {
    const colMostrada = document.querySelector('.coluna-aulas.aula-mostrada');
    if (colMostrada) {
      colMostrada.classList.remove('editor-modo-editar');
      if (modo === 'editar') colMostrada.classList.add('editor-modo-editar');
    }
  }

  // Cursor nos cards de drive
  if (tipo === 'drive') {
    const lista = document.getElementById('lista-drives');
    if (lista) {
      lista.classList.remove('editor-modo-editar', 'editor-modo-apagar');
      if (modo !== 'nenhum') lista.classList.add(`editor-modo-${modo}`);
    }
  }
}

// ── Abre o painel correto conforme o card aberto ──────────
function abrirEditorMaterial() {
  const horarioAberto = document.querySelector('#material-horario.material-aberto');
  const driveAberto   = document.querySelector('#material-drive.material-aberto');

  if (horarioAberto) {
    _garantirPainelEditorHorario();
    const aberto = _painelEditorHorario.classList.contains('aberto');
    if (aberto) {
      fecharEditorMaterial();
    } else {
      if (_painelEditorDrive) _painelEditorDrive.classList.remove('aberto');
      _painelEditorHorario.classList.add('aberto');
      _sincronizarEstadoEditorMaterialUI('horario');
    }
    return;
  }

  if (driveAberto) {
    _garantirPainelEditorDrive();
    const aberto = _painelEditorDrive.classList.contains('aberto');
    if (aberto) {
      fecharEditorMaterial();
    } else {
      if (_painelEditorHorario) _painelEditorHorario.classList.remove('aberto');
      _painelEditorDrive.classList.add('aberto');
      _sincronizarEstadoEditorMaterialUI('drive');
    }
  }
}

function fecharEditorMaterial() {
  if (_painelEditorHorario) {
    _painelEditorHorario.classList.remove('aberto');
    modoEditorMaterialHorario = 'nenhum';
    _sincronizarEstadoEditorMaterialUI('horario');
  }
  if (_painelEditorDrive) {
    _painelEditorDrive.classList.remove('aberto');
    modoEditorMaterialDrive = 'nenhum';
    _sincronizarEstadoEditorMaterialUI('drive');
  }
}

function resetarEditorMaterial() {
  modoEditorMaterialHorario = 'nenhum';
  modoEditorMaterialDrive   = 'nenhum';
  fecharEditorMaterial();
}

// ── Intercepta o clique em dias / cards do calendário ────
//    chamado pelos renderizadores existentes via delegação
function _interceptarCliqueCalendarioEditor(e) {
  if (modoEditorCalendario === 'nenhum') return false;

  if (modoEditorCalendario === 'adicionar') {
    // Exige clique num <li> da grade em ambos os casos
    const li = e.target.closest('.grade-dias-mes li');
    if (!li) return false;
    e.stopPropagation();

    // Se o painel do dia está aberto, usa a data dele; senão usa a do <li>
    const painelAberto = abaTarefas && !abaTarefas.classList.contains('oculto');
    const dataStr = (painelAberto && dataSelecionadaStr)
      ? dataSelecionadaStr
      : li.dataset.dataCompleta;

    modoEditorCalendario = 'nenhum';
    _sincronizarEstadoEditorUI();
    _abrirFormularioComData(dataStr);
    return true;
  }

  if (modoEditorCalendario === 'editar') {
    const card = e.target.closest('.card-atividade');
    if (!card) return false;
    e.stopPropagation();
    modoEditorCalendario = 'nenhum';
    _sincronizarEstadoEditorUI();
    _abrirFormularioEdicaoCalendario(card);
    return true;
  }

  if (modoEditorCalendario === 'apagar') {
    const card = e.target.closest('.card-atividade');
    if (!card) return false;
    e.stopPropagation();
    modoEditorCalendario = 'nenhum';
    _sincronizarEstadoEditorUI();
    _exibirConfirmacaoApagar(card);
    return true;
  }

  return false;
}

// ── MODO ADICIONAR — navega para o formulário e preenche a data ──
function _abrirFormularioComData(dataStr) {
  const partes = (dataStr || '').split('/');
  const dia = partes[0] || '';
  const mes = partes[1] || '';
  const ano = partes[2] || '';

  // Move o indicator para o botão + sem disparar listeners
  const btnNavAdd = document.getElementById('botao-navbar-adicionar');
  if (btnNavAdd) {
    moverParaBtn(btnNavAdd);
    atualizarNomeAba('botao-navbar-adicionar');
  }

  // Monta o formulário diretamente (sem .click())
  abrirModalCadastroTarefa();

  // Preenche os campos depois que o DOM do formulário está pronto
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const campoDia = document.getElementById('dia');
      const campoMes = document.getElementById('mes');
      const campoAno = document.getElementById('ano');
      if (campoDia) campoDia.value = dia;
      if (campoMes) campoMes.value = mes;
      if (campoAno) campoAno.value = ano;
      const campoDataLi = document.querySelector('.campo-data');
      if (campoDataLi) campoDataLi.classList.remove('erro-envio');
    });
  });
}

// ── MODO EDITAR — abre formulário pré-preenchido com os dados do card ──
function _abrirFormularioEdicaoCalendario(card) {
  // 1. Recupera o item original pelo id guardado no dataset
  const id = card.dataset.itemId;
  const item = todosDados.find(d => String(d.id) === String(id));
  if (!item) {
    console.warn('[editor-cal] item não encontrado para id', id);
    return;
  }

  // 2. Navega para o formulário passando o item como contexto de edição
  const btnNavAdd = document.getElementById('botao-navbar-adicionar');
  if (btnNavAdd) {
    moverParaBtn(btnNavAdd);
    atualizarNomeAba('botao-navbar-adicionar');
  }
  abrirModalCadastroTarefa(item);
}

// ── MODO APAGAR — overlay de confirmação criado sob demanda ──
let _overlayApagar = null;

function _garantirOverlayApagar() {
  if (_overlayApagar) return;

  _overlayApagar = document.createElement('div');
  _overlayApagar.className = 'modal-overlay';

  // Card de confirmação — reutiliza .anexo-com-erro do CSS existente
  const card = document.createElement('div');
  card.className = 'anexo-com-erro modal-confirmacao-apagar';

  // Ícone de lixeira (SVG inline, mesmo estilo do formulário)
  const svgWrap = document.createElement('div');
  const span = document.createElement('span');
  span.className = 'texto-anexo-com-erro';
  const h2 = document.createElement('h2');
  const h3 = document.createElement('h3');
  h2.textContent = 'apagar atividade?';
  h3.id = '_apagar-subtitulo';
  h3.className = 'modal-confirmacao-subtitulo';
  span.appendChild(h2);
  span.appendChild(h3);

  // Botões — "apagar" (vermelho) e "cancelar" (neutro)
  const rowBtns = document.createElement('div');
  rowBtns.className = 'modal-confirmacao-botoes';

  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button';
  btnCancelar.textContent = 'cancelar';
  btnCancelar.className = 'modal-confirmacao-cancelar';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.type = 'button';
  btnConfirmar.id = '_apagar-confirmar';
  btnConfirmar.textContent = 'apagar';
  btnConfirmar.className = 'modal-confirmacao-confirmar';

  rowBtns.appendChild(btnCancelar);
  rowBtns.appendChild(btnConfirmar);

  card.appendChild(svgWrap);
  card.appendChild(span);
  card.appendChild(rowBtns);
  _overlayApagar.appendChild(card);
  document.body.appendChild(_overlayApagar);

  const fechar = () => _overlayApagar.classList.remove('aberto');
  btnCancelar.addEventListener('click', fechar);
  _overlayApagar.addEventListener('click', e => { if (e.target === _overlayApagar) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlayApagar.classList.contains('aberto')) fechar();
  });
}

function _exibirConfirmacaoApagar(card) {
  _garantirOverlayApagar();

  // Recupera o item pelo id gravado no dataset
  const id = card.dataset.itemId;
  const item = todosDados.find(d => String(d.id) === String(id));
  if (!item) {
    console.warn('[editor-cal] apagar: item não encontrado para id', id);
    return;
  }

  // Atualiza subtítulo com o título da atividade
  const subtitulo = document.getElementById('_apagar-subtitulo');
  if (subtitulo) subtitulo.textContent = item.descricao_titulo || 'sem título';

  // Troca o handler do botão confirmar a cada abertura
  const btnConf = document.getElementById('_apagar-confirmar');
  const novoBtn = btnConf.cloneNode(true); // remove listeners antigos
  // Garante estado inicial limpo — evita herdar disabled/'...' de tentativa anterior
  novoBtn.disabled    = false;
  novoBtn.textContent = 'apagar';
  btnConf.parentNode.replaceChild(novoBtn, btnConf);

  novoBtn.addEventListener('click', async () => {
    novoBtn.disabled = true;
    novoBtn.textContent = '...';

    try {
      const r = await fetch(`/api/atividades/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao apagar');

      // Remove do cache local
      todosDados = todosDados.filter(d => String(d.id) !== String(id));

      novoBtn.disabled = false;
      novoBtn.textContent = 'apagar';
      _overlayApagar.classList.remove('aberto');

      // Remove o card da UI com animação suave
      card.style.transition = 'opacity 0.3s, transform 0.3s';
      card.style.opacity    = '0';
      card.style.transform  = 'scale(0.92)';
      setTimeout(() => {
        card.remove();
        atualizarAlturasCardsAtividade();
        // Se não restarem cards, mostra mensagem vazia
        if (containerAtividades && containerAtividades.querySelectorAll('.card-atividade').length === 0) {
          containerAtividades.innerHTML = `<div class="mensagem-vazia">nenhuma atividade</div>`;
        }
        // Atualiza marcadores do calendário (remove ponto do dia se necessário)
        renderizarCalendarioComEventos();
      }, 320);

    } catch (err) {
      console.error('[editor-cal] erro ao apagar:', err);
      novoBtn.disabled  = false;
      novoBtn.textContent = 'apagar';
      const subtit = document.getElementById('_apagar-subtitulo');
      if (subtit) subtit.textContent = 'erro ao apagar — tente novamente';
    }
  });

  _overlayApagar.classList.add('aberto');
}

/* ── Referência global e variáveis de estado ─────────────
   Declaradas aqui (antes do init) para evitar Temporal Dead Zone */
const conteudoTipo = document.getElementById('conteudo-tipo');

let todosDados            = [];
let opcaoSelecionadaLocal = 'casa';
let dataSelecionadaStr    = '';

// ── Filtro global de exibição (painel configurações) ──────
// Controla quais locais aparecem no calendário e em "próximo".
// Regra: pelo menos um sempre ativo; padrão = só casa.
const _filtroExibicao = { sala: false, casa: true };
let intervaloCicloCores   = null;

let containerDias, containerSemanas, elementoDataAtual;
let btnAnteriorCal, btnProximoCal;
let abaTarefas, overlayFundo, btnFecharAba;
let headerDataAba, containerAtividades, seletorLocal, botoesLocal;

let dataAtual = new Date();
let anoAtual  = dataAtual.getFullYear();
let mesAtual  = dataAtual.getMonth();

const nomesMeses = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const diasSemanaAbrev = ['D','S','T','Q','Q','S','S'];


/* ══════════════════════════════════════════════════════════
   Utilitários
   ══════════════════════════════════════════════════════════ */
const normalizarTexto = (t) =>
  t ? t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim() : '';

function formatarTextoDescricao(texto) {
  if (!texto || typeof texto !== 'string') return '';
  let s = texto
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s = s.replace(/\*\*(.*?)\*\*/g,'<span class="texto-negrito">$1</span>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g,
    '<a class="texto-link" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\n/g,'<br>');
  return s;
}

function formatarDataParaComparacao(dia, mes, ano) {
  return `${String(dia).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}/${ano}`;
}


/* ══════════════════════════════════════════════════════════
   Tema salvo — aplica ANTES da cor para que os toms de cor
   do tema escuro já estejam disponíveis quando a cor for lida
   ══════════════════════════════════════════════════════════ */
(function aplicarTemaSalvoNoLoad() {
  try {
    const _s = localStorage.getItem('cfg-modo-tema');
    if (_s === null) return;
    const _n = parseInt(_s, 10);
    if (isNaN(_n) || _n < 0 || _n > 2) return;

    const _prefereDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const _deveEscuro  = _n === 2 || (_n === 1 && _prefereDark);
    if (!_deveEscuro) return;

    const _DARK_VARS = `
      --cor-fundo:              18, 18, 22;
      --cor-letra:              210, 220, 235;
      --cor-letra-apagada:      120, 132, 148;
      --cor-sombra-apagada:     0, 0, 0;
      --cor-branco:             255, 255, 255;
      --cor-branco-fraco:       30, 32, 40;
      --cor-branco-claro:       26, 28, 35;
      --cor-branco-medio:       22, 24, 30;
      --cor-branco-escuro:      60, 68, 82;
      --cor-cinza-borda:        45, 48, 58;
      --cor-icone-senha:        90, 100, 115;
      --cor-cinza-fundo:        15, 16, 20;
      --cor-relevo-claro:       26, 28, 35;
      --cor-relevo-material:    23, 25, 30;
      --cor-fill-drive:         51, 41, 24;
      --cor-inset-escuro:       0, 0, 0;
      --cor-inset-claro:        80, 100, 130;
      --cor-overlay-escuro:     0, 0, 0;
      --cor-overlay-calendario: 0, 0, 0;
      --tom-azul-escuro:        30, 100, 200;
      --tom-azul-claro:         70, 145, 255;
      --tom-roxo-escuro:        140, 75, 170;
      --tom-roxo-claro:         165, 115, 220;
      --tom-rosa-escuro:        220, 85, 175;
      --tom-rosa-claro:         240, 120, 210;
      --tom-vermelho-escuro:    170, 45, 30;
      --tom-vermelho-claro:     220, 80, 65;
      --tom-ciano-escuro:       0, 165, 175;
      --tom-ciano-claro:        30, 200, 215;
      --tom-musgo-escuro:       80, 115, 85;
      --tom-musgo-claro:        100, 165, 155;
      --tom-cinza-escuro:       120, 120, 125;
      --tom-cinza-claro:        170, 170, 175;
      --tom-laranja-escuro:     230, 120, 55;
      --tom-laranja-claro:      255, 165, 115;
      --tom-marinho-escuro:     20, 70, 155;
      --tom-marinho-claro:      40, 105, 200;
      --tom-verde-escuro:       80, 175, 95;
      --tom-verde-claro:        100, 210, 145;
      --tom-marrom-escuro:      170, 85, 35;
      --tom-marrom-claro:       190, 135, 95;
      --tom-amarelo-escuro:     235, 145, 10;
      --tom-amarelo-claro:      255, 195, 30;
      --cor-erro-claro:         55, 18, 18;
      --text-shadow-apagado:    -1.5px 2px 2px rgba(var(--cor-inset-claro), 0.2);
      --text-shadow-letra:       1.5px 1.5px 2px rgba(var(--cor-sombra-apagada), 0.45);
      --text-shadow-branco:      0 0 3px rgba(var(--cor-branco-claro), 0.4);
    `;
    const _DARK_DIA_VARS = `
      .dia-prova   { --rgb1: var(--cor-prova-claro) !important;         --rgb2: var(--cor-prova) !important; }
      .dia-teste   { --rgb1: var(--cor-teste-claro) !important;         --rgb2: var(--cor-teste) !important; }
      .dia-projeto { --rgb1: var(--cor-projeto-claro) !important;       --rgb2: var(--cor-projeto) !important; }
      .dia-tarefa  { --rgb1: var(--cor-tarefa-claro) !important;        --rgb2: var(--cor-tarefa) !important; }
    `;

    // Injeta o <style> com id fixo — o mesmo usado por _aplicarTema() mais tarde,
    // então quando o painel de config montar, ele apenas sobrescreve o conteúdo.
    let _el = document.getElementById('cfg-tema-escuro');
    if (!_el) {
      _el = document.createElement('style');
      _el.id = 'cfg-tema-escuro';
      document.head.appendChild(_el);
    }
    _el.textContent = `:root { ${_DARK_VARS} } ${_DARK_DIA_VARS}`;
  } catch(e) {}
})();


/* ══════════════════════════════════════════════════════════
   Cor salva — aplica no carregamento antes da bola de cristal
   ══════════════════════════════════════════════════════════ */
(function aplicarCorSalvaNoLoad() {
  try {
    const _saved = localStorage.getItem('cfg-cor-paleta');
    if (_saved === null) return;
    const _n = parseInt(_saved, 10);
    if (isNaN(_n) || _n < 0) return;
    // A paleta é montada em ordem fixa em montarPainelConfig
    const _NOMES_TOM = [
      'azul','roxo','rosa','vermelho','ciano','musgo',
      'cinza','laranja','marinho','verde','marrom','amarelo'
    ];
    if (_n >= _NOMES_TOM.length) return;
    const st   = getComputedStyle(document.documentElement);
    const nome = _NOMES_TOM[_n];
    const escuro = st.getPropertyValue(`--tom-${nome}-escuro`).trim();
    const claro  = st.getPropertyValue(`--tom-${nome}-claro`).trim();
    if (!escuro || !claro) return;
    document.documentElement.style.setProperty('--cor-principal-escuro', escuro);
    document.documentElement.style.setProperty('--cor-principal-claro',  claro);
  } catch(e) {}
})();

/* ══════════════════════════════════════════════════════════
   Favicon — usa --cor-principal-escuro e --cor-principal-claro
   ══════════════════════════════════════════════════════════ */
function atualizarFavicon(idxOverride) {
  const _NOMES_TOM = [
    'azul','roxo','rosa','vermelho','ciano','musgo',
    'cinza','laranja','marinho','verde','marrom','amarelo'
  ];
  const _TOMS = {
    azul:      ['10,80,165',  '0,110,205',  '30,100,200', '70,145,255' ],
    roxo:      ['119,55,145', '129,85,185', '140,75,170', '165,115,220'],
    rosa:      ['215,70,160', '225,100,200','220,85,175', '240,120,210'],
    vermelho:  ['135,25,5',   '195,55,45',  '170,45,30',  '220,80,65'  ],
    ciano:     ['0,135,145',  '10,165,185', '0,165,175',  '30,200,215' ],
    musgo:     ['65,90,70',   '80,135,130', '80,115,85',  '100,165,155'],
    cinza:     ['65,65,65',   '115,115,115','120,120,125','170,170,175'],
    laranja:   ['220,100,45', '240,145,105','230,120,55', '255,165,115'],
    marinho:   ['0,50,125',   '10,80,165',  '20,70,155',  '40,105,200' ],
    verde:     ['70,150,80',  '80,180,120', '80,175,95',  '100,210,145'],
    marrom:    ['145,65,20',  '160,110,80', '170,85,35',  '190,135,95' ],
    amarelo:   ['220,120,0',  '250,170,10', '235,145,10', '255,195,30' ],
  };

  let nome = 'azul';
  try {
    const _n = (idxOverride !== undefined) ? idxOverride : parseInt(localStorage.getItem('cfg-cor-paleta'), 10);
    if (!isNaN(_n) && _n >= 0 && _n < _NOMES_TOM.length) nome = _NOMES_TOM[_n];
  } catch(e) {}

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [el, cl, ed, cd] = _TOMS[nome];
  const escuro = dark ? ed : el;
  const claro  = dark ? cd : cl;

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='30 30 160 160'>` +
    `<path d='M 50,110 A 60,60 0 1 1 110,170' fill='none' stroke='rgb(${escuro})' stroke-width='28' stroke-linecap='round'/>` +
    `<path d='M 110,50 A 60,60 0 0 1 170,110' fill='none' stroke='rgb(${claro})' stroke-width='34' stroke-linecap='round'/>` +
    `<circle cx='110' cy='170' r='17' fill='rgb(${claro})'/>` +
    `<circle cx='110' cy='110' r='17' fill='rgb(${escuro})'/>` +
    `</svg>`;

  let link = document.querySelector("link[rel='icon']");
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);

  let metaTheme = document.querySelector("meta[name='theme-color']");
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    document.head.appendChild(metaTheme);
  }
  metaTheme.content = `rgb(${escuro})`;
}

/* Atualiza favicon quando o modo do sistema mudar */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => atualizarFavicon());
atualizarFavicon();


/* ══════════════════════════════════════════════════════════
   Modal de login da SALA — autentica contra o banco de dados
   Fecha apenas com código válido no Supabase (tabela salas)
   ══════════════════════════════════════════════════════════ */
(function inicializarModalSala() {
  const overlay   = document.getElementById('modal-login-sala');
  const campoCod  = document.getElementById('campo-codigo-sala');
  const btnEntrar = document.getElementById('botao-entrar-sala');

  /* ── Restaura sala salva no localStorage (persiste entre sessões) ── */
  (function restaurarSalaSalva() {
    try {
      const salva = localStorage.getItem('salaAtual');
      if (!salva) return;
      const sala = JSON.parse(salva);
      if (!sala || !sala.id) return;
      window._salaAtual       = sala;
      window._codigoSalaAtual = sala.codigo;
      if (overlay) {
        overlay.classList.remove('aberto');
        overlay.style.pointerEvents = 'none';
      }
    } catch(e) {}
  })();

  /* ── Typewriter no título do modal da sala ── */
  (function iniciarTypewriterSala() {
    const el = document.getElementById('titulo-login-sala-dinamico');
    if (!el) return;
    const h2     = document.createElement('h2');
    const cursor = document.createElement('span');
    cursor.textContent = '|';
    el.appendChild(h2);
    el.appendChild(cursor);

    const palavras = ['bem-vindo!', 'qual é o código?', 'acesso à sala'];
    let iP = 0, iC = 0, apagando = false;

    function tick() {
      const p = palavras[iP];
      if (!apagando) {
        h2.textContent = p.slice(0, ++iC);
        if (iC === p.length) { apagando = true; setTimeout(tick, 2200); return; }
        setTimeout(tick, 65);
      } else {
        h2.textContent = p.slice(0, --iC);
        if (iC === 0) { apagando = false; iP = (iP + 1) % palavras.length; setTimeout(tick, 450); return; }
        setTimeout(tick, 38);
      }
    }
    setTimeout(tick, 500);
  })();

  function mostrarErro() {
    campoCod.classList.add('login-erro');
  }

  function limparErroSala() {
    campoCod.classList.remove('login-erro');
  }

  async function tentarEntrar() {
    const codigo = campoCod.value.trim();
    if (!codigo) { mostrarErro('Digite o código da sala.'); return; }

    btnEntrar.disabled = true;
    limparErroSala();

    try {
      const r = await fetch('/api/sala/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo })
      });
      const json = await r.json();

      if (!r.ok) {
        mostrarErro(json.error || 'Código inválido.');
        return;
      }

      /* Código correto — salva sala e fecha o modal */
      window._salaAtual = { id: json.id, nome: json.nome, codigo: json.codigo };
      window._codigoSalaAtual = json.codigo; // compatibilidade com código existente

      try { localStorage.setItem('salaAtual', JSON.stringify(window._salaAtual)); } catch(e) {}

      overlay.classList.remove('aberto');
      overlay.style.pointerEvents = 'none';

      /* Recarrega dados e re-renderiza a aba ativa em qualquer contexto */
      const _btnAtivo = document.querySelector('.nav-btn.active');
      carregarDadosAtividades().then(() => {
        if (_btnAtivo) renderAbaAtiva(_btnAtivo.id);
      });

    } catch (e) {
      mostrarErro('Erro de conexão. Tente novamente.');
      console.error('[sala-login]', e);
    } finally {
      btnEntrar.disabled = false;
    }
  }

  btnEntrar.addEventListener('click', tentarEntrar);
  campoCod.addEventListener('keydown', e => { if (e.key === 'Enter') tentarEntrar(); });
  campoCod.addEventListener('input', limparErroSala);
  campoCod.addEventListener('focus', limparErroSala);
})();



(function inicializarIndicadorCristal() {
  const BASE = 200;
  const dpr  = window.devicePixelRatio || 2;

  const canvas = document.getElementById('canvas-indicador');
  const indicatorEl = document.getElementById('indicator');
  const logico = indicatorEl.offsetWidth || 52.5;
  canvas.width  = Math.round(logico * dpr);
  canvas.height = Math.round(logico * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const off = document.createElement('canvas');
  off.width  = BASE;
  off.height = BASE;
  const offCtx = off.getContext('2d');

  const _estiloRaiz = getComputedStyle(document.documentElement);
  // Arrays mutáveis — atualizados por atualizarCorCristal()
  let escuro = _estiloRaiz.getPropertyValue('--cor-principal-escuro').trim().split(',').map(Number);
  let claro  = _estiloRaiz.getPropertyValue('--cor-principal-claro' ).trim().split(',').map(Number);
  let fundo  = _estiloRaiz.getPropertyValue('--cor-cinza-fundo').trim().split(',').map(Number);

  // Transição suave de cor: interpola do atual para o alvo ao longo de ~600ms
  let _escuroAlvo = escuro.slice();
  let _claroAlvo  = claro.slice();
  let _escuroOrig = escuro.slice();
  let _claroOrig  = claro.slice();
  let _transicaoT  = 1; // 1 = parado (já chegou)
  const _TRANS_DUR = 600; // ms
  let _transicaoStart = 0;

  // Exposto globalmente para selecionarCor() chamar
  window.atualizarCorCristal = function(novoEscuro, novoClaro) {
    _escuroOrig = [escuro[0], escuro[1], escuro[2]];
    _claroOrig  = [claro[0],  claro[1],  claro[2] ];
    _escuroAlvo = novoEscuro.slice();
    _claroAlvo  = novoClaro.slice();
    _transicaoStart = performance.now();
    _transicaoT = 0;
    // Atualiza o fundo com a nova cor clara (leitura pontual, não constante)
    fundo = novoClaro.slice();
  };

  let t = 0, angle = 0;

  function gerarRuidoCristal(x, y, t) {
    return Math.sin(x * 0.04 + t) * Math.cos(y * 0.03 + t * 0.7) * 0.5
         + Math.sin(x * 0.02 + y * 0.025 + t * 1.3) * 0.3
         + Math.cos(x * 0.05 - y * 0.02  + t * 0.9) * 0.2;
  }

  function suavizarTransicaoCor(v) {
    return 1 / (1 + Math.exp(-7 * (v - 0.5)));
  }

  function _easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }

  function desenharCristal() {
    // Atualiza interpolação de cor se transição em andamento
    if (_transicaoT < 1) {
      const prog = Math.min((performance.now() - _transicaoStart) / _TRANS_DUR, 1);
      _transicaoT = _easeInOut(prog);
      escuro = [
        _escuroOrig[0] + _transicaoT * (_escuroAlvo[0] - _escuroOrig[0]),
        _escuroOrig[1] + _transicaoT * (_escuroAlvo[1] - _escuroOrig[1]),
        _escuroOrig[2] + _transicaoT * (_escuroAlvo[2] - _escuroOrig[2]),
      ];
      claro = [
        _claroOrig[0] + _transicaoT * (_claroAlvo[0] - _claroOrig[0]),
        _claroOrig[1] + _transicaoT * (_claroAlvo[1] - _claroOrig[1]),
        _claroOrig[2] + _transicaoT * (_claroAlvo[2] - _claroOrig[2]),
      ];
    }

    const img = offCtx.createImageData(BASE, BASE);
    const d   = img.data;
    const cx  = BASE / 2, cy = BASE / 2, r = BASE / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) {
          const i = (y * BASE + x) * 4;
          d[i] = fundo[0]; d[i+1] = fundo[1]; d[i+2] = fundo[2]; d[i+3] = 255;
          continue;
        }

        const rx = cos * dx - sin * dy + cx;
        const ry = sin * dx + cos * dy + cy;

        const n    = gerarRuidoCristal(rx, ry, t);
        const norm = (rx / BASE) + n * 0.35;
        const raw  = Math.max(0, Math.min(1, (norm - 0.2) / 0.6));
        const b    = suavizarTransicaoCor(raw);

        const i = (y * BASE + x) * 4;
        d[i]   = claro[0] + b * (escuro[0] - claro[0]);
        d[i+1] = claro[1] + b * (escuro[1] - claro[1]);
        d[i+2] = claro[2] + b * (escuro[2] - claro[2]);
        d[i+3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  let _cristalPaused = false;
  let _cristalRafId  = null;

  function animarCristal() {
    if (!_cristalPaused) {
      t     += 0.02;
      angle += 0.002;
      desenharCristal();
    }
    _cristalRafId = requestAnimationFrame(animarCristal);
  }

  document.addEventListener('visibilitychange', () => {
    _cristalPaused = document.hidden;
  });

  _cristalRafId = requestAnimationFrame(animarCristal);
})();


/* ══════════════════════════════════════════════════════════
   Nomes das abas por botão
   btn-add omitido aqui — é adicionado dinamicamente após login
   ══════════════════════════════════════════════════════════ */
const nomesAbas = {
  'bnt-proximo':    { nome: 'atividades próximas', id: 'aba-notas'      },
  'btn-calendario': { nome: 'calendário',          id: 'aba-calendario' },
  'btn-material':   { nome: 'materiais extras',    id: 'aba-pasta'      },
  'btn-config':   { nome: 'configurações',       id: 'aba-filtros'    },
};

// Referência pela classe fixa — não perde o elemento quando o id muda
const abaNome = document.querySelector('.aba-nome');

function atualizarNomeAba(btnId) {
  const aba = nomesAbas[btnId];
  if (aba !== undefined) {
    abaNome.textContent = aba.nome;
    abaNome.id = aba.id;
  }
}


/* ══════════════════════════════════════════════════════════
   Conteúdo por aba — aluno vs representante
   ══════════════════════════════════════════════════════════ */
const conteudoAbas = {
  'btn-calendario': {
    aluno:         () => renderCalendarioAluno(),
    representante: () => renderCalendarioRepre(),
  },
  'bnt-proximo': {
    aluno:         () => renderAtividadesAluno(),
    representante: () => renderAtividadesRepre(),
  },
  'btn-material': {
    aluno:         () => renderMateriaisAluno(),
    representante: () => renderMateriaisRepre(),
  },
  'btn-config': {
    aluno:         () => renderConfigAluno(),
    representante: () => renderConfigRepre(),
  },
};

// conteudo-tipo é sempre remontado ao trocar de aba

function mostrarConteudo() {
  conteudoTipo.style.opacity = '1';
  conteudoTipo.style.pointerEvents = 'auto';
}

function esconderConteudo() {
  conteudoTipo.style.opacity = '0';
  conteudoTipo.style.pointerEvents = 'none';
}

function _garantirSalaLogada() {
  if (window._salaAtual) return true;
  const modalSala = document.getElementById('modal-login-sala');
  if (modalSala) {
    modalSala.style.pointerEvents = '';
    modalSala.classList.add('aberto');
  }
  return false;
}

function renderAbaAtiva(btnId) {
  if (!_garantirSalaLogada()) return;
  const aba = conteudoAbas[btnId];
  if (!aba) {
    // aba sem conteúdo (ex: btn-add) — esconde sem destruir
    esconderConteudo();
    return;
  }
  const role = sessao ? 'representante' : 'aluno';
  aba[role]();
}

/* ── Implemente o conteúdo de cada aba abaixo ─────────── */
function renderCalendarioAluno() {
  limparConteudo();
  montarCalendario();
  mostrarConteudo();
}
function renderCalendarioRepre()   { renderCalendarioAluno(); }
function renderAtividadesAluno() {
  limparConteudo();
  montarPainelAtividadesProximas();
  mostrarConteudo();
}
function renderAtividadesRepre()   { renderAtividadesAluno(); }
function renderMateriaisAluno()   { limparConteudo(); _renderEstruturaMateriais(); mostrarConteudo(); _carregarDadosMateriais(); }
function renderMateriaisRepre()   { limparConteudo(); _renderEstruturaMateriais(); mostrarConteudo(); _carregarDadosMateriais(); }
function renderConfigAluno()  { limparConteudo(); montarPainelConfig(); mostrarConteudo(); }
function renderConfigRepre() { renderConfigAluno(); }


/* ══════════════════════════════════════════════════════════
   Aba "configurações" — aparência e exibição
   ══════════════════════════════════════════════════════════ */

/* ── Loop compartilhado para todas as esferas do painel de cores ──
   Em vez de 12 requestAnimationFrame independentes (12 × 40k pixels/frame),
   um único loop sequencial renderiza todas as esferas cadastradas,
   com throttle de 20 fps (suficiente para bolinhas decorativas). */
const _esferasAtivas = [];   // lista de descritores de esfera
let   _esferaLoopAtivo = false;
const _ESFERA_FPS    = 20;
const _ESFERA_INTERVALO = 1000 / _ESFERA_FPS;
let   _esferaUltimoFrame = 0;

function _tickEsferas(agora) {
  if (!_esferaLoopAtivo) return;
  requestAnimationFrame(_tickEsferas);
  if (agora - _esferaUltimoFrame < _ESFERA_INTERVALO) return; // throttle
  if (document.hidden) return;
  _esferaUltimoFrame = agora;

  for (let s = 0; s < _esferasAtivas.length; s++) {
    const e = _esferasAtivas[s];
    e.t   += 0.02 * (60 / _ESFERA_FPS); // compensa velocidade no throttle
    e.ang += 0.002 * (60 / _ESFERA_FPS);
    _desenharEsfera(e);
  }
}

function _desenharEsfera(e) {
  const { offCtx, ctx, canvas, escuro, claro, BASE } = e;
  const img = offCtx.createImageData(BASE, BASE);
  const d   = img.data;
  const cx  = BASE / 2, r = BASE / 2;
  const cos = Math.cos(e.ang), sin = Math.sin(e.ang);
  for (let py = 0; py < BASE; py++) {
    for (let px = 0; px < BASE; px++) {
      const dx = px - cx, dy = py - cx;
      if (dx * dx + dy * dy > r * r) continue;
      const rx = cos * dx - sin * dy + cx;
      const ry = sin * dx + cos * dy + cx;
      const n   = Math.sin(rx * 0.04 + e.t) * Math.cos(ry * 0.03 + e.t * 0.7) * 0.5
                + Math.sin(rx * 0.02 + ry * 0.025 + e.t * 1.3) * 0.3
                + Math.cos(rx * 0.05 - ry * 0.02  + e.t * 0.9) * 0.2;
      const raw = Math.max(0, Math.min(1, ((rx / BASE) + n * 0.35 - 0.2) / 0.6));
      const b   = 1 / (1 + Math.exp(-7 * (raw - 0.5)));
      const i   = (py * BASE + px) * 4;
      d[i]   = claro[0] + b * (escuro[0] - claro[0]);
      d[i+1] = claro[1] + b * (escuro[1] - claro[1]);
      d[i+2] = claro[2] + b * (escuro[2] - claro[2]);
      d[i+3] = 255;
    }
  }
  offCtx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(e.off, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function _initEsfera(canvasId, opts) {
  opts = opts || {};
  // Esferas do painel de cores são pequenas (≤37.5px) — usa BASE menor para economizar
  const BASE   = opts.tamanho && opts.tamanho <= 40 ? 100 : 200;
  const dpr    = window.devicePixelRatio || 2;
  const LOGICO = opts.tamanho || 52.5;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return function(){};

  canvas.width  = Math.round(LOGICO * dpr);
  canvas.height = Math.round(LOGICO * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const off = document.createElement('canvas');
  off.width = off.height = BASE;
  const offCtx = off.getContext('2d');

  const desc = {
    canvas, ctx, off, offCtx, BASE,
    escuro: opts.corEscuro || [7, 79, 163],
    claro:  opts.corClaro  || [1, 110, 203],
    t:   0,
    ang: opts.anguloInicial || 0,
  };

  _esferasAtivas.push(desc);

  // Inicia o loop compartilhado se ainda não estiver rodando
  if (!_esferaLoopAtivo) {
    _esferaLoopAtivo = true;
    requestAnimationFrame(_tickEsferas);
  }

  // Retorna função para remover esta esfera do loop (ex: ao trocar de aba)
  return function() {
    const idx = _esferasAtivas.indexOf(desc);
    if (idx !== -1) _esferasAtivas.splice(idx, 1);
    if (_esferasAtivas.length === 0) _esferaLoopAtivo = false;
  };
}

/* ── Dados dos estados do modo-slider ── */
const _CFG_STATES = [
  {
    main: 'M12,8 A4,4 0 1,1 11.9999,8 Z',
    extras: ['M12 2 L12 4','M12 20 L12 22','M4.93 4.93 L6.34 6.34','M17.66 17.66 L19.07 19.07','M2 12 L4 12','M20 12 L22 12','M6.34 17.66 L4.93 19.07','M19.07 4.93 L17.66 6.34'],
  },
  {
    main: 'M11.017 2.814 A1,1 0 0,1 12.983 2.814 L14.034 8.372 A2,2 0 0,0 15.628 9.966 L21.186 11.017 A1,1 0 0,1 21.186 12.983 L15.628 14.034 A2,2 0 0,0 14.034 15.628 L12.983 21.186 A1,1 0 0,1 11.017 21.186 L9.966 15.628 A2,2 0 0,0 8.372 14.034 L2.814 12.983 A1,1 0 0,1 2.814 11.017 L8.372 9.966 A2,2 0 0,0 9.966 8.372 Z',
    extras: ['M4,18 A2,2 0 1,1 3.9999,18 Z', 'M20 2 L20 6', 'M22 4 L18 4'],
  },
  {
    main: 'M20.985 12.486 A9,9 0 1,1 11.512 3.014 C11.917 2.992 12.129 3.474 11.914 3.817 A6,6 0 0,0 20.182 12.085 C20.526 11.87 21.007 12.081 20.985 12.486 Z',
    extras: ['M20 2 L20 6', 'M22 4 L18 4'],
  },
];

const _CFG_PLUS_V = 'M20 2 L20 6';
const _CFG_PLUS_H = 'M22 4 L18 4';
const _CFG_DOT    = 'M12,12 A0.001,0.001 0 1,1 11.9999,12 Z';
const _CFG_DUR    = 500;

const _cfgEaseInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const _cfgEaseIn    = t => t * t * t;
const _cfgEaseOut   = t => 1 - Math.pow(1 - t, 3);

function _cfgHasPlus(idx)    { return _CFG_STATES[idx].extras.includes(_CFG_PLUS_V); }
function _cfgNakedExtras(idx){ return _CFG_STATES[idx].extras.filter(d => d !== _CFG_PLUS_V && d !== _CFG_PLUS_H); }

function _cfgSafeInterp(a, b) {
  try { return (typeof flubber !== 'undefined') ? flubber.interpolate(a, b, { maxSegmentLength: 0.5 }) : t => t < 0.5 ? a : b; }
  catch(e) { return t => t < 0.5 ? a : b; }
}

/* ── Montagem do painel de configurações ── */
function montarPainelConfig() {
  const NS   = 'http://www.w3.org/2000/svg';
  const root = document.documentElement;
  const st   = getComputedStyle(root);
  const parseRgb = v => st.getPropertyValue(v).trim().split(',').map(Number);

  const PALETA = [
    [parseRgb('--tom-azul-escuro'),     parseRgb('--tom-azul-claro')    ],
    [parseRgb('--tom-roxo-escuro'),     parseRgb('--tom-roxo-claro')    ],
    [parseRgb('--tom-rosa-escuro'),     parseRgb('--tom-rosa-claro')    ],
    [parseRgb('--tom-vermelho-escuro'), parseRgb('--tom-vermelho-claro')],
    [parseRgb('--tom-ciano-escuro'),    parseRgb('--tom-ciano-claro')   ],
    [parseRgb('--tom-musgo-escuro'),    parseRgb('--tom-musgo-claro')   ],
    [parseRgb('--tom-cinza-escuro'),    parseRgb('--tom-cinza-claro')   ],
    [parseRgb('--tom-laranja-escuro'),  parseRgb('--tom-laranja-claro') ],
    [parseRgb('--tom-marinho-escuro'),  parseRgb('--tom-marinho-claro') ],
    [parseRgb('--tom-verde-escuro'),    parseRgb('--tom-verde-claro')   ],
    [parseRgb('--tom-marrom-escuro'),   parseRgb('--tom-marrom-claro')  ],
    [parseRgb('--tom-amarelo-escuro'),  parseRgb('--tom-amarelo-claro') ],
  ];

  // ── HTML dos dois blocos ──
  conteudoTipo.innerHTML = `
    <div class="container-largura-total" style="display:flex;flex-direction:column;gap:2vh;padding:2vh 20px 20px 20px;overflow-y:auto;overflow-x:hidden;max-height:100%;scrollbar-width:none;touch-action:pan-y;">

      <!-- Aparência -->
      <div class="tema-container">
        <h2 class="texto-config">Aparência:</h2>
        <div class="modo-slider" id="cfg-modo-slider">
          ${[0,1,2].map(i => `
          <span class="icone-modo" id="cfg-icone-${i}" data-cfg-idx="${i}">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <g id="cfg-static-g-${i}" fill="none"></g>
            </svg>
          </span>`).join('')}
          <div class="modo-atual" id="cfg-modo-atual">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <g id="cfg-anim-g" fill="none"></g>
            </svg>
          </div>
        </div>
        <div class="painel-cor">
          ${PALETA.map((_,i) => `
          <span class="painel-cor-esfera" id="cfg-esfera-${i}" data-cfg-esfera="${i}">
            <canvas id="cfg-esfera-canvas-${i}"></canvas>
          </span>`).join('')}
        </div>
      </div>

      <!-- Exibição -->
      <div class="tema-container">
        <h2 class="texto-config">Exibição:</h2>
        <div class="painel-exibir">
          <button id="exibir-sala">sala</button>
          <button id="exibir-casa">casa</button>
        </div>
      </div>

    </div>
  `;

  // ── Ícones estáticos ──
  [0,1,2].forEach(idx => {
    const g = document.getElementById(`cfg-static-g-${idx}`);
    if (!g) return;
    const mk = d => { const p = document.createElementNS(NS,'path'); p.setAttribute('d',d); p.setAttribute('fill','none'); g.appendChild(p); };
    mk(_CFG_STATES[idx].main);
    if (_cfgHasPlus(idx)) { mk(_CFG_PLUS_V); mk(_CFG_PLUS_H); }
    _cfgNakedExtras(idx).forEach(mk);
  });

  // ── Pool animado ──
  const animG = document.getElementById('cfg-anim-g');
  const pool  = Array.from({ length: 12 }, () => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('opacity', '0');
    animG.appendChild(p);
    return p;
  });

  const setP = (i, d, op) => {
    pool[i].setAttribute('d', d || '');
    pool[i].setAttribute('opacity', op != null ? String(op) : '0');
  };

  function applyStatic(idx) {
    pool.forEach(p => { p.setAttribute('d',''); p.setAttribute('opacity','0'); });
    setP(0, _CFG_STATES[idx].main, 1);
    const sp = _cfgHasPlus(idx);
    setP(1, _CFG_PLUS_V, sp ? 1 : 0);
    setP(2, _CFG_PLUS_H, sp ? 1 : 0);
    _cfgNakedExtras(idx).forEach((d,i) => setP(3+i, d, 1));
  }

  // ── Indicador ──
  const indicatorEl = document.getElementById('cfg-modo-atual');
  function positionIndicator(idx, animate) {
    const sliderRect = document.getElementById('cfg-modo-slider').getBoundingClientRect();
    const iconRect   = document.getElementById(`cfg-icone-${idx}`).getBoundingClientRect();
    const top = iconRect.top + iconRect.height / 2 - sliderRect.top - indicatorEl.offsetHeight / 2;
    indicatorEl.style.transition = animate ? 'top 0.5s cubic-bezier(0.4,0,0.2,1)' : 'none';
    indicatorEl.style.top = top + 'px';
  }

  // ── Morfismo ──
  let cfgCurrent = 0, cfgGen = 0;

  function animateMorph(from, to, gen) {
    const mainInterp  = _cfgSafeInterp(_CFG_STATES[from].main, _CFG_STATES[to].main);
    const fromExtras  = _cfgNakedExtras(from), toExtras = _cfgNakedExtras(to);
    const fromHasP = _cfgHasPlus(from), toHasP = _cfgHasPlus(to);
    const cvV = fromHasP && !toHasP ? _cfgSafeInterp(_CFG_PLUS_V, _CFG_DOT) : null;
    const cvH = fromHasP && !toHasP ? _cfgSafeInterp(_CFG_PLUS_H, _CFG_DOT) : null;
    const evV = !fromHasP && toHasP ? _cfgSafeInterp(_CFG_DOT, _CFG_PLUS_V) : null;
    const evH = !fromHasP && toHasP ? _cfgSafeInterp(_CFG_DOT, _CFG_PLUS_H) : null;
    const collapseI = fromExtras.map(d => _cfgSafeInterp(d, _CFG_DOT));
    const expandI   = toExtras.map(d => _cfgSafeInterp(_CFG_DOT, d));

    pool.forEach(p => { p.setAttribute('opacity','0'); p.setAttribute('d',''); });
    pool[0].setAttribute('opacity','1');
    fromExtras.forEach((d,i) => setP(3+i, d, 1));
    if (fromHasP) { setP(1, _CFG_PLUS_V, 1); setP(2, _CFG_PLUS_H, 1); }

    const start = performance.now();
    function frame(now) {
      const raw = Math.min((now - start) / _CFG_DUR, 1);
      const t   = _cfgEaseInOut(raw);
      setP(0, mainInterp(t), 1);

      if (fromHasP && toHasP)   { setP(1, _CFG_PLUS_V, 1); setP(2, _CFG_PLUS_H, 1); }
      else if (fromHasP) { const lt = Math.min(raw/0.65,1), op = 1-_cfgEaseIn(lt); setP(1, cvV(_cfgEaseIn(lt)), op); setP(2, cvH(_cfgEaseIn(lt)), op); }
      else if (toHasP)   { const lt = Math.max(0,(raw-0.35)/0.65), op = _cfgEaseOut(lt); setP(1, evV(_cfgEaseOut(lt)), op); setP(2, evH(_cfgEaseOut(lt)), op); }

      fromExtras.forEach((d,i) => { const lt = Math.min(raw/0.65,1); setP(3+i, collapseI[i](_cfgEaseIn(lt)), 1-_cfgEaseIn(lt)); });
      toExtras.forEach((d,i)   => { const lt = Math.max(0,(raw-0.35)/0.65); setP(3+fromExtras.length+i, expandI[i](_cfgEaseOut(lt)), _cfgEaseOut(lt)); });

      if (raw < 1 && gen === cfgGen) requestAnimationFrame(frame);
      else if (gen === cfgGen) applyStatic(to);
    }
    requestAnimationFrame(frame);
  }

  // ── Tema escuro — variáveis injetadas via <style> ──
  const _DARK_VARS = `
    --cor-fundo:              18, 18, 22;
    --cor-letra:              210, 220, 235;
    --cor-letra-apagada:      120, 132, 148;
    --cor-sombra-apagada:     0, 0, 0;
    --cor-branco:             255, 255, 255;
    --cor-branco-fraco:       30, 32, 40;
    --cor-branco-claro:       26, 28, 35;
    --cor-branco-medio:       22, 24, 30;
    --cor-branco-escuro:      60, 68, 82;
    --cor-cinza-borda:        45, 48, 58;
    --cor-icone-senha:        90, 100, 115;
    --cor-cinza-fundo:        15, 16, 20;
    --cor-relevo-claro:       26, 28, 35;
    --cor-relevo-material:    23, 25, 30;
    --cor-fill-drive:         51, 41, 24;
    --cor-inset-escuro:       0, 0, 0;
    --cor-inset-claro:        80, 100, 130;
    --cor-overlay-escuro:     0, 0, 0;
    --cor-overlay-calendario: 0, 0, 0;
    --tom-azul-escuro:        30, 100, 200;
    --tom-azul-claro:         70, 145, 255;
    --tom-roxo-escuro:        140, 75, 170;
    --tom-roxo-claro:         165, 115, 220;
    --tom-rosa-escuro:        220, 85, 175;
    --tom-rosa-claro:         240, 120, 210;
    --tom-vermelho-escuro:    170, 45, 30;
    --tom-vermelho-claro:     220, 80, 65;
    --tom-ciano-escuro:       0, 165, 175;
    --tom-ciano-claro:        30, 200, 215;
    --tom-musgo-escuro:       80, 115, 85;
    --tom-musgo-claro:        100, 165, 155;
    --tom-cinza-escuro:       120, 120, 125;
    --tom-cinza-claro:        170, 170, 175;
    --tom-laranja-escuro:     230, 120, 55;
    --tom-laranja-claro:      255, 165, 115;
    --tom-marinho-escuro:     20, 70, 155;
    --tom-marinho-claro:      40, 105, 200;
    --tom-verde-escuro:       80, 175, 95;
    --tom-verde-claro:        100, 210, 145;
    --tom-marrom-escuro:      170, 85, 35;
    --tom-marrom-claro:       190, 135, 95;
    --tom-amarelo-escuro:     235, 145, 10;
    --tom-amarelo-claro:      255, 195, 30;
    --cor-erro-claro:         55, 18, 18;
    --text-shadow-apagado:    -1.5px 2px 2px rgba(var(--cor-inset-claro), 0.2);
    --text-shadow-letra:       1.5px 1.5px 2px rgba(var(--cor-sombra-apagada), 0.45);
    --text-shadow-branco:      0 0 3px rgba(var(--cor-branco-claro), 0.4);
  `;

  const _DARK_DIA_VARS = `
    .dia-prova   { --rgb1: var(--cor-prova-claro) !important;         --rgb2: var(--cor-prova) !important; }
    .dia-teste   { --rgb1: var(--cor-teste-claro) !important;         --rgb2: var(--cor-teste) !important; }
    .dia-projeto { --rgb1: var(--cor-projeto-claro) !important;       --rgb2: var(--cor-projeto) !important; }
    .dia-tarefa  { --rgb1: var(--cor-tarefa-claro) !important;        --rgb2: var(--cor-tarefa) !important; }
  `;

  // Reutiliza o elemento já criado pela IIFE de inicialização (se existir)
  let _darkStyleEl = document.getElementById('cfg-tema-escuro') || null;

  function _aplicarTema(modo) {
    // modo: 0=claro, 1=sistema, 2=escuro
    const prefereDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const deveEscuro  = modo === 2 || (modo === 1 && prefereDark);

    if (deveEscuro) {
      if (!_darkStyleEl) {
        _darkStyleEl = document.createElement('style');
        _darkStyleEl.id = 'cfg-tema-escuro';
        document.head.appendChild(_darkStyleEl);
      }
      _darkStyleEl.textContent = `:root { ${_DARK_VARS} } ${_DARK_DIA_VARS}`;
    } else {
      if (_darkStyleEl) { _darkStyleEl.textContent = ''; }
    }

    // Reatualiza a paleta de cores do painel (toms mudam entre claro/escuro)
    const st2 = getComputedStyle(document.documentElement);
    const parseRgb2 = v => st2.getPropertyValue(v).trim().split(',').map(Number);
    const novasPaleta = [
      [parseRgb2('--tom-azul-escuro'),     parseRgb2('--tom-azul-claro')    ],
      [parseRgb2('--tom-roxo-escuro'),     parseRgb2('--tom-roxo-claro')    ],
      [parseRgb2('--tom-rosa-escuro'),     parseRgb2('--tom-rosa-claro')    ],
      [parseRgb2('--tom-vermelho-escuro'), parseRgb2('--tom-vermelho-claro')],
      [parseRgb2('--tom-ciano-escuro'),    parseRgb2('--tom-ciano-claro')   ],
      [parseRgb2('--tom-musgo-escuro'),    parseRgb2('--tom-musgo-claro')   ],
      [parseRgb2('--tom-cinza-escuro'),    parseRgb2('--tom-cinza-claro')   ],
      [parseRgb2('--tom-laranja-escuro'),  parseRgb2('--tom-laranja-claro') ],
      [parseRgb2('--tom-marinho-escuro'),  parseRgb2('--tom-marinho-claro') ],
      [parseRgb2('--tom-verde-escuro'),    parseRgb2('--tom-verde-claro')   ],
      [parseRgb2('--tom-marrom-escuro'),   parseRgb2('--tom-marrom-claro')  ],
      [parseRgb2('--tom-amarelo-escuro'),  parseRgb2('--tom-amarelo-claro') ],
    ];
    novasPaleta.forEach(([esc, cla], i) => {
      const el = document.getElementById(`cfg-esfera-${i}`);
      if (!el) return;
      el.style.setProperty('--esfera-claro', cla.join(', '));
      el.style.background = `rgb(${esc.join(', ')})`;
    });

    // Reaplica cor principal salva com os novos toms
    try {
      const idxSalvo = parseInt(localStorage.getItem('cfg-cor-paleta') || '0', 10);
      const idx = (!isNaN(idxSalvo) && idxSalvo >= 0 && idxSalvo < novasPaleta.length) ? idxSalvo : 0;
      root.style.setProperty('--cor-principal-escuro', novasPaleta[idx][0].join(', '));
      root.style.setProperty('--cor-principal-claro',  novasPaleta[idx][1].join(', '));
      if (typeof window.atualizarCorCristal === 'function') {
        window.atualizarCorCristal(novasPaleta[idx][0], novasPaleta[idx][1]);
      }
      if (typeof atualizarFavicon === 'function') atualizarFavicon();
    } catch(e) {}

    try { localStorage.setItem('cfg-modo-tema', String(modo)); } catch(e) {}
  }

  // Ouve mudança de preferência do sistema enquanto estiver no modo "sistema"
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (cfgCurrent === 1) _aplicarTema(1);
  });

  function selectState(next) {
    if (next === cfgCurrent) return;
    const prev = cfgCurrent;
    cfgGen++;
    cfgCurrent = next;
    positionIndicator(next, true);
    animateMorph(prev, next, cfgGen);
    _aplicarTema(next);
  }

  // ── Inicializar slider ──
  function initSlider() {
    // Restaura modo salvo
    let _modoSalvo = 0;
    try {
      const _s = localStorage.getItem('cfg-modo-tema');
      if (_s !== null) {
        const _n = parseInt(_s, 10);
        if (!isNaN(_n) && _n >= 0 && _n <= 2) _modoSalvo = _n;
      }
    } catch(e) {}

    cfgCurrent = _modoSalvo;
    applyStatic(_modoSalvo);
    positionIndicator(_modoSalvo, false);
    _aplicarTema(_modoSalvo);

    [0,1,2].forEach(i => {
      document.getElementById(`cfg-icone-${i}`).addEventListener('click', () => selectState(i));
    });
  }

  // ── Esferas de cor ──
  let esferaAtual = null;
  function selecionarCor(escuro, claro, el, idx) {
    root.style.setProperty('--cor-principal-escuro', escuro.join(', '));
    root.style.setProperty('--cor-principal-claro',  claro.join(', '));
    if (esferaAtual) esferaAtual.classList.remove('tom-atual');
    el.classList.add('tom-atual');
    esferaAtual = el;
    if (typeof window.atualizarCorCristal === 'function') {
      window.atualizarCorCristal(escuro, claro);
    }
    if (typeof atualizarFavicon === 'function') atualizarFavicon(idx);
    if (idx !== undefined) {
      try { localStorage.setItem('cfg-cor-paleta', String(idx)); } catch(e) {}
    }
  }

  // Lê o índice salvo (padrão 0)
  let _idxCorSalva = 0;
  try {
    const _saved = localStorage.getItem('cfg-cor-paleta');
    if (_saved !== null) {
      const _n = parseInt(_saved, 10);
      if (!isNaN(_n) && _n >= 0 && _n < PALETA.length) _idxCorSalva = _n;
    }
  } catch(e) {}

  const _destruirEsferas = [];
  PALETA.forEach(([escuro, claro], i) => {
    // Escalona cada esfera em 30ms de diferença para não sobrecarregar o primeiro frame
    setTimeout(() => {
      if (!document.getElementById(`cfg-esfera-canvas-${i}`)) return; // aba já fechada
      const destruir = _initEsfera(`cfg-esfera-canvas-${i}`, {
        tamanho: 37.5,
        corEscuro: escuro,
        corClaro:  claro,
        anguloInicial: (i / 12) * Math.PI * 2
      });
      _destruirEsferas.push(destruir);
    }, i * 30);
    const el = document.getElementById(`cfg-esfera-${i}`);
    el.style.setProperty('--esfera-claro', claro.join(', '));
    el.style.background = `rgb(${escuro.join(', ')})`;
    el.addEventListener('click', () => {
      // Lê os valores atuais do elemento para respeitar o tema corrente
      // (o _aplicarTema atualiza --esfera-claro e background quando o modo muda)
      const _escuroAtual = getComputedStyle(el).backgroundColor
        .replace(/^rgb\(|\)$/g, '').split(',').map(s => Number(s.trim()));
      const _claroAtual  = el.style.getPropertyValue('--esfera-claro')
        .split(',').map(s => Number(s.trim()));
      selecionarCor(_escuroAtual, _claroAtual, el, i);
    });
  });
  // Restaura a cor salva — adiado para após o initSlider/_aplicarTema atualizarem as esferas
  setTimeout(() => {
    const _elSalva = document.getElementById(`cfg-esfera-${_idxCorSalva}`);
    if (!_elSalva) return;
    const _escuroSalvo = getComputedStyle(_elSalva).backgroundColor
      .replace(/^rgb\(|\)$/g, '').split(',').map(s => Number(s.trim()));
    const _claroSalvo  = _elSalva.style.getPropertyValue('--esfera-claro')
      .split(',').map(s => Number(s.trim()));
    selecionarCor(_escuroSalvo, _claroSalvo, _elSalva, _idxCorSalva);
  }, 0);

  // Remove todas as esferas do loop compartilhado quando o painel for desmontado
  const _cfgCleanupObs = new MutationObserver(() => {
    if (!document.getElementById('cfg-esfera-canvas-0')) {
      _destruirEsferas.forEach(fn => fn && fn());
      _cfgCleanupObs.disconnect();
    }
  });
  _cfgCleanupObs.observe(conteudoTipo, { childList: true });

  // ── Botões sala/casa ──
  function _sincronizarBotoesExibicao() {
    const btnSala = document.getElementById('exibir-sala');
    const btnCasa = document.getElementById('exibir-casa');
    if (btnSala) btnSala.classList.toggle('exibindo', _filtroExibicao.sala);
    if (btnCasa) btnCasa.classList.toggle('exibindo', _filtroExibicao.casa);
  }

  function _toggleExibicao(local) {
    // Impede desativar se for o único ativo
    const outro = local === 'sala' ? 'casa' : 'sala';
    if (_filtroExibicao[local] && !_filtroExibicao[outro]) return;
    _filtroExibicao[local] = !_filtroExibicao[local];
    _sincronizarBotoesExibicao();
    _atualizarSpansFiltroManualProximo();
    // Atualiza contadores do manual do calendário se estiver aberto
    if (_modalManualEl) _popularContadoresManuais(_modalManualEl);
    // Atualiza calendário se estiver aberto
    if (document.querySelector('.grade-dias-mes')) {
      renderizarCalendarioComEventos();
      iniciarAnimacaoDiasMultiplos();
    }
    // Atualiza painel próximo se estiver aberto
    if (document.getElementById('lista-atividades-proximas')) {
      atualizarCacheAtividadesProximas();
      renderizarListaAtividadesProximas();
    }
  }

  const _btnExibirSala = document.getElementById('exibir-sala');
  const _btnExibirCasa = document.getElementById('exibir-casa');
  if (_btnExibirSala) _btnExibirSala.addEventListener('click', () => _toggleExibicao('sala'));
  if (_btnExibirCasa) _btnExibirCasa.addEventListener('click', () => _toggleExibicao('casa'));
  _sincronizarBotoesExibicao();

  // ── Carrega flubber se necessário e inicializa ──
  if (typeof flubber !== 'undefined') {
    initSlider();
  } else {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/flubber/0.4.2/flubber.min.js';
    s.onload = initSlider;
    document.head.appendChild(s);
  }
}


/* ══════════════════════════════════════════════════════════
   Aba "materiais" — horário + drives + plataformas
   ══════════════════════════════════════════════════════════ */

let _gradeAulas = [];
let _drives     = [];

async function carregarGradeAulas() {
  if (!window._salaAtual) { _gradeAulas = []; return; }
  try {
    const salaId = window._salaAtual.id;
    const url = `/api/grade-aulas?sala_id=${salaId}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('erro grade');
    _gradeAulas = await r.json();
  } catch (e) {
    console.error('Erro ao carregar grade:', e);
    _gradeAulas = [];
  }
}

async function carregarDrives() {
  if (!window._salaAtual) { _drives = []; return; }
  try {
    const salaId = window._salaAtual.id;
    const url = `/api/drives?sala_id=${salaId}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('erro drives');
    _drives = await r.json();
  } catch (e) {
    console.error('Erro ao carregar drives:', e);
    _drives = [];
  }
}

const _NOMES_DIA     = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const _HORARIOS      = ['07:00','07:50','08:40','09:30','09:50','10:40','11:30'];
const _POS_INTERVALO = 3;

/**
 * Formata o nome do professor para exibição compacta nos spans do horário.
 * Regra: se o primeiro nome tiver 5+ letras e houver sobrenome,
 * exibe "Primeiro S." (sobrenome abreviado com inicial + ponto).
 * Caso contrário exibe o nome completo.
 */
function _formatarNomeProfHorario(nome) {
  if (!nome) return 'aula vaga';
  const partes = nome.trim().split(/\s+/);
  let nomeFormatado;
  if (partes.length < 2) {
    nomeFormatado = nome;
  } else {
    const primeiro = partes[0];
    if (primeiro.length >= 5) {
      nomeFormatado = `${primeiro} ${partes[1].charAt(0).toUpperCase()}.`;
    } else {
      nomeFormatado = nome;
    }
  }
  return `Prof. ${nomeFormatado}`;
}

function _diaUtilHoje() {
  const d = new Date().getDay();
  if (d === 0 || d === 6) return 1; // fim de semana -> segunda
  return d; // seg=1, ter=2, qua=3, qui=4, sex=5
}

/* Renderiza a estrutura HTML imediatamente (sem aguardar dados) */
function _renderEstruturaMateriais() {

  conteudoTipo.innerHTML = `
    <div class="conteudo-tipo" id="conteudo-tipo-materiais">
      <div class="painel-material">

        <div class="card-material" id="material-horario">
          <div class="parte-fixa-material">
            <span class="texto-fixo-material"><h2>HORÁRIO</h2><h3>grade de aulas</h3></span>
            <span class="icone-fixo-material">
              <svg id="icone-relogio-carga" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
              <svg id="icone-relogio-carga-h" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4"/></svg>
              <svg id="icone-relogio-carga-min" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6"/></svg>
            </span>
          </div>
          <div class="card-carga" id="card-carga-horario">
            <button class="btn-dia btn-dia-prev" id="btn-dia-prev" aria-label="Dia anterior">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div class="coluna-horario">
              ${_HORARIOS.map((h, i) => `<span class="${i === _POS_INTERVALO ? 'h-intervalo' : 'h-aula'}">${h}</span>`).join('')}
            </div>
            <div class="coluna-aulas-wrapper" id="coluna-aulas-wrapper"></div>
            <button class="btn-dia btn-dia-next" id="btn-dia-next" aria-label="Próximo dia">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>

        <div class="card-material" id="material-drive">
          <div class="parte-fixa-material">
            <span class="texto-fixo-material"><h2>DRIVES</h2><h3>pelos professores</h3></span>
            <span class="icone-fixo-material">
              <svg id="icone-pasta-tras-drive" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20a2 2 0 0 1 -2-2V8a2 2 0 0 1 2-2h7.9a2 2 0 0 0 1.69-.9L14.4 3.9A2 2 0 0 1 16.07 3H20a2 2 0 0 1 2 2v13a2 2 0 0 1 -2 2Z"/></svg>
              <svg id="icone-pasta-meio-drive" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
              <svg id="icone-pasta-frente-drive" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
            </span>
          </div>
          <div class="conteudo-material" id="lista-drives">
          </div>
        </div>

        <div class="card-material" id="material-plataformas">
          <div class="parte-fixa-material">
            <span class="texto-fixo-material"><h2>PLATAFORMAS</h2><h3>outros acessos</h3></span>
            <span class="icone-fixo-material">
              <svg id="icone-globo" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs><clipPath id="globe-clip"><circle cx="100" cy="100" r="80"/></clipPath></defs>
                <g id="globe-continents" clip-path="url(#globe-clip)"></g>
                <circle cx="100" cy="100" r="80" fill="none"/>
              </svg>
            </span>
          </div>
          <div class="conteudo-material">
            <div class="card-plataforma" id="portal-1">
              <div class="baner-plataforma"><div class="blob-itin"></div><div class="blob-hum"></div><div class="blob-nat"></div><h2>PORTAL SESI EDUCAÇÃO</h2></div>
              <div class="dados-plataforma"><h2>Acesse o portal oficial</h2><div class="pontos-material"><span id="p1-material"></span><span id="p2-material"></span><span id="p3-material"></span><span id="p4-material"></span></div></div>
            </div>
            <div class="card-plataforma" id="portal-2">
              <div class="baner-plataforma"><div class="blob-p2-mid"></div><div class="blob-p2-dark1"></div><div class="blob-p2-dark2"></div><h2>PORTAL DO ESTUDANTE</h2></div>
              <div class="dados-plataforma"><h2>Ver detalhes acadêmicos</h2><div class="pontos-material"><span id="p1-material"></span><span id="p2-material"></span><span id="p3-material"></span><span id="p4-material"></span></div></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  _iniciarCarrosselHorario();
  _iniciarCardDrive();
  _iniciarRelogioMateriais();
  _iniciarGloboMateriais();

  const cardsMateria = conteudoTipo.querySelectorAll('.card-material');
  const containerPainel = conteudoTipo.querySelector('.painel-material');
  cardsMateria.forEach(card => {
    const parteFixa = card.querySelector('.parte-fixa-material');
    if (!parteFixa) return;
    parteFixa.addEventListener('click', function () {
      const jaAberto = card.classList.contains('material-aberto');
      cardsMateria.forEach(c => c.classList.remove('material-aberto'));
      containerPainel.classList.remove('tem-aberto');
      fecharEditorMaterial(); // fecha painel do editor ao trocar de card
      if (!jaAberto) {
        card.classList.add('material-aberto');
        containerPainel.classList.add('tem-aberto');

        // Drive: sempre recarrega ao abrir, com tela de carregamento
        if (card.id === 'material-drive') {
          const listaDrive = conteudoTipo.querySelector('#lista-drives');
          if (listaDrive) {
            listaDrive.innerHTML = `<div class="mensagem-vazia" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:160px;">${_criarIconeCarregandoHTML()}</div>`;
          }
          _comTempoMinimo(carregarDrives(), 1700, function () {
            _iniciarCardDrive();
          });
        }
      }
      _atualizarModoBotaoMaterial(); // recalcula ícone do botão topo
    });
  });

  // Portais — confirmação antes de abrir, impede que o clique suba para o card-material
  const _portaisLinks = {
    'portal-1': { url: 'https://www.sesieducacao.com.br/publico/index.php', nome: 'Portal SESI Educação' },
    'portal-2': { url: 'https://sesigoias.com.br/portal-aluno/',            nome: 'Portal do Estudante'  },
  };
  Object.entries(_portaisLinks).forEach(([id, { url, nome }]) => {
    const el = conteudoTipo.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      _exibirConfirmacaoAcessarPlataforma(url, nome);
    });
  });
}

/* Carrega os dados em background e atualiza o carrossel/drive */
async function _carregarDadosMateriais() {
  const _tempoMinimo = new Promise(res => setTimeout(res, 1700));
  await Promise.all([carregarGradeAulas(), _tempoMinimo]);

  // Recarrega o carrossel de horário com os dados reais
  const wrapperCols   = conteudoTipo.querySelector('#coluna-aulas-wrapper');
  const labelWrapper  = conteudoTipo.querySelector('.label-dia-wrapper');
  if (wrapperCols && labelWrapper) {
    // Recupera o dia atual do carrossel já montado pelo label ativo
    const labelAtivo = labelWrapper.querySelector('.aula-mostrada');
    const nomeDia = labelAtivo ? labelAtivo.textContent.trim() : '';
    const diaIdx  = _NOMES_DIA.indexOf(nomeDia);
    const diaAtual = diaIdx >= 0 ? diaIdx + 1 : _diaUtilHoje();

    function _areaParaClasse(area) {
      if (!area) return '';
      return 'aula-' + area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
    }

    function _buildColuna(dia, role) {
      const aulas = _gradeAulas.filter(r => r.dia_semana === dia).sort((a, b) => a.posicao - b.posicao);
      const div = document.createElement('div');
      div.className = 'coluna-aulas ' + role;
      _HORARIOS.forEach((_, i) => {
        const span = document.createElement('span');
        if (i === _POS_INTERVALO) {
          span.className = 'aula-intervalo-slot';
          span.textContent = 'intervalo';
        } else {
          const pos = i < _POS_INTERVALO ? i + 1 : i;
          const aula = aulas.find(a => a.posicao === pos);
          const classeArea = aula ? _areaParaClasse(aula.area) : '';
          span.className = 'aula-span' + (classeArea ? ' ' + classeArea : '');
          span.textContent = _formatarNomeProfHorario(aula ? aula.professor : null);
        }
        div.appendChild(span);
      });
      return div;
    }

    const prev = diaAtual === 1 ? 5 : diaAtual - 1;
    const next = diaAtual === 5 ? 1 : diaAtual + 1;
    wrapperCols.innerHTML = '';
    wrapperCols.appendChild(_buildColuna(prev,     'aula-passada'));
    wrapperCols.appendChild(_buildColuna(diaAtual, 'aula-mostrada'));
    wrapperCols.appendChild(_buildColuna(next,     'aula-futura'));
    if (sessao) _bindHorarioEditorCliques();
  }
}

function _iniciarCarrosselHorario() {
  const wrapperCols = conteudoTipo.querySelector('#coluna-aulas-wrapper');
  const cardCarga   = conteudoTipo.querySelector('#card-carga-horario');
  if (!wrapperCols || !cardCarga) return;

  const labelWrapper = document.createElement('div');
  labelWrapper.className = 'label-dia-wrapper';
  cardCarga.appendChild(labelWrapper);

  let diaAtual = _diaUtilHoje();
  let animando  = false;

  function _aulasParaDia(dia) {
    return _gradeAulas.filter(r => r.dia_semana === dia).sort((a, b) => a.posicao - b.posicao);
  }

  function _areaParaClasse(area) {
    if (!area) return '';
    return 'aula-' + area
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z]/g, '');                            // só letras
  }

  function _buildColuna(dia, role) {
    const aulas = _aulasParaDia(dia);
    const div = document.createElement('div');
    div.className = 'coluna-aulas ' + role;
    _HORARIOS.forEach((_, i) => {
      const span = document.createElement('span');
      if (i === _POS_INTERVALO) {
        span.className = 'aula-intervalo-slot';
        span.textContent = 'intervalo';
      } else {
        const pos = i < _POS_INTERVALO ? i + 1 : i;
        const aula = aulas.find(a => a.posicao === pos);
        const classeArea = aula ? _areaParaClasse(aula.area) : '';
        span.className = 'aula-span' + (classeArea ? ' ' + classeArea : '');
        span.textContent = _formatarNomeProfHorario(aula ? aula.professor : null);
      }
      div.appendChild(span);
    });
    return div;
  }

  function _buildLabel(texto, role) {
    const span = document.createElement('span');
    span.className = 'label-dia ' + role;
    span.textContent = texto;
    return span;
  }

  function initLabels() {
    labelWrapper.innerHTML = '';
    const prev = diaAtual === 1 ? 5 : diaAtual - 1;
    const next = diaAtual === 5 ? 1 : diaAtual + 1;
    labelWrapper.appendChild(_buildLabel(_NOMES_DIA[prev - 1],     'aula-passada'));
    labelWrapper.appendChild(_buildLabel(_NOMES_DIA[diaAtual - 1], 'aula-mostrada'));
    labelWrapper.appendChild(_buildLabel(_NOMES_DIA[next - 1],     'aula-futura'));
  }

  function initCarrossel() {
    wrapperCols.innerHTML = '';
    const prev = diaAtual === 1 ? 5 : diaAtual - 1;
    const next = diaAtual === 5 ? 1 : diaAtual + 1;
    wrapperCols.appendChild(_buildColuna(prev,     'aula-passada'));
    wrapperCols.appendChild(_buildColuna(diaAtual, 'aula-mostrada'));
    wrapperCols.appendChild(_buildColuna(next,     'aula-futura'));
  }

  function navegar(direcao) {
    if (animando) return;
    animando = true;
    const novoDia = direcao === 'next' ? (diaAtual === 5 ? 1 : diaAtual + 1) : (diaAtual === 1 ? 5 : diaAtual - 1);
    wrapperCols.classList.add('carrossel-' + direcao);
    labelWrapper.classList.add('carrossel-' + direcao);
    wrapperCols.addEventListener('transitionend', function handler() {
      wrapperCols.removeEventListener('transitionend', handler);
      wrapperCols.classList.remove('carrossel-next', 'carrossel-prev');
      labelWrapper.classList.remove('carrossel-next', 'carrossel-prev');
      diaAtual = novoDia;
      initCarrossel();
      initLabels();
      if (sessao) _bindHorarioEditorCliques();
      animando = false;
    }, { once: true });
  }

  initCarrossel();
  initLabels();
  if (sessao) _bindHorarioEditorCliques();

  conteudoTipo.querySelector('#btn-dia-prev').addEventListener('click', () => navegar('prev'));
  conteudoTipo.querySelector('#btn-dia-next').addEventListener('click', () => navegar('next'));
}

function _iniciarCardDrive() {
  const lista = conteudoTipo.querySelector('#lista-drives');
  if (!lista) return;

  lista.innerHTML = '';

  if (_drives.length === 0) {
    lista.innerHTML = `<div class="mensagem-vazia-drive">nenhum drive disponível</div>`;
    return;
  }

  // Mapeia área normalizada para classe CSS de cor
  function _areaParaClasseDrive(area) {
    if (!area) return '';
    const norm = area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
    const mapa = {
      matematica: 'drive-matematica',
      itinerario: 'drive-itinerario',
      linguagens:  'drive-linguagens',
      humanas:     'drive-humanas',
      natureza:    'drive-natureza',
    };
    return mapa[norm] || '';
  }

  _drives.forEach(d => {
    const classeArea = _areaParaClasseDrive(d.area);
    const nomeProf   = d.professor ? 'Prof. ' + d.professor : '—';
    const areaLabel  = d.area || '—';

    const card = document.createElement('div');
    card.className = 'card-drive' + (classeArea ? ' ' + classeArea : '');
    card.innerHTML = `
      <div class="area-drive"><h2>${areaLabel}</h2></div>
      <div class="dados-drive">
        <h2>${nomeProf}</h2>
        <div class="pontos-material"><span id="p1-material"></span><span id="p2-material"></span><span id="p3-material"></span><span id="p4-material"></span></div>
      </div>
    `;

    if (sessao) {
      card.classList.add('card-drive-editavel');
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (modoEditorMaterialDrive === 'editar') {
          modoEditorMaterialDrive = 'nenhum';
          _sincronizarEstadoEditorMaterialUI('drive');
          _abrirModalDrive(d, false);
        } else if (modoEditorMaterialDrive === 'apagar') {
          modoEditorMaterialDrive = 'nenhum';
          _sincronizarEstadoEditorMaterialUI('drive');
          _exibirConfirmacaoApagarDrive(d.id, `Prof. ${d.professor || ''} (${d.area || ''})`, card);
        } else if (d.link) {
          _exibirConfirmacaoAcessarDrive(d.link, `Prof. ${d.professor || ''} (${d.area || ''})`, d.area);
        }
      });
    } else {
      if (d.link) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => _exibirConfirmacaoAcessarDrive(d.link, `Prof. ${d.professor || ''} (${d.area || ''})`, d.area));;
      }
    }

    lista.appendChild(card);
  });
}

function _iniciarRelogioMateriais() {
  const elMin  = conteudoTipo.querySelector('#icone-relogio-carga-min path');
  const elHora = conteudoTipo.querySelector('#icone-relogio-carga-h path');
  const cardRel = conteudoTipo.querySelector('#material-horario');
  if (!elMin || !elHora) return;

  let speed = 1, degMin = 0, degHora = 0, lastTs = null;
  if (cardRel) {
    cardRel.addEventListener('mouseenter', () => speed = 60);
    cardRel.addEventListener('mouseleave', () => speed = 1);
  }

  function tick(ts) {
    if (!elMin.isConnected) return;
    if (lastTs !== null) {
      const dt = ts - lastTs;
      degMin  += (dt / 30000)  * 360 * speed;
      degHora += (dt / 180000) * 360 * speed;
      elMin.setAttribute('transform',  `rotate(${degMin}  12 12)`);
      elHora.setAttribute('transform', `rotate(${degHora} 12 12)`);
    }
    lastTs = ts;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function _iniciarGloboMateriais() {
  const globeGroup = conteudoTipo.querySelector('#globe-continents');
  if (!globeGroup) return;
  const cx = 100, cy = 100, R = 80;
  let globeAngle = 0, globeSpeed = 0.75;

  const continents = [
    [[-140,60],[-120,70],[-85,72],[-65,68],[-55,50],[-60,45],[-75,43],[-80,25],[-90,18],[-105,20],[-120,30],[-130,42],[-140,48],[-140,60]],
    [[-80,10],[-65,12],[-50,5],[-35,-5],[-35,-20],[-50,-30],[-65,-55],[-75,-50],[-80,-30],[-80,0],[-80,10]],
    [[0,50],[10,55],[25,65],[30,60],[28,45],[15,38],[0,40],[-10,38],[-10,44],[0,50]],
    [[-18,15],[0,16],[15,20],[40,12],[42,2],[40,-10],[32,-28],[18,-35],[12,-34],[0,-20],[-18,5],[-18,15]],
    [[30,45],[60,55],[90,70],[130,70],[145,45],[135,35],[100,5],[85,10],[70,22],[55,25],[40,38],[30,45]],
    [[115,-20],[130,-15],[150,-22],[152,-28],[140,-38],[130,-35],[115,-30],[113,-25],[115,-20]],
  ];

  const globePaths = continents.map(() => {
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('fill','none'); p.setAttribute('stroke-linejoin','round'); p.setAttribute('stroke-linecap','round');
    globeGroup.appendChild(p); return p;
  });

  function proj(lon, lat, a) {
    const lonR = (lon + a * 180 / Math.PI) * Math.PI / 180, latR = lat * Math.PI / 180;
    const x = Math.cos(latR)*Math.sin(lonR), y = -Math.sin(latR), z = Math.cos(latR)*Math.cos(lonR);
    return { px: cx+x*R, py: cy+y*R, z };
  }
  function edge(a, b) { const t=a.z/(a.z-b.z); return {px:a.px+t*(b.px-a.px),py:a.py+t*(b.py-a.py),z:0}; }
  function buildPath(pts) {
    const pr=pts.map(([lo,la])=>proj(lo,la,globeAngle)); let d='',s=false;
    for(let i=0;i<pr.length;i++){const c=pr[i],n=pr[(i+1)%pr.length];
      if(c.z>=0){d+=s?`L ${c.px.toFixed(2)} ${c.py.toFixed(2)} `:`M ${c.px.toFixed(2)} ${c.py.toFixed(2)} `;s=true;
        if(n.z<0){const e=edge(c,n);d+=`L ${e.px.toFixed(2)} ${e.py.toFixed(2)} `;s=false;}}
      else{if(n.z>=0){const e=edge(c,n);d+=`M ${e.px.toFixed(2)} ${e.py.toFixed(2)} `;s=true;}}}
    return d;
  }
  function meanZ(pts){return pts.reduce((s,[lo,la])=>s+proj(lo,la,globeAngle).z,0)/pts.length;}

  const cardPlat = conteudoTipo.querySelector('#material-plataformas');
  if(cardPlat){cardPlat.addEventListener('mouseenter',()=>globeSpeed=5);cardPlat.addEventListener('mouseleave',()=>globeSpeed=0.75);}

  function tick(){
    if(!globeGroup.isConnected) return;
    globeAngle+=0.012*globeSpeed;
    continents.map((pts,i)=>({i,z:meanZ(pts)})).sort((a,b)=>a.z-b.z).forEach(({i,z})=>{
      globePaths[i].setAttribute('d',buildPath(continents[i]));
      globePaths[i].setAttribute('opacity',(z<0?0:Math.min(1,z*3+0.25)).toFixed(3));
      globeGroup.appendChild(globePaths[i]);
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


/* ══════════════════════════════════════════════════════════
   Navbar
   ══════════════════════════════════════════════════════════ */
const wrapper   = document.querySelector('.navbar-wrapper');
const indicator = document.getElementById('indicator');
const cutout    = document.getElementById('recorte-svg-navbar');
const buttons   = document.querySelectorAll('.nav-btn');

function moverParaBtn(btn) {
  // btn.offsetLeft é relativo a .nav-icons (seu offsetParent)
  // .nav-icons.offsetLeft é relativo a .navbar-wrapper
  // Somando os dois obtemos cx correto sem depender de getBoundingClientRect,
  // que é distorcido pelo transform: translateX(-50%) do wrapper.
  const navIcons = wrapper.querySelector('.nav-icons');
  const cx = navIcons.offsetLeft + btn.offsetLeft + btn.offsetWidth / 2;

  indicator.style.left = cx + 'px';
  cutout.style.left    = cx + 'px';

  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

let btnAnteriorAoModal = null; // guarda o botão ativo antes de abrir o modal

buttons.forEach(btn => btn.addEventListener('click', () => {
  if (btn.classList.contains('active')) return;
  // Captura o ativo atual ANTES de moveToBtn remover o .active
  if (btn.id === 'botao-navbar-adicionar') {
    btnAnteriorAoModal = document.querySelector('.nav-btn.active') || null;
    moverParaBtn(btn);
    atualizarNomeAba(btn.id);
    // NÃO chama renderAbaAtiva — conteúdo só some após login bem-sucedido
    // NÃO chama atualizarModoBotaoAcao — botão de ação não muda ao abrir modal
    return;
  }
  moverParaBtn(btn);
  atualizarNomeAba(btn.id);
  resetarEditorCalendario();
  resetarEditorMaterial();
  renderAbaAtiva(btn.id);
  atualizarModoBotaoAcao(sessao ? 'admin' : 'aluno', btn.id);
}));

/* Estado inicial */
(function inicializarNavbar() {
  const initBtn = document.getElementById('btn-calendario');
  moverParaBtn(initBtn);
  atualizarNomeAba('btn-calendario');
  renderAbaAtiva('btn-calendario');
  atualizarModoBotaoAcao('aluno', 'btn-calendario'); // estado inicial: aluno, calendário

  // Carrega professores do banco na inicialização (autocomplete e modais)
  carregarDadosProfessores();

  // Reposiciona o indicator após o layout estabilizar (duplo rAF garante paint completo)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const btnAtivo = document.querySelector('.nav-btn.active');
    if (btnAtivo) moverParaBtn(btnAtivo);
  }));
})();


/* ══════════════════════════════════════════════════════════
   Modal de login — abrir / fechar
   ══════════════════════════════════════════════════════════ */
const modalLogin     = document.getElementById('modal-login');
let btnAdd           = document.getElementById('botao-navbar-adicionar');
const btnFecharModal = document.getElementById('botao-fechar-modal-login');

let typewriterIniciado = false;

function abrirModalLogin() {
  modalLogin.classList.add('aberto');
  if (!typewriterIniciado) {
    typewriterIniciado = true;
    iniciarAnimacaoTituloLogin();
  }
}

function fecharModalLogin(loginBemSucedido) {
  modalLogin.classList.remove('aberto');
  limparErroLogin();
  if (!loginBemSucedido) {
    const destino = btnAnteriorAoModal || document.getElementById('btn-calendario');
    moverParaBtn(destino);
    atualizarNomeAba(destino.id);
    atualizarModoBotaoAcao(sessao ? 'admin' : 'aluno', destino.id);
    btnAnteriorAoModal = null;
  }
}

btnAdd.addEventListener('click', abrirModalLogin);
btnFecharModal.addEventListener('click', (e) => {
  e.stopPropagation();
  fecharModalLogin(false);
});

/* Fechar ao clicar fora do card */
modalLogin.addEventListener('click', (e) => {
  if (e.target === modalLogin) fecharModalLogin(false);
});

/* Fechar com Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharModalLogin(false);
});


/* ══════════════════════════════════════════════════════════
   Após login — aplica sessão e troca botão +
   ══════════════════════════════════════════════════════════ */
function aplicarSessaoRepre(data) {
  sessao = { username: data.username, role: data.role };

  // adiciona btn-add ao mapa dinamicamente — a partir daqui o sistema cuida sozinho
  nomesAbas['botao-navbar-adicionar'] = { nome: 'adicionar', id: 'aba-adicionar' };

  btnAdd.title = 'Adicionar tarefa';
  btnAdd.removeEventListener('click', abrirModalLogin);
  btnAdd.addEventListener('click', () => abrirModalCadastroTarefa());

  moverParaBtn(btnAdd);
  atualizarNomeAba('botao-navbar-adicionar');

  // Agora é admin — recalcula o botão para a aba que ficou ativa
  atualizarModoBotaoAcao('admin', 'botao-navbar-adicionar');

  // Cria os painéis agora (sem .aberto) para que a transição CSS
  // já exista no DOM antes do primeiro clique no lápis
  _garantirPainelEditorCalendario();
  _garantirPainelEditorHorario();
  _garantirPainelEditorDrive();

  fecharModalLogin(true);
  abrirModalCadastroTarefa();
}


/* ══════════════════════════════════════════════════════════
   Formulário de adicionar tarefa — HTML template
   ══════════════════════════════════════════════════════════ */
const _htmlFormulario = `
<main id="formu-all">
  <form id="formu" method="post" enctype="multipart/form-data">
    <ul id="lista-campos-formulario">
      <li class="campo-area">
        <a class="nome-campo">Área:</a>
        <div id="painel-area">
          <h2 id="texto-materia">MATEMÁTICA</h2>
          <div id="deslizador-container">
            <div id="deslizador-trilha"></div>
            <div id="deslizador-bola"></div>
            <input type="range" min="0" max="4" step="1" value="0" id="deslizador" name="deslizador">
          </div>
        </div>
      </li>
      <li class="campo-prof">
        <a class="nome-campo">De:</a>
        <input id="entrada-professor" name="entrada-professor" type="text" autocomplete="off">
        <div id="visor-professor"></div>
      </li>
      <li class="campo-tipo">
        <a class="nome-campo">Tipo:</a>
        <input type="hidden" name="tipo" id="input-tipo-valor" value="selecione">
        <div id="menu-externo">
          <div id="menu-interno">
            <span id="texto-selecao">selecione</span>
            <svg id="icone-seta-tipo" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
          <div id="lista-opcoes">
            <div class="opcao opcao-azul" onclick="document.getElementById('input-tipo-valor').value='Tarefa'"><span id="texto-opcao-tarefa">tarefas curriculares</span></div>
            <div class="opcao opcao-verde" onclick="document.getElementById('input-tipo-valor').value='Projeto'"><span id="texto-opcao-projeto">projetos disciplinares</span></div>
            <div class="opcao opcao-amarela" onclick="document.getElementById('input-tipo-valor').value='Teste'"><span id="texto-opcao-teste">simulados formativos</span></div>
            <div class="opcao opcao-vermelha" onclick="document.getElementById('input-tipo-valor').value='Prova'"><span id="texto-opcao-prova">avaliações somativas</span></div>
          </div>
        </div>
      </li>
      <li class="campo-data">
        <a class="nome-campo">Data:</a>
        <div class="entrada-data">
          <input type="text" id="dia" name="dia" maxlength="2" placeholder="DD" inputmode="numeric" autocomplete="off">
          <span class="separador">/</span>
          <input type="text" id="mes" name="mes" maxlength="2" placeholder="MM" inputmode="numeric" autocomplete="off">
          <span class="separador">/</span>
          <input type="text" id="ano" name="ano" maxlength="4" placeholder="AAAA" inputmode="numeric" autocomplete="off">
        </div>
      </li>
      <li class="campo-local">
        <a class="nome-campo">Local:</a>
        <div id="container-local">
          <h2 id="local-sala">sala</h2>
          <div id="container-chave-local">
            <input class="controle-local-invisivel" type="checkbox" id="chave-local" name="chave-local">
            <div class="trilha-fundo"><div class="botao-bola"></div></div>
          </div>
          <h2 id="local-casa">casa</h2>
        </div>
      </li>
      <li class="bloco-descricao">
        <a class="nome-campo">Descrição:</a>
        <input id="entrada-titulo" name="entrada-titulo" autocomplete="off" placeholder="título aqui..." type="text">
        <div id="container-detalhes">
          <textarea id="entrada-detalhes" name="entrada-detalhes" placeholder="detalhes aqui..." rows="50"></textarea>
          <div class="preview-detalhes" aria-hidden="true"></div>
          <div id="botoes-descricao">
            <button type="button" id="botao-remover-descricao">
              <svg id="icone-tampa-lixeira" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              <svg id="icone-cesto-lixeira" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M5 6h14"/>
              </svg>
            </button>
            <label for="bloco-arquivo-anexo" id="botao-anexar-arquivo">
              <svg id="icone-pasta-tras" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 20a2 2 0 0 1 -2-2V8a2 2 0 0 1 2-2h7.9a2 2 0 0 0 1.69-.9L14.4 3.9A2 2 0 0 1 16.07 3H20a2 2 0 0 1 2 2v13a2 2 0 0 1 -2 2Z"/>
              </svg>
              <svg id="icone-pasta-meio" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
              </svg>
              <svg id="icone-pasta-frente" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
              </svg>
              <input type="file" id="bloco-arquivo-anexo" name="bloco-arquivo-anexo" class="input-arquivo-oculto" multiple>
            </label>
            <button type="button" id="botao-expandir">
              <input type="hidden" id="marcador-tem-anexo" name="marcador-tem-anexo" value="0">
              <svg class="icone-seta-superior" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 17l10-10"/><path d="M17 17V7H7"/>
              </svg>
              <span></span>
              <svg class="icone-seta-inferior" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 7L7 17"/><path d="M7 7v10h10"/>
              </svg>
              <span></span>
            </button>
          </div>
        </div>
        <div id="painel-arquivos-anexados" class="arquivos-anexados"></div>
      </li>
      <li id="secao-envio">
        <button type="submit" id="botao-postar">Postar</button>
        <div class="secao-duplica">
          <button type="button" id="botao-descricao-anterior">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <button type="button" id="botao-adicionar-descricao">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
          </button>
          <button type="button" id="botao-descricao-seguinte">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </div>
      </li>
    </ul>
  </form>
</main>
`;

/* ══════════════════════════════════════════════════════════
   Inicializar toda a lógica do formulário após montagem no DOM
   (equivalente ao index.js, executado no contexto do conteudo-tipo)
   ══════════════════════════════════════════════════════════ */
function _inicializarLogicaFormulario(itemEdicao) {
  const root = document.documentElement;
  // --t é usado para "congelar" animações de erro no instante correto.
  // Rodamos o tick apenas enquanto o formulário estiver montado.
  let _tAnimStart = performance.now();
  let _tRafId = null;
  function _tickT() {
    root.style.setProperty('--t', `${performance.now() - _tAnimStart}ms`);
    _tRafId = requestAnimationFrame(_tickT);
  }
  _tRafId = requestAnimationFrame(_tickT);
  // Cancela o tick quando o formulário for desmontado (limparConteudo chama innerHTML='')
  const _formObserver = new MutationObserver(() => {
    if (!document.getElementById('lista-campos-formulario')) {
      cancelAnimationFrame(_tRafId);
      _formObserver.disconnect();
    }
  });
  _formObserver.observe(document.getElementById('conteudo-tipo') || document.body, { childList: true, subtree: false });

  const state = {
    descricoes: [0],
    currentIndex: 0,
    maxDescricoes: 3,
    arquivos: { 0: [] },
    userWantsExpanded: false
  };
  // Expõe o estado para _vincularPreviaManual acessar currentIndex e arquivos
  window._formState = state;

  // ── Área ──────────────────────────────────────────────
  (function inicializarSeletorArea() {
    const deslizador = document.getElementById('deslizador');
    const textoMateria = document.getElementById('texto-materia');
    const deslizadorBola = document.getElementById('deslizador-bola');
    if (!deslizador) return;
    const cores = ['var(--cor-matematica)','var(--cor-itinerario)','var(--cor-linguagens)','var(--cor-humanas)','var(--cor-natureza)'];
    const materias = ['MATEMÁTICA','ITINERÁRIO','LINGUAGENS','HUMANAS','NATUREZA'];
    function atualizarSeletorArea(valor) {
      const dc = document.getElementById('deslizador-container');
      const pct = (valor / 4) * 100;
      deslizadorBola.style.left = (pct / 100) * (dc.offsetWidth - deslizadorBola.offsetWidth) + 'px';
      deslizadorBola.style.transform = 'translateY(-50%)';
      const cor = cores[valor];
      const trilha = document.getElementById('deslizador-trilha');
      trilha.style.background = `rgb(${cor})`;
      trilha.style.outline = `3.75px solid rgb(${cor})`;
      textoMateria.textContent = materias[valor];
      textoMateria.style.setProperty('--cor-texto-materia', `var(--cor-${['matematica','itinerario','linguagens','humanas','natureza'][valor]})`);
      textoMateria.style.removeProperty('background');
      textoMateria.style.removeProperty('text-shadow');
    }
    deslizador.addEventListener('input', () => atualizarSeletorArea(parseInt(deslizador.value)));
    // Defer para o layout estar pronto — offsetWidth precisa do paint
    requestAnimationFrame(() => requestAnimationFrame(() => atualizarSeletorArea(parseInt(deslizador.value))));
  })();

  // ── Autocomplete professor ─────────────────────────────
  (function inicializarAutocompleteProf() {
    const nomes = window._listaProfessores || [];
    const realInput = document.getElementById('entrada-professor');
    const visorDiv = document.getElementById('visor-professor');
    if (!realInput) return;
    // Garante que o visor fique acima do input no stacking context
    let currentSuggestion = '';
    const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const capitalized = v => v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    function atualizar() {
      const typed = realInput.value;
      const cur = realInput.selectionStart ?? typed.length;
      if (!typed) { visorDiv.innerHTML = '<span class="cursor-falso"></span>'; currentSuggestion = ''; return; }
      const match = nomes.find(n => semAcento(n.toLowerCase()).startsWith(semAcento(typed.toLowerCase())));
      const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const ante = esc(typed.substring(0, cur));
      const post = esc(typed.substring(cur));
      if (match) {
        visorDiv.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span><span class="texto-sugestao">${esc(match.substring(typed.length))}</span>`;
        currentSuggestion = match;
      } else {
        visorDiv.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span>`;
        currentSuggestion = '';
      }
    }
    realInput.addEventListener('input', e => {
      let v = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g,'').replace(/^\s+/,'');
      v = capitalized(v);
      if (v !== e.target.value) { const s = e.target.selectionStart; e.target.value = v; e.target.setSelectionRange(s,s); }
      atualizar();
    });
    document.addEventListener('selectionchange', () => { if (document.activeElement === realInput) atualizar(); });
    realInput.addEventListener('focus', () => { visorDiv.classList.add('input-focado'); atualizar(); });
    realInput.addEventListener('blur', () => {
      visorDiv.classList.remove('input-focado');
      if (currentSuggestion) {
        realInput.value = currentSuggestion;
        visorDiv.innerHTML = `<span class="texto-digitado">${currentSuggestion.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
        currentSuggestion = '';
      } else {
        // Sem sugestão — atualiza o visor para remover o cursor falso
        const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const typed = realInput.value;
        visorDiv.innerHTML = typed
          ? `<span class="texto-digitado">${esc(typed)}</span>`
          : `<span class="texto-sugestao texto-placeholder-visor">${realInput.getAttribute('placeholder') || 'profesor(a)'}</span>`;
      }
    });
    realInput.addEventListener('keydown', e => {
      if ((e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowRight') && currentSuggestion) {
        if (e.key === 'ArrowRight' && realInput.selectionStart !== realInput.value.length) return;
        e.preventDefault(); realInput.value = currentSuggestion; atualizar();
      } else if (e.key === 'Escape') { realInput.value = ''; atualizar(); }
    });
    ['paste','copy','cut','contextmenu','selectstart'].forEach(ev => realInput.addEventListener(ev, e => e.preventDefault()));
    realInput.addEventListener('mousedown', () => setTimeout(atualizar, 10));
    // Inicializa o visor com placeholder se campo vazio
    if (!realInput.value) visorDiv.innerHTML = `<span class="texto-sugestao texto-placeholder-visor">${realInput.getAttribute('placeholder') || 'profesor(a)'}</span>`;
  })();

  // ── Seletor de tipo ───────────────────────────────────
  (function inicializarSeletorTipo() {
    const menuInterno = document.getElementById('menu-interno');
    const menuExterno = document.getElementById('menu-externo');
    const opcoes = document.querySelectorAll('.opcao');
    if (!menuInterno) return;
    let ultimaSelecionada = null;
    let animando = false;
    function fechar() {
      animando = true;
      menuExterno.classList.add('estado-fechando');
      setTimeout(() => { menuExterno.classList.remove('ativo','estado-fechando'); animando = false; }, 650);
    }
    function abrir() { menuExterno.classList.remove('estado-fechando'); menuExterno.classList.add('ativo'); animando = false; }
    menuInterno.addEventListener('click', () => { if (animando) return; menuExterno.classList.contains('ativo') ? fechar() : abrir(); });
    opcoes.forEach(opcao => {
      opcao.addEventListener('click', e => {
        e.stopPropagation();
        if (ultimaSelecionada && ultimaSelecionada !== opcao) ultimaSelecionada.style.display = '';
        const textoSpan = document.getElementById('texto-selecao');
        const styles = window.getComputedStyle(opcao);
        const corOp = styles.getPropertyValue('--cor-op').trim();
        const corOpClaro = styles.getPropertyValue('--cor-op-claro').trim();
        textoSpan.textContent = opcao.textContent;
        if (corOp) { menuExterno.style.setProperty('--cor-op', corOp); textoSpan.style.background = `rgb(${corOp})`; }
        if (corOpClaro) {
          menuInterno.style.backgroundColor = `rgb(${corOpClaro})`;
          menuInterno.style.boxShadow = `0 0 7.5px rgba(${corOpClaro},1)`;
          textoSpan.style.textShadow = `-1.5px 2px 2px rgba(${corOpClaro},0.5),0 0 5px rgba(${corOp},0.3)`;
        }
        opcao.style.display = 'none';
        ultimaSelecionada = opcao;
        setTimeout(() => fechar(), 100);
      });
    });
    document.addEventListener('click', e => { if (!menuExterno.contains(e.target) && menuExterno.classList.contains('ativo')) fechar(); });
  })();

  // ── Chave local ───────────────────────────────────────
  (function inicializarChaveLocal() {
    const alt = document.getElementById('chave-local');
    const sala = document.getElementById('local-sala');
    const casa = document.getElementById('local-casa');
    if (!alt) return;
    function atualizar() { sala.classList.toggle('ativo', !alt.checked); casa.classList.toggle('ativo', alt.checked); }
    atualizar();
    alt.addEventListener('change', atualizar);
  })();

  // ── Campos data ───────────────────────────────────────
  (function inicializarCamposData() {
    const diaI = document.getElementById('dia');
    const mesI = document.getElementById('mes');
    const anoI = document.getElementById('ano');
    const seps = document.querySelectorAll('.separador');
    if (!diaI) return;
    function atualizarSeps() {
      const tem = diaI.value || mesI.value || anoI.value;
      seps.forEach(s => s.classList.toggle('sem-data', !tem));
    }
    atualizarSeps();
    [diaI, mesI, anoI].forEach(i => i.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g,''); atualizarSeps(); }));
    diaI.addEventListener('input', e => { if (e.target.value.length === 2) mesI.focus(); });
    mesI.addEventListener('input', e => { if (e.target.value.length === 2) anoI.focus(); });
    mesI.addEventListener('keydown', e => { if (e.key === 'Backspace' && mesI.value.length === 0) diaI.focus(); });
    anoI.addEventListener('keydown', e => { if (e.key === 'Backspace' && anoI.value.length === 0) { mesI.focus(); atualizarSeps(); } });
  })();

  // ── Bloco descrição ───────────────────────────────────
  (function inicializarBlocoDescricao() {
    const overlayAnexo = (function() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const aviso = document.createElement('div');
      aviso.className = 'anexo-com-erro';
      const span = document.createElement('span');
      span.className = 'texto-anexo-com-erro';
      const h2 = document.createElement('h2');
      const h3 = document.createElement('h3');
      span.appendChild(h2); span.appendChild(h3);
      const botaoOk = document.createElement('button');
      botaoOk.type = 'button'; botaoOk.textContent = 'ok';
      botaoOk.onclick = () => overlay.classList.remove('aberto');
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('aberto'); });
      aviso.appendChild(span); aviso.appendChild(botaoOk);
      overlay.appendChild(aviso); document.body.appendChild(overlay);
      return overlay;
    })();

    function exibirAvisoAnexo(h2, h3) {
      overlayAnexo.querySelector('h2').textContent = h2;
      overlayAnexo.querySelector('h3').textContent = h3;
      overlayAnexo.classList.add('aberto');
    }

    function formatarPreviewDescricao(texto) {
      if (!texto || typeof texto !== 'string') return '';
      let s = texto.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      s = s.replace(/\*\*(.*?)\*\*/g, (_,c) => `<span class="asterisco-preview">**</span><span class="texto-negrito-descricao">${c}</span><span class="asterisco-preview">**</span>`);
      s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a class="texto-link-descricao" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/\n/g,'<br>');
      return s;
    }

    function atualizarEstadoBotaoAnexo(descEl, idx) {
      const t = descEl.querySelector('#entrada-titulo');
      const d = descEl.querySelector('#entrada-detalhes');
      const b = descEl.querySelector('#botao-anexar-arquivo');
      const temArq = (state.arquivos[idx] || []).length > 0;
      const temTxt = (t && t.value.trim().length > 0) || (d && d.value.trim().length > 0);
      if (b) { b.classList.toggle('tem-descricao', temTxt || temArq); b.classList.toggle('tem-arquivos', temArq); }
    }

    function renderizarArquivos(idx, container) {
      if (!container) return;
      container.innerHTML = '';
      state.arquivos[idx].forEach((arquivo, i) => {
        const preview = document.createElement('div');
        preview.className = 'arquivo-preview';
        const ext = arquivo.name.split('.').pop().toUpperCase().substring(0,4);
        preview.innerHTML = `
          <div class="botao-excluir-arquivo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
          <div class="arquivo-icone"${arquivo._existente ? ' style="cursor:pointer" title="Visualizar"' : ''}>${ext}</div>
          <div class="arquivo-nome" title="${arquivo.name}">${arquivo.name}</div>
        `;
        if (arquivo._existente) {
          preview.querySelector('.arquivo-icone').addEventListener('click', async e => {
            e.stopPropagation();
            try { await abrirAnexoNoVisualizador(arquivo._path); }
            catch(err) { console.error(err); alert(err.message); }
          });
        }
        preview.querySelector('.botao-excluir-arquivo').onclick = e => {
          e.stopPropagation();
          state.arquivos[idx].splice(i, 1);
          const descEl = document.querySelector(`.bloco-descricao[data-indice="${idx}"]`);
          const hid = descEl?.querySelector('#marcador-tem-anexo');
          if (hid) hid.value = state.arquivos[idx].length > 0 ? '1' : '0';
          if (descEl) atualizarEstadoBotaoAnexo(descEl, idx);
          atualizarExibicao();
          document.dispatchEvent(new CustomEvent('formstate-changed'));
        };
        container.appendChild(preview);
      });
    }

    function atualizarExibicao() {
      const descs = document.querySelectorAll('.bloco-descricao');
      descs.forEach(desc => {
        const idx = parseInt(desc.dataset.indice);
        const ativa = idx === state.currentIndex;
        const temArq = state.arquivos[idx]?.length > 0;
        const cdContainer = desc.querySelector('#container-detalhes');
        const areaArq = desc.querySelector('#painel-arquivos-anexados');
        const btnExp = desc.querySelector('#botao-expandir');
        atualizarEstadoBotaoAnexo(desc, idx);
        desc.style.opacity = ativa ? '1' : '0';
        desc.style.pointerEvents = ativa ? 'auto' : 'none';
        desc.style.display = ativa ? 'block' : 'none';
        if (ativa) {
          if (state.userWantsExpanded) {
            btnExp.classList.add('ativo');
            if (temArq) { cdContainer.classList.add('tem-arquivos'); renderizarArquivos(idx, areaArq); }
            else { cdContainer.classList.remove('tem-arquivos'); areaArq.innerHTML = ''; }
          } else { btnExp.classList.remove('ativo'); cdContainer.classList.remove('tem-arquivos'); areaArq.innerHTML = ''; }
        } else { btnExp.classList.remove('ativo'); }
      });
      atualizarBotoes();
    }

    function atualizarBotoes() {
      const idxs = state.descricoes.slice().sort((a,b) => a-b);
      const pos = idxs.indexOf(state.currentIndex);
      const bd = document.getElementById('botao-descricao-anterior');
      const be = document.getElementById('botao-descricao-seguinte');
      const ba = document.getElementById('botao-adicionar-descricao');
      if (bd) { bd.disabled = pos === 0; bd.style.opacity = pos === 0 ? '0.3' : '1'; }
      if (be) { be.disabled = pos === idxs.length-1; be.style.opacity = pos === idxs.length-1 ? '0.3' : '1'; }
      if (ba) { ba.disabled = state.descricoes.length >= state.maxDescricoes; ba.style.opacity = state.descricoes.length >= state.maxDescricoes ? '0.3' : '1'; }
    }

    function atualizarRotulos() {
      const descs = document.querySelectorAll('.bloco-descricao');
      const total = descs.length;
      descs.forEach((d, i) => { const l = d.querySelector('.nome-campo'); if (l) l.textContent = total === 1 ? 'Descrição:' : `Descrição ${i+1}:`; });
    }

    function atualizarQuantidade() {
      const lista = document.getElementById('lista-campos-formulario');
      lista.classList.toggle('mais-descricao', document.querySelectorAll('.bloco-descricao').length > 1);
    }

    function vincularEventos(descEl, idx) {
      const btnExp = descEl.querySelector('#botao-expandir');
      const inputArq = descEl.querySelector('input[type="file"]');
      const labelAnexo = descEl.querySelector('#botao-anexar-arquivo');
      const btnRem = descEl.querySelector('#botao-remover-descricao');
      const inpTit = descEl.querySelector('#entrada-titulo');
      const inpDet = descEl.querySelector('#entrada-detalhes');
      const prevDet = descEl.querySelector('.preview-detalhes');

      const novoId = `arquivo-${idx}`;
      if (inputArq) inputArq.id = novoId;
      if (labelAnexo) labelAnexo.setAttribute('for', novoId);

      function atualizarEspelho() {
        if (!inpDet || !prevDet) return;
        prevDet.innerHTML = formatarPreviewDescricao(inpDet.value);
        prevDet.scrollTop = inpDet.scrollTop;
        prevDet.scrollLeft = inpDet.scrollLeft;
      }

      if (inpTit) inpTit.addEventListener('input', () => atualizarEstadoBotaoAnexo(descEl, idx));
      if (inpDet) {
        inpDet.addEventListener('input', () => { atualizarEstadoBotaoAnexo(descEl, idx); atualizarEspelho(); });
        inpDet.addEventListener('scroll', () => { if (prevDet) { prevDet.scrollTop = inpDet.scrollTop; prevDet.scrollLeft = inpDet.scrollLeft; } });
        atualizarEspelho();
      }

      btnExp.addEventListener('click', e => { e.preventDefault(); state.userWantsExpanded = !state.userWantsExpanded; atualizarExibicao(); });

      inputArq.addEventListener('change', function(e) {
        const novos = Array.from(e.target.files);
        const hid = descEl.querySelector('#marcador-tem-anexo');
        if (!state.arquivos[idx]) state.arquivos[idx] = [];
        const totalAtual = Object.values(state.arquivos).reduce((s,l) => s + (l||[]).length, 0);
        if (totalAtual + novos.length > 10) exibirAvisoAnexo('muitos dados','envie até 10 arquivos por vez');
        else if (novos.some(a => a.size > 50*1024*1024)) exibirAvisoAnexo('arquivo grande','compacte ou reduza o arquivo enviado');
        else if (novos.some(a => Object.values(state.arquivos).some(l => (l||[]).some(f => f.name===a.name && f.size===a.size)))) exibirAvisoAnexo('mesmo arquivo?','tente colocar algo diferente');
        else novos.forEach(a => state.arquivos[idx].push(a));
        if (hid) hid.value = state.arquivos[idx].length > 0 ? '1' : '0';
        atualizarEstadoBotaoAnexo(descEl, idx);
        atualizarExibicao();
        document.dispatchEvent(new CustomEvent('formstate-changed'));
        this.value = '';
      });

      if (btnRem) btnRem.onclick = e => { e.preventDefault(); removerDescricao(idx, descEl); };
      atualizarEstadoBotaoAnexo(descEl, idx);
    }

    function removerDescricao(idx, el) {
      if (state.descricoes.length <= 1) return;
      state.descricoes = state.descricoes.filter(id => id !== idx);
      delete state.arquivos[idx];
      if (state.currentIndex === idx) {
        const rest = state.descricoes.slice().sort((a,b) => a-b);
        state.currentIndex = rest[rest.length-1] || 0;
      }
      el.style.opacity = '0'; el.style.pointerEvents = 'none';
      setTimeout(() => {
        el.remove(); atualizarRotulos(); atualizarQuantidade(); atualizarExibicao();
        document.dispatchEvent(new CustomEvent('formstate-changed'));
      }, 300);
    }

    function adicionarDescricao(template) {
      if (state.descricoes.length >= state.maxDescricoes) return;
      const novoIdx = Math.max(...state.descricoes) + 1;
      const nova = template.cloneNode(true);
      nova.dataset.indice = novoIdx;
      nova.querySelectorAll('input, textarea').forEach(i => i.value = '');
      const prev = nova.querySelector('.preview-detalhes'); if (prev) prev.innerHTML = '';
      const arq = nova.querySelector('#painel-arquivos-anexados'); if (arq) arq.innerHTML = '';
      state.descricoes.push(novoIdx);
      state.arquivos[novoIdx] = [];
      const lista = document.getElementById('lista-campos-formulario');
      lista.insertBefore(nova, document.getElementById('secao-envio'));
      atualizarQuantidade(); vincularEventos(nova, novoIdx); atualizarRotulos();
      state.currentIndex = novoIdx; atualizarExibicao();
      document.dispatchEvent(new CustomEvent('formstate-changed'));
    }

    const primeiraDesc = document.querySelector('.bloco-descricao');
    if (!primeiraDesc) return;
    primeiraDesc.dataset.indice = 0;

    const btnAdd = document.getElementById('botao-adicionar-descricao');
    const btnAnt = document.getElementById('botao-descricao-anterior');
    const btnSeg = document.getElementById('botao-descricao-seguinte');

    if (btnAdd) btnAdd.addEventListener('click', e => { e.preventDefault(); adicionarDescricao(primeiraDesc); });
    if (btnAnt) btnAnt.addEventListener('click', e => {
      e.preventDefault();
      const idxs = state.descricoes.slice().sort((a,b) => a-b);
      const pos = idxs.indexOf(state.currentIndex);
      if (pos > 0) state.currentIndex = idxs[pos-1];
      atualizarExibicao();
      document.dispatchEvent(new CustomEvent('formstate-changed'));
    });
    if (btnSeg) btnSeg.addEventListener('click', e => {
      e.preventDefault();
      const idxs = state.descricoes.slice().sort((a,b) => a-b);
      const pos = idxs.indexOf(state.currentIndex);
      if (pos < idxs.length-1) state.currentIndex = idxs[pos+1];
      atualizarExibicao();
      document.dispatchEvent(new CustomEvent('formstate-changed'));
    });

    vincularEventos(primeiraDesc, 0);
    atualizarExibicao(); atualizarRotulos(); atualizarQuantidade();
  })();

  // ── Envio ─────────────────────────────────────────────
  (function inicializarEnvio() {
    const formulario = document.getElementById('formu');
    if (!formulario) return;
    const nomesProfessores = window._listaProfessores && window._listaProfessores.length
      ? window._listaProfessores
      : ['André Ferro','Edney','Bruno','Vinicius','Domiciano','Rayan','Bruna','Gracielle','Vitor','Monara','André Almeida','Gustavo','Ricardo','Fontenelle','Maryana','Tobias'];
    const normalizar = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

    const atualizarGuia = () => {
      const bd = document.getElementById('botao-descricao-anterior');
      const be = document.getElementById('botao-descricao-seguinte');
      if (!bd || !be) return;
      bd.classList.remove('erro-guia'); be.classList.remove('erro-guia');
      document.querySelectorAll('.bloco-descricao').forEach(d => {
        if (d.classList.contains('erro-envio')) {
          const i = parseInt(d.dataset.indice);
          if (i < state.currentIndex) bd.classList.add('erro-guia');
          else if (i > state.currentIndex) be.classList.add('erro-guia');
        }
      });
    };

    const btnAdicionarDesc = document.getElementById('botao-adicionar-descricao');
    if (btnAdicionarDesc) btnAdicionarDesc.addEventListener('click', () => {
      setTimeout(() => {
        const descs = document.querySelectorAll('.bloco-descricao');
        const ultima = descs[descs.length-1];
        if (ultima) { ultima.classList.remove('erro-envio'); ultima.querySelectorAll('.erro-envio').forEach(e => e.classList.remove('erro-envio')); }
        atualizarGuia();
      }, 50);
    });

    ['botao-descricao-anterior','botao-descricao-seguinte'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => setTimeout(atualizarGuia, 10));
    });

    formulario.addEventListener('submit', function(e) {
      e.preventDefault();
      let ok = true;
      const profLi = document.querySelector('.campo-prof');
      const profVal = document.getElementById('entrada-professor');
      if (!nomesProfessores.some(n => normalizar(n) === normalizar(profVal.value))) { profLi.classList.add('erro-envio'); ok = false; }
      const tipoLi = document.querySelector('.campo-tipo');
      const textoSel = document.getElementById('texto-selecao');
      if (textoSel && textoSel.textContent.trim().toLowerCase() === 'selecione') { tipoLi.classList.add('erro-envio'); ok = false; }
      const dataLi = document.querySelector('.campo-data');
      const d = parseInt(document.getElementById('dia').value);
      const m = parseInt(document.getElementById('mes').value);
      const a = parseInt(document.getElementById('ano').value);
      const hoje = new Date();
      const modoEdicaoValidacao = formulario.dataset.modoEdicao === '1';
      let dataOk = !isNaN(d) && !isNaN(m) && !isNaN(a) && (modoEdicaoValidacao || a === hoje.getFullYear());
      if (dataOk) { const di = new Date(a, m-1, d); if (di.getFullYear()!==a||di.getMonth()!==m-1||di.getDate()!==d) dataOk=false; }
      if (!dataOk) { dataLi.classList.add('erro-envio'); ok = false; }
      document.querySelectorAll('.bloco-descricao').forEach(secao => {
        const t = secao.querySelector('#entrada-titulo');
        const det = secao.querySelector('#entrada-detalhes');
        let secErr = false;
        if (t.value.trim().length < 5) { t.classList.add('erro-envio'); secErr = true; }
        if (det.value.trim().length < 10) { det.classList.add('erro-envio'); secErr = true; }
        secao.classList.toggle('erro-envio', secErr);
        if (secErr) ok = false;
      });
      atualizarGuia();
      if (!ok) return;

      const fixos = {
        deslizador: document.getElementById('deslizador')?.value ?? '',
        'entrada-professor': document.getElementById('entrada-professor')?.value ?? '',
        tipo: document.getElementById('input-tipo-valor')?.value ?? '',
        dia: document.getElementById('dia')?.value ?? '',
        mes: document.getElementById('mes')?.value ?? '',
        ano: document.getElementById('ano')?.value ?? '',
        'chave-local': document.getElementById('chave-local')?.checked ? 'on' : 'off',
      };

      // ── Modo edição: UPDATE via servidor ──
      const modoEdicao = formulario.dataset.modoEdicao === '1';
      if (modoEdicao) {
        const itemIdEd = formulario.dataset.itemIdEdicao;
        const primeiraSecao = document.querySelectorAll('.bloco-descricao')[0];
        if (!primeiraSecao) return;

        const MATERIAS_UPD = ['MATEMÁTICA','ITINERÁRIO','LINGUAGENS','HUMANAS','NATUREZA'];
        const dadosAtualizados = {
          area:             MATERIAS_UPD[parseInt(fixos['deslizador'], 10)] || 'DESCONHECIDO',
          professor:        fixos['entrada-professor'],
          tipo:             fixos['tipo'],
          data:             (() => {
            const [d2,m2,a2] = [fixos['dia'], fixos['mes'], fixos['ano']];
            return `${a2}-${String(m2).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
          })(),
          local:            fixos['chave-local'] === 'on' ? 'casa' : 'sala',
          descricao_titulo: primeiraSecao.querySelector('#entrada-titulo')?.value ?? '',
          descricao_detalhes: primeiraSecao.querySelector('#entrada-detalhes')?.value ?? '',
        };

        fetch(`/api/atividades/${itemIdEd}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dadosAtualizados)
        })
          .then(r => r.json())
          .then(j => {
            if (j.error) { alert('Erro ao salvar: ' + j.error); return; }
            const partesDt = dadosAtualizados.data.split('-');
            const dataVoltaStr = `${String(partesDt[2]).padStart(2,'0')}/${String(partesDt[1]).padStart(2,'0')}/${partesDt[0]}`;
            const diaNum = parseInt(partesDt[2], 10);
            const mesNum = parseInt(partesDt[1], 10) - 1;
            const _orig = carregarDadosAtividades;
            carregarDadosAtividades = async function() {
              await _orig();
              carregarDadosAtividades = _orig;
              renderizarCalendarioComEventos();
              abrirPainelDia(diaNum, mesNum, dataVoltaStr);
            };
            const btnCal = document.getElementById('btn-calendario');
            if (btnCal) btnCal.click();
          });

        // Anexos: envia separado (existentes a preservar + novos arquivos)
        // Sempre envia em modo edição para garantir que remoções de anexos sejam persistidas
        const todosArqs = state.arquivos[0] || [];
        const pathsExistentes = todosArqs.filter(a => a._existente).map(a => a._path);
        const arquivosNovos   = todosArqs.filter(a => !a._existente);
        const fdAnexos = new FormData();
        fdAnexos.append('_anexos_existentes', JSON.stringify(pathsExistentes));
        arquivosNovos.forEach(f => fdAnexos.append('arquivo', f, f.name));
        fetch(`/api/atividades/${itemIdEd}/anexos`, { method: 'POST', body: fdAnexos }).catch(console.error);
        return;
      }

      // ── Modo criação: POST normal ao servidor ──
      const envios = Array.from(document.querySelectorAll('.bloco-descricao')).map(secao => {
        const idx = parseInt(secao.dataset.indice);
        const fd = new FormData();
        Object.entries(fixos).forEach(([k,v]) => fd.append(k, v));
        fd.append('entrada-titulo', secao.querySelector('#entrada-titulo')?.value ?? '');
        fd.append('entrada-detalhes', secao.querySelector('#entrada-detalhes')?.value ?? '');
        fd.append('marcador-tem-anexo', (state.arquivos[idx]||[]).length > 0 ? '1' : '0');
        (state.arquivos[idx]||[]).forEach(f => fd.append('arquivo', f, f.name));
        // Inclui sala_id se o usuário estiver em uma sala
        const salaId = window._salaAtual ? window._salaAtual.id : null;
        if (salaId) fd.append('sala_id', String(salaId));
        return fetch('/', { method: 'POST', body: fd });
      });
      Promise.all(envios).then(async () => {
        const dia  = parseInt(fixos['dia'],  10);
        const mes  = parseInt(fixos['mes'],  10) - 1; // 0-based
        const ano  = parseInt(fixos['ano'],  10);
        const dataVoltaStr = `${String(fixos['dia']).padStart(2,'0')}/${String(fixos['mes']).padStart(2,'0')}/${fixos['ano']}`;

        // Monkey-patch temporário: após recarregar os dados, abre o painel do dia
        const _orig = carregarDadosAtividades;
        carregarDadosAtividades = async function() {
          await _orig();
          carregarDadosAtividades = _orig;
          renderizarCalendarioComEventos();
          abrirPainelDia(dia, mes, dataVoltaStr);
        };

        // Navega para o calendário (dispara renderAbaAtiva → carregarDadosAtividades)
        const btnCal = document.getElementById('btn-calendario');
        if (btnCal) btnCal.click();
      });
    });

    const limparErro = e => {
      const li = e.target.closest('li');
      if (li) { li.classList.remove('erro-envio'); li.querySelectorAll('.erro-envio').forEach(f => f.classList.remove('erro-envio')); atualizarGuia(); }
    };
    formulario.addEventListener('focusin', limparErro);
    formulario.addEventListener('mousedown', limparErro);
  })();

  // ── Pré-preenchimento para modo edição ───────────────
  if (itemEdicao) {
    // Marca como edição imediatamente — antes de qualquer rAF
    const formuImediato = document.getElementById('formu');
    if (formuImediato) {
      formuImediato.dataset.modoEdicao   = '1';
      formuImediato.dataset.itemIdEdicao = String(itemEdicao.id);
      const btnPostarImediato = document.getElementById('botao-postar');
      if (btnPostarImediato) btnPostarImediato.textContent = 'Salvar';
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Área (deslizador)
        const MATERIAS_EDIT = ['MATEMÁTICA','ITINERÁRIO','LINGUAGENS','HUMANAS','NATUREZA'];
        const idxArea = MATERIAS_EDIT.findIndex(m => m === (itemEdicao.area || '').toUpperCase());
        const desl = document.getElementById('deslizador');
        if (desl && idxArea >= 0) {
          desl.value = idxArea;
          desl.dispatchEvent(new Event('input'));
        }

        // Professor
        const profInput = document.getElementById('entrada-professor');
        if (profInput) {
          profInput.value = itemEdicao.professor || '';
          requestAnimationFrame(() => { profInput.dispatchEvent(new Event('input')); });
        }

        // Tipo
        const tipoValor = document.getElementById('input-tipo-valor');
        const textoSel  = document.getElementById('texto-selecao');
        if (tipoValor && itemEdicao.tipo) {
          const tipoMap = {
            'Tarefa':  { texto: 'tarefas curriculares', cor: 'var(--cor-op-azul)',    corClaro: 'var(--cor-op-azul-claro)'    },
            'Projeto': { texto: 'projetos disciplinares',   cor: 'var(--cor-op-verde)',   corClaro: 'var(--cor-op-verde-claro)'   },
            'Teste':   { texto: 'simulados formativos',   cor: 'var(--cor-op-amarela)', corClaro: 'var(--cor-op-amarela-claro)' },
            'Prova':   { texto: 'avaliações somativas', cor: 'var(--cor-op-vermelha)',corClaro: 'var(--cor-op-vermelha-claro)'},
          };
          tipoValor.value = itemEdicao.tipo;
          const t = tipoMap[itemEdicao.tipo];
          if (t && textoSel) {
            textoSel.textContent = t.texto;
            // Aplica estilos visuais semelhante ao clique manual na opção
            const menuExtEl = document.getElementById('menu-externo');
            const menuIntEl = document.getElementById('menu-interno');
            // Lê a cor via CSS da opção correspondente se disponível
            const opcaoEl = Array.from(document.querySelectorAll('.opcao')).find(o => o.textContent.trim() === t.texto);
            if (opcaoEl) {
              const st = window.getComputedStyle(opcaoEl);
              const cor = st.getPropertyValue('--cor-op').trim();
              const corC = st.getPropertyValue('--cor-op-claro').trim();
              if (cor && menuExtEl) menuExtEl.style.setProperty('--cor-op', cor);
              if (cor && textoSel) { textoSel.style.background = `rgb(${cor})`; }
              if (corC && menuIntEl) {
                menuIntEl.style.backgroundColor = `rgb(${corC})`;
                menuIntEl.style.boxShadow = `0 0 7.5px rgba(${corC},1)`;
                textoSel.style.textShadow = `-1.5px 2px 2px rgba(${corC},0.5),0 0 5px rgba(${cor},0.3)`;
              }
              opcaoEl.style.display = 'none';
            }
          }
        }

        // Data (DD/MM/AAAA)
        const partes = (itemEdicao.data || '').split('/');
        const campoDia = document.getElementById('dia');
        const campoMes = document.getElementById('mes');
        const campoAno = document.getElementById('ano');
        if (campoDia) campoDia.value = partes[0] || '';
        if (campoMes) campoMes.value = partes[1] || '';
        if (campoAno) campoAno.value = partes[2] || '';
        // Atualiza separadores
        const sepsEdit = document.querySelectorAll('.separador');
        const temDataEdit = (partes[0] || partes[1] || partes[2]);
        sepsEdit.forEach(s => s.classList.toggle('sem-data', !temDataEdit));

        // Local (casa / sala)
        const chaveLocal = document.getElementById('chave-local');
        if (chaveLocal) {
          chaveLocal.checked = (itemEdicao.local || '').toLowerCase() === 'casa';
          chaveLocal.dispatchEvent(new Event('change'));
        }

        // Título e detalhes (primeira descrição, índice 0)
        const primeiraDesc = document.querySelector('.bloco-descricao');
        if (primeiraDesc) {
          const inpTit = primeiraDesc.querySelector('#entrada-titulo');
          const inpDet = primeiraDesc.querySelector('#entrada-detalhes');
          const prevDet = primeiraDesc.querySelector('.preview-detalhes');
          if (inpTit) {
            inpTit.value = itemEdicao.descricao_titulo || '';
            inpTit.dispatchEvent(new Event('input'));
          }
          if (inpDet) {
            inpDet.value = itemEdicao.descricao_detalhes || '';
            inpDet.dispatchEvent(new Event('input'));
          }

          // Anexos já salvos: injeta no state como objetos _existente
          const anexosExistentes = Array.isArray(itemEdicao.arquivos) ? itemEdicao.arquivos : [];
          if (anexosExistentes.length > 0) {
            state.arquivos[0] = anexosExistentes.map(p => ({
              _existente: true, _path: p, name: p.split('/').pop(), size: 1,
            }));
            const hid = primeiraDesc.querySelector('#marcador-tem-anexo');
            if (hid) hid.value = '1';
            state.userWantsExpanded = true;
            atualizarEstadoBotaoAnexo(primeiraDesc, 0);
            atualizarExibicao();
          }
        }

      });
    });
  }

  // ── Ajuste de altura ao carregar ──────────────────────
  const ul = document.querySelector('ul');
  if (ul) document.documentElement.style.setProperty('--ul-height', `${ul.offsetHeight}px`);

  const menuExterno = document.getElementById('menu-externo');
  if (menuExterno) {
    menuExterno.style.opacity = '0';
    menuExterno.style.transform = 'translateY(20px)';
    menuExterno.style.transition = 'all 0.6s cubic-bezier(0.4,0,0.2,1)';
    setTimeout(() => { menuExterno.style.opacity = '1'; menuExterno.style.transform = 'translateY(0)'; }, 100);
  }

  let _ulResizeTimer = null;
  const observer = new ResizeObserver(() => {
    if (_ulResizeTimer) return;
    _ulResizeTimer = requestAnimationFrame(() => {
      _ulResizeTimer = null;
      const ul2 = document.querySelector('ul');
      if (ul2) document.documentElement.style.setProperty('--ul-height', `${ul2.offsetHeight}px`);
    });
  });
  observer.observe(document.body);
}


/* ══════════════════════════════════════════════════════════
   Modal de drive — HTML template
   (mesmo visual do modal-formulario, sem campo de link para horário)
   ══════════════════════════════════════════════════════════ */
const _htmlModalDrive = (semLink = false) => `
<div class="modal-overlay aberto" id="modal-drive-overlay">
  <div class="modal-drive">
    <main id="form-drive-container">
      <form id="form-drive">
        <ul id="lista-campos-drive">
          <li class="topo-modal-drive">
            <button class="fechar" type="button" id="botao-fechar-drive">
              <svg class="icone-fechar" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
            <h2 id="titulo-modal-drive">adicionar drive</h2>
          </li>
          <li class="campo-disciplina">
            <a class="nome-campo">Área:</a>
            <div id="painel-disciplina">
              <h2 id="texto-disciplina">MATEMÁTICA</h2>
              <div id="seletor-disciplina-container">
                <div id="seletor-disciplina-trilha"></div>
                <div id="seletor-disciplina-bola"></div>
                <input type="range" min="0" max="4" step="1" value="0" id="seletor-disciplina" name="seletor-disciplina">
              </div>
            </div>
          </li>
          <li class="campo-autor">
            <a class="nome-campo">De:</a>
            <input id="entrada-autor" name="entrada-autor" type="text" placeholder="professor(a)" autocomplete="off">
            <div id="visor-autor"></div>
          </li>
          ${semLink ? '' : `
          <li class="campo-link" id="li-campo-link">
            <a class="nome-campo">Caminho de acesso:</a>
            <div id="container-link">
              <textarea id="entrada-link" name="entrada-link" placeholder="link aqui..." spellcheck="false" rows="5"></textarea>
              <div class="preview-link" aria-hidden="true"></div>
            </div>
          </li>`}
          <li id="secao-salvar">
            <button type="submit" id="botao-salvar-drive">Salvar</button>
          </li>
        </ul>
      </form>
    </main>
  </div>
</div>
`;

/* ══════════════════════════════════════════════════════════
   Modal de drive — estado e funções
   ══════════════════════════════════════════════════════════ */
// Preenchido dinamicamente em carregarDadosProfessores() — veja Parte 1
let NOMES_AUTORES_DRIVE = [];
const DISCIPLINAS_DRIVE = ['MATEMÁTICA','ITINERÁRIO','LINGUAGENS','HUMANAS','NATUREZA'];
const DISCIPLINAS_API   = ['matematica','itinerario','linguagens','humanas','natureza'];

let _modalDriveEl = null;
let _modalDriveItemId = null; // null = criação, número = edição

function _abrirModalDrive(itemEdicao, semLink = false) {
  // Destrói instância anterior se existir
  if (_modalDriveEl) { _modalDriveEl.remove(); _modalDriveEl = null; }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = _htmlModalDrive(semLink);
  _modalDriveEl = wrapper.firstElementChild;
  document.body.appendChild(_modalDriveEl);
  _modalDriveItemId = itemEdicao ? (itemEdicao.id ?? itemEdicao._id ?? null) : null;

  const titulo = document.getElementById('titulo-modal-drive');
  if (titulo) titulo.textContent = semLink
    ? (itemEdicao ? 'editar horário' : 'editar horário')
    : (itemEdicao ? 'editar drive' : 'adicionar drive');

  // ── Seletor de disciplina ──────────────────────────────
  (function () {
    const seletor = document.getElementById('seletor-disciplina');
    const textoDisciplina = document.getElementById('texto-disciplina');
    const bola  = document.getElementById('seletor-disciplina-bola');
    const container = document.getElementById('seletor-disciplina-container');
    if (!seletor) return;
    const cores = ['var(--cor-matematica)','var(--cor-itinerario)','var(--cor-linguagens)','var(--cor-humanas)','var(--cor-natureza)'];
    function atualizar(v) {
      const pct = (v / 4) * 100;
      bola.style.left = (pct / 100) * (container.offsetWidth - bola.offsetWidth) + 'px';
      bola.style.transform = 'translateY(-50%)';
      const cor = cores[v];
      const trilha = document.getElementById('seletor-disciplina-trilha');
      trilha.style.background = `rgb(${cor})`;
      trilha.style.outline = `3.75px solid rgb(${cor})`;
      textoDisciplina.textContent = DISCIPLINAS_DRIVE[v];
      textoDisciplina.style.setProperty('--cor-texto-disciplina', `var(--cor-${['matematica','itinerario','linguagens','humanas','natureza'][v]})`);
      textoDisciplina.style.removeProperty('background');
      textoDisciplina.style.removeProperty('text-shadow');
    }
    seletor.addEventListener('input', () => atualizar(parseInt(seletor.value)));
    // Defer para o layout estar pronto — offsetWidth precisa do paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const initVal = (itemEdicao && itemEdicao.area)
          ? (() => { const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,''); return Math.max(0, DISCIPLINAS_API.indexOf(norm(itemEdicao.area))); })()
          : 0;
        seletor.value = initVal;
        atualizar(initVal);
      });
    });
  })();

  // ── Autocomplete autor ────────────────────────────────
  (function () {
    const nomes = NOMES_AUTORES_DRIVE;
    const inp = document.getElementById('entrada-autor');
    const visor = document.getElementById('visor-autor');
    if (!inp) return;
    const PLACEHOLDER_AUTOR_DRIVE = inp.getAttribute('placeholder') || 'professor(a)';
    let sugestao = '';
    const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const cap = v => v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    function atualizar() {
      const typed = inp.value; const cur = inp.selectionStart;
      if (!typed) { visor.innerHTML = '<span class="cursor-falso"></span>'; sugestao = ''; return; }
      const match = nomes.find(n => semAcento(n.toLowerCase()).startsWith(semAcento(typed.toLowerCase())));
      const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const ante = esc(typed.substring(0,cur)); const post = esc(typed.substring(cur));
      if (match) {
        visor.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span><span class="texto-sugestao">${esc(match.substring(typed.length))}</span>`;
        sugestao = match;
      } else {
        visor.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span>`;
        sugestao = '';
      }
    }
    inp.addEventListener('input', e => {
      let v = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g,'').replace(/^\s+/,'');
      v = cap(v);
      if (v !== e.target.value) { const s = e.target.selectionStart; e.target.value = v; e.target.setSelectionRange(s,s); }
      atualizar();
    });
    document.addEventListener('selectionchange', () => { if (document.activeElement === inp) atualizar(); });
    inp.addEventListener('focus', () => { visor.classList.add('input-focado'); atualizar(); });
    inp.addEventListener('blur', () => {
      visor.classList.remove('input-focado');
      if (sugestao) {
        inp.value = sugestao;
        visor.innerHTML = `<span class="texto-digitado">${sugestao.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
        sugestao = '';
      } else {
        const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const typed = inp.value;
        visor.innerHTML = typed
          ? `<span class="texto-digitado">${esc(typed)}</span>`
          : `<span class="texto-sugestao texto-placeholder-visor">${PLACEHOLDER_AUTOR_DRIVE}</span>`;
      }
    });
    inp.addEventListener('keydown', e => {
      if ((e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowRight') && sugestao) {
        if (e.key === 'ArrowRight' && inp.selectionStart !== inp.value.length) return;
        e.preventDefault(); inp.value = sugestao; atualizar();
      } else if (e.key === 'Escape') { inp.value = ''; atualizar(); }
    });
    ['paste','copy','cut','contextmenu','selectstart'].forEach(ev => inp.addEventListener(ev, e => e.preventDefault()));
    inp.addEventListener('mousedown', () => setTimeout(atualizar, 10));
    // Inicializa o visor com placeholder se campo vazio
    if (!inp.value) visor.innerHTML = `<span class="texto-sugestao texto-placeholder-visor">${PLACEHOLDER_AUTOR_DRIVE}</span>`;
    // Pré-preencher
    if (itemEdicao && itemEdicao.professor) {
      inp.value = itemEdicao.professor;
      requestAnimationFrame(() => { inp.dispatchEvent(new Event('input')); });
    }
  })();

  // ── Preview de link ───────────────────────────────────
  if (!semLink) {
    (function () {
      const textarea = document.getElementById('entrada-link');
      const preview  = document.querySelector('.preview-link');
      if (!textarea || !preview) return;
      function format(texto) {
        if (!texto) return '';
        let s = texto.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        s = s.replace(/\*\*(.*?)\*\*/g, (_,c) => `<span style="opacity:0.25">**</span><b>${c}</b><span style="opacity:0.25">**</span>`);
        s = s.replace(/(https?:\/\/[^\s<]+)/g,'<span style="text-decoration:underline">$1</span>');
        s = s.replace(/\n/g,'<br>');
        return s;
      }
      function sync() { preview.innerHTML = format(textarea.value); preview.scrollTop = textarea.scrollTop; preview.scrollLeft = textarea.scrollLeft; }
      textarea.addEventListener('input', sync);
      textarea.addEventListener('scroll', () => { preview.scrollTop = textarea.scrollTop; preview.scrollLeft = textarea.scrollLeft; });
      // Pré-preencher
      if (itemEdicao && itemEdicao.link) { textarea.value = itemEdicao.link; sync(); }
    })();
  }

  // ── Fechar ────────────────────────────────────────────
  const btnFechar = document.getElementById('botao-fechar-drive');
  const fechar = () => {
    if (!_modalDriveEl) return;
    const overlay = _modalDriveEl;
    const card = overlay.querySelector('.modal-drive');
    overlay.classList.add('saindo');
    if (card) card.classList.add('saindo');
    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
      if (_modalDriveEl === overlay) { _modalDriveEl = null; _modalDriveItemId = null; }
    }, 260);
  };
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  _modalDriveEl.addEventListener('click', e => { if (e.target === _modalDriveEl) fechar(); });
  const _escDrive = e => { if (e.key === 'Escape' && _modalDriveEl) { fechar(); document.removeEventListener('keydown', _escDrive); } };
  document.addEventListener('keydown', _escDrive);

  // ── Remover erro ao clicar na li ─────────────────────
  const lista = document.getElementById('lista-campos-drive');
  if (lista) lista.addEventListener('click', function(e) {
    const li = e.target.closest('li');
    if (li) li.classList.remove('erro-envio');
  });

  // ── Envio ─────────────────────────────────────────────
  const form = document.getElementById('form-drive');
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const seletor = document.getElementById('seletor-disciplina');
    const autor   = (document.getElementById('entrada-autor')?.value || '').trim();
    const linkEl  = document.getElementById('entrada-link');
    const link    = linkEl ? linkEl.value.trim() : null;

    // Valida
    let ok = true;
    const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const autorValido = NOMES_AUTORES_DRIVE.some(n => norm(n) === norm(autor));
    const campoAutor = document.querySelector('.campo-autor');
    const campoLink  = document.querySelector('.campo-link');
    if (!autorValido) { if (campoAutor) campoAutor.classList.add('erro-envio'); ok = false; }
    if (!semLink) {
      const temLink = link && /https?:\/\/\S+/.test(link);
      if (!temLink) { if (campoLink) campoLink.classList.add('erro-envio'); ok = false; }
    }
    if (!ok) return;

    const idxArea = parseInt(seletor?.value ?? '0');
    const payload = {
      area: DISCIPLINAS_DRIVE[idxArea],
      professor: autor,
      ...(semLink ? {} : { link }),
    };

    const botao = document.getElementById('botao-salvar-drive');
    if (botao) botao.disabled = true;

    try {
      let res, json;
      if (_modalDriveItemId != null) {
        // EDITAR
        res  = await fetch(`/api/drives/${_modalDriveItemId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        json = await res.json();
      } else {
        // CRIAR
        res  = await fetch('/api/drives', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        json = await res.json();
      }
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      fechar();
      // Recarrega drives na UI
      await carregarDrives();
      _iniciarCardDrive();
    } catch (err) {
      console.error('[modal-drive] erro:', err);
      if (botao) { botao.disabled = false; botao.textContent = 'erro — tente novamente'; setTimeout(() => { botao.textContent = 'Salvar'; }, 2500); }
    }
  });
}

/* ══════════════════════════════════════════════════════════
   Modal de manuais — dinâmico por aba
   Título fixo "manual de uso" em todas as abas.
   ══════════════════════════════════════════════════════════ */

let _modalManualEl = null;

// ── Utilitário: data atual em pt-BR ("2 de maio") ────────
function _dataAtualFormatada() {
  const hoje = new Date();
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  return `${hoje.getDate()} de ${meses[hoje.getMonth()]}`;
}

// ── Utilitário: texto do filtro atual ────────────────────
function _textoFiltroAtual() {
  const temCasa = _filtroExibicao.casa;
  const temSala = _filtroExibicao.sala;

  if (temCasa && temSala) return 'casa e sala';
  if (temCasa) return 'casa';
  if (temSala) return 'sala';

  return 'casa e sala';
}

function _atualizarSpansFiltroManualProximo() {
  const spanSala = document.getElementById('manual-proximo-filtro-sala');
  const spanE    = document.getElementById('manual-proximo-filtro-e');
  const spanCasa = document.getElementById('manual-proximo-filtro-casa');
  if (!spanSala || !spanE || !spanCasa) return;

  const temSala = _filtroExibicao.sala;
  const temCasa = _filtroExibicao.casa;

  spanSala.style.display = temSala ? '' : 'none';
  spanCasa.style.display = temCasa ? '' : 'none';
  spanE.style.display    = (temSala && temCasa) ? '' : 'none';
}

// ── Escape básico para HTML ──────────────────────────────
function _escapeHtmlManual(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Formata detalhes da prévia ───────────────────────────
// Trechos entre quatro aspas: """"texto"""" → <strong>texto</strong>
function _formatarDetalhesPrevia(texto) {
  const bruto = String(texto || 'sem detalhes');
  let html = '';
  let ultimoIndice = 0;
  const regex = /""""([\s\S]*?)""""/g;
  let match;

  while ((match = regex.exec(bruto)) !== null) {
    html += _escapeHtmlManual(bruto.slice(ultimoIndice, match.index));
    html += `<strong>${_escapeHtmlManual(match[1])}</strong>`;
    ultimoIndice = regex.lastIndex;
  }

  html += _escapeHtmlManual(bruto.slice(ultimoIndice));
  return html.replace(/\n/g, '<br>');
}

// ── Contadores para aba calendário ───────────────────────
function _popularContadoresManuais(root) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const contagem = {
    tarefa: 0,
    projeto: 0,
    teste: 0,
    prova: 0
  };

  (todosDados || []).forEach(item => {
    const tipo = normalizarTexto(item.tipo);

    if (!(tipo in contagem)) return;
    if (!item.data || !item.data.includes('/')) return;

    // Filtra pelo local de exibição configurado (casa / sala / ambos)
    const loc = normalizarTexto(item.local);
    if (!_filtroExibicao.casa && loc === 'casa') return;
    if (!_filtroExibicao.sala && loc === 'sala') return;

    const [d, m, a] = item.data.split('/');
    const dataItem = new Date(Number(a), Number(m) - 1, Number(d));
    dataItem.setHours(0, 0, 0, 0);

    if (dataItem >= hoje) contagem[tipo]++;
  });

  const map = {
    tarefa: 'manual-tarefa',
    projeto: 'manual-projeto',
    teste: 'manual-teste',
    prova: 'manual-prova'
  };

  Object.entries(map).forEach(([tipo, id]) => {
    const el = (root || document).querySelector(`#${id}`);
    if (!el) return;

    const span = el.querySelector('.quantidade-atividade');
    if (!span) return;

    const h2 = span.querySelector('h2');

    if (h2) h2.textContent = contagem[tipo] || 0;
    else span.textContent = contagem[tipo] || 0;
  });
}

// ── Conteúdo HTML interno por aba ────────────────────────
function _htmlConteudoManual(abaId) {
  if (abaId === 'btn-calendario') {
    return `
      <li>
        <div class="painel-manual-calendario">
          <div id="manual-tarefa" class="manual-atividade">
            <h2 class="t-nome-tipo-manual">tarefas curriculares</h2>
            <span class="quantidade-atividade"><h2 class="n-quantidade-manual"></h2></span>
          </div>

          <div id="manual-projeto" class="manual-atividade">
            <h2 class="t-nome-tipo-manual">projetos disciplinares</h2>
            <span class="quantidade-atividade"><h2 class="n-quantidade-manual"></h2></span>
          </div>

          <div id="manual-teste" class="manual-atividade">
            <h2 class="t-nome-tipo-manual">simulados formativos</h2>
            <span class="quantidade-atividade"><h2 class="n-quantidade-manual"></h2></span>
          </div>

          <div id="manual-prova" class="manual-atividade">
            <h2 class="t-nome-tipo-manual">avaliações somativas</h2>
            <span class="quantidade-atividade"><h2 class="n-quantidade-manual"></h2></span>
          </div>
        </div>
      </li>`;
  }

  if (abaId === 'bnt-proximo') {
    const data = _dataAtualFormatada();
    const filtro = _textoFiltroAtual();

    return `
      <li>
        <div class="manual-texto-simples">
          <span class="texto-manual-comum">atividades próximas a partir de <span id="manual-proximo-data">${data}</span>,
          para <span id="manual-proximo-filtro-sala">sala</span><span id="manual-proximo-filtro-e"> e </span><span id="manual-proximo-filtro-casa">casa</span></span>
        </div>
      </li>`;
  }

  if (abaId === 'btn-material') {
    return `
      <li>
        <div class="manual-texto-simples">
          <span class="texto-manual-comum"><span id="manual-material-horario">grade de aulas</span>, <span id="manual-material-drive">drives acadêmicos</span> e <span id="manual-material-plataforma">plataformas de apoio</span> disponibilizados pelos professores e escola</span>
        </div>
      </li>`;
  }

  if (abaId === 'botao-navbar-adicionar') {
    return `
      <li>
        <div class="manual-texto-simples manual-texto-adicionar">
          <span class="texto-manual-comum">preencha os campos da atividade e confira a prévia antes de salvar</span>
        </div>
      </li>

      <li id="manual-previa-li">
        <div class="manual-previa-card-wrap">
          <p class="manual-previa-legenda">prévia</p>
          <div id="manual-card-preview-container">
            <div class="card-atividade" id="manual-card-preview">
              <div class="tag-tipo" id="manual-preview-tag">selecione</div>
              <div class="card-materia" id="manual-preview-area">MATEMÁTICA</div>
              <div class="card-prof" id="manual-preview-prof">Prof. —</div>
              <button class="card-titulo" type="button" id="manual-preview-titulo">sem título</button>
              <div class="card-pontos-tipo"><div id="p1"></div><div id="p2"></div><div id="p3"></div><div id="p4"></div></div>
              <div class="card-detalhes"><div class="texto-detalhes" id="manual-preview-detalhes"></div></div>
            </div>
          </div>
        </div>
      </li>`;
  }

  if (abaId === 'btn-config') {
    const sala = window._salaAtual
      ? window._salaAtual.nome
      : (window._codigoSalaAtual || '\u2014');
    const codigo = window._salaAtual
      ? (window._salaAtual.codigo || window._codigoSalaAtual || '\u2014')
      : (window._codigoSalaAtual || '\u2014');
    const liCodigo = sessao ? `
      <li id="manual-config-li-codigo">
        <div class="manual-config-item manual-config-item-codigo">
          <span class="manual-config-item-label manual-config-label-codigo">c\u00f3digo:</span><strong class="manual-config-item-valor manual-config-valor-codigo">${_escapeHtmlManual(codigo)}</strong>
        </div>
      </li>` : '';
    return `
      <li id="manual-config-li-sala">
        <div class="manual-config-item manual-config-item-sala">
          <span class="manual-config-item-label manual-config-label-sala">sala atual:</span><strong class="manual-config-item-valor manual-config-valor-sala">${_escapeHtmlManual(sala)}</strong>
        </div>
      </li>${liCodigo}
      <li id="manual-config-li-sair">
        <button id="botao-sair-sala" type="button" class="manual-config-sair-sala"><h2 id="manual-config-sair-sala-texto">sair</h2></button>
      </li>`;
  }

  if (abaId === 'login') {
    return `
      <li>
        <div class="manual-texto-simples">
          <span class="texto-manual-comum">em caso de dificuldade de acesso, entre em contato com a coordenação escolar</span>
        </div>
      </li>`;
  }

  return `
    <li>
      <div class="manual-texto-simples">manual de uso</div>
    </li>`;
}

function _vincularPreviaManual(overlay) {
  const card       = overlay.querySelector('#manual-card-preview');
  const tagEl      = overlay.querySelector('#manual-preview-tag');
  const areaEl     = overlay.querySelector('#manual-preview-area');
  const profEl     = overlay.querySelector('#manual-preview-prof');
  const tituloEl   = overlay.querySelector('#manual-preview-titulo');
  const detalhesEl = overlay.querySelector('#manual-preview-detalhes');
  if (!card) return;

  // Lê os campos do formulário que está aberto em conteudo-tipo
  function lerCampos() {
    // Área
    const textoMateria = document.getElementById('texto-materia');
    const area = textoMateria ? textoMateria.textContent.trim() : 'MATEMÁTICA';
    if (areaEl) areaEl.textContent = area;

    // Normaliza área para classe CSS
    const areaNorm = area.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

    // Tipo
    const inputTipo = document.getElementById('input-tipo-valor');
    const tipoRaw = inputTipo ? inputTipo.value.trim() : '';
    const tipoNorm = tipoRaw.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const tiposValidos = ['tarefa', 'projeto', 'teste', 'prova'];
    const tipoValido = tiposValidos.includes(tipoNorm) ? tipoNorm : '';

    if (tagEl) {
      tiposValidos.forEach(t => tagEl.classList.remove(t));
      if (tipoValido) {
        tagEl.textContent = tipoRaw;
        tagEl.classList.add(tipoValido);
      } else {
        tagEl.textContent = 'vazio';
        tagEl.style.background = 'rgb(var(--cor-letra-apagada))';
        tagEl.style.color = 'rgb(var(--cor-branco-claro))';
        tagEl.style.opacity = '1';
      }
    }

    // Remove classes de area/tipo antigas do card e aplica as novas — preserva .aberto
    const estaAberto = card.classList.contains('aberto');
    const classesFixas = ['card-atividade'];
    card.className = classesFixas.join(' ')
      + (estaAberto ? ' aberto' : '')
      + (areaNorm ? ' ' + areaNorm : '')
      + (tipoValido ? ' ' + tipoValido : '');

    // Bolinhas: sem tipo → forçar cor-branco-claro via inline; com tipo → deixar CSS animar
    const bolinhas = card.querySelectorAll('#p1, #p2, #p3, #p4');
    bolinhas.forEach(b => {
      if (tipoValido) {
        b.style.background = '';
        b.style.boxShadow = '';
      } else {
        b.style.background = 'rgb(var(--cor-branco-claro))';
        b.style.boxShadow = 'none';
      }
    });

    // Professor
    const profInput = document.getElementById('entrada-professor');
    const profVal = profInput ? profInput.value.trim() : '';
    if (profEl) profEl.textContent = profVal ? 'Prof. ' + profVal : 'Prof. vazio';

    // Título e Detalhes — lê do bloco ativo (currentIndex)
    const formState = window._formState;
    const idxAtivo = formState ? formState.currentIndex : 0;
    const blocoAtivo = document.querySelector(`.bloco-descricao[data-indice="${idxAtivo}"]`)
                    || document.querySelector('.bloco-descricao');
    const titInput = blocoAtivo ? blocoAtivo.querySelector('#entrada-titulo') : null;
    const titVal = titInput ? titInput.value.trim() : '';
    if (tituloEl) tituloEl.textContent = titVal || 'sem título';

    const detInput = blocoAtivo ? blocoAtivo.querySelector('#entrada-detalhes') : null;
    const detVal = detInput ? detInput.value.trim() : '';
    if (detalhesEl) {
      if (detVal) {
        detalhesEl.innerHTML = formatarTextoDescricao(detVal);
        detalhesEl.style.opacity = '';
        detalhesEl.style.fontStyle = '';
      } else {
        detalhesEl.textContent = 'sem detalhes';
        detalhesEl.style.opacity = '0.4';
        detalhesEl.style.fontStyle = 'italic';
      }
    }

    // Anexos — exibe os arquivos do bloco ativo no card preview
    let anexosPrevia = card.querySelector('.lista-anexos-card');
    const arquivosAtivos = formState ? (formState.arquivos[idxAtivo] || []) : [];
    if (arquivosAtivos.length > 0) {
      if (!anexosPrevia) {
        anexosPrevia = document.createElement('div');
        anexosPrevia.className = 'lista-anexos-card';
        card.appendChild(anexosPrevia);
      }
      card.classList.add('estado-com-anexo');
      anexosPrevia.innerHTML = arquivosAtivos.map(arq => {
        const nome = arq.name || 'anexo';
        const ext = nome.split('.').pop().toUpperCase().substring(0, 4);
        return `
          <div class="card-arquivo-anexo" style="pointer-events:none">
            <div class="icone-arquivo-anexo">${ext}</div>
            <div class="nome-arquivo-anexo" title="${nome}">${nome}</div>
            <div class="tamanho-arquivo-anexo">Anexo</div>
          </div>`;
      }).join('');
    } else {
      if (anexosPrevia) { anexosPrevia.remove(); }
      card.classList.remove('estado-com-anexo');
    }

    // Atualiza altura do card-detalhes (clampado a 15vh — tamanho máximo do preview)
    const detDiv = card.querySelector('.card-detalhes');
    if (detDiv && card.classList.contains('aberto')) {
      requestAnimationFrame(() => {
        const maxH = window.innerHeight * 0.15;
        const hReal = Math.min(detDiv.scrollHeight, maxH);
        detDiv.style.height = `${hReal}px`;
        card.style.setProperty('--detalhes-height', `${hReal}px`);
      });
    }
  }

  // Leitura inicial
  lerCampos();

  // Observa mudanças nos campos do formulário enquanto o modal estiver aberto
  const alvoObservar = document.getElementById('formu-all');
  if (!alvoObservar) return;

  const obs = new MutationObserver(lerCampos);
  obs.observe(alvoObservar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['value'] });

  // Escuta input diretamente (MutationObserver não captura <input> value via teclado)
  function onInput() { lerCampos(); }
  alvoObservar.addEventListener('input', onInput);
  alvoObservar.addEventListener('change', onInput);

  // Atualiza prévia quando o usuário navega entre descrições (muda currentIndex)
  function onStateChanged() { lerCampos(); }
  document.addEventListener('formstate-changed', onStateChanged);

  // Limpa ao fechar o modal
  const btnFechar = overlay.querySelector('#botao-fechar-manual');
  const limpar = () => {
    obs.disconnect();
    alvoObservar.removeEventListener('input', onInput);
    alvoObservar.removeEventListener('change', onInput);
    document.removeEventListener('formstate-changed', onStateChanged);
  };
  if (btnFechar) btnFechar.addEventListener('click', limpar, { once: true });
  overlay.addEventListener('click', e => { if (e.target === overlay) limpar(); }, { once: true });

  // Botão do título: abre/fecha detalhes igual ao card real
  if (tituloEl) {
    tituloEl.addEventListener('click', () => {
      const d = card.querySelector('.card-detalhes');
      const abrindo = !card.classList.contains('aberto');
      const maxH = window.innerHeight * 0.15;

      if (abrindo) {
        // Seta --detalhes-height antes de .aberto para a animação partir certo
        const h = Math.min(d.scrollHeight, maxH);
        card.style.setProperty('--detalhes-height', `${h}px`);
        card.classList.add('aberto');
        // Após layout, aplica height fixo em px para scroll funcionar corretamente
        requestAnimationFrame(() => {
          const hReal = Math.min(d.scrollHeight, maxH);
          d.style.height = `${hReal}px`;
          card.style.setProperty('--detalhes-height', `${hReal}px`);
          d.scrollTop = 0;
        });
      } else {
        // Ao fechar: fixa height atual em px, depois vai a 0 no próximo frame para a transição partir certo
        d.style.height = `${d.offsetHeight}px`;
        requestAnimationFrame(() => {
          d.style.height = '0px';
          card.classList.remove('aberto');
        });
      }
    });
  }
}

function abrirModalManual(abaId) {
  if (_modalManualEl) {
    _modalManualEl.remove();
    _modalManualEl = null;
  }

  if (!abaId) {
    const btnAtivo = document.querySelector('.nav-btn.active');
    abaId = btnAtivo ? btnAtivo.id : 'btn-calendario';
  }

  const wrapper = document.createElement('div');

  wrapper.innerHTML = `
    <div class="modal-overlay aberto" id="modal-manual-overlay">
      <div class="modal-manual">
        <main id="manual-container">
          <ul id="lista-manual">
            <li class="topo-modal-manual">
              <button class="fechar" type="button" id="botao-fechar-manual">
                <svg class="icone-fechar" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"/>
                  <path d="m6 6 12 12"/>
                </svg>
              </button>
              <h2>manual de uso</h2>
            </li>

            ${_htmlConteudoManual(abaId)}
          </ul>
        </main>
      </div>
    </div>
  `;

  _modalManualEl = wrapper.firstElementChild;
  document.body.appendChild(_modalManualEl);

  if (abaId === 'btn-calendario') {
    _popularContadoresManuais(_modalManualEl);
  }

  if (abaId === 'botao-navbar-adicionar') {
    _vincularPreviaManual(_modalManualEl);
  }

  if (abaId === 'bnt-proximo') {
    _atualizarSpansFiltroManualProximo();
  }

  if (abaId === 'btn-config') {
    const btnSairSala = _modalManualEl.querySelector('#botao-sair-sala');
    if (btnSairSala) {
      btnSairSala.addEventListener('click', () => {
        fechar();

        /* Se for admin de sala específica (sala_id ≠ 0), encerra a sessão também */
        if (sessao) {
          try {
            const usuarioSalvo = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const salaIdAdmin  = usuarioSalvo ? Number(usuarioSalvo.sala_id) : NaN;
            if (salaIdAdmin !== 0) {
              try { localStorage.removeItem('usuarioLogado'); } catch(e) {}
            }
          } catch(e) {}
        }

        window._salaAtual = null;
        window._codigoSalaAtual = null;
        try { localStorage.removeItem('salaAtual'); } catch(e) {}
        location.reload();
        /* Limpa o conteúdo de fundo antes de mostrar o modal */
        const _btnAtivo = document.querySelector('.nav-btn.active');
        carregarDadosAtividades().then(() => {
          if (_btnAtivo) renderAbaAtiva(_btnAtivo.id);
        });
        const modalSala = document.getElementById('modal-login-sala');
        const campoCod  = document.getElementById('campo-codigo-sala');
        if (campoCod) campoCod.value = '';
        if (modalSala) {
          modalSala.style.pointerEvents = '';
          modalSala.classList.add('aberto');
        }
      });
    }
  }

  const btnFechar = _modalManualEl.querySelector('#botao-fechar-manual');

  const fechar = () => {
    if (!_modalManualEl) return;

    const overlay = _modalManualEl;
    const card = overlay.querySelector('.modal-manual');

    overlay.classList.add('saindo');
    if (card) card.classList.add('saindo');

    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
      if (_modalManualEl === overlay) _modalManualEl = null;
    }, 260);
  };

  if (btnFechar) {
    btnFechar.addEventListener('click', fechar);
  }

  _modalManualEl.addEventListener('click', e => {
    if (e.target === _modalManualEl) fechar();
  });

  const _escManual = e => {
    if (e.key === 'Escape' && _modalManualEl) {
      fechar();
      document.removeEventListener('keydown', _escManual);
    }
  };

  document.addEventListener('keydown', _escManual);
}

/* ══════════════════════════════════════════════════════════
   Modal de horário — reutiliza modal drive sem campo de link
   ══════════════════════════════════════════════════════════ */
function _abrirModalHorario(diaNum, posicao, aulaExistente) {
  // aulaExistente pode ser null (aula vaga) ou objeto { dia_semana, posicao, professor, area }
  // Monta item fake para pré-preencher o modal
  const itemFake = aulaExistente ? {
    id: null, // não tem id próprio — identifica por dia+posicao
    _diaNum: diaNum,
    _posicao: posicao,
    area: aulaExistente.area,
    professor: aulaExistente.professor,
  } : { _diaNum: diaNum, _posicao: posicao };

  _abrirModalDrive(aulaExistente ? itemFake : null, true /* semLink */);
  // Sobrescreve o submit do form para salvar em grade_aulas em vez de drives
  const form = document.getElementById('form-drive');
  if (!form) return;
  // Clona para remover listener de submit anterior
  const novoForm = form.cloneNode(true);
  form.parentNode.replaceChild(novoForm, form);

  // ── Re-bind botão fechar (estava dentro do form, cloneNode removeu listener) ──
  const btnFecharHor = document.getElementById('botao-fechar-drive');
  if (btnFecharHor) {
    btnFecharHor.addEventListener('click', () => {
      if (!_modalDriveEl) return;
      const overlay = _modalDriveEl;
      const card = overlay.querySelector('.modal-drive');
      overlay.classList.add('saindo');
      if (card) card.classList.add('saindo');
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
        if (_modalDriveEl === overlay) { _modalDriveEl = null; _modalDriveItemId = null; }
      }, 260);
    });
  }

  // ── Re-bind seletor de disciplina (cloneNode removeu listeners) ──────────────
  const seletorRebind   = document.getElementById('seletor-disciplina');
  const bolaRebind      = document.getElementById('seletor-disciplina-bola');
  const trilhaRebind    = document.getElementById('seletor-disciplina-trilha');
  const textoRebind     = document.getElementById('texto-disciplina');
  const containerRebind = document.getElementById('seletor-disciplina-container');
  if (seletorRebind && bolaRebind && trilhaRebind && textoRebind && containerRebind) {
    const coresRebind = ['var(--cor-matematica)','var(--cor-itinerario)','var(--cor-linguagens)','var(--cor-humanas)','var(--cor-natureza)'];
    function _atualizarSeletorHorario(v) {
      const pct = (v / 4) * 100;
      bolaRebind.style.left = (pct / 100) * (containerRebind.offsetWidth - bolaRebind.offsetWidth) + 'px';
      bolaRebind.style.transform = 'translateY(-50%)';
      const cor = coresRebind[v];
      trilhaRebind.style.background = `rgb(${cor})`;
      trilhaRebind.style.outline = `3.75px solid rgb(${cor})`;
      textoRebind.textContent = DISCIPLINAS_DRIVE[v];
      textoRebind.style.setProperty('--cor-texto-disciplina', `var(--cor-${['matematica','itinerario','linguagens','humanas','natureza'][v]})`);
      textoRebind.style.removeProperty('background');
      textoRebind.style.removeProperty('text-shadow');
    }
    seletorRebind.addEventListener('input', () => _atualizarSeletorHorario(parseInt(seletorRebind.value)));
    // Pré-preencher área se houver aula existente
    if (aulaExistente && aulaExistente.area) {
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
      const idx = DISCIPLINAS_API.indexOf(norm(aulaExistente.area));
      if (idx >= 0) seletorRebind.value = idx;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => _atualizarSeletorHorario(parseInt(seletorRebind.value))));
  }

  // ── Re-bind autocomplete de autor (cloneNode removeu listeners) ───────────────
  (function () {
    const nomes = NOMES_AUTORES_DRIVE;
    const inp   = document.getElementById('entrada-autor');
    const visor = document.getElementById('visor-autor');
    if (!inp || !visor) return;
    let sugestao = '';
    const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const cap = v => v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    const PLACEHOLDER_AUTOR = inp.getAttribute('placeholder') || 'professor(a)';
    function atualizar() {
      const typed = inp.value; const cur = inp.selectionStart ?? typed.length;
      if (!typed) { visor.innerHTML = '<span class="cursor-falso"></span>'; sugestao = ''; return; }
      const match = nomes.find(n => semAcento(n.toLowerCase()).startsWith(semAcento(typed.toLowerCase())));
      const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const ante = esc(typed.substring(0, cur)); const post = esc(typed.substring(cur));
      if (match) {
        visor.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span><span class="texto-sugestao">${esc(match.substring(typed.length))}</span>`;
        sugestao = match;
      } else {
        visor.innerHTML = `<span class="texto-digitado">${ante}<span class="cursor-falso"></span>${post}</span>`;
        sugestao = '';
      }
    }
    inp.addEventListener('input', e => {
      let v = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g,'').replace(/^\s+/,'');
      v = cap(v);
      if (v !== e.target.value) { const s = e.target.selectionStart; e.target.value = v; e.target.setSelectionRange(s,s); }
      atualizar();
    });
    document.addEventListener('selectionchange', () => { if (document.activeElement === inp) atualizar(); });
    inp.addEventListener('focus', () => { visor.classList.add('input-focado'); atualizar(); });
    inp.addEventListener('blur', () => {
      visor.classList.remove('input-focado');
      if (sugestao) {
        inp.value = sugestao;
        visor.innerHTML = `<span class="texto-digitado">${sugestao.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
        sugestao = '';
      } else {
        const esc = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        visor.innerHTML = inp.value
          ? `<span class="texto-digitado">${esc(inp.value)}</span>`
          : `<span class="texto-sugestao texto-placeholder-visor">${PLACEHOLDER_AUTOR}</span>`;
      }
    });
    inp.addEventListener('keydown', e => {
      if ((e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowRight') && sugestao) {
        if (e.key === 'ArrowRight' && inp.selectionStart !== inp.value.length) return;
        e.preventDefault(); inp.value = sugestao; atualizar();
      } else if (e.key === 'Escape') { inp.value = ''; atualizar(); }
    });
    inp.addEventListener('mousedown', () => setTimeout(atualizar, 10));
    // Inicializa o visor com placeholder se campo vazio
    if (!inp.value) visor.innerHTML = `<span class="texto-sugestao texto-placeholder-visor">${PLACEHOLDER_AUTOR}</span>`;
    // Pré-preencher se houver aula existente
    if (aulaExistente && aulaExistente.professor) {
      inp.value = aulaExistente.professor;
      requestAnimationFrame(() => { inp.dispatchEvent(new Event('input')); });
    }
  })();

  // ── Limpar erro ao clicar no campo (horário) ─────────
  const listaHorario = document.getElementById('lista-campos-drive');
  if (listaHorario) listaHorario.addEventListener('click', function(e) {
    const li = e.target.closest('li');
    if (li) li.classList.remove('erro-envio');
  });

  novoForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const seletor = document.getElementById('seletor-disciplina');
    const autor   = (document.getElementById('entrada-autor')?.value || '').trim();
    const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const autorValido = NOMES_AUTORES_DRIVE.some(n => norm(n) === norm(autor));
    const campoAutor = document.querySelector('.campo-autor');
    if (!autorValido) { if (campoAutor) campoAutor.classList.add('erro-envio'); return; }

    const idxArea = parseInt(seletor?.value ?? '0');
    const payload = {
      dia_semana: diaNum,
      posicao,
      area: DISCIPLINAS_DRIVE[idxArea],
      professor: autor,
    };

    const botao = document.getElementById('botao-salvar-drive');
    if (botao) botao.disabled = true;

    try {
      const res  = await fetch('/api/grade-aulas', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      // Fecha o modal com animação
      if (_modalDriveEl) {
        const overlay = _modalDriveEl;
        const card = overlay.querySelector('.modal-drive');
        overlay.classList.add('saindo');
        if (card) card.classList.add('saindo');
        setTimeout(() => {
          if (overlay.parentNode) overlay.remove();
          if (_modalDriveEl === overlay) { _modalDriveEl = null; _modalDriveItemId = null; }
        }, 260);
      }
      // Recarrega grade
      await carregarGradeAulas();
      // Atualiza carrossel no DOM sem remontá-lo — procura a coluna mostrada
      const wrapperCols = document.querySelector('#coluna-aulas-wrapper');
      if (wrapperCols) {
        const labelAtivo = document.querySelector('.label-dia-wrapper .aula-mostrada');
        const nomeDia = labelAtivo ? labelAtivo.textContent.trim() : '';
        const diaIdx  = _NOMES_DIA.indexOf(nomeDia);
        const diaAtual = diaIdx >= 0 ? diaIdx + 1 : _diaUtilHoje();
        function _areaParaClasseHor(area) {
          if (!area) return '';
          return 'aula-' + area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
        }
        function _buildColunaHor(dia, role) {
          const aulas = _gradeAulas.filter(r => r.dia_semana === dia).sort((a,b) => a.posicao - b.posicao);
          const div = document.createElement('div');
          div.className = 'coluna-aulas ' + role;
          _HORARIOS.forEach((_, i) => {
            const span = document.createElement('span');
            if (i === _POS_INTERVALO) { span.className = 'aula-intervalo-slot'; span.textContent = 'intervalo'; }
            else {
              const pos = i < _POS_INTERVALO ? i + 1 : i;
              const aula = aulas.find(a => a.posicao === pos);
              const classeArea = aula ? _areaParaClasseHor(aula.area) : '';
              span.className = 'aula-span' + (classeArea ? ' ' + classeArea : '');
              span.textContent = _formatarNomeProfHorario(aula ? aula.professor : null);
            }
            div.appendChild(span);
          });
          return div;
        }
        const prev = diaAtual === 1 ? 5 : diaAtual - 1;
        const next = diaAtual === 5 ? 1 : diaAtual + 1;
        wrapperCols.innerHTML = '';
        wrapperCols.appendChild(_buildColunaHor(prev, 'aula-passada'));
        wrapperCols.appendChild(_buildColunaHor(diaAtual, 'aula-mostrada'));
        wrapperCols.appendChild(_buildColunaHor(next, 'aula-futura'));
        // Rebind cliques de edição nas colunas
        if (sessao) _bindHorarioEditorCliques();
      }
    } catch (err) {
      console.error('[modal-horario] erro:', err);
      if (botao) { botao.disabled = false; botao.textContent = 'erro — tente novamente'; setTimeout(() => { botao.textContent = 'Salvar'; }, 2500); }
    }
  });
}

/* ══════════════════════════════════════════════════════════
   Overlay de confirmação para apagar drive
   ══════════════════════════════════════════════════════════ */
let _overlayApagarDrive = null;

function _garantirOverlayApagarDrive() {
  if (_overlayApagarDrive) return;

  _overlayApagarDrive = document.createElement('div');
  _overlayApagarDrive.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'anexo-com-erro modal-confirmacao-apagar';

  const span = document.createElement('span');
  span.className = 'texto-anexo-com-erro';
  const h2 = document.createElement('h2');
  const h3 = document.createElement('h3');
  h2.textContent = 'apagar drive?';
  h3.id = '_apagar-drive-subtitulo';
  h3.className = 'modal-confirmacao-subtitulo';
  span.appendChild(h2); span.appendChild(h3);

  const rowBtns = document.createElement('div');
  rowBtns.className = 'modal-confirmacao-botoes';

  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button'; btnCancelar.textContent = 'cancelar';
  btnCancelar.className = 'modal-confirmacao-cancelar';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.type = 'button'; btnConfirmar.id = '_apagar-drive-confirmar'; btnConfirmar.textContent = 'apagar';
  btnConfirmar.className = 'modal-confirmacao-confirmar';

  rowBtns.appendChild(btnCancelar); rowBtns.appendChild(btnConfirmar);
  card.appendChild(span); card.appendChild(rowBtns);
  _overlayApagarDrive.appendChild(card);
  document.body.appendChild(_overlayApagarDrive);

  const fechar = () => _overlayApagarDrive.classList.remove('aberto');
  btnCancelar.addEventListener('click', fechar);
  _overlayApagarDrive.addEventListener('click', e => { if (e.target === _overlayApagarDrive) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlayApagarDrive.classList.contains('aberto')) fechar();
  });
}

function _exibirConfirmacaoApagarDrive(driveId, nomeLabel, cardEl) {
  _garantirOverlayApagarDrive();
  const sub = document.getElementById('_apagar-drive-subtitulo');
  if (sub) sub.textContent = nomeLabel;
  const btnConf = document.getElementById('_apagar-drive-confirmar');
  const novoBtn = btnConf.cloneNode(true);

  // Garante estado inicial limpo — evita herdar disabled/'...' de tentativa anterior
  novoBtn.disabled    = false;
  novoBtn.textContent = 'apagar';
  btnConf.parentNode.replaceChild(novoBtn, btnConf);
  novoBtn.addEventListener('click', async () => {
    novoBtn.disabled = true; novoBtn.textContent = '...';
    try {
      const r = await fetch(`/api/drives/${driveId}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao apagar');
      _overlayApagarDrive.classList.remove('aberto');
      cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
      cardEl.style.opacity = '0'; cardEl.style.transform = 'scale(0.92)';
      setTimeout(() => {
        cardEl.remove();
        _drives = _drives.filter(d => String(d.id) !== String(driveId));
      }, 320);
    } catch (err) {
      console.error('[apagar-drive]', err);
      novoBtn.disabled = false; novoBtn.textContent = 'apagar';
      const s = document.getElementById('_apagar-drive-subtitulo');
      if (s) s.textContent = 'erro ao apagar — tente novamente';
    }
  });
  _overlayApagarDrive.classList.add('aberto');
}

/* ══════════════════════════════════════════════════════════
   Overlay de confirmação para acessar drive
   ══════════════════════════════════════════════════════════ */
let _overlayAcessarDrive = null;

function _garantirOverlayAcessarDrive() {
  if (_overlayAcessarDrive) return;

  _overlayAcessarDrive = document.createElement('div');
  _overlayAcessarDrive.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'acessar-com-confirmacao modal-confirmacao-acessar';

  const span = document.createElement('span');
  span.className = 'texto-acessar-confirmacao';
  const h2 = document.createElement('h2');
  const h3 = document.createElement('h3');
  h2.textContent = 'acessar drive?';
  h3.id = '_acessar-drive-subtitulo';
  h3.className = 'modal-confirmacao-subtitulo';
  span.appendChild(h2); span.appendChild(h3);

  const rowBtns = document.createElement('div');
  rowBtns.className = 'modal-confirmacao-botoes';

  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button'; btnCancelar.textContent = 'cancelar';
  btnCancelar.className = 'modal-confirmacao-cancelar';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.type = 'button'; btnConfirmar.id = '_acessar-drive-confirmar'; btnConfirmar.textContent = 'acessar';
  btnConfirmar.className = 'modal-confirmacao-confirmar';

  rowBtns.appendChild(btnCancelar); rowBtns.appendChild(btnConfirmar);
  card.appendChild(span); card.appendChild(rowBtns);
  _overlayAcessarDrive.appendChild(card);
  document.body.appendChild(_overlayAcessarDrive);

  const fechar = () => _overlayAcessarDrive.classList.remove('aberto');
  btnCancelar.addEventListener('click', fechar);
  _overlayAcessarDrive.addEventListener('click', e => { if (e.target === _overlayAcessarDrive) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlayAcessarDrive.classList.contains('aberto')) fechar();
  });
}

/* ══════════════════════════════════════════════════════════
   Overlay de confirmação para acessar plataforma
   ══════════════════════════════════════════════════════════ */
let _overlayAcessarPlataforma = null;

function _garantirOverlayAcessarPlataforma() {
  if (_overlayAcessarPlataforma) return;

  _overlayAcessarPlataforma = document.createElement('div');
  _overlayAcessarPlataforma.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'acessar-com-confirmacao modal-confirmacao-acessar';

  const span = document.createElement('span');
  span.className = 'texto-acessar-confirmacao';
  const h2 = document.createElement('h2');
  const h3 = document.createElement('h3');
  h2.textContent = 'acessar?';
  h3.id = '_acessar-plataforma-subtitulo';
  h3.className = 'modal-confirmacao-subtitulo';
  span.appendChild(h2); span.appendChild(h3);

  const rowBtns = document.createElement('div');
  rowBtns.className = 'modal-confirmacao-botoes';

  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button'; btnCancelar.textContent = 'cancelar';
  btnCancelar.className = 'modal-confirmacao-cancelar';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.type = 'button'; btnConfirmar.id = '_acessar-plataforma-confirmar'; btnConfirmar.textContent = 'acessar';
  btnConfirmar.className = 'modal-confirmacao-confirmar';

  rowBtns.appendChild(btnCancelar); rowBtns.appendChild(btnConfirmar);
  card.appendChild(span); card.appendChild(rowBtns);
  _overlayAcessarPlataforma.appendChild(card);
  document.body.appendChild(_overlayAcessarPlataforma);

  const fechar = () => _overlayAcessarPlataforma.classList.remove('aberto');
  btnCancelar.addEventListener('click', fechar);
  _overlayAcessarPlataforma.addEventListener('click', e => { if (e.target === _overlayAcessarPlataforma) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlayAcessarPlataforma.classList.contains('aberto')) fechar();
  });
}

function _exibirConfirmacaoAcessarPlataforma(link, nomeLabel) {
  _garantirOverlayAcessarPlataforma();
  const sub = document.getElementById('_acessar-plataforma-subtitulo');
  if (sub) sub.textContent = nomeLabel;
  const btnConf = document.getElementById('_acessar-plataforma-confirmar');
  const novoBtn = btnConf.cloneNode(true);

  novoBtn.disabled    = false;
  novoBtn.textContent = 'acessar';
  btnConf.parentNode.replaceChild(novoBtn, btnConf);
  novoBtn.addEventListener('click', () => {
    _overlayAcessarPlataforma.classList.remove('aberto');
    window.open(link, '_blank', 'noopener');
  });
  _overlayAcessarPlataforma.classList.add('aberto');
}

function _exibirConfirmacaoAcessarDrive(link, nomeLabel, area) {
  _garantirOverlayAcessarDrive();
  const _corRgbPorArea = {
    matematica: 'var(--cor-matematica)',
    itinerario: 'var(--cor-itinerario)',
    linguagens:  'var(--cor-linguagens)',
    humanas:     'var(--cor-humanas)',
    natureza:    'var(--cor-natureza)',
  };
  const norm = area ? area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'') : '';
  const corVar = _corRgbPorArea[norm] || null;
  const card = _overlayAcessarDrive.querySelector('.acessar-com-confirmacao');
  if (card) {
    if (corVar) {
      // Resolve o valor RGB real da variável CSS no momento da abertura
      const rgb = getComputedStyle(document.documentElement).getPropertyValue(
        corVar.replace(/^var\(--(.+)\)$/, '--$1')
      ).trim();
      card.style.setProperty('--cor-area-drive', rgb);
    } else {
      card.style.removeProperty('--cor-area-drive');
    }
  }

  const sub = document.getElementById('_acessar-drive-subtitulo');
  if (sub) sub.textContent = nomeLabel;
  const btnConf = document.getElementById('_acessar-drive-confirmar');
  const novoBtn = btnConf.cloneNode(true);

  novoBtn.disabled    = false;
  novoBtn.textContent = 'acessar';
  btnConf.parentNode.replaceChild(novoBtn, btnConf);
  novoBtn.addEventListener('click', () => {
    _overlayAcessarDrive.classList.remove('aberto');
    window.open(link, '_blank', 'noopener');
  });
  _overlayAcessarDrive.classList.add('aberto');
}

/* ══════════════════════════════════════════════════════════
   Bind de cliques de edição nas colunas do horário (admin)
   ══════════════════════════════════════════════════════════ */
function _bindHorarioEditorCliques() {
  const colMostrada = document.querySelector('.coluna-aulas.aula-mostrada');
  if (!colMostrada) return;
  Array.from(colMostrada.children).forEach((el, i) => {
    // Pula o slot de intervalo — não é clicável
    if (el.classList.contains('aula-intervalo-slot')) return;
    // Remove listener antigo clonando
    const novoEl = el.cloneNode(true);
    el.parentNode.replaceChild(novoEl, el);
    novoEl.classList.add('aula-span-editavel');
    novoEl.addEventListener('click', () => {
      if (modoEditorMaterialHorario !== 'editar') return;
      // Descobre dia atual
      const labelAtivo = document.querySelector('.label-dia-wrapper .aula-mostrada');
      const nomeDia = labelAtivo ? labelAtivo.textContent.trim() : '';
      const diaIdx  = _NOMES_DIA.indexOf(nomeDia);
      const diaNum  = diaIdx >= 0 ? diaIdx + 1 : _diaUtilHoje();
      // Posição real (pula intervalo) — i inclui o slot de intervalo
      const pos = i < _POS_INTERVALO ? i + 1 : i;
      const aulaExistente = _gradeAulas.find(a => a.dia_semana === diaNum && a.posicao === pos) || null;
      // Fecha editor
      modoEditorMaterialHorario = 'nenhum';
      _sincronizarEstadoEditorMaterialUI('horario');
      _abrirModalHorario(diaNum, pos, aulaExistente);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   Modal de adicionar tarefa (representante)
   ══════════════════════════════════════════════════════════ */
function abrirModalCadastroTarefa(itemEdicao) {
  fecharEditorCalendario();
  limparConteudo();
  conteudoTipo.innerHTML = _htmlFormulario;
  mostrarConteudo();
  _inicializarLogicaFormulario(itemEdicao || null);
  atualizarModoBotaoAcao('admin', 'bnt-proximo'); // formu ativo → modo manual
}


/* ══════════════════════════════════════════════════════════
   Typewriter
   ══════════════════════════════════════════════════════════ */
function iniciarAnimacaoTituloLogin() {
  const el = document.getElementById('titulo-login-dinamico');

  const h2 = document.createElement('h2');
  const cursor = document.createElement('span');

  el.appendChild(h2);
  el.appendChild(cursor);

  cursor.textContent = '|'; // <- faltava isso

  const palavras = [
    'aluno?',
    'professor?',
    'administrador?',
    'representante?',
    'coordenador?',
  ];

  let indicePalavra = 0;
  let indiceChar = 0;
  let apagando = false;

  function digitarTituloLogin() {
    const palavra = palavras[indicePalavra];

    if (!apagando) {
      indiceChar++;
      h2.textContent = palavra.slice(0, indiceChar);

      if (indiceChar === palavra.length) {
        apagando = true;
        setTimeout(digitarTituloLogin, 2000);
        return;
      }
      setTimeout(digitarTituloLogin, 60);
    } else {
      indiceChar--;
      h2.textContent = palavra.slice(0, indiceChar);

      if (indiceChar === 0) {
        apagando = false;
        indicePalavra = (indicePalavra + 1) % palavras.length;
        setTimeout(digitarTituloLogin, 500);
        return;
      }
      setTimeout(digitarTituloLogin, 40);
    }
  }

  setTimeout(digitarTituloLogin, 400);
}

/* ══════════════════════════════════════════════════════════
   Alternar visibilidade da senha
   ══════════════════════════════════════════════════════════ */
function alternarVisibilidadeSenha() {
  const input = document.querySelector('#campo-senha-login');
  const icone = document.querySelector('.icone-senha');

  if (input.type === 'password') {
    input.type = 'text';
    icone.classList.add('senha-aberta');
  } else {
    input.type = 'password';
    icone.classList.remove('senha-aberta');
  }
}


/* ══════════════════════════════════════════════════════════
   Botão de ação contextual — listener
   ══════════════════════════════════════════════════════════ */
(function vincularBotaoAcao() {
  const botao = document.getElementById('botao-acao-topo');
  if (!botao) return;
  botao.addEventListener('click', () => {
    if (botao.classList.contains('funcao-editor')) {
      // Descobre qual aba está ativa
      const btnAtivo = document.querySelector('.nav-btn.active');
      const abaAtiva = btnAtivo ? btnAtivo.id : '';

      if (abaAtiva === 'btn-material') {
        abrirEditorMaterial();
      } else {
        abrirEditorCalendario();
      }
    }
    if (botao.classList.contains('funcao-manual')) {
      const _btnAtivoManual = document.querySelector(".nav-btn.active");
      abrirModalManual(_btnAtivoManual ? _btnAtivoManual.id : null);
    }
  });
})();


/* ══════════════════════════════════════════════════════════
   Event listeners — login
   ══════════════════════════════════════════════════════════ */
document.getElementById('form-login-admin').addEventListener('submit', (e) => {
  // Não previne o submit — ele vai para o iframe (login-sink), invisível ao usuário,
  // e o browser detecta o fluxo e oferece salvar a senha.
  executarLoginRepre();
});

document.getElementById('botao-ajuda-login').addEventListener('click', () => abrirModalManual('login'));
document.getElementById('botao-ajuda-login-admin').addEventListener('click', () => abrirModalManual('login'));

['campo-usuario-login', 'campo-senha-login'].forEach(id => {
  const el = document.getElementById(id);
  ['input', 'focus', 'click'].forEach(evt =>
    el.addEventListener(evt, limparErroLogin)
  );
});

/* ── Remove readonly dos dois campos juntos ao interagir com qualquer um ──
   Isso faz o Chrome mostrar a sugestão de credenciais e preencher ambos
   simultaneamente, em vez de preencher só o campo focado. */
(function inicializarReadonlyLogin() {
  const campoUser  = document.getElementById('campo-usuario-login');
  const campoSenha = document.getElementById('campo-senha-login');
  if (!campoUser || !campoSenha) return;

  function removerReadonly() {
    campoUser.removeAttribute('readonly');
    campoSenha.removeAttribute('readonly');
  }

  campoUser.addEventListener('focus',  removerReadonly, { once: true });
  campoSenha.addEventListener('focus', removerReadonly, { once: true });
  campoUser.addEventListener('click',  removerReadonly, { once: true });
  campoSenha.addEventListener('click', removerReadonly, { once: true });
})();


/* ══════════════════════════════════════════════════════════
   Camada de desfoque — overlay compartilhado entre abas
   ══════════════════════════════════════════════════════════ */
let camadaBorrao   = null;
let overlaysAbertos = 0;

function alternarCamadaDesfoque(abrir) {
  if (abrir) {
    overlaysAbertos++;
    if (!camadaBorrao) {
      camadaBorrao = document.createElement('div');
      camadaBorrao.className = 'camada-desfoque-fundo';
      camadaBorrao.addEventListener('click', () => {
        if (overlayViewer && overlayViewer.classList.contains('aberto')) {
          overlayViewer.classList.remove('aberto');
          if (viewerFrame) viewerFrame.innerHTML = '';
          document.body.style.overflow = '';
          return;
        }
      });
      document.body.appendChild(camadaBorrao);
    }
    return;
  }
  overlaysAbertos = Math.max(0, overlaysAbertos - 1);
  if (overlaysAbertos === 0 && camadaBorrao) {
    camadaBorrao.remove();
    camadaBorrao = null;
  }
}


/* ══════════════════════════════════════════════════════════
   CONTEÚDO DAS ABAS — renderizadores
   ══════════════════════════════════════════════════════════ */

function limparConteudo() {
  conteudoTipo.innerHTML = '';
  const ov = document.getElementById('overlay-fundo-calendario');
  if (ov) ov.remove();
  const pd = document.getElementById('painel-tarefas-dia');
  if (pd) pd.remove();
}


/* ── Aba "próximo" — painel de atividades próximas ─────── */

function montarPainelAtividadesProximas() {
  limparConteudo();

  conteudoTipo.innerHTML = `
    <div class="container-largura-total" id="area-painel-proximas">
      <aside class="painel-atividades-proximas" id="painel-atividades-proximas">
        <div class="lista-atividades-proximas" id="lista-atividades-proximas">
          <div class="mensagem-vazia" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:200px;">${_criarIconeCarregandoHTML()}</div>
        </div>
      </aside>
    </div>
  `;

  _comTempoMinimo(
    carregarDadosAtividades(),
    1700,
    function() {
      atualizarCacheAtividadesProximas();
      renderizarListaAtividadesProximas();
    }
  );
}

// ── Lógica do painel próximo ─────────────────────────────
let proximasCasaCache = null;

function converterDataBrParaDate(str) {
  const parts = (str || '').split('/');
  if (parts.length !== 3) return new Date(NaN);
  return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 0, 0, 0, 0);
}

function obterDataAtualSemHorario() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate(), 0, 0, 0, 0);
}

function obterPrioridadeTipoAtividade(tipo) {
  const t = normalizarTexto(tipo);
  if (t === 'prova')   return 1;
  if (t === 'teste')   return 2;
  if (t === 'projeto') return 3;
  if (t === 'tarefa')  return 4;
  return 99;
}

function ordenarAtividadesProximas(a, b) {
  const da = converterDataBrParaDate(a.data).getTime();
  const db = converterDataBrParaDate(b.data).getTime();
  if (da !== db) return da - db;
  const pa = obterPrioridadeTipoAtividade(a.tipo);
  const pb = obterPrioridadeTipoAtividade(b.tipo);
  if (pa !== pb) return pa - pb;
  return (a.descricao_titulo || '').toLowerCase()
    .localeCompare((b.descricao_titulo || '').toLowerCase());
}

function atualizarCacheAtividadesProximas() {
  const hoje = obterDataAtualSemHorario().getTime();
  proximasCasaCache = (todosDados || [])
    .filter(item => {
      if (!item || !item.data) return false;
      const loc = normalizarTexto(item.local);
      if (loc !== 'casa' && loc !== 'sala') return false;
      const t = converterDataBrParaDate(item.data).getTime();
      if (!Number.isFinite(t) || t < hoje) return false;
      // Provas têm autoridade maior: aparecem sempre, independente do filtro
      if (normalizarTexto(item.tipo) === 'prova') return true;
      if (!_filtroExibicao.casa && loc === 'casa') return false;
      if (!_filtroExibicao.sala && loc === 'sala') return false;
      return true;
    })
    .sort(ordenarAtividadesProximas);
}

function criarCardAtividadeProxima(item) {
  const card = document.createElement('div');
  const area = normalizarTexto(item.area);
  const tipo = normalizarTexto(item.tipo);
  const temAnexo = item.anexo && item.arquivos && item.arquivos.length > 0;

  let htmlAnexos = '';
  if (temAnexo) {
    htmlAnexos = `
      <div class="lista-anexos-card">
        ${item.arquivos.map(p => {
          const nomeArquivo = (p || '').split('/').pop() || 'anexo';
          const ext = nomeArquivo.split('.').pop().toUpperCase().substring(0, 4);
          return `
            <button class="card-arquivo-anexo" type="button" data-path="${p}">
              <div class="icone-arquivo-anexo">${ext}</div>
              <div class="nome-arquivo-anexo" title="${nomeArquivo}">${nomeArquivo}</div>
              <div class="tamanho-arquivo-anexo">Anexo</div>
            </button>`;
        }).join('')}
      </div>`;
  }

  card.className = `card-atividade ${area} ${tipo} ${temAnexo ? 'estado-com-anexo' : ''}`;
  card.innerHTML = `
    <div class="tag-tipo ${tipo}">${item.data.substring(0, 5)}</div>
    <div class="card-materia">${item.area || 'GERAL'}</div>
    <div class="card-prof">Prof. ${item.professor || 'Desc.'}</div>
    <button class="card-titulo" type="button">${item.descricao_titulo || 'sem título'}</button>
    <div class="card-pontos-tipo"><div id="p1"></div><div id="p2"></div><div id="p3"></div><div id="p4"></div></div>
    <div class="card-detalhes"><div class="texto-detalhes">${formatarTextoDescricao(item.descricao_detalhes || '')}</div></div>
    ${htmlAnexos}
  `;

  card.querySelector('.card-titulo').addEventListener('click', () => {
    card.classList.toggle('aberto');
    atualizarAlturasCardsProximos();
  });

  if (temAnexo) {
    card.querySelectorAll('.card-arquivo-anexo').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await abrirAnexoNoVisualizador(btn.getAttribute('data-path')); }
        catch(e) { console.error(e); alert(e.message); }
      });
    });
  }

  return card;
}

function renderizarListaAtividadesProximas() {
  const lista = document.getElementById('lista-atividades-proximas');
  if (!lista) return;
  if (!Array.isArray(proximasCasaCache)) {
    lista.innerHTML = `<div class="mensagem-vazia">${_criarIconeCarregandoHTML()}</div>`;
    return;
  }
  lista.innerHTML = '';
  if (proximasCasaCache.length === 0) {
    const locais = [_filtroExibicao.sala && 'sala', _filtroExibicao.casa && 'casa'].filter(Boolean).join(' e ');
    lista.innerHTML = `<div class="mensagem-vazia">nenhuma atividade próxima</div>`;
    return;
  }
  proximasCasaCache.forEach(item => lista.appendChild(criarCardAtividadeProxima(item)));
  setTimeout(() => { atualizarAlturasCardsProximos(); verificarScrollAnexosCardsProximos(); }, 30);
}

function atualizarAlturasCardsProximos() {
  const lista = document.getElementById('lista-atividades-proximas');
  if (!lista) return;
  lista.querySelectorAll('.card-atividade').forEach(card => {
    const d = card.querySelector('.card-detalhes');
    if (d) card.style.setProperty('--detalhes-height', `${d.scrollHeight}px`);
  });
}

function verificarScrollAnexosCardsProximos() {
  const lista = document.getElementById('lista-atividades-proximas');
  if (!lista) return;
  lista.querySelectorAll('.lista-anexos-card').forEach(c => {
    c.classList.toggle('estado-scroll-horizontal', c.scrollWidth > c.clientWidth);
  });
}


/* ── Aba "calendário" — grade mensal e painel do dia ───── */

function montarCalendario() {
  limparConteudo();

  conteudoTipo.innerHTML = `
    <div class="container-largura-total">
      <div class="container-painel" id="container-calendario-principal">
        <header>
          <div class="grupo-icones-navegacao">
            <span id="botao-mes-anterior">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 6L9 12L15 18"/>
              </svg>
            </span>
            <p class="texto-mes-atual"></p>
            <span id="botao-mes-proximo">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6L15 12L9 18"/>
              </svg>
            </span>
          </div>
        </header>
        <div class="painel-calendario">
          <ul class="lista-cabecalho-semana">
            <li>D</li><li>S</li><li>T</li><li>Q</li><li>Q</li><li>S</li><li>S</li>
          </ul>
          <ul class="grade-dias-mes"></ul>
        </div>
        <div id="painel-info-organizacao" style="display:none;"></div>
      </div>
    </div>

    <div class="painel-lateral-dia oculto" id="painel-tarefas-dia">
      <div class="fixo">
        <button class="botao-fechar-painel-calendario" id="botao-fechar-painel-dia">
          <svg class="icone-fechar" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
        <div id="titulo-data-selecionada">Data</div>
      </div>

      <div class="local">
        <div class="seletor" id="seletor-local-tarefas"></div>
        <div class="grupo-botoes-local">
          <button type="button" class="botao-opcao-local" id="opcao-local-sala">sala</button>
          <button type="button" class="botao-opcao-local" id="opcao-local-casa">casa</button>
        </div>
      </div>

      <div id="lista-atividades-dia" class="conteudo-lista-atividades"></div>
    </div>
  `;

  // Resolve referências DOM
  containerDias        = conteudoTipo.querySelector('.grade-dias-mes');
  containerSemanas     = conteudoTipo.querySelector('.lista-cabecalho-semana');
  elementoDataAtual    = conteudoTipo.querySelector('.texto-mes-atual');
  btnAnteriorCal       = document.getElementById('botao-mes-anterior');
  btnProximoCal        = document.getElementById('botao-mes-proximo');
  btnFecharAba         = document.getElementById('botao-fechar-painel-dia');
  headerDataAba        = document.getElementById('titulo-data-selecionada');
  containerAtividades  = document.getElementById('lista-atividades-dia');
  seletorLocal         = document.getElementById('seletor-local-tarefas');
  botoesLocal          = document.querySelectorAll('.botao-opcao-local');

  // Move painel e overlay para body — garante position:fixed sem clip do conteudo-tipo
  abaTarefas = document.getElementById('painel-tarefas-dia');
  document.body.appendChild(abaTarefas);

  overlayFundo = document.createElement('div');
  overlayFundo.id = 'overlay-fundo-calendario';
  overlayFundo.className = 'overlay';
  document.body.appendChild(overlayFundo);

  // Eventos
  btnAnteriorCal.addEventListener('click', () => navegarEntreMeses(-1));
  btnProximoCal .addEventListener('click', () => navegarEntreMeses(1));
  btnFecharAba  .addEventListener('click', fecharPainelDia);
  overlayFundo  .addEventListener('click', fecharPainelDia);

  document.getElementById('opcao-local-sala').addEventListener('click', () => alternarFiltroLocal('sala'));
  document.getElementById('opcao-local-casa').addEventListener('click', () => alternarFiltroLocal('casa'));

  // Renderiza imediatamente sem dados, atualiza com eventos ao carregar
  renderizarCalendarioComEventos();
  carregarDadosAtividades().then(() => {
    renderizarCalendarioComEventos();
    iniciarAnimacaoDiasMultiplos();
  });
}

// ── Ciclo de cores ───────────────────────────────────────
function iniciarAnimacaoDiasMultiplos() {
  if (intervaloCicloCores) clearInterval(intervaloCicloCores);
  const tick = () => {
    if (document.hidden) return; // não processa quando a aba está em segundo plano
    document.querySelectorAll('.dia-com-multiplos-tipos').forEach((li) => {
      const tipos = JSON.parse(li.dataset.listaTipos);
      let idx = parseInt(li.dataset.indiceCor);
      li.classList.remove(`dia-${tipos[idx]}`);
      idx = (idx + 1) % tipos.length;
      li.classList.add(`dia-${tipos[idx]}`);
      li.dataset.indiceCor = idx;
    });
  };
  intervaloCicloCores = setInterval(tick, 3000);
}

// ── Lógica do calendário ─────────────────────────────────
function calcularSequenciaDiasSemana(primeiroDia) {
  const base = [0,1,2,3,4,5,6];
  const d = (primeiroDia - 3 + 7) % 7;
  return base.slice(d).concat(base.slice(0, d));
}

function renderizarCabecalhoSemana(ordemDias) {
  containerSemanas.innerHTML = ordemDias.map(i => `<li>${diasSemanaAbrev[i]}</li>`).join('');
}

function obterInformacoesMesAtual() {
  return {
    primeiroDia:          new Date(anoAtual, mesAtual, 1).getDay(),
    ultimoDiaDoMes:       new Date(anoAtual, mesAtual + 1, 0).getDate(),
    ultimoDiaMesAnterior: new Date(anoAtual, mesAtual, 0).getDate()
  };
}

function obterClassesEAtributosDia(dia, mes, ano, _indiceAtividades) {
  const classes = [];
  let atributosExtras = {};
  const dataFormatada = formatarDataParaComparacao(dia, mes, ano);
  const atividadesDia = _indiceAtividades
    ? (_indiceAtividades[dataFormatada] || [])
    : todosDados.filter(t => t.data === dataFormatada);
  const temCasa = _filtroExibicao.casa && atividadesDia.some(t => normalizarTexto(t.local) === 'casa');
  const temSala = _filtroExibicao.sala && atividadesDia.some(t => normalizarTexto(t.local) === 'sala');
  // Provas têm autoridade: marcam o dia mesmo que o local delas esteja fora do filtro
  const temProvaForaFiltro = atividadesDia.some(t =>
    normalizarTexto(t.tipo) === 'prova' &&
    ((!_filtroExibicao.casa && normalizarTexto(t.local) === 'casa') ||
     (!_filtroExibicao.sala && normalizarTexto(t.local) === 'sala'))
  );

  if (temCasa || temSala || temProvaForaFiltro) {
    classes.push('tem-tarefa');
    const tiposAlvo = ['tarefa','projeto','teste','prova'];
    const tiposPresentes = [...new Set(
      atividadesDia
        .filter(a => {
          const loc = normalizarTexto(a.local);
          const tipoNorm = normalizarTexto(a.tipo);
          if (!tiposAlvo.includes(tipoNorm)) return false;
          // Prova aparece sempre, outros tipos respeitam o filtro
          if (tipoNorm === 'prova') return true;
          return (_filtroExibicao.casa && loc === 'casa') || (_filtroExibicao.sala && loc === 'sala');
        })
        .map(a => normalizarTexto(a.tipo))
    )];
    if (tiposPresentes.length > 0) {
      classes.push(`dia-${tiposPresentes[0]}`);
      if (tiposPresentes.length > 1) {
        classes.push('dia-com-multiplos-tipos');
        atributosExtras = {
          'data-lista-tipos': JSON.stringify(tiposPresentes),
          'data-indice-cor': 0
        };
      }
    }
  }
  return { classes, atributosExtras, dataFormatada };
}

function gerarMarcacaoCompletaCalendario(ordemDias, infoMes) {
  const calendario = [];
  const { primeiroDia, ultimoDiaDoMes, ultimoDiaMesAnterior } = infoMes;
  const posicaoDia1 = ordemDias.indexOf(primeiroDia);
  const hoje = new Date();

  // Pré-indexa atividades por data para evitar N×35 iterações de filter
  const _indiceAtividades = Object.create(null);
  todosDados.forEach(t => {
    if (!t || !t.data) return;
    (_indiceAtividades[t.data] = _indiceAtividades[t.data] || []).push(t);
  });

  const anoAnt = mesAtual === 0  ? anoAtual - 1 : anoAtual;
  const mesAnt = mesAtual === 0  ? 11 : mesAtual - 1;
  for (let i = 0; i < posicaoDia1; i++) {
    const dia = ultimoDiaMesAnterior - (posicaoDia1 - 1 - i);
    const dados = obterClassesEAtributosDia(dia, mesAnt, anoAnt, _indiceAtividades);
    dados.classes.push('inativo');
    calendario.push({ dia, tipo:'anterior', classe:dados.classes.join(' '), dataCompleta:dados.dataFormatada, attrs:dados.atributosExtras });
  }

  for (let dia = 1; dia <= ultimoDiaDoMes; dia++) {
    const dados = obterClassesEAtributosDia(dia, mesAtual, anoAtual, _indiceAtividades);
    if (dia === hoje.getDate() && mesAtual === hoje.getMonth() && anoAtual === hoje.getFullYear())
      dados.classes.push('ativo');
    calendario.push({ dia, tipo:'atual', classe:dados.classes.join(' '), dataCompleta:dados.dataFormatada, attrs:dados.atributosExtras });
  }

  const anoProx = mesAtual === 11 ? anoAtual + 1 : anoAtual;
  const mesProx = mesAtual === 11 ? 0 : mesAtual + 1;
  let diaProx = 1;
  while (calendario.length < 35) {
    const dados = obterClassesEAtributosDia(diaProx, mesProx, anoProx, _indiceAtividades);
    dados.classes.push('inativo');
    calendario.push({ dia:diaProx, tipo:'proximo', classe:dados.classes.join(' '), dataCompleta:dados.dataFormatada, attrs:dados.atributosExtras });
    diaProx++;
  }
  return calendario;
}

function renderizarCalendario(calendario) {
  const frag = document.createDocumentFragment();
  calendario.forEach((celula) => {
    const li = document.createElement('li');
    li.className = celula.classe;
    li.textContent = celula.dia;
    li.dataset.dataCompleta = celula.dataCompleta;
    if (celula.attrs) {
      for (const key in celula.attrs) li.setAttribute(key, celula.attrs[key]);
    }
    li.addEventListener('click', (e) => {
      if (_interceptarCliqueCalendarioEditor(e)) return;
      let mes = mesAtual;
      if (celula.tipo === 'anterior') mes = mesAtual === 0  ? 11 : mesAtual - 1;
      if (celula.tipo === 'proximo')  mes = mesAtual === 11 ? 0  : mesAtual + 1;
      abrirPainelDia(celula.dia, mes, celula.dataCompleta);
    });
    frag.appendChild(li);
  });
  containerDias.innerHTML = '';
  containerDias.appendChild(frag);
}

function renderizarCalendarioComEventos() {
  const infoMes  = obterInformacoesMesAtual();
  const ordemDias = calcularSequenciaDiasSemana(infoMes.primeiroDia);
  renderizarCabecalhoSemana(ordemDias);
  renderizarCalendario(gerarMarcacaoCompletaCalendario(ordemDias, infoMes));
  elementoDataAtual.textContent = `${nomesMeses[mesAtual]} ${anoAtual}`;
}

function navegarEntreMeses(dir) {
  mesAtual += dir;
  if (mesAtual < 0)  { mesAtual = 11; anoAtual--; }
  if (mesAtual > 11) { mesAtual = 0;  anoAtual++; }
  renderizarCalendarioComEventos();
  iniciarAnimacaoDiasMultiplos();
}

// ── Painel do dia ────────────────────────────────────────
function _escolherLocalInicial(dataStr) {
  const itensDia = todosDados.filter(item => item.data === dataStr);
  const temProvaSala = itensDia.some(item => normalizarTexto(item.tipo) === 'prova' && normalizarTexto(item.local) === 'sala');
  const temProvaCasa = itensDia.some(item => normalizarTexto(item.tipo) === 'prova' && normalizarTexto(item.local) === 'casa');
  // Prioridade 1: local com prova (sala antes de casa se ambos tiverem)
  if (temProvaSala && !temProvaCasa) return 'sala';
  if (temProvaCasa && !temProvaSala) return 'casa';
  // Ambos com prova ou nenhum: vai para o local com mais atividades
  const qtdSala = itensDia.filter(item => normalizarTexto(item.local) === 'sala').length;
  const qtdCasa = itensDia.filter(item => normalizarTexto(item.local) === 'casa').length;
  if (qtdSala > qtdCasa) return 'sala';
  if (qtdCasa > qtdSala) return 'casa';
  // Empate: mantém o ultimo local selecionado
  return opcaoSelecionadaLocal;
}

function abrirPainelDia(dia, mes, dataStr) {
  dataSelecionadaStr = dataStr;
  headerDataAba.textContent = `${dia} de ${nomesMeses[mes]}`;
  abaTarefas.classList.remove('oculto');
  overlayFundo.classList.add('visivel');
  alternarFiltroLocal(_escolherLocalInicial(dataStr));
}

function fecharPainelDia() {
  abaTarefas.classList.add('oculto');
  overlayFundo.classList.remove('visivel');
  document.querySelectorAll('.card-atividade.aberto').forEach(c => c.classList.remove('aberto'));
}

function alternarFiltroLocal(opcao, render = true) {
  opcaoSelecionadaLocal = opcao;
  seletorLocal.classList.toggle('marcador-local-casa', opcao === 'casa');
  botoesLocal.forEach(btn => btn.classList.toggle('ativo', btn.textContent.toLowerCase() === opcao));
  if (render) renderizarListaAtividadesDia();
}

function renderizarListaAtividadesDia() {
  containerAtividades.innerHTML = '';
  const itens = todosDados.filter(item =>
    normalizarTexto(item.local) === normalizarTexto(opcaoSelecionadaLocal) &&
    item.data === dataSelecionadaStr
  );
  if (itens.length === 0) {
    containerAtividades.innerHTML = `<div class="mensagem-vazia">nenhuma atividade</div>`;
    return;
  }
  itens.forEach(item => criarCardAtividadeDia(item));
  setTimeout(() => { atualizarAlturasCardsAtividade(); verificarScrollAnexosCardsDia(); }, 50);
}

// ── Cards do dia ─────────────────────────────────────────
function criarCardAtividadeDia(item) {
  const card = document.createElement('div');
  const area = normalizarTexto(item.area);
  const tipo = normalizarTexto(item.tipo);
  const temAnexo = item.anexo && item.arquivos && item.arquivos.length > 0;

  let htmlAnexos = '';
  if (temAnexo) {
    htmlAnexos = `
      <div class="lista-anexos-card">
        ${item.arquivos.map(p => {
          const nomeArquivo = (p || '').split('/').pop() || 'anexo';
          const ext = nomeArquivo.split('.').pop().toUpperCase().substring(0, 4);
          return `
            <button class="card-arquivo-anexo" type="button" data-path="${p}">
              <div class="icone-arquivo-anexo">${ext}</div>
              <div class="nome-arquivo-anexo" title="${nomeArquivo}">${nomeArquivo}</div>
              <div class="tamanho-arquivo-anexo">Anexo</div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  card.className = `card-atividade ${area} ${tipo} ${temAnexo ? 'estado-com-anexo' : ''}`;
  // Guarda o id do registro para o modo editar conseguir recuperar o item
  if (item.id != null) card.dataset.itemId = String(item.id);
  card.innerHTML = `
    <div class="tag-tipo ${tipo}">${item.tipo || 'Outros'}</div>
    <div class="card-materia">${item.area || 'GERAL'}</div>
    <div class="card-prof">Prof. ${item.professor || 'Desc.'}</div>
    <button class="card-titulo">${item.descricao_titulo || 'Sem título'}</button>
    <div class="card-pontos-tipo"><div id="p1"></div><div id="p2"></div><div id="p3"></div><div id="p4"></div></div>
    <div class="card-detalhes"><div class="texto-detalhes">${formatarTextoDescricao(item.descricao_detalhes || '')}</div></div>
    ${htmlAnexos}
  `;

  // Interceptação do editor (modos editar / apagar) — tem prioridade sobre tudo
  card.addEventListener('click', (e) => {
    _interceptarCliqueCalendarioEditor(e);
  }, true); // capture=true para rodar antes dos filhos

  card.querySelector('.card-titulo').addEventListener('click', () => {
    card.classList.toggle('aberto');
    atualizarAlturasCardsAtividade();
  });

  if (temAnexo) {
    card.querySelectorAll('.card-arquivo-anexo').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await abrirAnexoNoVisualizador(btn.getAttribute('data-path')); }
        catch(e) { console.error(e); alert(e.message); }
      });
    });
  }

  containerAtividades.appendChild(card);
}

function atualizarAlturasCardsAtividade() {
  document.querySelectorAll('.card-atividade').forEach(card => {
    const d = card.querySelector('.card-detalhes');
    if (d) card.style.setProperty('--detalhes-height', `${d.scrollHeight}px`);
  });
}

function verificarScrollAnexosCardsDia() {
  document.querySelectorAll('.lista-anexos-card').forEach(c => {
    c.classList.toggle('estado-scroll-horizontal', c.scrollWidth > c.clientWidth);
  });
}

let _resizeTimer = null;
const observer = new ResizeObserver(() => {
  if (_resizeTimer) return;
  _resizeTimer = requestAnimationFrame(() => {
    _resizeTimer = null;
    atualizarAlturasCardsAtividade();
    verificarScrollAnexosCardsDia();
    // Reposiciona o indicator caso o layout tenha mudado
    const btnAtivo = document.querySelector('.nav-btn.active');
    if (btnAtivo) moverParaBtn(btnAtivo);
  });
});
observer.observe(document.body);




/* ╔══════════════════════════════════════════════════════════════╗
   ║                                                              ║
   ║   ░░░  P A R T E   3  —  I F R A M E / V I S U A L I Z A D O R  ░░░  ║
   ║                                                              ║
   ║   Visualizador de anexos embutido (overlay modal):          ║
   ║   • Calendário → pdf.js para PDFs renderizados em canvas    ║
   ║   • Próximo   → Office Online viewer via iframe             ║
   ║   • Demais abas futuras podem reutilizar abrirAnexoNoVisualizador() ║
   ║                                                              ║
   ║   Fluxo: clique no anexo → obterUrlAssinadaArquivo()        ║
   ║          → detecta extensão → escolhe estratégia de render  ║
   ║          → exibe no overlayViewer (criado sob demanda)       ║
   ║                                                              ║
   ╚══════════════════════════════════════════════════════════════╝ */


/* ══════════════════════════════════════════════════════════
   Estrutura do visualizador — criada sob demanda
   ══════════════════════════════════════════════════════════ */
let overlayViewer = null, viewerFrame = null, btnFecharViewer = null, btnBaixarViewer = null;

function garantirEstruturaVisualizador() {
  if (overlayViewer) return;

  overlayViewer = document.createElement('div');
  overlayViewer.id = 'overlay-visualizador-anexo';

  const box  = document.createElement('div'); box.classList.add('janela-visualizador');
  const topo = document.createElement('div'); topo.classList.add('barra-superior-visualizador');

  btnBaixarViewer = document.createElement('button');
  btnBaixarViewer.type = 'button';
  btnBaixarViewer.classList.add('botao-visualizador','botao-download-visualizador');
  btnBaixarViewer.innerHTML = `<svg class="icone-visualizador" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>`;

  btnFecharViewer = document.createElement('button');
  btnFecharViewer.type = 'button';
  btnFecharViewer.classList.add('botao-visualizador','botao-fechar-visualizador');
  btnFecharViewer.innerHTML = `<svg class="icone-visualizador" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

  viewerFrame = document.createElement('div'); viewerFrame.classList.add('area-conteudo-visualizador');

  topo.appendChild(btnFecharViewer);
  topo.appendChild(btnBaixarViewer);
  box.appendChild(topo);
  box.appendChild(viewerFrame);
  overlayViewer.appendChild(box);
  document.body.appendChild(overlayViewer);

  const fechar = () => {
    overlayViewer.classList.remove('aberto');
    viewerFrame.innerHTML = '';
    document.body.style.overflow = '';
  };

  btnFecharViewer.addEventListener('click', fechar);
  overlayViewer.addEventListener('click', e => { if (e.target === overlayViewer) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayViewer.classList.contains('aberto')) fechar();
  });
}


/* ══════════════════════════════════════════════════════════
   Utilitários do visualizador
   ══════════════════════════════════════════════════════════ */
function obterExtensaoArquivoPorNome(nome) {
  const base = (nome || '').split('?')[0].split('#')[0];
  const p = base.split('.').pop();
  return p ? p.toLowerCase() : '';
}


/* ══════════════════════════════════════════════════════════
   Renderizadores por tipo de arquivo
   ══════════════════════════════════════════════════════════ */

// PDF — renderizado página a página via pdf.js (canvas)
async function renderizarPdfNoCanvasPdfjs(url) {
  if (typeof pdfjsLib === 'undefined') {
    if (typeof window._carregarPdfJs === 'function') {
      await window._carregarPdfJs();
    } else {
      throw new Error('PDF.js não carregado.');
    }
  }
  const pdfContainer = document.createElement('div');
  pdfContainer.classList.add('container-pdfjs');
  viewerFrame.appendChild(pdfContainer);

  const pdf = await pdfjsLib.getDocument(url).promise;
  const largura = Math.max((viewerFrame.clientWidth || 0) - 24, 320);

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp   = page.getViewport({ scale: largura / page.getViewport({scale:1}).width });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width; canvas.height = vp.height;
    canvas.classList.add('pagina-pdfjs');
    pdfContainer.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
}


/* ══════════════════════════════════════════════════════════
   Ponto de entrada — abre qualquer tipo de anexo no viewer
   (usado pelo calendário, pelo painel próximo e pelas
    abas futuras — basta chamar abrirAnexoNoVisualizador(path))
   ══════════════════════════════════════════════════════════ */
async function abrirAnexoNoVisualizador(path) {
  garantirEstruturaVisualizador();
  const nome = (path || '').split('/').pop() || 'anexo';
  const ext  = obterExtensaoArquivoPorNome(nome);

  overlayViewer.classList.add('aberto');
  viewerFrame.innerHTML = `<div class="estado-carregando-visualizador">${_criarIconeCarregandoHTML()}</div>`;
  document.body.style.overflow = 'hidden';

  let url;
  const _tempoMinimo = new Promise(res => setTimeout(res, 1700));
  try {
    const [urlResult] = await Promise.all([obterUrlAssinadaArquivo(path), _tempoMinimo]);
    url = urlResult;
  }
  catch(e) { viewerFrame.innerHTML = `<div class="estado-erro-visualizador">Erro: ${e.message}</div>`; return; }

  btnBaixarViewer.onclick = () => {
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
  };

  viewerFrame.innerHTML = '';

  // Imagens — tag <img> nativa
  if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) {
    const img = document.createElement('img'); img.src = url; img.alt = nome;
    viewerFrame.appendChild(img); return;
  }

  // PDF — pdf.js (canvas por página)
  if (ext === 'pdf') {
    try { await renderizarPdfNoCanvasPdfjs(url); }
    catch(e) { viewerFrame.innerHTML = `<div class="estado-erro-visualizador">Erro ao abrir PDF: ${e.message}</div>`; }
    return;
  }

  // Office (doc/xls/ppt e variantes) — iframe via Office Online
  if (['doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    viewerFrame.appendChild(iframe); return;
  }

  // Fallback genérico — iframe direto (txt, csv, html, etc.)
  const iframe = document.createElement('iframe');
  iframe.src = url; viewerFrame.appendChild(iframe);
}