// Vendas do xMenu → estoque mínimo.
// Planilha importada uma vez (período informado) vira a base de venda média semanal.
// Mínimo = média semanal × (1 + (margem base + acréscimo por pessoa × pessoas reservadas na semana) / 100).
let vendasBase = null;                      // { de, ate, importadoEm, arquivo, itens: { codigo: { nome, qtd, valor } } }
let cfgMinimo = { margemBase: 20, porPessoa: 0.025 };
let _importVendas = null;                   // importação em andamento (pré-visualização)

// ---------- Leitura do arquivo (.xlsx sem biblioteca externa, ou .csv) ----------
async function _inflar(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function _lerZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let fim = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; } }
    if (fim < 0) throw new Error('zip');
    const n = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    const arquivos = {};
    for (let i = 0; i < n; i++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
        const nomeLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), comLen = dv.getUint16(p + 32, true);
        const local = dv.getUint32(p + 42, true);
        const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nomeLen));
        arquivos[nome] = { metodo, tam, local };
        p += 46 + nomeLen + extraLen + comLen;
    }
    const ler = async (nome) => {
        const f = arquivos[nome]; if (!f) return null;
        const ini = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
        const dados = u8.subarray(ini, ini + f.tam);
        const bytes = f.metodo === 0 ? dados : await _inflar(dados);
        return new TextDecoder('utf-8').decode(bytes);
    };
    return { nomes: Object.keys(arquivos), ler };
}

function _colIdx(ref) {
    let n = 0; const m = /^[A-Z]+/.exec(ref || '');
    if (!m) return 0;
    for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

async function lerXlsxLinhas(arquivo) {
    const zip = await _lerZip(await arquivo.arrayBuffer());
    const xml = t => new DOMParser().parseFromString(t, 'application/xml');
    const ss = [];
    const tSS = await zip.ler('xl/sharedStrings.xml');
    if (tSS) xml(tSS).querySelectorAll('si').forEach(si => ss.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent).join('')));
    const nomeSheet = zip.nomes.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!nomeSheet) throw new Error('sem planilha');
    const doc = xml(await zip.ler(nomeSheet));
    const linhas = [];
    doc.querySelectorAll('sheetData > row').forEach(row => {
        const l = [];
        row.querySelectorAll('c').forEach(c => {
            const tipo = c.getAttribute('t'), v = c.querySelector('v');
            let val = null;
            if (tipo === 'inlineStr') val = Array.from(c.querySelectorAll('t')).map(t => t.textContent).join('');
            else if (v) val = tipo === 's' ? (ss[parseInt(v.textContent, 10)] ?? '') : (tipo === 'str' || tipo === 'b' || tipo === 'e') ? v.textContent : Number(v.textContent);
            l[_colIdx(c.getAttribute('r'))] = val;
        });
        linhas.push(l);
    });
    return linhas;
}

function lerCsvLinhas(texto) {
    const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return texto.split(/\r?\n/).filter(l => l.trim()).map(l => {
        const out = []; let atual = '', asp = false;
        for (const ch of l) {
            if (ch === '"') asp = !asp;
            else if (ch === sep && !asp) { out.push(atual); atual = ''; }
            else atual += ch;
        }
        out.push(atual);
        return out;
    });
}

function _numero(v) {
    if (typeof v === 'number') return v;
    let s = String(v === null || v === undefined ? '' : v).replace(/R\$|\s| /g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s);
}

function _codigoNorm(c) { return String(c === null || c === undefined ? '' : c).trim().replace(/\./g, '').replace(/^0+(?=\d)/, ''); }

// Procura o cabeçalho (Código / Produto / Qtde / Valor) e devolve só as linhas de produto.
function extrairVendas(linhas) {
    let h = -1, col = {};
    for (let i = 0; i < Math.min(linhas.length, 30); i++) {
        const l = (linhas[i] || []).map(x => String(x === null || x === undefined ? '' : x).trim().toLowerCase());
        const c = l.findIndex(x => x === 'código' || x === 'codigo' || x === 'cód.' || x === 'cod');
        const q = l.findIndex(x => x === 'qtde' || x === 'qtd' || x === 'quantidade');
        if (c >= 0 && q >= 0) { h = i; col = { c, q, p: l.findIndex(x => x === 'produto' || x === 'descrição' || x === 'descricao'), v: l.findIndex(x => x === 'valor' || x === 'total') }; break; }
    }
    if (h < 0) return null;
    const itens = {};
    for (let i = h + 1; i < linhas.length; i++) {
        const l = linhas[i] || [];
        const cod = _codigoNorm(l[col.c]);
        const nome = col.p >= 0 ? String(l[col.p] === null || l[col.p] === undefined ? '' : l[col.p]).trim() : '';
        const qtd = _numero(l[col.q]);
        if (!/^\d+$/.test(cod) || !nome || isNaN(qtd)) continue;   // pula grupos, subgrupos e totais
        const valor = col.v >= 0 ? _numero(l[col.v]) : 0;
        if (itens[cod]) { itens[cod].qtd += qtd; itens[cod].valor += isNaN(valor) ? 0 : valor; }
        else itens[cod] = { nome, qtd, valor: isNaN(valor) ? 0 : valor };
    }
    return Object.keys(itens).length ? itens : null;
}

// ---------- Cálculo do estoque mínimo ----------
function _isoLocal(d) { return dataLocalISO(d); }

function semanaAtual() {
    const h = new Date(); h.setHours(12, 0, 0, 0);
    const dia = (h.getDay() + 6) % 7;                       // segunda = 0
    const ini = new Date(h); ini.setDate(h.getDate() - dia);
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    return { ini: _isoLocal(ini), fim: _isoLocal(fim), datas: Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return _isoLocal(d); }) };
}

function pessoasNaSemana() {
    return semanaAtual().datas.reduce((s, d) => s + (resumoReservasDia(d).pessoas || 0), 0);
}

function percentualMinimo() {
    const pessoas = pessoasNaSemana();
    const base = Number(cfgMinimo.margemBase), pp = Number(cfgMinimo.porPessoa);
    const pct = (isNaN(base) ? 20 : base) + (isNaN(pp) ? 0.025 : pp) * pessoas;
    return { pessoas, pct };
}

function _semanasDaBase() {
    if (!vendasBase || !vendasBase.de || !vendasBase.ate) return 0;
    const dias = Math.round((new Date(vendasBase.ate + 'T12:00:00') - new Date(vendasBase.de + 'T12:00:00')) / 86400000) + 1;
    return dias > 0 ? dias / 7 : 0;
}

function _itemDeVendas(p) {
    if (!vendasBase || !vendasBase.itens || !p || p.codigo === undefined || p.codigo === '') return null;
    return vendasBase.itens[_codigoNorm(p.codigo)] || null;
}

// Mínimo do produto na mesma unidade do estoque dele (fardos quando há fardo, senão unidades).
// Sem venda importada para o produto, vale o mínimo digitado no cadastro.
function minimoEfetivo(p) {
    const manual = Number(p && p.estoqueMinimo || 0);
    const semanas = _semanasDaBase();
    const it = _itemDeVendas(p);
    if (!it || !semanas || produtoUsaContagemFracionada(p)) return { valor: manual, origem: 'manual', emFardos: !!p && !produtoUsaContagemFracionada(p) && getTamFardoProduto(p) > 1 };
    const media = it.qtd / semanas;
    const { pessoas, pct } = percentualMinimo();
    const un = Math.ceil(media * (1 + pct / 100));
    const t = getTamFardoProduto(p);
    const emFardos = t > 1;
    return { valor: emFardos ? Math.ceil(un / t) : un, origem: 'vendas', media, pct, pessoas, un, emFardos };
}

function textoMinimo(p) {
    const m = minimoEfetivo(p);
    if (m.origem !== 'vendas') return '';
    const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return `Venda média ${fmt(m.media)} Un./sem. + ${fmt(m.pct)}% (${m.pessoas} pessoas na semana)`;
}

// ---------- Banco ----------
function iniciarListenersVendas() {
    escutar(db.ref('vendas_base'), 'vendas', s => {
        vendasBase = s.val() || null;
        agendarRender('vendas', _atualizarTelasVendas);
    });
    escutar(db.ref('config/estoqueMinimo'), 'config mínimo', s => {
        const v = s.val() || {};
        cfgMinimo = { margemBase: v.margemBase !== undefined ? Number(v.margemBase) : 20, porPessoa: v.porPessoa !== undefined ? Number(v.porPessoa) : 0.025 };
        agendarRender('vendas', _atualizarTelasVendas);
    });
}

function pararListenersVendas() {
    vendasBase = null;
    cfgMinimo = { margemBase: 20, porPessoa: 0.025 };
}

function _atualizarTelasVendas() {
    try {
        if (typeof atualizarBadges === 'function') atualizarBadges();
        if (typeof renderizarInicio === 'function') renderizarInicio();
        renderizarCardMinimo();
    } catch (e) { console.error(e); }
}

// ---------- Tela: card em Configurações ----------
function renderizarCardMinimo() {
    const box = document.getElementById('minimo-resumo');
    if (!box) return;
    const m = document.getElementById('cfg-min-base'), pp = document.getElementById('cfg-min-pessoa');
    if (m && document.activeElement !== m) m.value = String(cfgMinimo.margemBase).replace('.', ',');
    if (pp && document.activeElement !== pp) pp.value = String(cfgMinimo.porPessoa).replace('.', ',');
    const { pessoas, pct } = percentualMinimo();
    const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const sem = semanaAtual();
    const dd = iso => iso.split('-').reverse().slice(0, 2).join('/');
    document.getElementById('minimo-previa').textContent = `Semana ${dd(sem.ini)} a ${dd(sem.fim)}: ${pessoas} pessoa(s) reservada(s) → margem de ${fmt(pct)}% sobre a venda média.`;
    if (!vendasBase) { box.textContent = 'Nenhuma planilha de vendas importada ainda.'; document.getElementById('minimo-tabela').innerHTML = ''; return; }
    const dt = new Date(vendasBase.importadoEm || 0).toLocaleDateString('pt-BR');
    const n = Object.keys(vendasBase.itens || {}).length;
    const f = iso => iso.split('-').reverse().join('/');
    box.textContent = `Período: ${f(vendasBase.de)} a ${f(vendasBase.ate)} (${Math.round(_semanasDaBase() * 10) / 10} semanas) · ${n} produtos · importada em ${dt}`;
    const linhas = [];
    Object.keys(produtos).forEach(pk => {
        const p = produtos[pk]; const r = minimoEfetivo(p);
        if (r.origem !== 'vendas') return;
        linhas.push({ nome: p.nome, media: r.media, un: r.un, valor: r.valor, emFardos: r.emFardos });
    });
    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    document.getElementById('minimo-tabela').innerHTML = linhas.length
        ? `<table><thead><tr><th>Produto</th><th>Venda/sem.</th><th>Mínimo</th></tr></thead><tbody>${linhas.map(l => `<tr><td>${esc(l.nome)}</td><td style="text-align:center">${Math.round(l.media * 10) / 10}</td><td style="text-align:center">${l.valor} ${l.emFardos ? 'Fds' : 'Un.'}${l.emFardos ? ` <small style="color:var(--muted)">(${l.un} un.)</small>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="vazio">Nenhum produto cadastrado tem código igual ao da planilha.</p>';
}

function salvarCfgMinimo() {
    const base = _numero(document.getElementById('cfg-min-base').value);
    const pp = _numero(document.getElementById('cfg-min-pessoa').value);
    if (isNaN(base) || base < 0 || base > 500 || isNaN(pp) || pp < 0 || pp > 10) { alert('Confira os valores: margem entre 0 e 500 e acréscimo por pessoa entre 0 e 10.'); return; }
    db.ref('config/estoqueMinimo').set({ margemBase: base, porPessoa: pp })
        .then(() => showToast('Estoque mínimo atualizado.', 'success'))
        .catch(() => showToast('Não foi possível salvar. Confira a internet e se você é o dono.', 'error'));
}

// ---------- Importação ----------
async function escolherPlanilhaVendas(input) {
    const arq = input.files && input.files[0];
    input.value = '';
    if (!arq) return;
    try {
        const linhas = /\.csv$/i.test(arq.name) ? lerCsvLinhas(await arq.text()) : await lerXlsxLinhas(arq);
        const itens = extrairVendas(linhas);
        if (!itens) { alert('Não encontrei as colunas Código, Produto e Qtde nessa planilha. Use o relatório "Vendas período" do xMenu (.xlsx ou .csv).'); return; }
        _importVendas = { arquivo: arq.name, itens };
        abrirImportVendas();
    } catch (e) {
        console.error(e);
        alert('Não consegui ler esse arquivo. Use o .xlsx ou .csv exportado do xMenu (PDF não funciona).');
    }
}

function _casamento(itens) {
    const porCodigo = {};
    Object.keys(produtos).forEach(pk => { const p = produtos[pk]; if (p && p.codigo !== undefined && p.codigo !== '') porCodigo[_codigoNorm(p.codigo)] = p; });
    const ligados = [], sem = [];
    Object.keys(itens).forEach(c => (porCodigo[c] ? ligados : sem).push({ codigo: c, ...itens[c] }));
    return { ligados, sem };
}

function abrirImportVendas() {
    const { ligados, sem } = _casamento(_importVendas.itens);
    document.getElementById('imp-v-arquivo').textContent = _importVendas.arquivo;
    document.getElementById('imp-v-resumo').textContent = `${Object.keys(_importVendas.itens).length} produtos na planilha: ${ligados.length} ligados a produtos cadastrados, ${sem.length} sem produto com esse código.`;
    document.getElementById('imp-v-sem').innerHTML = sem.length ? '<strong>Sem cadastro (ficam guardados, mas não geram mínimo):</strong><br>' + sem.map(s => esc(s.codigo + ' · ' + s.nome)).join('<br>') : '';
    document.getElementById('imp-v-de').value = vendasBase ? vendasBase.de : '';
    document.getElementById('imp-v-ate').value = vendasBase ? vendasBase.ate : '';
    document.getElementById('imp-v-aviso').textContent = vendasBase ? 'Já existe uma planilha importada: esta vai substituir a anterior.' : '';
    document.getElementById('modalVendasImport').style.display = 'flex';
}

function fecharImportVendas() { document.getElementById('modalVendasImport').style.display = 'none'; _importVendas = null; }

function confirmarImportVendas() {
    if (!_importVendas) return;
    const de = document.getElementById('imp-v-de').value, ate = document.getElementById('imp-v-ate').value;
    if (!de || !ate || ate < de) { alert('Informe o período da planilha (de / até), com a data final igual ou depois da inicial.'); return; }
    const btn = document.getElementById('imp-v-ok');
    const liberar = travarBotao(btn, 'Salvando...');
    if (liberar === null) return;
    const dados = { de, ate, importadoEm: Date.now(), arquivo: _importVendas.arquivo, itens: _importVendas.itens };
    db.ref('vendas_base').set(dados).then(() => {
        liberar();
        showToast('Vendas importadas. O estoque mínimo já usa essa média.', 'success');
        fecharImportVendas();
    }).catch(e => {
        liberar();
        console.error(e);
        showToast('Não foi possível salvar. Confira a internet e se você é o dono.', 'error');
    });
}
