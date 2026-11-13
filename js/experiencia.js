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
