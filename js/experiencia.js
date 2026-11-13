// Experiência de app: cache do último estado, skeletons, feedback de toque e fila offline.
// Carregado depois de cadastros.js. Compartilha as variáveis globais do firebaseFunction.js.
(function () {
    'use strict';

    const ok = { areas: false, produtos: false, categorias: false, metodos: false };
    const SESSAO = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    let uidAtual = null;
    const timers = {};

    const chaveCache = nome => 'adminiran_cache_' + uidAtual + '_' + nome;

    // ---------- 1) Cache do último estado (telas não abrem vazias) ----------
    function usuarioAtual() { try { if (typeof currentUser !== 'undefined' && currentUser) uidAtual = currentUser.uid; } catch (e) {} return uidAtual; }

    function salvar(nome, valor) {
        usuarioAtual();
        ok[nome] = true;
        atualizarChip();
        if (!uidAtual) return;
        clearTimeout(timers[nome]);
        timers[nome] = setTimeout(() => {
            try { localStorage.setItem(chaveCache(nome), JSON.stringify(valor)); } catch (e) { /* cota cheia: ignora */ }
        }, 800);
    }

    function ler(nome) {
        try { const t = localStorage.getItem(chaveCache(nome)); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    }

    // Preenche as variáveis com o último estado salvo, antes do Firebase responder.
    function hidratar() {
        if (!usuarioAtual()) return;
        let usou = false;
        const a = ler('areas'); if (Array.isArray(a)) { areas = a; usou = true; }
        const p = ler('produtos'); if (p && typeof p === 'object') { produtos = p; usou = true; }
        const c = ler('categorias'); if (c && typeof c === 'object') { categorias = c; usou = true; }
        const m = ler('metodos'); if (m && typeof m === 'object') { metodosCompra = m; usou = true; }
        if (!usou) return;
        try {
            if (typeof reindexarCategorias === 'function') reindexarCategorias();
            atualizarTelasDeProdutos();
            if (typeof renderizarInicio === 'function') renderizarInicio();
        } catch (e) { console.error('Cache:', e); }
        document.body.classList.add('usando-cache');
        atualizarChip();
    }

    function limparCache() {
        try {
            Object.keys(localStorage).filter(k => k.indexOf('adminiran_cache_') === 0).forEach(k => localStorage.removeItem(k));
        } catch (e) {}
    }

    function resetar() {
        Object.keys(ok).forEach(k => { ok[k] = false; });
        document.body.classList.remove('usando-cache');
        atualizarChip();
    }

    function tudoCarregado() { return Object.keys(ok).every(k => ok[k]); }

    // Aviso discreto enquanto o que está na tela ainda é o último estado salvo
    function atualizarChip() {
        let el = document.getElementById('chip-atualizando');
        const mostrar = document.body.classList.contains('usando-cache') && !tudoCarregado();
        if (!mostrar) { if (el) el.remove(); if (tudoCarregado()) document.body.classList.remove('usando-cache'); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'chip-atualizando';
            el.setAttribute('role', 'status');
            el.innerHTML = '<span class="chip-spin"></span> Atualizando…';
            document.body.appendChild(el);
        }
    }

    // ---------- 2) Skeletons ----------
    function esqueletoCards(n, altura) {
        let h = '';
        for (let i = 0; i < (n || 4); i++) {
            h += `<div class="sk-card" aria-hidden="true" style="height:${altura || 120}px; animation-delay:${i * 90}ms"><div class="sk-linha sk-l1"></div><div class="sk-linha sk-l2"></div></div>`;
        }
        return h;
    }

    function esqueletoLinhas(n) {
        let h = '';
        for (let i = 0; i < (n || 6); i++) h += `<tr class="sk-tr" aria-hidden="true" style="animation-delay:${i * 90}ms"><td></td></tr>`;
        return h;
    }

    // ---------- 3) Feedback de toque ----------


    // ---------- 4) Fila offline persistente ----------
    const CHAVE_FILA = 'adminiran_fila';
    const VALIDADE = 48 * 3600 * 1000;

    function lerFila() { try { return JSON.parse(localStorage.getItem(CHAVE_FILA) || '[]'); } catch (e) { return []; } }
    function gravarFila(f) { try { localStorage.setItem(CHAVE_FILA, JSON.stringify(f)); } catch (e) {} atualizarPendentes(); }
    function pendentesDaSessao() { return lerFila().filter(x => x.uid === uidAtual).length; }

    function atualizarPendentes() {
        const el = document.getElementById('aviso-offline');
        if (!el) return;
        let span = document.getElementById('fila-pendente');
        const n = pendentesDaSessao();
        if (!span) { span = document.createElement('div'); span.id = 'fila-pendente'; el.appendChild(span); }
        span.textContent = n > 0 ? n + (n === 1 ? ' alteração aguardando envio' : ' alterações aguardando envio') : '';
        span.style.display = n > 0 ? 'block' : 'none';
    }

    function estaOffline() { return (typeof navigator !== 'undefined' && navigator.onLine === false) || window.__offline === true; }

    let avisouOffline = 0;
    function avisarSalvoLocal() {
        const agora = Date.now();
        if (agora - avisouOffline < 6000) return;
        avisouOffline = agora;
        if (typeof showToast === 'function') showToast('Sem conexão: salvo no aparelho. Envia quando a internet voltar.', 'success');
    }

    // Instala a gravação com fila em uma classe de Reference (injetável para teste).
    // Offline: grava local (o SDK já atualiza a tela na hora) e não deixa o botão esperando.
    function instalarFila(Proto) {
        if (!Proto || Proto.__filaInstalada) return false;
        const originais = {};
        ['update', 'set', 'remove', 'push'].forEach(op => {
            if (typeof Proto[op] !== 'function') return;
            originais[op] = Proto[op];
            Proto[op] = function () {
                const args = Array.prototype.slice.call(arguments);
                let id = null;
                const p = originais[op].apply(this, args);
                try {
                    if (uidAtual && !window.__reenviando) {
                        let url = null, valor = null, tipo = op;
                        if (op === 'push') { if (args[0] !== undefined && args[0] !== null) { url = String(p); valor = args[0]; tipo = 'set'; } }
                        else { url = String(this); valor = op === 'remove' ? null : args[0]; }
                        if (url) {
                            id = SESSAO + '-' + Math.random().toString(36).slice(2, 9);
                            const f = lerFila();
                            f.push({ id, uid: uidAtual, sessao: SESSAO, t: Date.now(), url, op: tipo, v: JSON.parse(JSON.stringify(valor === undefined ? null : valor)) });
                            gravarFila(f);
                            const tirar = () => gravarFila(lerFila().filter(x => x.id !== id));
                            if (p && typeof p.then === 'function') p.then(tirar, tirar);
                        }
                    }
                } catch (e) { console.error('Fila:', e); }

                if (id && estaOffline() && op !== 'push') {
                    avisarSalvoLocal();
                    return Promise.resolve();
                }
                return p;
            };
        });
        Proto.__filaInstalada = true;
        Proto.__originaisFila = originais;
        return true;
    }

    // Reenvia o que ficou pendente numa sessão anterior (aba fechada/recarregada sem internet)
    async function reenviarPendentes() {
        if (!uidAtual || estaOffline()) return 0;
        const todas = lerFila();
        const validas = todas.filter(x => Date.now() - x.t < VALIDADE);
        if (validas.length !== todas.length) gravarFila(validas);
        const velhas = validas.filter(x => x.uid === uidAtual && x.sessao !== SESSAO).sort((x, y) => x.t - y.t);
        if (!velhas.length) return 0;
        let enviados = 0;
        window.__reenviando = true;
        try {
            const Proto = firebase.database.Reference.prototype;
            const orig = Proto.__originaisFila || {};
            for (const it of velhas) {
                try {
                    const ref = firebase.database().refFromURL(it.url);
                    const fn = it.v === null && it.op !== 'update' ? (orig.set || Proto.set) : (orig[it.op] || Proto[it.op]);
                    await fn.call(ref, it.v);
                    enviados++;
                } catch (e) { console.error('Reenvio falhou:', e); }
                gravarFila(lerFila().filter(x => x.id !== it.id));
            }
        } finally { window.__reenviando = false; }
        if (enviados && typeof showToast === 'function') showToast(enviados + (enviados === 1 ? ' alteração pendente foi enviada.' : ' alterações pendentes foram enviadas.'), 'success');
        return enviados;
    }

    // ---------- 5) Transição entre telas: blocos saem um a um, os novos entram um a um ----------
    const BLOCO_UNICO = '.card, .card-nav, .stat-card, .product-card, .linha-item, .page-head, .btn-pill, .segmented, table, .table-container, .search-bar, input, form, .form-card, .stepper, .passo, button';
    const MAX_BLOCOS = 12;
    let transAtual = null;

    function ehContainer(el) {
        if (el.matches(BLOCO_UNICO)) return false;
        const filhos = Array.from(el.children).filter(c => c.getBoundingClientRect().height > 0);
        if (filhos.length >= 3) return true;
        return filhos.length === 1 && el.tagName === 'DIV' && !el.className;
    }

    // Lista os blocos visíveis (um "bloco" = um card, um item de lista, um título...)
    function blocosDe(raiz) {
        const out = [];
        const vh = window.innerHeight;
        (function coletar(el, prof) {
            Array.from(el.children).forEach(c => {
                const cs = getComputedStyle(c);
                if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'sticky') return;
                const r = c.getBoundingClientRect();
                if (r.height < 1 || r.width < 1) return;
                if (prof < 3 && ehContainer(c)) { coletar(c, prof + 1); return; }
                if (r.top < vh && r.bottom > 0) out.push(c);
            });
        })(raiz, 0);
        // ordem de leitura: de cima para baixo, esquerda para direita
        out.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (Math.round(ra.top / 24) - Math.round(rb.top / 24)) || (ra.left - rb.left); });
        return out.slice(0, MAX_BLOCOS);
    }

    function encerrarTransicao() {
        if (!transAtual) return;
        transAtual.anims.forEach(a => { try { a.cancel(); } catch (e) {} });
        if (transAtual.ghost) transAtual.ghost.remove();
        clearTimeout(transAtual.timer);
        document.body.classList.remove('em-transicao');
        transAtual = null;
    }

    function contarNumero(el, atraso) {
        const alvo = parseInt(String(el.textContent).replace(/\D/g, ''), 10);
        if (!isFinite(alvo) || alvo <= 0 || String(el.textContent).trim() !== String(alvo)) return;
        el.textContent = '0';
        const dur = 700;
        setTimeout(() => {
            const t0 = performance.now();
            (function passo(t) {
                const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
                el.textContent = String(Math.round(alvo * e));
                if (k < 1) requestAnimationFrame(passo);
            })(t0);
        }, atraso);
    }

    function prepararTransicao(idNovo) {
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
        const velha = document.querySelector('.section.active');
        const nova = document.getElementById(idNovo);
        if (!velha || !nova || velha === nova || document.hidden) return null;
        const r = velha.getBoundingClientRect();
        if (r.height < 20 || r.width < 20) return null;
        encerrarTransicao();
        const ghost = velha.cloneNode(true);
        ghost.classList.add('ghost-transicao');
        ghost.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${Math.max(0, Math.min(r.height, window.innerHeight - r.top))}px; overflow:hidden; margin:0; pointer-events:none; z-index:40; animation:none; display:block;`;
        document.body.appendChild(ghost);
        return { ghost };
    }

    function iniciarTransicao(ctx, idNovo) {
        const nova = document.getElementById(idNovo);
        const ghost = ctx.ghost;
        const anims = [];
        transAtual = { ghost, anims, timer: setTimeout(encerrarTransicao, 2200) };
        document.body.classList.add('em-transicao');

        // SAÍDA: blocos da tela antiga somem um por vez (cap ~320 ms no total)
        const saindo = blocosDe(ghost);
        const stgOut = Math.min(30, 100 / Math.max(saindo.length - 1, 1));
        saindo.forEach((el, i) => {
            anims.push(el.animate(
                [{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateY(-8px)', filter: 'blur(3px)' }],
                { duration: 220, delay: i * stgOut, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }));
        });
        const totalSaida = 220 + Math.max(saindo.length - 1, 0) * stgOut;
        anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: Math.max(0, totalSaida - 120), fill: 'forwards' }));

        // ENTRADA: blocos da tela nova entram um por vez, subindo e ficando nítidos
        const entrando = blocosDe(nova);
        const inicio = totalSaida * 0.8;
        const stgIn = Math.min(60, 380 / Math.max(entrando.length - 1, 1));
        entrando.forEach((el, i) => {
            const atraso = inicio + i * stgIn;
            anims.push(el.animate(
                [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
                { duration: 420, delay: atraso, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
            el.querySelectorAll('.stat-num').forEach(n => contarNumero(n, atraso + 120));
        });
        const fimTotal = inicio + Math.max(entrando.length - 1, 0) * stgIn + 420;
        clearTimeout(transAtual.timer);
        transAtual.timer = setTimeout(encerrarTransicao, Math.max(totalSaida, fimTotal) + 80);
    }

    (function envolverNavegar() {
        if (typeof window.navegar !== 'function' || window.navegar.__transicao) return;
        const original = window.navegar;
        const envolvida = function () {
            let ctx = null;
            try { ctx = prepararTransicao(arguments[0]); } catch (e) { console.error('Transição:', e); }
            const r = original.apply(this, arguments);
            if (ctx) { try { iniciarTransicao(ctx, arguments[0]); } catch (e) { console.error('Transição:', e); encerrarTransicao(); } }
            return r;
        };
        envolvida.__transicao = true;
        window.navegar = envolvida;
    })();

    // ---------- inicialização ----------
    window.XP = { ok, salvar, hidratar, resetar, limparCache, esqueletoCards, esqueletoLinhas, instalarFila, reenviarPendentes, atualizarPendentes, _fila: { ler: lerFila }, _setUid: u => { uidAtual = u; } };

    try {
        if (typeof firebase !== 'undefined' && firebase.database && firebase.database.Reference) instalarFila(firebase.database.Reference.prototype);
    } catch (e) { console.error('Fila indisponível:', e); }

    try {
        firebase.auth().onAuthStateChanged(user => {
            uidAtual = user ? user.uid : null;
            if (!user) { resetar(); limparCache(); return; }
            atualizarPendentes();
            setTimeout(reenviarPendentes, 1500);
        });
    } catch (e) {}
})();
