require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { IncomingForm } = require('formidable');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const RAIZ = __dirname;
const BUCKET = 'anexos';

// Conecta no Supabase com as variáveis de ambiente
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Matérias do seletor do formulário
const MATERIAS = ['MATEMÁTICA', 'ITINERÁRIO', 'LINGUAGENS', 'HUMANAS', 'NATUREZA'];

// Converte data do formulário (dd/mm/aaaa) para ISO (aaaa-mm-dd) antes de salvar
function converterDataBrParaIso(d, m, a) {
  if (!d || !m || !a) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

// Rotas de acesso restrito (bloqueadas para acesso direto)
const ROTAS_RESTRITAS = ['/assets/js/index.js'];

// Serve arquivos estáticos (HTML/CSS/JS) da pasta
function servirArquivoEstatico(req, res) {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0];

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
    res.writeHead(200, { 'Content-Type': obterMimeTypePorExtensao(ext) });
    res.end(content);
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
        const { username, senha } = JSON.parse(body);

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

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
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
        const { error } = await supabase.from('drives').update(campos).eq('id', id);
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

  // --- API: apagar drive (DELETE /api/drives/:id)
  if (req.method === 'DELETE' && urlPath.startsWith('/api/drives/')) {
    try {
      const id = urlPath.split('/').pop();
      const { error } = await supabase.from('drives').delete().eq('id', id);
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

  // --- API: editar/criar aula na grade (PUT /api/grade-aulas)
  // Upsert por (dia_semana, posicao)
  if (req.method === 'PUT' && urlPath === '/api/grade-aulas') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const campos = JSON.parse(body);
        const { dia_semana, posicao, area } = campos;
        let professor_id = campos.professor_id ?? null;

        // Resolve nome → professor_id se vier o campo "professor" (nome) sem o id
        if (campos.professor && !professor_id) {
          const { data: prof } = await supabase
            .from('professores')
            .select('id')
            .eq('nome', campos.professor)
            .maybeSingle();
          professor_id = prof ? prof.id : null;
        }

        // Tenta atualizar; se não existir, insere
        const { data: existing } = await supabase
          .from('grade_aulas')
          .select('id')
          .eq('dia_semana', dia_semana)
          .eq('posicao', posicao)
          .maybeSingle();
        let error;
        if (existing) {
          ({ error } = await supabase.from('grade_aulas').update({ area, professor_id }).eq('id', existing.id));
        } else {
          ({ error } = await supabase.from('grade_aulas').insert([{ dia_semana, posicao, area, professor_id }]));
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
      const { error } = await supabase
        .from('atividades')
        .delete()
        .eq('id', id);
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

  // --- API: atualizar anexos de uma atividade (POST /api/atividades/:id/anexos)
  if (req.method === 'POST' && /^\/api\/atividades\/[^/]+\/anexos$/.test(urlPath)) {
    const id = urlPath.split('/')[3];
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
          const { error } = await supabase
            .from('atividades')
            .update(campos)
            .eq('id', id);
          if (error) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: error.message }));
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

      const salaIdPost = get(fields['sala_id'] || '') || null;
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
        ...(salaIdPost ? { sala_id: parseInt(salaIdPost, 10) } : {})
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

      const { error: dbErr } = await supabase
        .from('atividades')
        .insert([novoRegistro]);

      if (dbErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Erro banco: ' + dbErr.message);
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
});