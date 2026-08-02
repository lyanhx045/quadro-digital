require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { IncomingForm } = require('formidable');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const RAIZ = __dirname;
const BUCKET = 'anexos';
const FUSO_NOTIFICACOES = 'America/Sao_Paulo';

const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const NOTIFICACOES_CRON_SECRET = String(
  process.env.NOTIFICACOES_CRON_SECRET || ''
).trim();
const VAPID_SUBJECT = String(
  process.env.VAPID_SUBJECT ||
  process.env.SITE_URL ||
  'mailto:admin@quadro-digital.local'
).trim();

let notificacoesConfiguradas = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (notificacoesConfiguradas) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (erro) {
    notificacoesConfiguradas = false;
    console.error('[notificacoes] Chaves VAPID inválidas:', erro.message);
  }
}

// Conecta no Supabase com as variáveis de ambiente
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEGREDO_SESSAO = crypto
  .createHash('sha256')
  .update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:sessao-admin`)
  .digest();

const DURACAO_SESSAO = 8 * 60 * 60 * 1000;

function criarTokenSessao(dados) {
  const payload = Buffer.from(JSON.stringify({
    ...dados,
    expiraEm: Date.now() + DURACAO_SESSAO,
  })).toString('base64url');

  const assinatura = crypto
    .createHmac('sha256', SEGREDO_SESSAO)
    .update(payload)
    .digest('base64url');

  return `${payload}.${assinatura}`;
}

function validarTokenSessao(token) {
  try {
    const [payload, assinaturaRecebida] = String(token || '').split('.');
    if (!payload || !assinaturaRecebida) return null;

    const assinaturaEsperada = crypto
      .createHmac('sha256', SEGREDO_SESSAO)
      .update(payload)
      .digest('base64url');

    const recebida = Buffer.from(assinaturaRecebida);
    const esperada = Buffer.from(assinaturaEsperada);

    if (
      recebida.length !== esperada.length ||
      !crypto.timingSafeEqual(recebida, esperada)
    ) {
      return null;
    }

    const sessao = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    if (!sessao.expiraEm || Date.now() >= sessao.expiraEm) {
      return null;
    }

    return sessao;
  } catch {
    return null;
  }
}

function lerCookies(req) {
  const cookies = {};

  String(req.headers.cookie || '').split(';').forEach(parte => {
    const separador = parte.indexOf('=');
    if (separador === -1) return;

    const nome = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();

    if (nome) cookies[nome] = valor;
  });

  return cookies;
}

function obterSessaoAdmin(req) {
  const cookies = lerCookies(req);
  const sessao = validarTokenSessao(cookies.sessao_admin);

  if (!sessao || sessao.tipo !== 'admin') return null;
  return sessao;
}

function criarCookieSessao(token) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return [
    `sessao_admin=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
  ].join('; ') + seguro;
}

function criarCookieLogout() {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return [
    'sessao_admin=',
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
  ].join('; ') + seguro;
}

function resolverSalaDaGravacao(req, salaSolicitada) {
  const salaUsuario = Number(req.sessaoAdmin?.sala_id);

  if (!Number.isInteger(salaUsuario)) return null;

  if (salaUsuario !== 0) {
    return salaUsuario;
  }

  const salaAlvo = Number(salaSolicitada);

  if (!Number.isInteger(salaAlvo) || salaAlvo <= 0) {
    return null;
  }

  return salaAlvo;
}

function restringirQueryASala(query, req) {
  const salaUsuario = Number(req.sessaoAdmin?.sala_id);

  if (salaUsuario === 0) return query;

  return query.eq('sala_id', salaUsuario);
}

// Matérias do seletor do formulário
const MATERIAS = ['MATEMÁTICA', 'ITINERÁRIO', 'LINGUAGENS', 'HUMANAS', 'NATUREZA'];

// Converte data do formulário (dd/mm/aaaa) para ISO (aaaa-mm-dd) antes de salvar
function converterDataBrParaIso(d, m, a) {
  if (!d || !m || !a) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* ============================================================
   NOTIFICAÇÕES PUSH
   ============================================================ */

const formatadorDataHoraBrasil = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_NOTIFICACOES,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function lerCorpoJson(req, limite = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    let excedeuLimite = false;

    req.on('data', parte => {
      if (excedeuLimite) return;
      corpo += parte;
      if (Buffer.byteLength(corpo) > limite) excedeuLimite = true;
    });

    req.on('end', () => {
      if (excedeuLimite) {
        reject(new Error('Corpo da requisição muito grande'));
        return;
      }

      try {
        resolve(corpo ? JSON.parse(corpo) : {});
      } catch (erro) {
        reject(new Error('JSON inválido: ' + erro.message));
      }
    });

    req.on('error', reject);
  });
}

function obterPartesDataHoraBrasil(data = new Date()) {
  const partes = {};

  formatadorDataHoraBrasil.formatToParts(data).forEach(parte => {
    if (parte.type !== 'literal') partes[parte.type] = parte.value;
  });

  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

function normalizarDataIso(valor) {
  const data = String(valor || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

function adicionarDiasDataIso(dataIso, quantidade) {
  const dataNormalizada = normalizarDataIso(dataIso);
  if (!dataNormalizada) return null;

  const [ano, mes, dia] = dataNormalizada.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + quantidade));
  return data.toISOString().slice(0, 10);
}

function formatarDataCurta(dataIso) {
  const dataNormalizada = normalizarDataIso(dataIso);
  if (!dataNormalizada) return '';
  const [ano, mes, dia] = dataNormalizada.split('-');
  return `${dia}/${mes}`;
}

function normalizarTextoNotificacao(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function obterTipoNotificacao(atividade) {
  const tipo = normalizarTextoNotificacao(atividade?.tipo);
  return ['prova', 'teste', 'projeto', 'tarefa'].includes(tipo)
    ? tipo
    : 'tarefa';
}

function formatarDisciplinaNotificacao(valor) {
  const texto = String(valor || 'GERAL').trim().toLocaleLowerCase('pt-BR');
  return texto.replace(/(^|[\s-])([a-záàâãéèêíïóôõöúç])/giu, (_, inicio, letra) => {
    return inicio + letra.toLocaleUpperCase('pt-BR');
  });
}

function limitarTextoNotificacao(valor, limite) {
  const texto = String(valor || '').replace(/\s+/g, ' ').trim();
  if (texto.length <= limite) return texto;
  return texto.slice(0, Math.max(0, limite - 1)).trimEnd() + '…';
}

function criarTextoNotificacao(atividade, evento, opcoes = {}) {
  const tipo = obterTipoNotificacao(atividade);
  const local = normalizarTextoNotificacao(atividade.local) === 'casa' ? 'casa' : 'sala';
  const disciplina = formatarDisciplinaNotificacao(atividade.area);
  const descricao = limitarTextoNotificacao(
    atividade.descricao_titulo || 'Sem título',
    90
  );

  const titulosPublicacao = {
    prova: 'Nova prova',
    teste: 'Novo teste',
    projeto: 'Novo projeto',
    tarefa: 'Nova tarefa',
  };

  const titulosAlteracao = {
    prova: 'Data da prova alterada',
    teste: 'Data do teste alterada',
    projeto: 'Data do projeto alterada',
    tarefa: 'Data da tarefa alterada',
  };

  const titulosCancelamento = {
    prova: 'Prova cancelada',
    teste: 'Teste cancelado',
    projeto: 'Projeto cancelado',
    tarefa: 'Tarefa cancelada',
  };

  const titulosAmanha = {
    prova: 'Prova amanhã',
    teste: 'Teste amanhã',
    projeto: 'Projeto para amanhã',
    tarefa: 'Tarefa para amanhã',
  };

  let titulo;
  let dataTexto = formatarDataCurta(atividade.data);

  if (evento === 'publicacao') {
    titulo = titulosPublicacao[tipo];
  } else if (evento === 'prova-3-dias') {
    titulo = 'Prova em 3 dias';
  } else if (evento === 'lembrete-1-dia') {
    titulo = titulosAmanha[tipo];
  } else if (evento === 'alteracao-data') {
    titulo = titulosAlteracao[tipo];
    dataTexto = `${formatarDataCurta(opcoes.dataAnterior)} → ${formatarDataCurta(atividade.data)}`;
  } else {
    titulo = titulosCancelamento[tipo];
  }

  return {
    titulo: `${titulo} • ${local}`,
    subtitulo: `${disciplina} — ${descricao} • ${dataTexto}`,
  };
}

async function listarInscricoesDaSala(salaId) {
  const { data, error } = await supabase
    .from('notificacoes_inscricoes')
    .select('id, endpoint, p256dh, auth')
    .eq('sala_id', salaId);

  if (error) throw error;
  return data || [];
}

async function removerInscricaoExpirada(id) {
  const { error } = await supabase
    .from('notificacoes_inscricoes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[notificacoes] Falha ao remover inscrição expirada:', error.message);
  }
}

async function enviarNotificacaoDaAtividade(atividade, evento, opcoes = {}) {
  if (!notificacoesConfiguradas) return { enviadas: 0, falhas: 0 };

  const salaId = Number(atividade.sala_id);
  if (!Number.isInteger(salaId) || salaId <= 0) {
    return { enviadas: 0, falhas: 0 };
  }

  const inscricoes = await listarInscricoesDaSala(salaId);
  if (inscricoes.length === 0) return { enviadas: 0, falhas: 0 };

  const texto = criarTextoNotificacao(atividade, evento, opcoes);
  const atividadeId = String(atividade.id);
  const url = `/?atividade=${encodeURIComponent(atividadeId)}&sala=${encodeURIComponent(salaId)}`;
  const payload = JSON.stringify({
    title: texto.titulo,
    body: texto.subtitulo,
    icon: '/icons/notificacao-192.png',
    tag: `atividade-${atividadeId}-${evento}`,
    data: {
      atividadeId,
      salaId,
      url,
    },
  });

  const resultados = await Promise.allSettled(inscricoes.map(async inscricao => {
    try {
      await webpush.sendNotification({
        endpoint: inscricao.endpoint,
        keys: {
          p256dh: inscricao.p256dh,
          auth: inscricao.auth,
        },
      }, payload, {
        TTL: 24 * 60 * 60,
        urgency: 'normal',
      });

      return true;
    } catch (erro) {
      if (erro?.statusCode === 404 || erro?.statusCode === 410) {
        await removerInscricaoExpirada(inscricao.id);
        return false;
      }

      throw erro;
    }
  }));

  let enviadas = 0;
  let falhas = 0;

  resultados.forEach(resultado => {
    if (resultado.status === 'fulfilled' && resultado.value) {
      enviadas += 1;
    } else {
      falhas += 1;
      if (resultado.status === 'rejected') {
        console.error('[notificacoes] Falha no envio:', resultado.reason?.message || resultado.reason);
      }
    }
  });

  return { enviadas, falhas };
}

async function registrarEventoUnico(atividadeId, evento, dataReferencia) {
  const { error } = await supabase
    .from('notificacoes_eventos')
    .insert([{
      atividade_id: String(atividadeId),
      evento,
      data_referencia: dataReferencia,
    }]);

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function eventoFoiRegistrado(atividadeId, evento, dataReferencia) {
  let query = supabase
    .from('notificacoes_eventos')
    .select('id')
    .eq('atividade_id', String(atividadeId))
    .eq('evento', evento)
    .limit(1);

  if (dataReferencia) query = query.eq('data_referencia', dataReferencia);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function marcarAtividadeAnunciada(atividade) {
  const data = normalizarDataIso(atividade.data);
  if (!data) return;

  try {
    await registrarEventoUnico(atividade.id, 'anuncio', data);
  } catch (erro) {
    console.error('[notificacoes] Falha ao registrar anúncio:', erro.message);
  }
}

function deveNotificarPublicacao(atividade) {
  const dataAtividade = normalizarDataIso(atividade.data);
  if (!dataAtividade) return false;

  const hoje = obterPartesDataHoraBrasil().data;
  if (dataAtividade < hoje) return false;

  const local = normalizarTextoNotificacao(atividade.local);
  if (dataAtividade === hoje && local === 'sala') return false;

  return true;
}

async function processarPublicacaoAtividade(atividade) {
  const hoje = obterPartesDataHoraBrasil().data;

  try {
    await registrarEventoUnico(atividade.id, 'publicacao', hoje);
  } catch (erro) {
    console.error('[notificacoes] Falha ao registrar publicação:', erro.message);
  }

  if (!deveNotificarPublicacao(atividade)) return;

  await marcarAtividadeAnunciada(atividade);
  await enviarNotificacaoDaAtividade(atividade, 'publicacao');
}

async function processarAlteracaoData(atividadeAnterior, atividadeAtual) {
  const dataAnterior = normalizarDataIso(atividadeAnterior.data);
  const dataAtual = normalizarDataIso(atividadeAtual.data);

  if (!dataAnterior || !dataAtual || dataAnterior === dataAtual) return;

  const hoje = obterPartesDataHoraBrasil().data;
  if (dataAtual < hoje) return;

  await marcarAtividadeAnunciada(atividadeAtual);
  await enviarNotificacaoDaAtividade(atividadeAtual, 'alteracao-data', {
    dataAnterior,
  });
}

async function processarCancelamentoAtividade(atividade, atividadeAnunciada) {
  const dataAtividade = normalizarDataIso(atividade.data);
  if (!dataAtividade) return;

  const hoje = obterPartesDataHoraBrasil().data;
  if (dataAtividade < hoje) return;

  const deveAvisar = dataAtividade > hoje || atividadeAnunciada;
  if (!deveAvisar) return;

  await enviarNotificacaoDaAtividade(atividade, 'cancelamento');
}

async function limparEventosDaAtividade(atividadeId) {
  const { error } = await supabase
    .from('notificacoes_eventos')
    .delete()
    .eq('atividade_id', String(atividadeId));

  if (error) {
    console.error('[notificacoes] Falha ao limpar eventos:', error.message);
  }
}

let processamentoLembretesEmAndamento = false;
let dataUltimaLimpezaEventos = null;

async function enviarLembreteUnico(atividade, evento, hoje) {
  if (await eventoFoiRegistrado(atividade.id, 'publicacao', hoje)) return;

  const reservado = await registrarEventoUnico(atividade.id, evento, hoje);
  if (!reservado) return;

  await marcarAtividadeAnunciada(atividade);
  await enviarNotificacaoDaAtividade(atividade, evento);
}

async function processarLembretesAgendados() {
  if (!notificacoesConfiguradas || processamentoLembretesEmAndamento) return;

  const agoraBrasil = obterPartesDataHoraBrasil();
  if (agoraBrasil.hora < 18) return;

  processamentoLembretesEmAndamento = true;

  try {
    const hoje = agoraBrasil.data;
    const amanha = adicionarDiasDataIso(hoje, 1);
    const daquiTresDias = adicionarDiasDataIso(hoje, 3);

    const { data: atividades, error } = await supabase
      .from('atividades')
      .select('id, area, tipo, data, local, descricao_titulo, sala_id')
      .in('data', [amanha, daquiTresDias]);

    if (error) throw error;

    for (const atividade of atividades || []) {
      const dataAtividade = normalizarDataIso(atividade.data);
      const tipo = obterTipoNotificacao(atividade);

      if (dataAtividade === daquiTresDias && tipo === 'prova') {
        await enviarLembreteUnico(atividade, 'prova-3-dias', hoje);
      }

      if (dataAtividade === amanha) {
        await enviarLembreteUnico(atividade, 'lembrete-1-dia', hoje);
      }
    }

    if (dataUltimaLimpezaEventos !== hoje) {
      dataUltimaLimpezaEventos = hoje;
      const limite = adicionarDiasDataIso(hoje, -45);
      const { error: erroLimpeza } = await supabase
        .from('notificacoes_eventos')
        .delete()
        .lt('data_referencia', limite);

      if (erroLimpeza) {
        console.error('[notificacoes] Falha na limpeza de eventos:', erroLimpeza.message);
      }
    }
  } catch (erro) {
    console.error('[notificacoes] Falha ao processar lembretes:', erro.message);
  } finally {
    processamentoLembretesEmAndamento = false;
  }
}

// Determina Content-Type pelo tipo de arquivo
function obterMimeTypePorExtensao(ext) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
  };
  return types[ext] || 'application/octet-stream';
}

// Descobre o endereço público usado nos metadados, robots.txt e sitemap.
// Na hospedagem, SITE_URL pode ser definido como https://seu-dominio.com.br.
function obterUrlPublica(req) {
  const urlConfigurada = String(process.env.SITE_URL || '').trim();

  if (urlConfigurada) {
    try {
      const url = new URL(urlConfigurada);

      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString().replace(/\/+$/, '');
      }
    } catch (_) {}
  }

  const protocoloEncaminhado = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();

  const protocolo =
    protocoloEncaminhado === 'http' || protocoloEncaminhado === 'https'
      ? protocoloEncaminhado
      : (req.socket.encrypted || process.env.NODE_ENV === 'production' ? 'https' : 'http');

  const host = String(
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    `localhost:${PORT}`
  ).split(',')[0].trim();

  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return `http://localhost:${PORT}`;
  }

  return `${protocolo}://${host}`;
}

function escaparXml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function servirRobotsTxt(req, res) {
  const urlPublica = obterUrlPublica(req);
  const conteudo = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${urlPublica}/sitemap.xml`,
    '',
  ].join('\n');

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(conteudo);
}

function servirSitemapXml(req, res) {
  const urlPublica = obterUrlPublica(req);
  let ultimaAlteracao = new Date().toISOString().slice(0, 10);

  try {
    ultimaAlteracao = fs
      .statSync(path.join(RAIZ, 'index.html'))
      .mtime
      .toISOString()
      .slice(0, 10);
  } catch (_) {}

  const conteudo = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escaparXml(`${urlPublica}/`)}</loc>`,
    `    <lastmod>${ultimaAlteracao}</lastmod>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');

  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(conteudo);
}

// Rotas de acesso restrito (bloqueadas para acesso direto)
const ROTAS_RESTRITAS = ['/assets/js/index.js'];

// Serve arquivos estáticos (HTML/CSS/JS) da pasta
function servirArquivoEstatico(req, res) {
  const caminhoOriginal = req.url.split('?')[0];
  const requisicaoDeNavegacao =
    req.headers['sec-fetch-mode'] === 'navigate' ||
    (caminhoOriginal === '/' && !req.headers['sec-fetch-mode']);

  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0];

  if (urlPath === '/robots.txt') {
    return servirRobotsTxt(req, res);
  }

  if (urlPath === '/sitemap.xml') {
    return servirSitemapXml(req, res);
  }

  if (ROTAS_RESTRITAS.includes(urlPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Acesso não permitido.');
  }

  const filePath = path.join(RAIZ, urlPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado: ' + urlPath);
    }
    const headers = {
      'Content-Type': obterMimeTypePorExtensao(ext)
    };

    let conteudoFinal = content;

    if (urlPath === '/index.html') {
      conteudoFinal = Buffer.from(
        content
          .toString('utf8')
          .replaceAll('__URL_PUBLICA__', obterUrlPublica(req)),
        'utf8'
      );
    }

    if (urlPath === '/index.html' && requisicaoDeNavegacao) {
      headers['Set-Cookie'] = criarCookieLogout();
    }

    if (urlPath === '/sw.js') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    if (
      urlPath === '/index.html' ||
      urlPath === '/index.css' ||
      urlPath === '/index.js'
    ) {
      headers['Cache-Control'] = 'no-cache, must-revalidate';
    }

    res.writeHead(200, headers);
    res.end(conteudoFinal);
  });
}

// Limpa nome do arquivo (sem caminho e sem acentos)
function limparNomeArquivo(nome) {
  const base = path.basename(nome || 'arquivo');
  return base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '').split('?')[0];

  // --- API: login da sala (POST /api/sala/login)
  if (req.method === 'POST' && urlPath === '/api/sala/login') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { codigo } = JSON.parse(body);
        if (!codigo) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Código obrigatório' }));
        }
        const { data, error } = await supabase
          .from('salas')
          .select('id, nome, codigo')
          .eq('codigo', codigo.trim())
          .maybeSingle();
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }
        if (!data) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Código inválido' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ id: data.id, nome: data.nome, codigo: data.codigo }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'JSON inválido: ' + e.message }));
      }
    });
    return;
  }

  // --- API: login do representante/admin (POST /api/login)
  if (req.method === 'POST' && urlPath === '/api/login') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { username, senha, sala_id } = JSON.parse(body);

        if (!username) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'usuario_nao_encontrado' }));
        }

        const { data, error } = await supabase
          .from('usuarios')
          .select('id, username, senha_hash, role, sala_id')
          .eq('username', username.trim())
          .single();

        if (error || !data) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'usuario_nao_encontrado' }));
        }

        if (!senha) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'senha_incorreta' }));
        }

        const hashDoBanco = String(data.senha_hash).trim();
        const senhaValida = bcrypt.compareSync(senha, hashDoBanco);

        if (!senhaValida) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'senha_incorreta' }));
        }

        const salaIdUsuario = Number(data.sala_id);
        const salaIdAtual = Number(sala_id);

        if (salaIdUsuario !== 0 && salaIdUsuario !== salaIdAtual) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'usuario_nao_encontrado' }));
        }

        const tokenSessao = criarTokenSessao({
          tipo:     'admin',
          id:       data.id,
          username: data.username,
          role:     data.role,
          sala_id:  data.sala_id,
        });

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': criarCookieSessao(tokenSessao),
        });
        return res.end(JSON.stringify({
          id:       data.id,
          username: data.username,
          role:     data.role,
          sala_id:  data.sala_id,
        }));

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'JSON inválido: ' + e.message }));
      }
    });
    return;
  }

  // --- API: encerrar sessão administrativa
  if (req.method === 'POST' && urlPath === '/api/logout') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': criarCookieLogout(),
    });

    return res.end(JSON.stringify({ ok: true }));
  }

  // --- API: configuração pública das notificações
  if (req.method === 'GET' && urlPath === '/api/notificacoes/config') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });

    return res.end(JSON.stringify({
      disponivel: notificacoesConfiguradas,
      publicKey: notificacoesConfiguradas ? VAPID_PUBLIC_KEY : null,
    }));
  }

  // --- API: acionada diariamente pelo pg_cron do Supabase às 18:00
  if (
    req.method === 'POST' &&
    urlPath === '/api/notificacoes/processar-lembretes'
  ) {
    const autorizacao = String(req.headers.authorization || '');
    const tokenRecebido = autorizacao.startsWith('Bearer ')
      ? autorizacao.slice(7)
      : '';
    const recebido = Buffer.from(tokenRecebido);
    const esperado = Buffer.from(NOTIFICACOES_CRON_SECRET);
    const autorizado = Boolean(
      NOTIFICACOES_CRON_SECRET &&
      recebido.length === esperado.length &&
      crypto.timingSafeEqual(recebido, esperado)
    );

    if (!autorizado) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Não autorizado' }));
    }

    await processarLembretesAgendados();

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  // --- API: vincular este navegador à sala atual
  if (req.method === 'POST' && urlPath === '/api/notificacoes/inscricao') {
    try {
      if (!notificacoesConfiguradas) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Notificações indisponíveis' }));
      }

      const corpo = await lerCorpoJson(req);
      const salaId = Number(corpo.sala_id);
      const codigo = String(corpo.codigo || '').trim();
      const inscricao = corpo.subscription || {};
      const endpoint = String(inscricao.endpoint || '').trim();
      const p256dh = String(inscricao.keys?.p256dh || '').trim();
      const auth = String(inscricao.keys?.auth || '').trim();

      if (
        !Number.isInteger(salaId) ||
        salaId <= 0 ||
        !codigo ||
        !endpoint.startsWith('https://') ||
        endpoint.length > 4096 ||
        !p256dh ||
        !auth
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Inscrição inválida' }));
      }

      const { data: sala, error: erroSala } = await supabase
        .from('salas')
        .select('id')
        .eq('id', salaId)
        .eq('codigo', codigo)
        .maybeSingle();

      if (erroSala) throw erroSala;

      if (!sala) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Sala não autorizada' }));
      }

      const agora = new Date().toISOString();
      const { error } = await supabase
        .from('notificacoes_inscricoes')
        .upsert([{
          endpoint,
          p256dh,
          auth,
          sala_id: salaId,
          atualizado_em: agora,
        }], {
          onConflict: 'endpoint',
        });

      if (error) throw error;

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(JSON.stringify({ ok: true }));
    } catch (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: erro.message }));
    }
  }

  // --- API: remover a inscrição deste navegador
  if (req.method === 'POST' && urlPath === '/api/notificacoes/desativar') {
    try {
      const corpo = await lerCorpoJson(req);
      const endpoint = String(corpo.endpoint || '').trim();

      if (!endpoint || endpoint.length > 4096) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Endpoint inválido' }));
      }

      const { error } = await supabase
        .from('notificacoes_inscricoes')
        .delete()
        .eq('endpoint', endpoint);

      if (error) throw error;

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(JSON.stringify({ ok: true }));
    } catch (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: erro.message }));
    }
  }

  const metodoProtegido = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (metodoProtegido) {
    const sessaoAdmin = obterSessaoAdmin(req);

    if (!sessaoAdmin) {
      res.writeHead(401, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });

      return res.end(JSON.stringify({
        error: 'Não autorizado',
      }));
    }

    req.sessaoAdmin = sessaoAdmin;
  }

  // --- API: gerar link temporário para um anexo (GET /api/anexo?path=...)
  if (req.method === 'GET' && urlPath === '/api/anexo') {
    try {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const filePath = u.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Parâmetro "path" é obrigatório' }));
      }
      const { data, error } = await supabase
        .storage
        .from(BUCKET)
        .createSignedUrl(filePath, 120);
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ url: data.signedUrl }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: listar atividades (GET /api/atividades)
  if (req.method === 'GET' && urlPath === '/api/atividades') {
    try {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const salaId = u.searchParams.get('sala_id');
      let query = supabase.from('atividades').select('*, professores(nome)');
      if (salaId) query = query.eq('sala_id', parseInt(salaId, 10));
      const { data, error } = await query;
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      // Resolve professor_id → professor (nome) para compatibilidade com o front-end
      const resultado = (data || []).map(item => ({
        ...item,
        professor: item.professores?.nome ?? item.professor ?? null,
        professores: undefined,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resultado));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: listar grade de aulas (GET /api/grade-aulas)
  if (req.method === 'GET' && urlPath === '/api/grade-aulas') {
    try {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const salaId = u.searchParams.get('sala_id');
      let query = supabase
        .from('grade_aulas')
        .select('dia_semana, posicao, professor_id, area, professores(nome)')
        .order('dia_semana')
        .order('posicao');
      if (salaId) query = query.eq('sala_id', parseInt(salaId, 10));
      const { data, error } = await query;
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      // Resolve professor_id → professor (nome) para compatibilidade com o front-end
      const resultado = (data || []).map(r => ({
        dia_semana:   r.dia_semana,
        posicao:      r.posicao,
        area:         r.area,
        professor_id: r.professor_id,
        professor:    r.professores?.nome ?? null,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resultado));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: listar drives (GET /api/drives)
  if (req.method === 'GET' && urlPath === '/api/drives') {
    try {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const salaId = u.searchParams.get('sala_id');
      let query = supabase
        .from('drives')
        .select('id, area, professor_id, link, professores(nome)')
        .order('area');
      if (salaId) query = query.eq('sala_id', parseInt(salaId, 10));
      const { data, error } = await query;
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      // Resolve professor_id → professor (nome) para compatibilidade com o front-end
      const resultado = (data || []).map(d => ({
        id:           d.id,
        area:         d.area,
        link:         d.link,
        professor_id: d.professor_id,
        professor:    d.professores?.nome ?? null,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resultado));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }


  // --- API: criar drive (POST /api/drives)
  if (req.method === 'POST' && urlPath === '/api/drives') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        const sala_id = resolverSalaDaGravacao(req, campos.sala_id);

        if (sala_id === null) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Sala não autorizada' }));
        }

        campos.sala_id = sala_id;

        // Resolve nome → professor_id se vier o campo "professor" (nome)
        if (campos.professor && !campos.professor_id) {
          const { data: prof } = await supabase
            .from('professores')
            .select('id')
            .eq('nome', campos.professor)
            .maybeSingle();
          campos.professor_id = prof ? prof.id : null;
          delete campos.professor;
        }
        const { data, error } = await supabase.from('drives').insert([campos]).select().single();
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- API: editar drive (PUT /api/drives/:id)
  if (req.method === 'PUT' && urlPath.startsWith('/api/drives/')) {
    const id = urlPath.split('/').pop();
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        delete campos.sala_id;

        // Resolve nome → professor_id se vier o campo "professor" (nome)
        if (campos.professor && !campos.professor_id) {
          const { data: prof } = await supabase
            .from('professores')
            .select('id')
            .eq('nome', campos.professor)
            .maybeSingle();
          campos.professor_id = prof ? prof.id : null;
          delete campos.professor;
        }

        let query = supabase
          .from('drives')
          .update(campos)
          .eq('id', id);

        query = restringirQueryASala(query, req);

        const { data, error } = await query
          .select('id')
          .maybeSingle();

        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }

        if (!data) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Drive não encontrado nesta sala' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- API: apagar drive (DELETE /api/drives/:id)
  if (req.method === 'DELETE' && urlPath.startsWith('/api/drives/')) {
    try {
      const id = urlPath.split('/').pop();

      let query = supabase
        .from('drives')
        .delete()
        .eq('id', id);

      query = restringirQueryASala(query, req);

      const { data, error } = await query
        .select('id')
        .maybeSingle();

      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }

      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Drive não encontrado nesta sala' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: editar/criar aula na grade (PUT /api/grade-aulas)
  // Upsert por (sala_id, dia_semana, posicao)
  if (req.method === 'PUT' && urlPath === '/api/grade-aulas') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        const { dia_semana, posicao, area } = campos;
        const sala_id = resolverSalaDaGravacao(req, campos.sala_id);
        let professor_id = campos.professor_id ?? null;

        if (sala_id === null) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Sala não autorizada' }));
        }

        // Resolve nome → professor_id se vier o campo "professor" (nome) sem o id
        if (campos.professor && !professor_id) {
          const { data: prof, error: erroProfessor } = await supabase
            .from('professores')
            .select('id')
            .eq('nome', campos.professor)
            .maybeSingle();

          if (erroProfessor) throw erroProfessor;
          professor_id = prof ? prof.id : null;
        }

        // Tenta atualizar na sala atual; se não existir, insere
        const { data: existing, error: erroBusca } = await supabase
          .from('grade_aulas')
          .select('id')
          .eq('sala_id', sala_id)
          .eq('dia_semana', dia_semana)
          .eq('posicao', posicao)
          .maybeSingle();

        if (erroBusca) throw erroBusca;

        let error;

        if (existing) {
          ({ error } = await supabase
            .from('grade_aulas')
            .update({ area, professor_id })
            .eq('id', existing.id));
        } else {
          ({ error } = await supabase
            .from('grade_aulas')
            .insert([{
              sala_id,
              dia_semana,
              posicao,
              area,
              professor_id,
            }]));
        }

        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- API: listar professores (GET /api/professores)
  if (req.method === 'GET' && urlPath === '/api/professores') {
    try {
      const { data, error } = await supabase
        .from('professores')
        .select('id, nome, ativo')
        .order('nome');
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data || []));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: criar professor (POST /api/professores)
  if (req.method === 'POST' && urlPath === '/api/professores') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        if (!campos.nome || !campos.nome.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Campo "nome" é obrigatório.' }));
        }
        const registro = { nome: campos.nome.trim(), ativo: campos.ativo !== false };
        const { data, error } = await supabase.from('professores').insert([registro]).select().single();
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- API: editar professor (PUT /api/professores/:id)
  if (req.method === 'PUT' && urlPath.startsWith('/api/professores/')) {
    const id = urlPath.split('/').pop();
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        const atualizacao = {};
        if (campos.nome  !== undefined) atualizacao.nome  = campos.nome.trim();
        if (campos.ativo !== undefined) atualizacao.ativo = campos.ativo;
        const { error } = await supabase.from('professores').update(atualizacao).eq('id', id);
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: error.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- API: apagar professor (DELETE /api/professores/:id)
  if (req.method === 'DELETE' && urlPath.startsWith('/api/professores/')) {
    try {
      const id = urlPath.split('/').pop();
      const { error } = await supabase.from('professores').delete().eq('id', id);
      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

    // Arquivos estáticos (HTML, CSS, JS)
  if (req.method === 'GET') {
    return servirArquivoEstatico(req, res);
  }

  // --- API: apagar atividade (DELETE /api/atividades/:id)
  if (req.method === 'DELETE' && urlPath.startsWith('/api/atividades/')) {
    try {
      const id = urlPath.split('/').pop();

      let queryAtividade = supabase
        .from('atividades')
        .select('id, area, tipo, data, local, descricao_titulo, sala_id')
        .eq('id', id);

      queryAtividade = restringirQueryASala(queryAtividade, req);

      const { data: atividade, error: erroAtividade } = await queryAtividade
        .maybeSingle();

      if (erroAtividade) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: erroAtividade.message }));
      }

      if (!atividade) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Atividade não encontrada nesta sala' }));
      }

      let atividadeAnunciada = false;

      try {
        atividadeAnunciada = await eventoFoiRegistrado(id, 'anuncio');
      } catch (erro) {
        console.error('[notificacoes] Falha ao consultar anúncio:', erro.message);
      }

      let query = supabase
        .from('atividades')
        .delete()
        .eq('id', id);

      query = restringirQueryASala(query, req);

      const { data, error } = await query
        .select('id')
        .maybeSingle();

      if (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }

      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Atividade não encontrada nesta sala' }));
      }

      try {
        await processarCancelamentoAtividade(atividade, atividadeAnunciada);
      } catch (erro) {
        console.error('[notificacoes] Falha ao avisar cancelamento:', erro.message);
      }

      await limparEventosDaAtividade(id);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: atualizar anexos de uma atividade (POST /api/atividades/:id/anexos)
  if (req.method === 'POST' && /^\/api\/atividades\/[^/]+\/anexos$/.test(urlPath)) {
    const id = urlPath.split('/')[3];

    let queryAtividade = supabase
      .from('atividades')
      .select('id')
      .eq('id', id);

    queryAtividade = restringirQueryASala(queryAtividade, req);

    const {
      data: atividadePermitida,
      error: erroAtividade,
    } = await queryAtividade.maybeSingle();

    if (erroAtividade) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: erroAtividade.message }));
    }

    if (!atividadePermitida) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Atividade não encontrada nesta sala' }));
    }

    const form = new IncomingForm({ multiples: true, keepExtensions: true, allowEmptyFiles: true, minFileSize: 0 });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      const get = v => Array.isArray(v) ? v[0] : v;
      let arquivosFinais = [];
      try { arquivosFinais = JSON.parse(get(fields['_anexos_existentes']) || '[]'); } catch(_) {}

      let lista = files['arquivo'];
      if (lista) {
        if (!Array.isArray(lista)) lista = [lista];
        for (const f of lista) {
          if (!f || !f.size || f.size <= 0) continue;
          const nomeOriginal = limparNomeArquivo(f.originalFilename || f.name || 'arquivo');
          const destino = `uploads/${Date.now()}-${nomeOriginal}`;
          let buffer;
          try { buffer = fs.readFileSync(f.filepath || f.path); }
          catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Erro lendo arquivo: ' + e.message }));
          }
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(destino, buffer, {
            contentType: f.mimetype || 'application/octet-stream', upsert: false,
          });
          if (upErr) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Erro upload: ' + upErr.message }));
          }
          arquivosFinais.push(destino);
        }
      }

      const { error: dbErr } = await supabase.from('atividades').update({
        arquivos: arquivosFinais,
        anexo: arquivosFinais.length > 0,
      }).eq('id', id);
      if (dbErr) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: dbErr.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // --- API: editar atividade (PUT /api/atividades/:id)
  if (req.method === 'PUT' && urlPath.startsWith('/api/atividades/')) {
    try {
      const id = urlPath.split('/').pop();
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const campos = JSON.parse(body);
          delete campos.sala_id;

          let queryAnterior = supabase
            .from('atividades')
            .select('id, area, tipo, data, local, descricao_titulo, sala_id')
            .eq('id', id);

          queryAnterior = restringirQueryASala(queryAnterior, req);

          const {
            data: atividadeAnterior,
            error: erroAtividadeAnterior,
          } = await queryAnterior.maybeSingle();

          if (erroAtividadeAnterior) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: erroAtividadeAnterior.message }));
          }

          if (!atividadeAnterior) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Atividade não encontrada nesta sala' }));
          }

          // Resolve nome → professor_id se vier o campo "professor" sem o id
          if (campos.professor && !campos.professor_id) {
            const { data: prof } = await supabase
              .from('professores')
              .select('id')
              .eq('nome', campos.professor)
              .maybeSingle();
            campos.professor_id = prof ? prof.id : null;
            delete campos.professor;
          }

          let query = supabase
            .from('atividades')
            .update(campos)
            .eq('id', id);

          query = restringirQueryASala(query, req);

          const { data, error } = await query
            .select('id, area, tipo, data, local, descricao_titulo, sala_id')
            .maybeSingle();

          if (error) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: error.message }));
          }

          if (!data) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Atividade não encontrada nesta sala' }));
          }

          try {
            await processarAlteracaoData(atividadeAnterior, data);
          } catch (erro) {
            console.error('[notificacoes] Falha ao avisar alteração de data:', erro.message);
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'JSON inválido: ' + e.message }));
        }
      });
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- POST: recebe formulário e grava no Supabase
  if (req.method === 'POST') {
    const form = new IncomingForm({
      multiples: true,
      keepExtensions: true,
      allowEmptyFiles: true,
      minFileSize: 0
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Erro no formulário: ' + err.message);
      }

      const get = (v) => (Array.isArray(v) ? v[0] : v);

      // Resolve professor: prioriza "professor-id" (id direto), senão busca pelo nome em "entrada-professor"
      let professor_id = null;
      const professorIdRaw = get(fields['professor-id'] || '');
      if (professorIdRaw) {
        professor_id = parseInt(professorIdRaw, 10) || null;
      } else {
        const professorNome = (get(fields['entrada-professor'] || '')).trim();
        if (professorNome) {
          const { data: profData } = await supabase
            .from('professores')
            .select('id')
            .eq('nome', professorNome)
            .maybeSingle();
          professor_id = profData ? profData.id : null;
        }
      }

      const salaIdPost = resolverSalaDaGravacao(
        req,
        get(fields['sala_id'] || '')
      );

      if (salaIdPost === null) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Sala não autorizada' }));
      }

      const novoRegistro = {
        area: MATERIAS[parseInt(get(fields['deslizador'] || '0'), 10)] || 'DESCONHECIDO',
        professor_id,
        tipo: get(fields['tipo'] || 'Tarefa'),
        data: converterDataBrParaIso(get(fields['dia']), get(fields['mes']), get(fields['ano'])),
        local: get(fields['chave-local']) === 'on' ? 'casa' : 'sala',
        descricao_titulo: get(fields['entrada-titulo'] || ''),
        descricao_detalhes: get(fields['entrada-detalhes'] || ''),
        anexo: false,
        arquivos: [],
        sala_id: salaIdPost,
      };

      let lista = files['arquivo'];
      if (lista) {
        if (!Array.isArray(lista)) lista = [lista];
        for (const f of lista) {
          if (!f || !f.size || f.size <= 0) continue;

          const caminhoTemp = f.filepath || f.path;
          const nomeOriginal = limparNomeArquivo(f.originalFilename || f.name || 'arquivo');
          const destino = `uploads/${Date.now()}-${nomeOriginal}`;

          let buffer;
          try {
            buffer = fs.readFileSync(caminhoTemp);
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Erro lendo arquivo temporário: ' + e.message);
          }

          const { error: upErr } = await supabase
            .storage
            .from(BUCKET)
            .upload(destino, buffer, {
              contentType: f.mimetype || 'application/octet-stream',
              upsert: false
            });

          if (upErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Erro upload: ' + upErr.message);
          }

          novoRegistro.anexo = true;
          novoRegistro.arquivos.push(destino);
        }
      }

      const { data: atividadeCriada, error: dbErr } = await supabase
        .from('atividades')
        .insert([novoRegistro])
        .select('id, area, tipo, data, local, descricao_titulo, sala_id')
        .single();

      if (dbErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Erro banco: ' + dbErr.message);
      }

      try {
        await processarPublicacaoAtividade(atividadeCriada);
      } catch (erro) {
        console.error('[notificacoes] Falha ao avisar publicação:', erro.message);
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <h1 style="font-family:sans-serif;color:#1d8b56;text-align:center;margin-top:20vh">
          Salvo no Supabase com arquivo!
        </h1>
        <script>setTimeout(() => location.href = '/', 1500)</script>
      `);
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Método não permitido');
});

server.listen(PORT, () => {
  console.log(`Servidor rodando → http://localhost:${PORT}`);

  if (notificacoesConfiguradas) {
    const inicioLembretes = setTimeout(processarLembretesAgendados, 5000);
    inicioLembretes.unref?.();

    const intervaloLembretes = setInterval(processarLembretesAgendados, 60 * 1000);
    intervaloLembretes.unref?.();
  } else {
    console.warn('[notificacoes] Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render.');
  }
});
