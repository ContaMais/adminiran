// =====================================================================
// CADASTROS: passo a passo, cadastro rápido e "Recomeçar do zero"
// =====================================================================

// ---------- Recomeçar do zero ----------
const NOS_PARA_APAGAR = ['produtos', 'categorias', 'metodos', 'areas', 'receitas', 'historico_timeline', 'cardapio', 'reservas', 'mapas'];
// Estes nós só podem ser apagados item por item (regras do Firebase)
const NOS_ITEM_A_ITEM = ['produtos', 'historico_timeline'];

function abrirRecomecarDoZero() {
    if (currentRole !== 'dono') { showToast("Apenas o dono pode fazer isso.", "error"); return; }
    document.getElementById('input-recomecar-frase').value = '';
    document.getElementById('input-recomecar-senha').value = '';
    document.getElementById('status-recomecar').textContent = '';
    document.getElementById('modalRecomecar').style.display = 'flex';
    setTimeout(() => document.getElementById('input-recomecar-frase').focus(), 50);
}

async function executarRecomecarDoZero() {
    if (currentRole !== 'dono' || !currentUser) return;
    const frase = document.getElementById('input-recomecar-frase').value.trim().toUpperCase();
    const senha = document.getElementById('input-recomecar-senha').value;
    const status = document.getElementById('status-recomecar');
    if (frase !== 'APAGAR TUDO') { status.textContent = 'Digite exatamente: APAGAR TUDO'; return; }
    if (!senha) { status.textContent = 'Digite sua senha.'; return; }

    const btn = document.getElementById('btn-recomecar-confirmar');
    const liberar = travarBotao(btn, 'Apagando...');
    if (liberar === null) return;
    try {
        status.textContent = 'Conferindo a senha...';
        const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, senha);
        await currentUser.reauthenticateWithCredential(cred);

        // 1) Backup completo, baixado no aparelho antes de apagar qualquer coisa
        status.textContent = 'Gerando backup...';
        const snaps = await Promise.all(NOS_PARA_APAGAR.map(n => db.ref(n).once('value')));
        const backup = { geradoEm: new Date().toISOString(), geradoPor: currentUser.email, dados: {} };
        NOS_PARA_APAGAR.forEach((n, i) => { backup.dados[n] = snaps[i].val(); });
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `backup-completo-adminiran-${dataLocalISO()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);

        // O navegador não avisa se o arquivo foi mesmo salvo: só apaga com a confirmação do dono.
        const salvou = await confirmar('O download do backup terminou e o arquivo está salvo neste aparelho?\n\nSó continue se estiver. Depois disso os dados são apagados.', { titulo: 'Backup salvo?', ok: 'Sim, apagar tudo', cancelar: 'Cancelar', perigo: true });
        if (!salvou) { status.textContent = 'Cancelado. Nada foi apagado.'; liberar(); return; }

        // 2) Apaga tudo numa gravação só
        status.textContent = 'Apagando...';
        const updates = {};
        NOS_PARA_APAGAR.forEach((n, i) => {
            if (NOS_ITEM_A_ITEM.includes(n)) {
                const val = snaps[i].val() || {};
                Object.keys(val).forEach(k => { updates[`${n}/${k}`] = null; });
            } else {
                updates[n] = null;
            }
        });
        if (Object.keys(updates).length) await db.ref().update(updates);

        liberar();
        document.getElementById('modalRecomecar').style.display = 'none';
        showToast("Tudo apagado. O backup foi baixado neste aparelho.", "success");
        abrirCadastros();
    } catch (e) {
        liberar();
        console.error(e);
        const code = e && e.code;
        status.textContent = (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')
            ? 'Senha incorreta. Nada foi apagado.'
            : code === 'PERMISSION_DENIED' || /permission/i.test(String(e && e.message))
                ? 'Sem permissão para apagar (seu cargo no banco precisa ser "dono"). Nada foi apagado.'
                : 'Erro: ' + (e && e.message ? e.message : e) + '. Confira a internet.';
    }
}

// ---------- Tela "Cadastros" (passo a passo) ----------
function abrirCadastros() {
    navegar('cadastros');
}

function passosCadastro() {
    const nAreas = areas.length;
    const nCats = Object.keys(categorias).length;
    const nMets = Object.keys(metodosCompra).length;
    const nProds = Object.keys(produtos).length;
    return [
        { n: 1, titulo: 'Áreas de estoque', desc: 'Onde as coisas ficam guardadas: câmara fria, bar, depósito...', qtd: nAreas, ok: nAreas > 0, icone: 'ph-map-pin',
          add: "cadastroRapido('area')", addTxt: 'Adicionar áreas', ver: "navegar('areas-lista')", itens: areas.map(a => a.nome) },
        { n: 2, titulo: 'Categorias', desc: 'Grupos de produtos (cervejas, destilados...). Definem fardo e em quais áreas ficam.', qtd: nCats, ok: nCats > 0, icone: 'ph-tag', bloq: nAreas === 0 ? 'Cadastre uma área antes.' : '',
          add: "cadastroRapido('categoria')", addTxt: 'Adicionar categoria', ver: "abrirConfigNoCard(1)", itens: Object.values(categorias).map(c => c.nome) },
        { n: 3, titulo: 'Métodos de compra', desc: 'De quem você compra (Atacadão, distribuidora...). Organiza a tela de Pedidos.', qtd: nMets, ok: nMets > 0, icone: 'ph-truck',
          add: "cadastroRapido('metodo')", addTxt: 'Adicionar métodos', ver: "abrirConfigNoCard(3)", itens: Object.values(metodosCompra).map(m => m.nome) },
        { n: 4, titulo: 'Produtos', desc: 'Cada item do estoque com preço, categoria, fornecedor e mínimo.', qtd: nProds, ok: nProds > 0, icone: 'ph-package',
          bloq: (nAreas === 0 || nCats === 0 || nMets === 0) ? 'Complete os passos 1 a 3 antes.' : '',
          add: 'abrirCadastroProduto()', addTxt: 'Cadastrar produto', ver: "navegar('produtos-categorias')", itens: Object.values(produtos).map(p => p && p.nome).filter(Boolean) }
    ];
}

function renderizarCadastros() {
    const box = document.getElementById('cadastros-passos');
    if (!box) return;
    if (!currentUser) { box.innerHTML = '<p class="vazio">Faça login para cadastrar.</p>'; return; }
    box.innerHTML = passosCadastro().map(p => {
        const amostra = p.itens.slice(0, 6).map(t => `<span class="tag-cinza">${esc(t)}</span>`).join('') + (p.itens.length > 6 ? `<span class="tag-cinza">+${p.itens.length - 6}</span>` : '');
        return `
        <div class="card passo ${p.ok ? 'feito' : ''} ${p.bloq ? 'bloqueado' : ''}">
            <div class="passo-topo">
                <span class="passo-num">${p.ok ? '<i class="ph ph-check"></i>' : p.n}</span>
                <div class="passo-txt"><h3>${p.titulo}</h3><p>${p.desc}</p></div>
                <span class="passo-qtd">${p.qtd}</span>
            </div>
            ${amostra ? `<div class="passo-amostra">${amostra}</div>` : ''}
            ${p.bloq ? `<p class="form-dica">${p.bloq}</p>` : ''}
            <div class="passo-acoes">
                ${p.qtd ? `<button class="btn-pill" onclick="${p.ver}">Ver e editar</button>` : ''}
                <button class="btn-pill dark" onclick="${p.add}" ${p.bloq ? 'disabled' : ''}><i class="ph ph-plus"></i> ${p.addTxt}</button>
            </div>
        </div>`;
    }).join('');
}

// Cartão "Comece por aqui" no Início (só para o dono, enquanto faltar algum passo)
function renderizarComeceAqui() {
    const box = document.getElementById('comece-aqui');
    if (!box) return;
    if (!currentUser || currentRole !== 'dono') { box.innerHTML = ''; return; }
    const passos = passosCadastro();
    const feitos = passos.filter(p => p.ok).length;
    if (feitos === passos.length) { box.innerHTML = ''; return; }
    const prox = passos.find(p => !p.ok);
    box.innerHTML = `
        <div class="card comece">
            <div class="comece-txt">
                <h3><i class="ph ph-rocket-launch"></i> Comece por aqui</h3>
                <p>${feitos} de ${passos.length} passos feitos. Próximo: <strong>${prox.titulo}</strong>.</p>
                <div class="comece-barra"><i style="width:${(feitos / passos.length) * 100}%"></i></div>
            </div>
            <div class="comece-acoes">
                <button class="btn-pill" onclick="abrirCadastros()">Ver passos</button>
                <button class="btn-pill dark" onclick="${prox.add}" ${prox.bloq ? 'disabled' : ''}><i class="ph ph-plus"></i> ${prox.addTxt}</button>
            </div>
        </div>`;
}

// Abre Configurações já com um card aberto (1 = categorias, 3 = métodos)
function abrirConfigNoCard(idx) {
    abrirConfig();
    setTimeout(() => {
        const cards = document.querySelectorAll('#configuracoes .config-card');
        const c = cards[idx];
        if (c && !c.classList.contains('open')) c.querySelector('.config-card-header').click();
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
}

// ---------- Cadastro rápido (sem sair da tela) ----------
let _cr = { tipo: '', ctx: '' };

function cadastroRapido(tipo, ctx = '') {
    if (currentRole !== 'dono') { showToast("Apenas o dono pode cadastrar.", "error"); return; }
    _cr = { tipo, ctx };
    const t = document.getElementById('cr-titulo'), sub = document.getElementById('cr-sub'), corpo = document.getElementById('cr-corpo');
    if (tipo === 'area') {
        t.textContent = 'Novas áreas';
        sub.textContent = 'Uma por linha. Ex.: Câmara Fria, Bar, Depósito.';
        corpo.innerHTML = `<textarea id="cr-nomes" rows="4" placeholder="Câmara Fria&#10;Bar"></textarea>`;
    } else if (tipo === 'metodo') {
        t.textContent = 'Novos métodos de compra';
        sub.textContent = 'Uma por linha. Ex.: Atacadão, Distribuidora Coca-Cola.';
        corpo.innerHTML = `<textarea id="cr-nomes" rows="4" placeholder="Atacadão&#10;Distribuidora"></textarea>`;
    } else if (tipo === 'categoria') {
        if (areas.length === 0) { showToast("Cadastre uma área antes da categoria.", "error"); cadastroRapido('area', ctx); return; }
        t.textContent = 'Nova categoria';
        sub.textContent = 'Você pode ajustar detalhes depois em Configurações.';
        corpo.innerHTML = `
            <label class="form-label">Nome <b>*</b></label>
            <input type="text" id="cr-cat-nome" placeholder="Ex.: Cervejas Lata" autocomplete="off">
            <label class="check-item" style="margin-top:8px;"><input type="checkbox" id="cr-cat-fardo" onchange="document.getElementById('cr-cat-fardo-wrap').style.display=this.checked?'block':'none'"> <span>Compra em fardo / caixa</span></label>
            <div id="cr-cat-fardo-wrap" style="display:none;"><input type="number" inputmode="numeric" id="cr-cat-fardo-qtd" placeholder="Unidades por fardo (ex.: 12)" min="2"></div>
            <label class="check-item"><input type="checkbox" id="cr-cat-frac"> <span>Contagem fracionada (ex.: 6,5 garrafas)</span></label>
            <label class="form-label" style="margin-top:8px;">Fica nas áreas <b>*</b></label>
            <div class="areas-check-list" style="max-height:180px; overflow:auto;">${areas.map(a => `<label class="check-item"><input type="checkbox" class="cr-cat-area" value="${esc(a.nome)}" checked> <span>${esc(a.nome)}</span></label>`).join('')}</div>`;
    }
    document.getElementById('modalCadastroRapido').style.display = 'flex';
    setTimeout(() => { const f = corpo.querySelector('input[type="text"], textarea'); if (f) f.focus(); }, 60);
}

function fecharCadastroRapido() {
    document.getElementById('modalCadastroRapido').style.display = 'none';
}

function nomesDasLinhas(txt) {
    const vistos = new Set();
    return String(txt || '').split(/\r?\n|;/).map(x => x.trim()).filter(x => {
        const k = x.toLowerCase();
        if (!x || vistos.has(k)) return false;
        vistos.add(k); return true;
    });
}

async function salvarCadastroRapido() {
    const btn = document.getElementById('cr-salvar');
    const liberar = travarBotao(btn, 'Salvando...');
    if (liberar === null) return;
    const cr = _cr; // este cadastro; se o usuário abrir outro durante a gravação, não mexemos nele
    try {
        if (cr.tipo === 'area') {
            const nomes = nomesDasLinhas(document.getElementById('cr-nomes').value);
            const r = await criarAreas(nomes);
            if (!r) { liberar(); return; }
            if (_cr === cr) marcarNovasAreasNoFormulario(nomes);
        } else if (cr.tipo === 'metodo') {
            const nomes = nomesDasLinhas(document.getElementById('cr-nomes').value);
            if (!nomes.length) { alert('Digite pelo menos um nome.'); liberar(); return; }
            const existentes = new Set(Object.values(metodosCompra).map(m => (m.nome || '').trim().toLowerCase()));
            const novos = nomes.filter(n => !existentes.has(n.toLowerCase()));
            const repetidos = nomes.length - novos.length;
            const updates = {};
            novos.forEach(n => { updates['metodos/' + db.ref('metodos').push().key] = { nome: n }; });
            if (novos.length) await db.ref().update(updates);
            showToast(`${novos.length} método(s) criado(s)${repetidos ? `, ${repetidos} já existia(m)` : ''}.`, "success");
            // Seleciona no formulário de produto o primeiro criado
            if (cr.ctx && novos[0]) document.getElementById(cr.ctx === 'novo' ? 'prod-metodo-selecionado' : 'edit-prod-metodo-selecionado').value = novos[0];
        } else if (cr.tipo === 'categoria') {
            const nome = document.getElementById('cr-cat-nome').value.trim();
            const usaFardo = document.getElementById('cr-cat-fardo').checked;
            const qtd = parseInt(document.getElementById('cr-cat-fardo-qtd').value) || 0;
            const sel = Array.from(document.querySelectorAll('.cr-cat-area:checked')).map(i => i.value);
            if (!nome) { alert('Digite o nome da categoria.'); liberar(); return; }
            if (usaFardo && qtd < 2) { alert('Informe quantas unidades vêm no fardo (2 ou mais).'); liberar(); return; }
            if (!sel.length) { alert('Marque pelo menos uma área.'); liberar(); return; }
            if (Object.values(categorias).some(c => (c.nome || '').trim().toLowerCase() === nome.toLowerCase())) { alert('Já existe uma categoria com esse nome.'); liberar(); return; }
            const ref = db.ref('categorias').push();
            await ref.set({ nome, areas: sel, unidadesFardo: usaFardo ? qtd : 1, subgrupos: [], contagemFracionada: document.getElementById('cr-cat-frac').checked });
            showToast("Categoria criada!", "success");
            if (cr.ctx) {
                // Seleciona a nova categoria no formulário assim que ela chegar do banco
                const ctx = cr.ctx;
                esperarAte(() => categorias[ref.key]).then(ok => {
                    const lista = ctx === 'novo' ? catsNovo : catsEdit;
                    if (ok && !lista.includes(nome)) togglePreset(ref.key, ctx);
                });
            }
        }
        liberar();
        if (_cr === cr) fecharCadastroRapido();
        agendarRender('cadastros', () => { renderizarCadastros(); renderizarComeceAqui(); renderizarPresets(); renderizarPresetsMetodos(); });
    } catch (e) {
        liberar();
        console.error(e);
        showToast("Erro ao salvar. Confira a internet.", "error");
    }
}

// Cria várias áreas de uma vez. Devolve false se nada foi criado.
async function criarAreas(nomes) {
    if (!nomes.length) { alert('Digite pelo menos um nome.'); return false; }
    const invalidos = nomes.filter(n => nomeAreaInvalido(n) || n === '_Pendente_');
    if (invalidos.length) { alert(`Nome inválido: ${invalidos.join(', ')}\nNão use os caracteres . # $ [ ] /`); return false; }
    const existentes = new Set(areas.map(a => (a.nome || '').trim().toLowerCase()));
    const novos = nomes.filter(n => !existentes.has(n.toLowerCase()));
    const repetidos = nomes.length - novos.length;
    if (!novos.length) { alert('Essas áreas já existem.'); return false; }
    const updates = {};
    novos.forEach(n => { updates['areas/' + db.ref('areas').push().key] = { nome: n, config: { usaPadrao: false, padroes: {} } }; });
    await db.ref().update(updates);
    showToast(`${novos.length} área(s) criada(s)${repetidos ? `, ${repetidos} já existia(m)` : ''}.`, "success");
    return true;
}

// Depois de criar áreas pelo formulário de produto, já deixa marcadas
function marcarNovasAreasNoFormulario(nomes) {
    if (!_cr.ctx) return;
    const alvo = _cr.ctx === 'novo' ? 'checks-areas' : 'edit-checks-areas';
    const chave = new Set(nomes.map(n => n.toLowerCase()));
    esperarAte(() => areas.some(a => chave.has((a.nome || '').toLowerCase()))).then(() => {
        const box = document.getElementById(alvo);
        if (!box) return;
        const marcados = new Set(Array.from(box.querySelectorAll('input:checked')).map(i => i.value));
        nomes.forEach(n => marcados.add(n));
        box.innerHTML = areas.map(a => `<label class="check-item"><input type="checkbox" value="${esc(a.nome)}" ${marcados.has(a.nome) ? 'checked' : ''}> <span>${esc(a.nome)}</span></label>`).join('');
    });
}

// Espera (até ~4s) os dados recém-gravados chegarem pelo listener
function esperarAte(cond, limite = 4000) {
    return new Promise(res => {
        const t0 = Date.now();
        (function checar() {
            let ok = false; try { ok = !!cond(); } catch (e) {}
            if (ok) return res(true);
            if (Date.now() - t0 > limite) return res(false);
            setTimeout(checar, 120);
        })();
    });
}

// ---------- Utilidades dos formulários ----------
function passoCampo(id, d) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = Math.max(0, (Number(String(el.value).replace(',', '.')) || 0) + d);
}

function voltarDoCadastroProduto() {
    const t = history.state && history.state.tela;
    if ((t === 'novo-produto' || t === 'editar-produto') && history.length > 1) history.back();
    else navegar('cadastros');
}

// Converte "5,50", "R$ 5.50", "1.234,56" em número
function lerPreco(txt) {
    let s = String(txt || '').replace(/[R$\s]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
}

function precoParaCampo(v) {
    const n = Number(v);
    return n ? n.toFixed(2).replace('.', ',') : '';
}

// Chamado pelos listeners do Firebase quando áreas/categorias/métodos/produtos mudam
function atualizarPainelCadastros() {
    if (typeof telaAtiva === 'function' && telaAtiva('cadastros')) renderizarCadastros();
    if (typeof telaAtiva === 'function' && telaAtiva('inicio')) renderizarComeceAqui();
    const imp = document.getElementById('modalImportar');
    if (imp && imp.style.display === 'flex') preencherOpcoesImportar();
}

// ---------- Importar vários produtos ----------
// Lista do relatório de vendas do último ano (bebidas: cervejas e refrigerantes)
const LISTA_VENDAS = {
    'Cervejas': ['Amstel 600ml', 'Amstel Sem Glúten Long Neck', 'Baden Cristal 600ml', 'Baden Gold 600ml', 'Baden IPA 600ml', 'Baden Peach 600ml',
        'Baden Witbier 600ml', 'Blue Moon 355ml', 'Eisenbahn Pilsen 600ml', 'Heineken 600ml', 'Heineken Long Neck 330ml',
        'Heineken Long Neck Ultimate 330ml', 'Heineken Zero 330ml', 'Lagunitas IPA', 'Praya Lager 330ml', 'Smirnoff Ice Long Neck'],
    'Refrigerantes': ['Água com Gás 300ml', 'Água sem Gás 300ml', 'Água de Coco', 'Citrus Lata 350ml', 'Coca-Cola Lata 350ml', 'Coca-Cola 2L',
        'Coca-Cola Zero 350ml', 'Coca-Cola Zero 2L', 'Fanta Laranja 350ml', 'Fanta Uva 350ml', 'Guaraná Lata 350ml', 'Guaraná 2L',
        'Guaraná Zero Lata 350ml', 'Guaraná Zero 2L', 'H2OH Limão 500ml', 'H2OH Limoneto 500ml', 'Sprite Lata', 'Tônica Lata 350ml',
        'Tônica Zero Lata 350ml', 'Red Bull Lata 250ml', 'Energético Monster']
};

function abrirImportar() {
    if (currentRole !== 'dono') { showToast("Apenas o dono pode cadastrar.", "error"); return; }
    document.getElementById('imp-linhas').value = '';
    preencherOpcoesImportar();
    document.getElementById('modalImportar').style.display = 'flex';
}

function fecharImportar() { document.getElementById('modalImportar').style.display = 'none'; }

function carregarListaVendas() {
    document.getElementById('imp-linhas').value = Object.entries(LISTA_VENDAS)
        .map(([cat, itens]) => itens.map(n => `${cat}; ${n}`).join('\n')).join('\n');
    atualizarResumoImportar();
}

// Mantém método/áreas atualizados (também quando cria um novo pelo "+")
function preencherOpcoesImportar() {
    const sel = document.getElementById('imp-metodo'); if (!sel) return;
    const atual = sel.value;
    const nomes = Object.values(metodosCompra).map(m => m.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    sel.innerHTML = '<option value="">Escolha...</option>' + nomes.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (nomes.includes(atual)) sel.value = atual; else if (nomes.length === 1) sel.value = nomes[0];
    const box = document.getElementById('imp-areas');
    const marcados = new Set(Array.from(box.querySelectorAll('input:checked')).map(i => i.value));
    const primeira = !box.querySelector('input');
    box.innerHTML = areas.length
        ? areas.map(a => `<label class="check-item"><input type="checkbox" value="${esc(a.nome)}" onchange="atualizarResumoImportar()" ${(primeira || marcados.has(a.nome)) ? 'checked' : ''}> <span>${esc(a.nome)}</span></label>`).join('')
        : '<span class="form-dica">Nenhuma área ainda. Toque em "+ Nova área".</span>';
    atualizarResumoImportar();
}

function lerLinhasImportar() {
    const vistos = new Set();
    return document.getElementById('imp-linhas').value.split(/\r?\n/).map(l => {
        const i = l.indexOf(';');
        if (i < 0) return null;
        const cat = l.slice(0, i).trim(), nome = l.slice(i + 1).trim();
        if (!cat || !nome) return null;
        const k = nome.toLowerCase();
        if (vistos.has(k)) return null;
        vistos.add(k);
        return { cat, nome };
    }).filter(Boolean);
}

function planoImportar() {
    const linhas = lerLinhasImportar();
    const existentes = new Set(Object.values(produtos).map(p => p && (p.nome || '').trim().toLowerCase()));
    const novos = linhas.filter(l => !existentes.has(l.nome.toLowerCase()));
    const catsExist = {};
    Object.keys(categorias).forEach(k => { catsExist[(categorias[k].nome || '').trim().toLowerCase()] = k; });
    const vistasCat = new Map();
    novos.forEach(l => { const k = l.cat.toLowerCase(); if (!catsExist[k] && !vistasCat.has(k)) vistasCat.set(k, l.cat); });
    const catsNovas = [...vistasCat.values()];
    return { linhas, novos, pulados: linhas.length - novos.length, catsExist, catsNovas };
}

function atualizarResumoImportar() {
    const el = document.getElementById('imp-resumo'); if (!el) return;
    const p = planoImportar();
    if (!p.linhas.length) { el.textContent = ''; return; }
    el.textContent = `${p.novos.length} produto(s) novo(s)` + (p.pulados ? `, ${p.pulados} já existe(m)` : '') +
        (p.catsNovas.length ? `. Categorias novas: ${p.catsNovas.join(', ')}.` : '.');
}

async function executarImportar() {
    if (currentRole !== 'dono') return;
    const p = planoImportar();
    const met = document.getElementById('imp-metodo').value;
    const areasSel = Array.from(document.querySelectorAll('#imp-areas input:checked')).map(i => i.value);
    if (!p.linhas.length) { alert('Cole a lista ou toque em "Usar a lista de vendas".'); return; }
    if (!p.novos.length) { alert('Todos esses produtos já estão cadastrados.'); return; }
    if (!met) { alert('Escolha o método de compra (ou crie um em "+ Novo método").'); return; }
    if (p.catsNovas.length && !areasSel.length) { alert('Marque pelo menos uma área.'); return; }
    const invalida = p.catsNovas.find(c => /[.#$\[\]\/]/.test(c));
    if (invalida) { alert(`Nome de categoria inválido: ${invalida}`); return; }

    const btn = document.getElementById('imp-salvar');
    const liberar = travarBotao(btn, 'Importando...');
    if (liberar === null) return;
    try {
        const updates = {};
        const catInfo = {}; // nome em minúsculas -> { nome, areas, fardo }
        Object.entries(p.catsExist).forEach(([k, key]) => {
            const c = categorias[key];
            catInfo[k] = { nome: c.nome, areas: (c.areas && c.areas.length) ? c.areas : areasSel, fardo: Number(c.unidadesFardo) || 1 };
        });
        p.catsNovas.forEach(c => {
            updates['categorias/' + db.ref('categorias').push().key] = { nome: c, areas: areasSel, unidadesFardo: 1, subgrupos: [], contagemFracionada: false };
            catInfo[c.toLowerCase()] = { nome: c, areas: areasSel, fardo: 1 };
        });
        p.novos.forEach(l => {
            const c = catInfo[l.cat.toLowerCase()];
            const locais = c.areas.filter(a => areas.some(x => x.nome === a));
            const usar = locais.length ? locais : areasSel;
            const estoque = {}; usar.forEach(a => { estoque[a] = { f: 0, u: 0 }; });
            updates['produtos/' + db.ref('produtos').push().key] = {
                nome: l.nome, precoCusto: 0, categorias: [c.nome], metodoCompra: met,
                estoqueMinimo: 0, locais: usar, estoque, itemProduzido: false
            };
        });
        await db.ref().update(updates);
        liberar();
        fecharImportar();
        showToast(`${p.novos.length} produto(s) importado(s)!`, "success");
    } catch (e) {
        liberar();
        console.error(e);
        showToast("Erro ao importar. Nada foi gravado. Confira a internet.", "error");
    }
}

// =====================================================================
// RESTAURAR BACKUP
// =====================================================================
async function restaurarBackup(ev) {
    const input = ev.target;
    const arq = input.files && input.files[0];
    input.value = '';
    const status = document.getElementById('status-restaurar');
    if (!arq) return;
    if (currentRole !== 'dono') { showToast("Apenas o dono pode restaurar.", "error"); return; }
    if (arq.size > 50 * 1024 * 1024) { status.textContent = 'Arquivo grande demais (máx. 50 MB).'; return; }
    try {
        const bruto = JSON.parse(await arq.text());
        const dados = bruto && bruto.dados;
        if (!dados || typeof dados !== 'object') throw new Error('formato');
        const nos = NOS_PARA_APAGAR.filter(n => dados[n] && typeof dados[n] === 'object' && Object.keys(dados[n]).length);
        if (!nos.length) { status.textContent = 'Este backup está vazio.'; return; }
        const resumo = nos.map(n => `${n}: ${Object.keys(dados[n]).length}`).join('\n');
        const ok = await confirmar(`Gravar de volta os dados do backup${bruto.geradoEm ? ' de ' + new Date(bruto.geradoEm).toLocaleString('pt-BR') : ''}?\n\n${resumo}`, { titulo: 'Restaurar backup', ok: 'Restaurar' });
        if (!ok) return;
        const btn = document.getElementById('btn-restaurar-backup');
        const liberar = travarBotao(btn, 'Restaurando...');
        if (liberar === null) return;
        try {
            const cats = dados.categorias || {};
            const ruins = Object.keys(cats).filter(k => !cats[k] || typeof cats[k].nome !== 'string' || !cats[k].nome.trim());
            if (ruins.length) { liberar(); status.textContent = 'Backup recusado: ' + ruins.length + ' categoria(s) sem nome válido. Nada foi gravado.'; return; }
            const updates = {};
            nos.forEach(n => Object.keys(dados[n]).forEach(k => { updates[`${n}/${k}`] = dados[n][k]; }));
            await db.ref().update(updates);
            liberar();
            status.textContent = 'Backup restaurado.';
            showToast("Backup restaurado!", "success");
        } catch (e) {
            liberar();
            console.error(e);
            status.textContent = 'Não foi possível gravar (confira a internet e se você é o dono).';
        }
    } catch (e) {
        status.textContent = 'Arquivo inválido. Use um backup gerado pelo app (.json).';
    }
}
