// =====================================================================
// PAINEL (layout novo): menu lateral, busca global, tela de Início
// =====================================================================

// ---------- Menu lateral no celular (gaveta) ----------
function abrirMenuLateral() {
    document.body.classList.add('menu-aberto');
}
function fecharMenuLateral() {
    document.body.classList.remove('menu-aberto');
}

// Os pop-ups (modais) ficam fora do painel com vidro: elementos com "backdrop-filter"
// prendem os filhos com position:fixed dentro deles, e o pop-up abriria cortado.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => document.body.appendChild(m));
    renderizarInicio();
});

// ---------- Atalhos de teclado (computador) ----------
document.addEventListener('keydown', (e) => {
    const alvo = e.target;
    const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
    if (e.key === '/' && !digitando) {
        e.preventDefault();
        const b = document.getElementById('busca-global');
        if (b) b.focus();
    }
    if (e.key === 'Escape') {
        fecharMenuLateral();
        fecharBuscaGlobal();
        fecharBuscaMobile();
        const opts = document.getElementById('fabOptions');
        if (opts && opts.classList.contains('active')) toggleFab();
    }
});

// ---------- Busca global ----------
let _resultadosBusca = [];
let _idxBusca = -1;

function fecharBuscaGlobal() {
    const box = document.getElementById('busca-global-resultados');
    if (box) { box.classList.remove('aberta'); box.innerHTML = ''; }
    _resultadosBusca = []; _idxBusca = -1;
}

function buscarGlobal() {
    const inp = document.getElementById('busca-global');
    const box = document.getElementById('busca-global-resultados');
    if (!inp || !box) return;
    const termo = normalizarBusca(inp.value);
    if (termo.length < 2) { fecharBuscaGlobal(); return; }
    if (!currentUser) {
        box.innerHTML = `<div class="sr-vazio">Faça login para buscar.</div>`;
        box.classList.add('aberta');
        return;
    }
    const achou = (txt) => normalizarBusca(txt).includes(termo);
    const res = [];

    Object.keys(produtos).forEach(pk => {
        const p = produtos[pk];
        if (p && achou(p.nome)) res.push({ tipo: 'Produto', icone: 'ph-package', titulo: p.nome, sub: getCategoriaPrincipalProduto(p), acao: () => verDetalhesProduto(pk) });
    });
    areas.forEach(a => {
        if (achou(a.nome)) res.push({ tipo: 'Área', icone: 'ph-map-pin', titulo: a.nome, sub: 'Estoque da área', acao: () => verArea(a.key, a.nome) });
    });
    Object.keys(receitasDB).forEach(k => {
        const r = receitasDB[k];
        if (r && achou(r.nome)) res.push({ tipo: 'Receita', icone: 'ph-martini', titulo: r.nome, sub: 'Receita', acao: () => verDetalhesReceita(k) });
    });
    const hoje = dataLocalISO();
    Object.keys(reservasApp).filter(d => d >= hoje).sort().forEach(d => {
        const lista = reservasApp[d] || {};
        Object.keys(lista).forEach(k => {
            const r = lista[k];
            if (r && achou(r.nome)) {
                const [y, m, dd] = d.split('-');
                res.push({ tipo: 'Reserva', icone: 'ph-calendar-check', titulo: r.nome, sub: `${dd}/${m}/${y} · ${r.area || ''} · ${r.lugares || 0} lug.`, acao: () => abrirDia(d, new Date(d + 'T12:00:00').getDay()) });
            }
        });
    });

    _resultadosBusca = res.slice(0, 12);
    _idxBusca = _resultadosBusca.length ? 0 : -1;
    desenharResultadosBusca(res.length);
}

function desenharResultadosBusca(total) {
    const box = document.getElementById('busca-global-resultados');
    if (!box) return;
    if (_resultadosBusca.length === 0) {
        box.innerHTML = `<div class="sr-vazio">Nada encontrado.</div>`;
    } else {
        box.innerHTML = _resultadosBusca.map((r, i) => `
            <button class="sr-item ${i === _idxBusca ? 'sel' : ''}" onmousedown="event.preventDefault()" onclick="escolherResultadoBusca(${i})">
                <span class="sr-ico"><i class="ph ${r.icone}"></i></span>
                <span class="sr-txt"><strong>${esc(r.titulo)}</strong><small>${esc(r.tipo)} · ${esc(r.sub || '')}</small></span>
            </button>`).join('') + (total > _resultadosBusca.length ? `<div class="sr-vazio">Mostrando ${_resultadosBusca.length} de ${total}. Digite mais para filtrar.</div>` : '');
    }
    box.classList.add('aberta');
}

function escolherResultadoBusca(i) {
    const r = _resultadosBusca[i];
    if (!r) return;
    const inp = document.getElementById('busca-global');
    if (inp) { inp.value = ''; inp.blur(); }
    fecharBuscaGlobal();
    fecharBuscaMobile();
    r.acao();
}

function teclaBuscaGlobal(e) {
    if (!_resultadosBusca.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _idxBusca = (_idxBusca + 1) % _resultadosBusca.length; desenharResultadosBusca(_resultadosBusca.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _idxBusca = (_idxBusca - 1 + _resultadosBusca.length) % _resultadosBusca.length; desenharResultadosBusca(_resultadosBusca.length); }
    else if (e.key === 'Enter') { e.preventDefault(); escolherResultadoBusca(Math.max(0, _idxBusca)); }
}

document.addEventListener('click', (e) => {
    const area = document.querySelector('.search-global');
    if (area && !area.contains(e.target)) { fecharBuscaGlobal(); fecharBuscaMobile(); }
});

// Celular: a busca fica só na lupa e abre ocupando a barra superior
function abrirBuscaMobile() {
    document.body.classList.add('busca-aberta');
    const inp = document.getElementById('busca-global');
    if (inp) setTimeout(() => inp.focus(), 30);
}
function fecharBuscaMobile() {
    if (!document.body.classList.contains('busca-aberta')) return;
    document.body.classList.remove('busca-aberta');
    const inp = document.getElementById('busca-global');
    if (inp) { inp.value = ''; inp.blur(); }
    fecharBuscaGlobal();
}

// Barra inferior: a pílula desliza até a aba ativa
function moverIndicadorTabbar(animar = true) {
    const ind = document.getElementById('tab-ind');
    const bar = document.getElementById('tabbar');
    if (!ind || !bar) return;
    const ativo = bar.querySelector('.tab-btn.active');
    if (!ativo || !ativo.offsetWidth) { ind.style.opacity = '0'; return; }
    if (!animar) ind.style.transition = 'none';
    ind.style.width = ativo.offsetWidth + 'px';
    ind.style.transform = `translateX(${ativo.offsetLeft - 6}px)`;
    ind.style.opacity = '1';
    if (!animar) { ind.offsetWidth; ind.style.transition = ''; }
}
window.addEventListener('resize', () => moverIndicadorTabbar(false));
document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => moverIndicadorTabbar(false)));

// ---------- Cálculos usados no Início e nos contadores do menu ----------
function produtosAbaixoDoMinimo() {
    const lista = [];
    Object.keys(produtos).forEach(pk => {
        const p = produtos[pk];
        if (!p) return;
        const m = Number(p.estoqueMinimo || 0);
        if (m <= 0) return;
        const frac = produtoUsaContagemFracionada(p);
        const t = getTamFardoProduto(p);
        const pend = (p.estoque && p.estoque['_Pendente_']) || { f: 0, u: 0 };
        const totalUn = getUnidadesTotaisEstoque(p) + parseQtdValor(pend.f, frac) * t + parseQtdValor(pend.u, frac);
        const atual = (t > 1 && !frac) ? totalUn / t : totalUn;
        if (atual < m) lista.push(pk);
    });
    return lista;
}

function qtdPendentesPatio() {
    let n = 0;
    Object.keys(produtos).forEach(pk => {
        const p = produtos[pk];
        const pend = p && p.estoque && p.estoque['_Pendente_'];
        if (pend && (Number(pend.f) > 0 || Number(pend.u) > 0)) n++;
    });
    return n;
}

function resumoReservasDia(dataStr) {
    const lista = reservasApp[dataStr] || {};
    let qtd = 0, pessoas = 0;
    Object.keys(lista).forEach(k => {
        const r = lista[k];
        if (!r) return;
        qtd++;
        const isUnidade = String(r.area || '').includes('Redondas') || String(r.area || '').includes('Bistrôs');
        if (!isUnidade) pessoas += parseInt(r.lugares) || 0;
    });
    return { qtd, pessoas };
}

function valorEstoquePorArea() {
    const porArea = {};
    let total = 0;
    areas.forEach(a => { if (a.nome) porArea[a.nome] = 0; });
    Object.keys(produtos).forEach(pk => {
        const p = produtos[pk];
        if (!p || !p.estoque) return;
        const preco = getPrecoPorUnidadeBase(p);
        const frac = produtoUsaContagemFracionada(p);
        const t = getTamFardoProduto(p);
        Object.keys(p.estoque).forEach(loc => {
            if (porArea[loc] === undefined) return;
            const v = p.estoque[loc];
            if (!v || typeof v !== 'object') return;
            const val = (parseQtdValor(v.f, frac) * t + parseQtdValor(v.u, frac)) * preco;
            porArea[loc] += val; total += val;
        });
    });
    return { porArea, total };
}

function definirBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    el.style.display = n > 0 ? '' : 'none';
}

function atualizarBadges() {
    if (!currentUser) { ['badge-pendentes', 'badge-pedidos', 'badge-reservas'].forEach(id => definirBadge(id, 0)); return; }
    definirBadge('badge-pendentes', currentRole === 'visualizador' ? 0 : qtdPendentesPatio());
    definirBadge('badge-pedidos', produtosAbaixoDoMinimo().length);
    definirBadge('badge-reservas', resumoReservasDia(dataLocalISO()).qtd);
}

// ---------- Tela de Início ----------
let periodoGrafico = 7;

function mudarPeriodoGrafico(dias, btn) {
    periodoGrafico = dias;
    if (btn) btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    renderizarInicio();
}

function abrirNovaReservaHoje() {
    const hoje = new Date();
    if (hoje.getDay() === 1) { showToast("Segunda-feira o bar está fechado. Escolha um dia na agenda.", "error"); irParaAgenda(); return; }
    abrirDia(dataLocalISO(hoje), hoje.getDay());
    setTimeout(() => { const n = document.getElementById('res-nome'); if (n) n.focus(); }, 50);
}

function irParaPendentes() {
    navegar('areas-lista');
    abrirAlocacaoModal();
}

function abrirReservasHoje() {
    const hoje = new Date();
    if (hoje.getDay() === 1) { irParaAgenda(); return; }
    abrirDia(dataLocalISO(hoje), hoje.getDay());
}

function abrirPedidosAbaixoMinimo() {
    navegar('pedidos-metodos');
}

function renderizarInicio() {
    const sec = document.getElementById('inicio');
    if (!sec) return;
    if (typeof renderizarComeceAqui === 'function') renderizarComeceAqui();
    const agora = new Date();
    const h = agora.getHours();
    const saud = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const primeiroNome = currentUser ? String(currentUserName || '').split(/\s+/)[0] : '';
    const elSaud = document.getElementById('saudacao');
    if (elSaud) elSaud.textContent = primeiroNome ? `${saud}, ${primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1)}` : `${saud}!`;

    const dataTxt = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const abaixo = currentUser ? produtosAbaixoDoMinimo() : [];
    const pend = currentUser && currentRole !== 'visualizador' ? qtdPendentesPatio() : 0;
    const hojeRes = resumoReservasDia(dataLocalISO(agora));
    const atencao = (abaixo.length ? 1 : 0) + (pend ? 1 : 0);
    const elSub = document.getElementById('saudacao-sub');
    if (elSub) {
        const d = dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1);
        elSub.textContent = !currentUser ? `${d} · faça login para ver o painel`
            : atencao ? `${d} · ${atencao} ${atencao === 1 ? 'coisa precisa' : 'coisas precisam'} da sua atenção`
            : `${d} · tudo em ordem por aqui`;
    }

    // ---- Gráfico de reservas (próximos dias) ----
    const chart = document.getElementById('chart-reservas');
    if (chart) {
        const dias = [];
        for (let i = 0; i < periodoGrafico; i++) {
            const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
            const iso = dataLocalISO(d);
            const r = resumoReservasDia(iso);
            dias.push({ iso, d, pessoas: r.pessoas, qtd: r.qtd, fechado: d.getDay() === 1 });
        }
        chart.classList.toggle('denso', periodoGrafico > 7 && window.innerWidth < 700);
        const tit = document.getElementById('chart-reservas-titulo');
        if (tit) tit.textContent = periodoGrafico > 7 ? `Reservas dos próximos ${periodoGrafico} dias` : 'Reservas da semana';
        const max = Math.max(10, ...dias.map(x => x.pessoas));
        const passo = max <= 20 ? 5 : max <= 60 ? 15 : max <= 120 ? 30 : Math.ceil(max / 4 / 10) * 10;
        const topo = Math.ceil(max / passo) * passo;
        const linhas = [];
        for (let v = topo; v >= 0; v -= passo) linhas.push(v);
        const nomesDia = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        chart.innerHTML = `
            <div class="bc-y">${linhas.map(v => `<span>${v}</span>`).join('')}</div>
            <div class="bc-area">
                <div class="bc-grid">${linhas.map(() => '<i></i>').join('')}</div>
                <div class="bc-bars">${dias.map((x, i) => `
                    <button class="bc-col ${i === 0 ? 'hoje' : ''} ${x.fechado ? 'fechado' : ''}" ${x.fechado ? 'disabled' : `onclick="abrirDia('${x.iso}', ${x.d.getDay()})"`} title="${x.fechado ? 'Fechado' : `${x.qtd} reserva(s), ${x.pessoas} pessoa(s)`}">
                        <span class="bc-plot"><span class="bc-bar" style="height:${topo ? Math.max(x.pessoas ? 3 : 0, (x.pessoas / topo) * 100) : 0}%">${x.pessoas ? `<span class="bc-val">${x.pessoas}</span>` : ''}</span></span>
                        <span class="bc-lbl"><span class="dia-sem">${i === 0 ? 'Hoje' : nomesDia[x.d.getDay()]}<br></span><small>${x.d.getDate()}</small></span>
                    </button>`).join('')}
                </div>
            </div>`;
        const totalPessoas = dias.reduce((a, x) => a + x.pessoas, 0);
        const totalRes = dias.reduce((a, x) => a + x.qtd, 0);
        const sub = document.getElementById('chart-reservas-sub');
        if (sub) sub.textContent = `${totalRes} reserva(s) · ${totalPessoas} pessoa(s) nos próximos ${periodoGrafico} dias`;
    }

    // ---- Rosca: valor (ou itens) por área ----
    const donut = document.getElementById('donut-areas');
    if (donut) {
        const cores = ['#9b2226', '#d4a373', '#588157', '#e9c46a', '#7a5c46', '#bc6c25', '#a3b18a', '#6d597a'];
        const verValor = podeVerCustos();
        let dados = [];
        if (verValor) {
            const { porArea } = valorEstoquePorArea();
            dados = Object.keys(porArea).map(n => ({ nome: n, valor: porArea[n] }));
        } else {
            const cont = {};
            areas.forEach(a => cont[a.nome] = 0);
            Object.keys(produtos).forEach(pk => (produtos[pk] && produtos[pk].locais || []).forEach(l => { if (cont[l] !== undefined) cont[l]++; }));
            dados = Object.keys(cont).map(n => ({ nome: n, valor: cont[n] }));
        }
        dados.sort((a, b) => b.valor - a.valor);
        if (dados.length > 7) {
            const resto = dados.slice(6).reduce((a, x) => a + x.valor, 0);
            dados = dados.slice(0, 6).concat([{ nome: 'Outras', valor: resto, outras: true }]);
        }
        const total = dados.reduce((a, x) => a + x.valor, 0);
        document.getElementById('donut-titulo').textContent = verValor ? 'Estoque por área' : 'Itens por área';
        document.getElementById('donut-sub').textContent = verValor ? 'Valor parado em cada área' : 'Quantidade de produtos em cada área';
        const fmtCurto = (v) => verValor
            ? (v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'))
            : String(Math.round(v));
        if (!currentUser || dados.length === 0) {
            donut.innerHTML = `<p class="vazio">${currentUser ? 'Nenhuma área cadastrada.' : 'Faça login para ver.'}</p>`;
        } else {
            const R = 52, C = 2 * Math.PI * R;
            let acc = 0;
            const comValor = dados.filter(x => x.valor > 0).length;
            const arcos = total > 0 ? dados.map((x, i) => {
                const frac = x.valor / total;
                if (frac <= 0) return ''; // área zerada não desenha nada
                const len = Math.max(0.5, frac * C - (comValor > 1 ? 2 : 0));
                const arco = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${cores[i % cores.length]}" stroke-width="16" stroke-linecap="butt" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"></circle>`;
                acc += frac * C;
                return arco;
            }).join('') : `<circle r="${R}" cx="70" cy="70" fill="none" stroke="rgba(15,30,46,.1)" stroke-width="16"></circle>`;
            donut.innerHTML = `
                <div class="donut">
                    <svg viewBox="0 0 140 140" aria-hidden="true">${arcos}</svg>
                    <div class="donut-centro"><strong>${fmtCurto(total)}</strong><small>${verValor ? 'em estoque' : 'vínculos'}</small></div>
                </div>
                <div class="donut-legenda">${dados.map((x, i) => {
                    const a = areas.find(z => z.nome === x.nome);
                    const click = a ? `onclick="verArea(${jsArg(a.key)}, ${jsArg(a.nome)})"` : '';
                    return `<button class="leg" ${click} ${a ? '' : 'disabled'}><i style="background:${cores[i % cores.length]}"></i><span>${esc(x.nome)}</span><strong>${fmtCurto(x.valor)}</strong></button>`;
                }).join('')}</div>`;
        }
    }

    // ---- Cartões de números ----
    const grid = document.getElementById('stat-grid');
    if (grid) {
        if (!currentUser) { grid.innerHTML = ''; return; }
        const { total: valorTotal } = podeVerCustos() ? valorEstoquePorArea() : { total: 0 };
        const prox7 = (() => { let q = 0; for (let i = 1; i <= 7; i++) { const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i); q += resumoReservasDia(dataLocalISO(d)).qtd; } return q; })();
        const cards = [
            { ico: 'ph-shopping-cart', n: abaixo.length, t: 'Itens abaixo do mínimo', s: abaixo.length ? 'Veja o que pedir' : 'Estoque em dia', tag: abaixo.length ? { txt: 'Pedir', cls: 'alerta' } : null, acao: 'abrirPedidosAbaixoMinimo()' },
            { ico: 'ph-box-arrow-down', n: pend, t: 'Aguardando armazenagem', s: pend ? 'Itens parados no pátio' : 'Nada no pátio', tag: pend ? { txt: 'Guardar', cls: 'aviso' } : null, acao: 'irParaPendentes()', papel: 'req-contrib' },
            { ico: 'ph-calendar-check', n: hojeRes.qtd, t: 'Reservas hoje', s: `${hojeRes.pessoas} pessoa(s)`, acao: 'abrirReservasHoje()' },
            { ico: 'ph-coins', n: formatarReais(valorTotal), t: 'Valor em estoque', s: 'Custo parado nas áreas', acao: 'abrirDashboard()', papel: 'req-dono' },
            { ico: 'ph-package', n: Object.keys(produtos).length, t: 'Produtos cadastrados', s: `${Object.keys(categorias).length} categoria(s)`, acao: "navegar('produtos-categorias')" },
            { ico: 'ph-map-pin', n: areas.length, t: 'Áreas de estoque', s: 'Câmaras, bar, depósitos...', acao: "navegar('areas-lista')" },
            { ico: 'ph-calendar-blank', n: prox7, t: 'Reservas na semana', s: 'Próximos 7 dias', acao: 'irParaAgenda()' },
            { ico: 'ph-martini', n: Object.keys(receitasDB).length, t: 'Receitas', s: 'Fichas técnicas', acao: 'abrirReceitas()' }
        ];
        grid.innerHTML = cards.map(c => `
            <button class="stat-card ${c.papel || ''}" onclick="${c.acao}">
                <div class="stat-top"><span class="stat-ico"><i class="ph ${c.ico}"></i></span>${c.tag ? `<span class="stat-tag ${c.tag.cls}">${c.tag.txt}</span>` : ''}</div>
                <strong class="stat-num">${typeof c.n === 'number' ? c.n : esc(c.n)}</strong>
                <span class="stat-t">${c.t}</span>
                <small class="stat-s">${esc(c.s)}</small>
            </button>`).join('');
    }
}

// Ao girar o celular ou redimensionar a janela, ajusta o gráfico do Início
window.addEventListener('resize', () => { if (telaAtiva('inicio')) agendarRender('inicio-resize', renderizarInicio); });

// =====================================================================
// AVISOS E CONFIRMAÇÕES PERSONALIZADOS (substituem alert/confirm do navegador)
// =====================================================================
const _dlgFila = [];
let _dlgAtivo = null;

function _dlgLimpaTexto(t) {
    return String(t == null ? '' : t).replace(/^[\s🚨⚠️❌✅ℹ️❗]+/u, '').trim();
}

function _dlgMostrar(cfg) {
    return new Promise(res => { _dlgFila.push({ cfg, res }); if (!_dlgAtivo) _dlgProximo(); });
}

function _dlgProximo() {
    const item = _dlgFila.shift();
    if (!item) { _dlgAtivo = null; return; }
    _dlgAtivo = item;
    const c = item.cfg;
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    ov.innerHTML = `
        <div class="dlg-box" role="alertdialog" aria-modal="true">
            <div class="dlg-icone ${c.perigo ? 'perigo' : ''}"><i class="ph ${c.icone}"></i></div>
            <h3 class="dlg-titulo"></h3>
            <p class="dlg-msg"></p>
            <div class="dlg-acoes">
                ${c.confirmar ? `<button type="button" class="btn-pill dlg-cancelar"></button>` : ''}
                <button type="button" class="btn-pill dark dlg-ok ${c.perigo ? 'perigo' : ''}"></button>
            </div>
        </div>`;
    ov.querySelector('.dlg-titulo').textContent = c.titulo;
    ov.querySelector('.dlg-msg').textContent = c.msg;
    ov.querySelector('.dlg-ok').textContent = c.ok;
    if (c.confirmar) ov.querySelector('.dlg-cancelar').textContent = c.cancelar;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('aberto'));
    const fechar = (valor) => {
        document.removeEventListener('keydown', teclas, true);
        ov.classList.remove('aberto');
        setTimeout(() => ov.remove(), 180);
        item.res(valor);
        _dlgAtivo = null;
        _dlgProximo();
    };
    const teclas = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fechar(true); }
    };
    document.addEventListener('keydown', teclas, true);
    ov.querySelector('.dlg-ok').onclick = () => fechar(true);
    if (c.confirmar) ov.querySelector('.dlg-cancelar').onclick = () => fechar(false);
    ov.addEventListener('click', (e) => { if (e.target === ov && c.confirmar) fechar(false); });
    setTimeout(() => { const b = ov.querySelector('.dlg-ok'); if (b) b.focus(); }, 30);
}

// Aviso simples (não trava a tela como o alert do navegador)
function avisar(msg, titulo = 'Atenção') {
    return _dlgMostrar({ msg: _dlgLimpaTexto(msg), titulo, ok: 'Entendi', icone: 'ph-warning-circle', confirmar: false });
}

// Pergunta com Cancelar/Confirmar. Devolve uma Promise: true ou false.
function confirmar(msg, opc = {}) {
    return _dlgMostrar({
        msg: _dlgLimpaTexto(msg), titulo: opc.titulo || 'Confirmar', ok: opc.ok || 'Continuar', cancelar: opc.cancelar || 'Cancelar',
        icone: opc.icone || 'ph-question', perigo: !!opc.perigo, confirmar: true
    });
}

window.alert = function (msg) { avisar(msg); };

// =====================================================================
// SEM ZOOM E SEM "PUXAR PARA RECARREGAR"
// =====================================================================
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// Sem "elástico" no topo: no começo da página, puxar para baixo não faz nada (nem rola para cima).
(function () {
    let y0 = 0, interno = false;
    function rolavel(el) {
        for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
        }
        return null;
    }
    document.addEventListener('touchstart', e => { if (e.touches.length === 1) { y0 = e.touches[0].clientY; const r = rolavel(e.target); interno = !!r && r.scrollTop > 0; } }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (e.touches.length !== 1 || interno || !e.cancelable) return;
        const r = rolavel(e.target);
        if (r && r.scrollTop > 0) return;
        if (e.touches[0].clientY > y0 && (window.scrollY || document.documentElement.scrollTop) <= 0) e.preventDefault();
    }, { passive: false });
})();
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault();
}, true);


// =====================================================================
// CONEXÃO, ERROS INESPERADOS E LIMITES
// =====================================================================
// Aviso de "sem internet"
(function () {
    let offline = false;
    function mostrar(off) {
        offline = off;
        window.__offline = off;
        const el = document.getElementById('aviso-offline');
        if (el) el.style.display = off ? 'flex' : 'none';
        document.body.classList.toggle('offline', off);
        if (window.XP) XP.atualizarPendentes();
    }
    window.addEventListener('offline', () => mostrar(true));
    window.addEventListener('online', () => mostrar(false));
    document.addEventListener('DOMContentLoaded', () => {
        if (!navigator.onLine) mostrar(true);
        try {
            firebase.database().ref('.info/connected').on('value', snap => {
                const conectado = snap.val() === true;
                // Dá 4 s de tolerância antes de avisar (quedas rápidas são normais)
                if (conectado) mostrar(false);
                else setTimeout(() => { if (!navigator.onLine) mostrar(true); else firebase.database().ref('.info/connected').once('value', s => { if (s.val() !== true) mostrar(true); }); }, 4000);
            });
        } catch (e) {}
    });
})();

// Erros inesperados: avisa em português (sem travar) e guarda os últimos no aparelho
(function () {
    let ultimo = 0;
    function registrar(msg) {
        try {
            const lista = JSON.parse(localStorage.getItem('adminiran_erros') || '[]');
            lista.push({ quando: new Date().toISOString(), msg: String(msg).slice(0, 300), tela: location.hash });
            localStorage.setItem('adminiran_erros', JSON.stringify(lista.slice(-30)));
        } catch (e) {}
        const agora = Date.now();
        if (agora - ultimo > 8000 && typeof showToast === 'function') { ultimo = agora; showToast('Algo deu errado. Tente de novo; se repetir, avise o administrador.', 'error'); }
    }
    window.addEventListener('error', e => { if (e && e.message && !/ResizeObserver|Script error/i.test(e.message)) registrar(e.message); });
    window.addEventListener('unhandledrejection', e => { const m = e && e.reason && (e.reason.message || e.reason); if (m && !/PERMISSION_DENIED|auth\//.test(String(m))) registrar(m); });
})();

// Limite de tamanho de foto (10 MB) antes de ler o arquivo
document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.type === 'file' && t.files && t.files[0] && /^image\//.test(t.accept || 'image/') && t.files[0].size > 10 * 1024 * 1024) {
        e.stopImmediatePropagation();
        t.value = '';
        avisar('Essa foto é muito grande (máximo 10 MB). Escolha outra ou reduza o tamanho.', 'Foto grande demais');
    }
}, true);

// Limite de tentativas de login: 5 erros seguidos bloqueiam por 30 s
(function () {
    let falhas = 0, bloqueadoAte = 0;
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof auth === 'undefined') return;
        const orig = auth.signInWithEmailAndPassword.bind(auth);
        auth.signInWithEmailAndPassword = function (email, senha) {
            const agora = Date.now();
            if (agora < bloqueadoAte) {
                const seg = Math.ceil((bloqueadoAte - agora) / 1000);
                return Promise.reject({ code: 'auth/too-many-requests', message: `Aguarde ${seg}s` });
            }
            return orig(email, senha).then(r => { falhas = 0; return r; }).catch(err => {
                if (err && /wrong-password|invalid-credential|invalid-login/.test(err.code || '') && ++falhas >= 5) { bloqueadoAte = Date.now() + 30000; falhas = 0; }
                throw err;
            });
        };
    });
})();
