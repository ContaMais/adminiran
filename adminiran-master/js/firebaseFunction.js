        // CONFIGURAÇÕES FIREBASE
        const firebaseConfig = { apiKey: "AIzaSyC3cAzrTMwCUxDcMvl68XxrcGLkmeANtSg", authDomain: "contamais-411llp.firebaseapp.com", databaseURL: "https://contamais-411llp-default-rtdb.firebaseio.com", projectId: "contamais-411llp", storageBucket: "contamais-411llp.firebasestorage.app", messagingSenderId: "691691378209", appId: "1:691691378209:web:6191b84e88ee3281b17560" };
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        const auth = firebase.auth();
        // ATIVAR MODO OFFLINE (Feature 45)
        
        // O Firebase já gerencia o cache local automaticamente em navegadores modernos.
        // ATIVAR MODO OFFLINE (Feature 45)
        
        // O Firebase já gerencia o cache local automaticamente em navegadores modernos.

        // ESTADOS GLOBAIS
        const DONO_EMAIL = "pedrosoaresctt@gmail.com";
        let currentUser = null;
        let currentRole = 'visualizador'; 
        let currentUserName = '';
        
        // CAPACIDADE DAS ÁREAS
        const CAPACIDADE_AREAS = { "Varanda": 20, "Salão 1 - Frente": 30, "Salão 1 - Corredor": 30, "Salão 2 - Parede": 40, "Salão 2 - Meio": 40, "Salão 2 - Corrimão": 15, "Salão 2 - Mesas Redondas": 3, "Salão 2 - Bistrôs": 3, "Salão 2 - Brinquedão": 60, "Laje": 60 };

        let areas = [], produtos = {}, categorias = {}, metodosCompra = {}, reservasApp = {}, receitasDB = {};
        let areaAtualKey = "", catsNovo = [], catsEdit = [], agrupamentoAtual = 'categorias'; 
        
        let mapasApp = {}; let modoMontagemMapa = false; let mesasSelecionadasMapa = []; let areaFocadaMapa = null; let mapaAtualData = ""; let mapaAtualTurno = "";
        let navDate = new Date();
        let dataAtualReserva = "";
        
        let categoriaFocadaOrdenacao = "";
        let currentCatSubgrupos = [];
        let prodSubNovo = "";
        let prodSubEdit = "";
        let activeSubgroupFilter = "Todos";
        let activeAdminSubgroupFilter = "Todos"; 
        let areaCatOrderTemp = [];

        // Estados das Receitas
        let receitaAtualKey = "";
        let receitaEmConstrucao = { nome: "", ingredientes: [], preparo: "", foto: "" };
        let receitaEmEdicao = { nome: "", ingredientes: [], preparo: "", foto: "" };
        let ingredienteSelecionadoTemp = "";
        let ctxIngredienteTemp = "novo";
        let base64ReceitaFoto = "";
        let base64ReceitaFotoEdit = "";
        let configEnquadramentoNovo = { x: 50, y: 50, scale: 1 };
        let configEnquadramentoEdit = { x: 50, y: 50, scale: 1 };

        // ==========================================
        // SISTEMA DE AUTENTICAÇÃO E CARGOS (RBAC)
        // ==========================================
        function podeVerCustos() {
            return currentRole === 'dono' || currentRole === 'contribuidor';
        }

        let authMode = 'login'; 

        function abrirModalAuth() {
            if(currentUser) { auth.signOut(); return; }
            document.getElementById('modalAuth').style.display = 'flex';
            document.getElementById('auth-nome').value = '';
            document.getElementById('auth-email').value = '';
            document.getElementById('auth-senha').value = '';
            setAuthMode('login');
        }

        function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }

        function toggleAuthMode() { setAuthMode(authMode === 'login' ? 'register' : 'login'); }

        function setAuthMode(mode) {
            authMode = mode;
            document.getElementById('auth-title').innerText = mode === 'login' ? '👤 Entrar' : '📝 Cadastrar Conta';
            document.getElementById('btn-submit-auth').innerText = mode === 'login' ? 'Entrar' : 'Cadastrar';
            document.getElementById('auth-toggle-link').innerText = mode === 'login' ? 'Ainda não tem conta? Cadastre-se' : 'Já tem conta? Clique para Entrar';
            document.getElementById('auth-nome').style.display = mode === 'login' ? 'none' : 'block';
        }

        function submeterAuth() {
            const email = document.getElementById('auth-email').value.trim();
            const senha = document.getElementById('auth-senha').value;
            const nome = document.getElementById('auth-nome').value.trim();

            if(authMode === 'register' && !nome) return alert("Preencha seu nome!");
            if(!email || !senha) return alert("Preencha email e senha!");
            
            if(authMode === 'login') {
                auth.signInWithEmailAndPassword(email, senha)
                    .then(() => fecharModalAuth())
                    .catch(e => {
                        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') alert("🚨 Essa conta não existe ou a senha está errada! Clique em 'Cadastre-se' e crie a conta.");
                        else alert("Erro ao entrar: " + e.message);
                    });
            } else {
                auth.createUserWithEmailAndPassword(email, senha)
                    .then((cred) => {
                        const roleNovo = email === DONO_EMAIL ? 'dono' : 'visualizador';
                        const perfil = { nome: nome, email: email, role: roleNovo };
                        db.ref('users/' + cred.user.uid).set(perfil).then(() => {
                            sincronizarUsuarioIndex(cred.user.uid, perfil);
                        });
                        fecharModalAuth();
                        alert("Conta criada com sucesso!");
                    })
                    .catch(e => {
                        if (e.code === 'auth/email-already-in-use') alert("🚨 Esse e-mail já está cadastrado! Vá em 'Entrar' para fazer login.");
                        else if (e.code === 'auth/weak-password') alert("🚨 A senha é muito fraca. Digite pelo menos 6 caracteres.");
                        else alert("Erro ao cadastrar: " + e.message);
                    });
            }
        }

        let listenersFirebaseAtivos = false;
        let perfilUserListener = null;
        let listenerEquipeAdmin = null;

        auth.onAuthStateChanged((user) => {
            if (perfilUserListener) {
                db.ref('users/' + perfilUserListener).off('value');
                perfilUserListener = null;
            }
            pararListenerEquipeAdmin();
            pararListenersFirebase();

            if (user) {
                currentUser = user;
                perfilUserListener = user.uid;
                db.ref('users/' + user.uid).on('value', snap => {
                    const data = snap.val();
                    let roleDb = data ? (data.role || 'visualizador') : 'visualizador';
                    if (roleDb === 'vizualizador') roleDb = 'visualizador';
                    currentRole = (user.email === DONO_EMAIL) ? 'dono' : roleDb;
                    currentUserName = data ? (data.nome || user.email.split('@')[0]) : user.email.split('@')[0];

                    const perfilSync = {
                        nome: currentUserName,
                        email: user.email,
                        role: currentRole
                    };
                    if (user.email === DONO_EMAIL && roleDb !== 'dono') {
                        perfilSync.role = 'dono';
                        db.ref('users/' + user.uid).update(perfilSync);
                    }
                    sincronizarUsuarioIndex(user.uid, perfilSync);

                    aplicarPermissoes();
                    iniciarListenersFirebase();
                });
            } else {
                currentUser = null;
                currentRole = 'visualizador';
                currentUserName = '';
                aplicarPermissoes();
            }
        });

        function aplicarPermissoes() {
            document.body.className = 'role-' + currentRole;
            const avisoLogin = document.getElementById('aviso-login');
            if (avisoLogin) avisoLogin.style.display = currentUser ? 'none' : 'block';

            const btnLogin = document.getElementById('btn-login-sidebar');
            const btnRole = document.getElementById('btn-top-role');
            
            if(currentUser) {
                btnLogin.innerHTML = '<i class="ph ph-sign-out" style="font-size:1.3rem;"></i> <span>Sair da Conta</span>';
            } else {
                btnLogin.innerHTML = '<i class="ph ph-user" style="font-size:1.3rem;"></i> <span>Entrar / Cadastrar</span>';
            }
            
            if (currentRole === 'dono') btnRole.innerHTML = '<i class="ph ph-gear-six" style="color: var(--bg-sidebar); font-weight: bold;"></i>';
            else if (currentRole === 'contribuidor') btnRole.innerHTML = '<i class="ph ph-pencil-simple" style="color: var(--bg-sidebar); font-weight: bold;"></i>';
            else btnRole.innerHTML = '<i class="ph ph-eye" style="color: var(--bg-sidebar); font-weight: bold;"></i>';

            if(currentRole !== 'dono' && document.getElementById('configuracoes').classList.contains('active')) navegar('inicio');
            
            if(document.getElementById('agenda-view').classList.contains('active')) renderizarCalendario();
            if(document.getElementById('agenda-detalhe').classList.contains('active')) renderizarReservasDia();
            if(document.getElementById('mapa-salao').classList.contains('active')) carregarReservasMapa();

            if (document.getElementById('receitas-lista').classList.contains('active')) renderizarReceitas();
            if (document.getElementById('detalhe-receita').classList.contains('active') && receitaAtualKey) {
                verDetalhesReceita(receitaAtualKey);
            }
        }

        function sincronizarUsuarioIndex(uid, u) {
            if (!uid || !u) return;
            let role = u.role || 'visualizador';
            if (role === 'vizualizador') role = 'visualizador';
            db.ref('meta/usuariosIndex/' + uid).set({
                nome: u.nome || '',
                email: u.email || '',
                role: role
            });
        }

        function pararListenerEquipeAdmin() {
            if (listenerEquipeAdmin) {
                db.ref('meta/usuariosIndex').off('value', listenerEquipeAdmin);
                db.ref('users').off('value', listenerEquipeAdmin);
                listenerEquipeAdmin = null;
            }
        }

        function carregarEquipeAdmin() {
            const lista = document.getElementById('lista-usuarios-admin');
            if (!lista) return;
            lista.innerHTML = '<p style="color:#64748b; font-size:0.9rem;">Carregando equipe...</p>';

            pararListenerEquipeAdmin();

            const iniciarEscutaIndex = () => {
                listenerEquipeAdmin = function(snap) {
                    renderizarUsuariosAdmin(snap.val() || {});
                };
                db.ref('meta/usuariosIndex').on('value', listenerEquipeAdmin, function(err) {
                    console.error('Erro ao ler meta/usuariosIndex:', err);
                    lista.innerHTML = `<p style="color:var(--primary); font-size:0.9rem; line-height:1.5;">Não foi possível carregar a equipe.<br><br>Atualize as <strong>Regras do Firebase</strong> (copie o arquivo <code>database.rules.json</code> do projeto) e clique em Publicar.<br><br>Seu UID: <code>${currentUser ? currentUser.uid : '?'}</code></p>`;
                });
            };

            db.ref('users').once('value')
                .then(snap => {
                    const val = snap.val() || {};
                    const updates = {};
                    Object.keys(val).forEach(uid => {
                        const u = val[uid];
                        if (!u) return;
                        let role = u.role || 'visualizador';
                        if (role === 'vizualizador') role = 'visualizador';
                        updates['meta/usuariosIndex/' + uid] = {
                            nome: u.nome || '',
                            email: u.email || '',
                            role: role
                        };
                    });
                    if (Object.keys(updates).length) {
                        return db.ref().update(updates);
                    }
                })
                .catch(e => console.warn('Leitura users para sincronizar índice:', e))
                .finally(iniciarEscutaIndex);
        }

        function abrirConfig() { 
            if(currentRole === 'dono') { 
                resetarFormCategoria(); 
                resetarFormMetodo(); 
                navegar('configuracoes');
                carregarEquipeAdmin();
            } else { 
                alert("Acesso Negado: Apenas o Dono pode acessar as configurações da equipe.");
            } 
        }

        function renderizarUsuariosAdmin(usersObj) {
            const lista = document.getElementById('lista-usuarios-admin');
            if (!lista) return;

            const emailsProcessados = new Set();
            let html = '';
            const chaves = Object.keys(usersObj || {});
            
            chaves.forEach(uid => {
                const u = usersObj[uid];
                if (!u || typeof u !== 'object') return;

                const email = u.email || '';
                if (email && emailsProcessados.has(email)) return;
                if (email) emailsProcessados.add(email);

                const nome = u.nome || (email ? email.split('@')[0] : 'Usuário');
                const emailLinha = email
                    ? `<span style="font-size:0.75rem; color:#64748b; font-weight:normal; display:block;">${email}</span>`
                    : `<span style="font-size:0.75rem; color:#64748b; font-weight:normal; display:block;">Sem e-mail no cadastro</span>`;
                const nomeExibicao = `${nome}${emailLinha}`;

                let roleAtual = u.role || 'visualizador';
                if (roleAtual === 'vizualizador') roleAtual = 'visualizador';

                let selectHtml = '';
                if (email === DONO_EMAIL) {
                    selectHtml = `<div style="font-weight:bold; color:var(--primary); font-size:0.85rem; padding-right:5px;">👑 Dono</div>`;
                } else {
                    selectHtml = `<select onchange="atualizarCargoUsuario('${uid}', this.value)" style="width:auto; padding:6px; margin:0; font-weight:bold; border-radius:6px; font-size:0.85rem; border:1px solid #ccc; background:#1a0404; color:#fbeee3;">
                        <option value="contribuidor" ${roleAtual==='contribuidor'?'selected':''}>✏️ Contribuidor</option>
                        <option value="visualizador" ${roleAtual==='visualizador'?'selected':''}>👁️ Visualizador</option>
                    </select>`;
                }
                html += `<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); margin-bottom:8px; gap:10px; flex-wrap:wrap;">
                    <div style="font-weight:bold; font-size:0.9rem; color:var(--text-main); line-height:1.2; flex:1; min-width:180px;">${nomeExibicao}</div>
                    ${selectHtml}
                </div>`;
            });

            if (!html) {
                html = `<p style="color:#64748b; font-size:0.9rem;">Nenhum usuário em <strong>users</strong> ainda. Peça para a equipe criar conta pelo botão Entrar no app.</p>`;
            }
            lista.innerHTML = html;
        }

        function atualizarCargoUsuario(uid, novoRole) {
            if (currentRole !== 'dono') {
                showToast("Apenas o dono pode alterar cargos.", "error");
                return;
            }
            const updates = {
                ['users/' + uid + '/role']: novoRole,
                ['meta/usuariosIndex/' + uid + '/role']: novoRole
            };
            db.ref().update(updates)
                .then(() => showToast("Cargo atualizado!", "success"))
                .catch(err => {
                    console.error(err);
                    showToast("Erro ao salvar cargo. Verifique as regras do Firebase.", "error");
                    carregarEquipeAdmin();
                });
        }

        // ==========================================
        // NAVEGAÇÃO E FAB CLICK OUTSIDE
        // ==========================================
        // ==========================================
        // SISTEMA DE RECEBIMENTO E ALOCAÇÃO (PÁTIO)
        // ==========================================
        let recebimentoTemp = {};

        function abrirRecebimentos() {
            navegar('recebimentos-lista');
            const grid = document.getElementById('grid-recebimentos-metodos');
            const chaves = Object.keys(metodosCompra);
            if(chaves.length === 0) { grid.innerHTML = `<p style="color:#64748b; grid-column:1/-1;">Nenhum método de compra cadastrado.</p>`; return; }
            grid.innerHTML = chaves.map(k => `<div class="card-nav" onclick="iniciarRecebimento('${k}')">${obterIconeMetodo(metodosCompra[k].nome, true)}<h3 style="margin-top:5px;">${metodosCompra[k].nome}</h3></div>`).join('');
        }

        function iniciarRecebimento(keyMetodo) {
            const met = metodosCompra[keyMetodo].nome;
            document.getElementById('titulo-recebimento-metodo').innerText = `Carga: ${met}`;
            recebimentoTemp = {};
            
            let prods = Object.keys(produtos).filter(k => produtos[k].metodoCompra === met);
            prods.sort((a,b) => produtos[a].nome.localeCompare(produtos[b].nome));
            
            if(prods.length === 0) {
                document.getElementById('tabela-recebimento-itens').innerHTML = `<tr><td colspan="3" style="text-align:center; color:#64748b;">Fornecedor não tem produtos vinculados.</td></tr>`;
            } else {
                let maxF = 1;
                prods.forEach(pk => {
                    let t = 1; getCategoriasProduto(produtos[pk]).forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); });
                    if(t > maxF) maxF = t;
                });
                
                let htmlHead = `<tr><th>Item</th><th style="text-align:center">${maxF>1?'Fds.':' '}</th><th style="text-align:center">Un.</th></tr>`;
                document.getElementById('head-recebimento').innerHTML = htmlHead;
                
                document.getElementById('tabela-recebimento-itens').innerHTML = prods.map(pk => {
                    const p = produtos[pk];
                    let t = 1; getCategoriasProduto(p).forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); });
                    
                    recebimentoTemp[pk] = { f: 0, u: 0, t: t };
                    const fardoInput = t > 1 ? `<div class="qty-box" style="background:#1a0404;"><input type="number" class="qty-input" style="background:#1a0404;" id="rec-f-${pk}" value="0" onchange="atualizarRecTemp('${pk}')"><div class="qty-ctrls"><button class="qty-btn-up" onclick="mudarRecQtd('${pk}','f',1)">▲</button><button class="qty-btn-down" onclick="mudarRecQtd('${pk}','f',-1)">▼</button></div></div>` : '';
                    const unInput = `<div class="qty-box" style="background:#1a0404;"><input type="number" class="qty-input" style="background:#1a0404;" id="rec-u-${pk}" value="0" onchange="atualizarRecTemp('${pk}')"><div class="qty-ctrls"><button class="qty-btn-up" onclick="mudarRecQtd('${pk}','u',1)">▲</button><button class="qty-btn-down" onclick="mudarRecQtd('${pk}','u',-1)">▼</button></div></div>`;
                    
                    return `<tr><td class="col-item">${p.nome}</td><td style="text-align:center">${fardoInput}</td><td style="text-align:center">${unInput}</td></tr>`;
                }).join('');
            }
            navegar('recebimento-entrada');
        }

        function mudarRecQtd(pk, tipo, delta) {
            const el = document.getElementById(`rec-${tipo}-${pk}`);
            let v = (parseInt(el.value)||0) + delta; if(v < 0) v = 0;
            el.value = v; atualizarRecTemp(pk);
        }

        function atualizarRecTemp(pk) {
            const elF = document.getElementById(`rec-f-${pk}`);
            recebimentoTemp[pk].f = elF ? (parseInt(elF.value)||0) : 0;
            recebimentoTemp[pk].u = parseInt(document.getElementById(`rec-u-${pk}`).value)||0;
        }

        // Função para mostrar Notificações do Sistema (Toasts)
        function showToast(msg, type = 'success') {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = msg;
            container.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function salvarRecebimentoEstoque() {
            if(currentRole === 'visualizador') return;
            let updates = {}; let qtdRecebida = 0;
            let itensRecebidosHist = {}; // NOVO: Para a Linha do Tempo
            const met = document.getElementById('titulo-recebimento-metodo').innerText.replace('Carga: ', '');
            
            for(let pk in recebimentoTemp) {
                const r = recebimentoTemp[pk];
                if(r.f > 0 || r.u > 0) {
                    qtdRecebida++;
                    const p = produtos[pk];
                    itensRecebidosHist[pk] = { f: r.f, u: r.u, nome: p.nome }; // Guarda pro histórico
                    
                    let estAntigo = p.estoque && p.estoque['_Pendente_'] ? p.estoque['_Pendente_'] : {f:0, u:0};
                    let novoF = (Number(estAntigo.f)||0) + r.f; let novoU = (Number(estAntigo.u)||0) + r.u;
                    if(r.t > 1 && novoU >= r.t) { novoF += Math.floor(novoU / r.t); novoU = novoU % r.t; }
                    updates[`produtos/${pk}/estoque/_Pendente_`] = { f: novoF, u: novoU };
                }
            }
            if(qtdRecebida > 0) {
                db.ref().update(updates).then(() => { 
                    // NOVO: Registra na Linha do Tempo
                    const data = new Date();
                    db.ref('historico_timeline').push({
                        timestamp: data.getTime(), dataFormatada: data.toLocaleDateString('pt-BR'),
                        tipo: 'recebimento', fornecedor: met, itens: itensRecebidosHist, usuario: currentUserName || "Equipe"
                    });
                    
                    showToast("Entrada registrada! Itens no pátio aguardando armazenagem.", "success"); 
                    navegar('produtos-hub'); 
                });
            } else { alert("Informe pelo menos a quantidade de 1 produto."); }
        }

        function verificarPendentes() {
            let temPendente = false; let qtdItens = 0; let htmlAlocar = '';
            
            for(let pk in produtos) {
                const p = produtos[pk];
                if(p.estoque && p.estoque['_Pendente_'] && (p.estoque['_Pendente_'].f > 0 || p.estoque['_Pendente_'].u > 0)) {
                    temPendente = true; qtdItens++;
                    const pend = p.estoque['_Pendente_'];
                    let t = 1; getCategoriasProduto(p).forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); });
                    
                    const frac = produtoUsaContagemFracionada(p);
                    let totalF = parseQtdValor(pend.f, frac);
                    let totalU = parseQtdValor(pend.u, frac);

                    if (!frac && t === 1 && totalF > 0) {
                        totalU += totalF;
                        totalF = 0;
                    }

                    const totalUnPend = totalF * t + totalU;
                    let txtQtd = frac
                        ? `${formatarQtdNumero(totalUnPend, true)} Un.`
                        : (t > 1 ? `${formatarQtdNumero(totalF, false)} Fds e ${formatarQtdNumero(totalU, false)} Un.` : `${formatarQtdNumero(totalU, false)} Unidade(s)`);

                    let optionsArea = (p.locais || []).map(loc => `<option value="${loc}">${loc}</option>`).join('');
                    if(!optionsArea) optionsArea = `<option value="">⚠️ Sem área física assinalada!</option>`;

                    const stepP = frac ? '0.01' : '1';
                    let inputsQtd = '';
                    if (frac || t <= 1) {
                        inputsQtd = `
                        <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">Qtd. (máx. ${formatarQtdNumero(totalUnPend, frac)})</label><input type="number" id="transf-u-${pk}" value="${formatarQtdNumero(totalUnPend, frac)}" min="0" max="${totalUnPend}" step="${stepP}" style="margin:0; text-align:center; background:#000; color:var(--text-main); font-weight:bold;"></div>`;
                        totalF = 0;
                        totalU = totalUnPend;
                    } else if(t > 1) {
                        inputsQtd = `
                        <div style="display:flex; gap:8px; flex:1;">
                            <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">Fardos (MÁX: ${totalF})</label><input type="number" id="transf-f-${pk}" value="${totalF}" min="0" max="${totalF}" step="${stepP}" style="margin:0; text-align:center; background:#000; color:var(--text-main); font-weight:bold;"></div>
                            <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">Un. (MÁX: ${totalU})</label><input type="number" id="transf-u-${pk}" value="${totalU}" min="0" max="${totalU}" step="${stepP}" style="margin:0; text-align:center; background:#000; color:var(--text-main); font-weight:bold;"></div>
                        </div>`;
                    } else {
                        inputsQtd = `
                        <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">Unidades (MÁX: ${totalU})</label><input type="number" id="transf-u-${pk}" value="${totalU}" min="0" max="${totalU}" step="${stepP}" style="margin:0; text-align:center; background:#000; color:var(--text-main); font-weight:bold;"></div>`;
                    }

                    htmlAlocar += `
                    <div style="padding:15px; border:1px solid rgba(251, 238, 227, 0.1); border-radius:10px; background:rgba(255,255,255,0.03);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:flex-start;">
                            <strong style="color:var(--text-main); font-size:1.05rem;">${p.nome}</strong>
                            <span style="color:var(--primary); font-weight:800; font-size:0.85rem; text-align:right;">Disponível:<br>${txtQtd}</span>
                        </div>
                        <div style="display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap;">
                            <div style="flex:1; min-width: 160px;">
                                <label style="font-size:0.7rem; color:#64748b;">Área de Destino</label>
                                <select id="aloc-area-${pk}" style="margin:0; background:#280606; color:#fbeee3; font-weight:bold; border-color:rgba(251, 238, 227, 0.2);">${optionsArea}</select>
                            </div>
                            ${inputsQtd}
                            <button class="btn-submit req-contrib" style="margin:0; background:#10b981; width:auto; padding:10px 15px;" onclick="prepararEfetivacaoAlocacao('${pk}', '${p.nome.replace(/'/g, "\\'")}', ${totalF}, ${totalU}, ${t})">Transferir</button>
                        </div>
                    </div>`;
                }
            }
            
            const banner = document.getElementById('banner-pendentes'); const listaAlocar = document.getElementById('lista-pendentes-alocar');
            if(banner && listaAlocar) {
                if(temPendente && currentRole !== 'visualizador') {
                    banner.style.display = 'flex';
                    document.getElementById('txt-qtd-pendentes').innerText = `Contém ${qtdItens} itens pendentes.`;
                    listaAlocar.innerHTML = htmlAlocar;
                } else {
                    banner.style.display = 'none';
                    listaAlocar.innerHTML = '';
                }
            }
        }

        function abrirAlocacaoModal() { document.getElementById('modalAlocar').style.display = 'flex'; }

        // Variável global para segurar a transferência enquanto aguarda o pop-up
        let transferenciaPendente = null;

        function prepararEfetivacaoAlocacao(pk, nomeProd, maxF, maxU, t) {
            const areaSel = document.getElementById(`aloc-area-${pk}`).value;
            if(!areaSel) { alert("Este produto não possui área assinalada para guardar."); return; }

            const elF = document.getElementById(`transf-f-${pk}`);
            const elU = document.getElementById(`transf-u-${pk}`);
            
            const pAloc = produtos[pk];
            const fracAloc = produtoUsaContagemFracionada(pAloc);
            let f = elF ? parseQtdValor(elF.value, fracAloc) : 0;
            let u = elU ? parseQtdValor(elU.value, fracAloc) : 0;

            if(f > maxF) f = maxF; if(u > maxU) u = maxU;
            
            if(f === 0 && u === 0) { 
                showToast("Digite uma quantidade maior que zero.", "error"); 
                return; 
            }

            // Monta o texto inteligente de confirmação (Plural/Singular e Ocultação Inteligente)
            let msgArr = [];
            if(f > 0) msgArr.push(`${f} ${f === 1 ? 'fardo' : 'fardos'}`);
            if(u > 0) msgArr.push(`${u} ${u === 1 ? 'unidade' : 'unidades'}`);
            let msgStr = msgArr.join(' e ');

            document.getElementById('msgConfirmTransfer').innerHTML = `Você está transferindo <strong style="color:var(--primary);">${msgStr} de ${nomeProd}</strong> para a área <strong style="color:var(--primary);">${areaSel}</strong>.<br><br>Confirmar operação?`;
            
            const p = produtos[pk];
            transferenciaPendente = {
                tipo: 'patio',
                pk, f, u, t, areaSel, maxF, maxU,
                fracionada: produtoUsaContagemFracionada(p)
            };
            document.getElementById('modalConfirmTransfer').style.display = 'flex';
        }

        let transferenciaOrigemNome = '';

        function voltarDeTransferenciaArea() {
            const area = areas.find(a => a.key === areaAtualKey);
            if (area) verArea(area.key, area.nome);
            else navegar('areas-lista');
        }

        function abrirTransferenciaArea() {
            if (currentRole === 'visualizador') return;
            cancelarModoContagem();
            const area = areas.find(a => a.key === areaAtualKey);
            if (!area) return;
            transferenciaOrigemNome = area.nome;
            document.getElementById('titulo-transferencia-area').innerText = `Transferir de: ${area.nome}`;
            document.getElementById('subtitulo-transferencia-area').innerText =
                'Informe quanto sair desta área e para qual estoque de destino (somente áreas vinculadas ao produto).';
            renderizarTransferenciaArea();
            navegar('transferencia-area');
        }

        function renderizarTransferenciaArea() {
            const lista = document.getElementById('lista-transferencia-area');
            if (!lista) return;
            const origem = transferenciaOrigemNome;
            const prods = Object.keys(produtos).filter(pk => {
                const p = produtos[pk];
                if (!p || !p.estoque || !p.estoque[origem]) return false;
                const est = p.estoque[origem];
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);
                const total = parseQtdValor(est.f, frac) * t + parseQtdValor(est.u, frac);
                return total > 0;
            });

            if (prods.length === 0) {
                lista.innerHTML = '<p style="color:#64748b;">Nenhum item com estoque nesta área para transferir.</p>';
                return;
            }

            prods.sort((a, b) => (produtos[a].nome || '').localeCompare(produtos[b].nome || ''));

            lista.innerHTML = prods.map(pk => {
                const p = produtos[pk];
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);
                const est = p.estoque[origem];
                let maxF = parseQtdValor(est.f, frac);
                let maxU = parseQtdValor(est.u, frac);
                if (!frac && t === 1 && maxF > 0) { maxU += maxF; maxF = 0; }
                const totalUn = maxF * t + maxU;
                const txtDisp = t > 1 && !frac
                    ? `${formatarQtdNumero(maxF, false)} Fds e ${formatarQtdNumero(maxU, frac)} Un.`
                    : `${formatarQtdNumero(totalUn, frac)} Un.`;

                const destinos = (p.locais || []).filter(l => l && l !== origem && l !== '_Pendente_');
                if (destinos.length === 0) {
                    return `<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:10px;">
                        <strong>${p.nome}</strong><br><span style="color:#64748b; font-size:0.85rem;">Sem outra área vinculada.</span></div>`;
                }

                const opts = destinos.map(d => `<option value="${d}">${d}</option>`).join('');
                const step = frac ? '0.01' : '1';
                const inputF = t > 1 && !frac ? `
                    <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">Fardos (máx. ${formatarQtdNumero(maxF, false)})</label>
                    <input type="number" id="tr-area-f-${pk}" value="0" min="0" max="${maxF}" step="${step}" style="margin:0; text-align:center;"></div>` : '';
                const inputU = `
                    <div style="flex:1;"><label style="font-size:0.7rem; color:#64748b;">${t > 1 && !frac ? 'Un.' : 'Qtd.'} (máx. ${formatarQtdNumero(maxU, frac)})</label>
                    <input type="number" id="tr-area-u-${pk}" value="0" min="0" max="${maxU}" step="${step}" style="margin:0; text-align:center;"></div>`;

                return `<div style="padding:15px; border:1px solid rgba(251,238,227,0.15); border-radius:10px; margin-bottom:10px; background:rgba(0,0,0,0.25);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                        <strong style="color:var(--text-main);">${p.nome}</strong>
                        <span style="color:var(--primary); font-weight:800; font-size:0.85rem;">Disponível: ${txtDisp}</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                        <div style="flex:1; min-width:140px;">
                            <label style="font-size:0.7rem; color:#64748b;">Destino</label>
                            <select id="tr-area-dest-${pk}" style="margin:0;">${opts}</select>
                        </div>
                        ${inputF}
                        ${inputU}
                        <button class="btn-submit req-contrib" style="margin:0; width:auto; padding:10px 14px; background:#3b82f6;" onclick="prepararTransferenciaArea('${pk}', '${p.nome.replace(/'/g, "\\'")}', ${maxF}, ${maxU}, ${t}, ${frac})">Transferir</button>
                    </div>
                </div>`;
            }).join('');
        }

        function prepararTransferenciaArea(pk, nomeProd, maxF, maxU, t, fracionada) {
            const destino = document.getElementById(`tr-area-dest-${pk}`).value;
            if (!destino) { showToast("Selecione o estoque de destino.", "error"); return; }

            const elF = document.getElementById(`tr-area-f-${pk}`);
            let f = elF ? parseQtdValor(elF.value, fracionada) : 0;
            let u = parseQtdValor(document.getElementById(`tr-area-u-${pk}`).value, fracionada);

            if (f > maxF) f = maxF;
            if (u > maxU) u = maxU;
            if (f <= 0 && u <= 0) {
                showToast("Informe uma quantidade maior que zero.", "error");
                return;
            }

            let msgArr = [];
            if (t > 1 && !fracionada && f > 0) msgArr.push(`${formatarQtdNumero(f, false)} ${f === 1 ? 'fardo' : 'fardos'}`);
            if (u > 0) msgArr.push(`${formatarQtdNumero(u, fracionada)} ${u === 1 ? 'unidade' : 'unidades'}`);

            document.getElementById('msgConfirmTransfer').innerHTML =
                `Transferir <strong style="color:var(--primary);">${msgArr.join(' e ')} de ${nomeProd}</strong><br>
                De <strong>${transferenciaOrigemNome}</strong> para <strong>${destino}</strong>?`;

            transferenciaPendente = {
                tipo: 'area',
                pk, f, u, t,
                origem: transferenciaOrigemNome,
                destino,
                maxF, maxU,
                fracionada
            };
            document.getElementById('modalConfirmTransfer').style.display = 'flex';
        }

        // Função disparada ao clicar no "Sim, Transferir" do modal
        document.getElementById('btnConfirmTransferAction').onclick = function() {
            if(!transferenciaPendente) return;
            const p = produtos[transferenciaPendente.pk];
            if (!p) return;

            let updates = {};

            if (transferenciaPendente.tipo === 'area') {
                const { pk, f, u, t, origem, destino, maxF, maxU, fracionada } = transferenciaPendente;
                const estOrig = p.estoque && p.estoque[origem] ? p.estoque[origem] : { f: 0, u: 0 };
                const estDest = p.estoque && p.estoque[destino] ? p.estoque[destino] : { f: 0, u: 0 };

                const novoOrig = subtrairEstoqueFU(estOrig.f, estOrig.u, f, u, t, fracionada);
                const somaDest = combinarEstoqueFU(estDest.f, estDest.u, f, u, t, fracionada);

                updates[`produtos/${pk}/estoque/${origem}`] = novoOrig;
                updates[`produtos/${pk}/estoque/${destino}`] = somaDest;

                db.ref().update(updates).then(() => {
                    document.getElementById('modalConfirmTransfer').style.display = 'none';
                    transferenciaPendente = null;
                    showToast("Transferência entre áreas concluída!", "success");
                    renderizarTransferenciaArea();
                    if (document.getElementById('detalhe-area').classList.contains('active')) {
                        const area = areas.find(a => a.key === areaAtualKey);
                        if (area) verArea(area.key, area.nome);
                    }
                });
                return;
            }

            const { pk, f, u, t, areaSel, maxF, maxU, fracionada } = transferenciaPendente;
            let estAtualArea = p.estoque && p.estoque[areaSel] ? p.estoque[areaSel] : { f: 0, u: 0 };
            const somaDest = combinarEstoqueFU(estAtualArea.f, estAtualArea.u, f, u, t, fracionada);
            const novoPend = subtrairEstoqueFU(maxF, maxU, f, u, t, fracionada);

            updates[`produtos/${pk}/estoque/${areaSel}`] = somaDest;
            if (novoPend.u <= 0 && novoPend.f <= 0) {
                updates[`produtos/${pk}/estoque/_Pendente_`] = null;
            } else {
                updates[`produtos/${pk}/estoque/_Pendente_`] = novoPend;
            }

            db.ref().update(updates).then(() => {
                document.getElementById('modalConfirmTransfer').style.display = 'none';
                transferenciaPendente = null;
                showToast("Transferência efetuada com sucesso!", "success");
                verificarPendentes();
            });
        };
        function navegar(id, btn, doHistorico = false) { 
            // Remove a aura/brilho de qualquer botão que tenha sido clicado
            if (document.activeElement) document.activeElement.blur();

            if (!doHistorico) { history.pushState({ tela: id }, "", "#" + id); }
            
            const alvo = document.getElementById(id);
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); 
            if(alvo) alvo.classList.add('active');

            // Mantém os botões do menu sincronizados
document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            if (id.includes('reservas') || id.includes('mapa') || id.includes('agenda')) {
                const btnRes = document.getElementById('nav-reservas-hub');
                if(btnRes) btnRes.classList.add('active');
            } else if (id.includes('receita')) {
                const btnRec = document.getElementById('nav-receitas-hub');
                if(btnRec) btnRec.classList.add('active');
            } else if (id === 'inicio') {
                const btnIni = document.getElementById('nav-inicio');
                if(btnIni) btnIni.classList.add('active');
            } else if (id.includes('financeiro')) {
                const btnFin = document.getElementById('nav-financeiro');
                if(btnFin) btnFin.classList.add('active');
            } else if (id === 'cardapio-digital') {
                const btnCard = document.getElementById('nav-cardapio');
                if(btnCard) btnCard.classList.add('active');
            } else if (id !== 'configuracoes' && id !== 'atribuir-categoria' && id !== 'atribuir-metodo' && id !== 'detalhe-categoria-admin') {
                const btnProd = document.getElementById('nav-produtos-hub');
                if(btnProd) btnProd.classList.add('active');
            } 
            
            window.scrollTo(0, 0); 
            
            if(id === 'mapa-salao') ajustarEscalaMapa();
            if(id === 'agenda-view') setTimeout(() => { renderizarCalendario(); }, 100);
            if(id === 'configuracoes') collapseConfigCards();

            const fabOptions = document.getElementById('fabOptions');
            const fabOverlay = document.getElementById('fab-overlay');
            if (fabOptions) fabOptions.classList.remove('active');
            if (fabOverlay) fabOverlay.classList.remove('active');
        }

        function irParaAgenda() {
            navegar('agenda-view');
            setTimeout(() => { renderizarCalendario(); }, 100);
        }

        function toggleFab(event) { 
            if(event) event.stopPropagation();
            const options = document.getElementById('fabOptions');
            const overlay = document.getElementById('fab-overlay');
            
            options.classList.toggle('active');
            overlay.classList.toggle('active');
        }

        function collapseConfigCards() {
            document.querySelectorAll('.config-card').forEach(card => {
                card.classList.remove('open');
                const header = card.querySelector('.config-card-header');
                if (header) header.setAttribute('aria-expanded', 'false');
            });
        }

        function toggleConfigCard(button) {
            const card = button.closest('.config-card');
            if (!card) return;
            const expanded = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', (!expanded).toString());
            card.classList.toggle('open', !expanded);
        }

        document.addEventListener('click', function(event) {
            const fabOptions = document.getElementById('fabOptions');
            const fabMain = document.querySelector('.fab-main');
            const btnNovoTop = document.getElementById('btn-novo-top');
            
            if (fabOptions && fabOptions.classList.contains('active')) {
                const isClickInsideMain = fabMain && fabMain.contains(event.target);
                const isClickInsideTop = btnNovoTop && btnNovoTop.contains(event.target);
                const isClickInsideOptions = fabOptions.contains(event.target);

                if (!isClickInsideMain && !isClickInsideTop && !isClickInsideOptions) {
                    fabOptions.classList.remove('active');
                }
            }
        });

        // ==========================================
        // PESQUISA E FILTROS DINÂMICOS
        // ==========================================
        function filtrarTabela(inputId, tabelaId) {
            const termo = document.getElementById(inputId).value.toLowerCase();
            const linhas = document.querySelectorAll(`#${tabelaId} tr`);
            linhas.forEach(linha => {
                const item = linha.querySelector('.col-item');
                if (item) {
                    const txt = item.innerText.toLowerCase();
                    linha.style.display = txt.includes(termo) ? '' : 'none';
                }
            });
        }

        let produtosVisualizacao = 'list'; // Estado atual da visualização: 'list' ou 'grid'

        function aplicarFiltrosProdutos() {
            const termo = document.getElementById('busca-categoria').value.toLowerCase();
            const linhas = document.querySelectorAll(`#tabela-produtos-filtrada tr`);
            
            linhas.forEach(linha => {
                const item = linha.querySelector('.col-item');
                if (!item) return;
                
                const txt = item.innerText.toLowerCase();
                const rowSub = linha.getAttribute('data-subgrupo') || "";
                
                const passText = txt.includes(termo);
                const passSub = (activeSubgroupFilter === 'Todos' || rowSub === activeSubgroupFilter);
                
                linha.style.display = (passText && passSub) ? '' : 'none';
            });

            renderizarProdutosEmCards();
        }

        function toggleVisualizacaoProdutos() {
            const wrapper = document.getElementById('produtos-view-wrapper');
            const toggleBtn = document.getElementById('toggleViewBtn');
            const label = document.getElementById('viewModeLabel');

            produtosVisualizacao = produtosVisualizacao === 'list' ? 'grid' : 'list';
            wrapper.classList.toggle('grid-view', produtosVisualizacao === 'grid');
            wrapper.classList.toggle('list-view', produtosVisualizacao === 'list');

            toggleBtn.innerText = produtosVisualizacao === 'grid' ? 'Voltar para Lista' : 'Alternar Visualização';
            label.innerText = `Modo: ${produtosVisualizacao === 'grid' ? 'Cards' : 'Lista'}`;

            renderizarProdutosEmCards();
        }

        function renderizarProdutosEmCards() {
            const grid = document.getElementById('produtos-card-grid');
            if (!grid) return;

            if (produtosVisualizacao !== 'grid') {
                grid.innerHTML = '';
                return;
            }

            const linhas = Array.from(document.querySelectorAll('#tabela-produtos-filtrada tr'));
            const cards = linhas
                .filter(linha => linha.style.display !== 'none')
                .map(linha => {
                    const itemSpan = linha.querySelector('.col-item');
                    const precoCell = linha.children[1];
                    const nome = itemSpan ? itemSpan.innerText.trim().replace(/\s+PRODUZIDO$/, '') : 'Produto';
                    const preco = precoCell ? precoCell.innerText.trim() : 'R$ 0,00';

                    return `
                        <article class="product-card">
                            <div class="card-media">
                                <img src="https://via.placeholder.com/400x400?text=Produto" alt="${nome}">
                                <button class="favorite-btn" type="button" aria-label="Favoritar">
                                    <i class="ph ph-heart"></i>
                                </button>
                            </div>
                            <div class="card-body">
                                <p class="product-title">${nome}</p>
                                <strong class="product-price">${preco}</strong>
                            </div>
                        </article>
                    `;
                });

            if (cards.length === 0) {
                grid.innerHTML = `<p class="empty-card-message">Nenhum produto encontrado.</p>`;
            } else {
                grid.innerHTML = cards.join('');
            }
        }

        function setSubgroupFilter(sub, btn) {
            activeSubgroupFilter = sub;
            btn.parentElement.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            aplicarFiltrosProdutos();
        }

        function filtrarOrdenacaoSubgrupo(sub) {
            activeAdminSubgroupFilter = sub;
            const container = document.getElementById('info-tecnica-cat');
            if(container) {
                container.querySelectorAll('.chip').forEach(btn => btn.classList.remove('active-chip'));
                const btns = container.querySelectorAll('.chip');
                btns.forEach(b => {
                    if(b.getAttribute('data-sub') === sub) b.classList.add('active-chip');
                });
            }
            renderizarOrdenacaoCategoria();
        }

        // ==========================================
        // INICIALIZAÇÃO E LISTENERS
        // ==========================================
        window.onload = () => { 
            document.getElementById('setup-mapa-data').value = new Date().toISOString().split('T')[0];
            renderizarCalendario(); 
        };

        let eventosTimeline = [];

        function pararListenersFirebase() {
            if (!listenersFirebaseAtivos) return;
            db.ref('areas').off('value');
            db.ref('produtos').off('value');
            db.ref('categorias').off('value');
            db.ref('metodos').off('value');
            db.ref('historico_timeline').off('value');
            db.ref('reservas').off('value');
            db.ref('mapas').off('value');
            db.ref('receitas').off('value');
            listenersFirebaseAtivos = false;
            areas = [];
            produtos = {};
            categorias = {};
            metodosCompra = {};
            reservasApp = {};
            mapasApp = {};
            receitasDB = {};
            eventosTimeline = [];
            try {
                renderizarAreas();
                renderizarGradeAgrupada();
                renderizarPedidosMetodos();
                renderizarReceitas();
                renderizarCalendario();
            } catch (e) {}
        }

        function iniciarListenersFirebase() {
            if (listenersFirebaseAtivos || !currentUser) return;
            listenersFirebaseAtivos = true;

            db.ref('areas').on('value', s => { 
                try { 
                    const val = s.val();
                    areas = val ? Object.entries(val).map(([key, v]) => {
                        if (typeof v === 'object' && v !== null) {
                            return { key, nome: v.nome || "Área Recuperada", config: v.config || { usaPadrao: false, padroes: {} } };
                        }
                        return { key, nome: v || "Área Recuperada", config: { usaPadrao: false, padroes: {} } };
                    }) : []; 
                    renderizarAreas(); 
                    renderizarChecksConfig(); 
                } catch(e){ console.error("Erro Áreas:", e); } 
            }, err => { console.error("Permissão áreas:", err); showToast("Sem permissão para ler áreas.", "error"); });

            db.ref('produtos').on('value', s => {
                try {
                    produtos = s.val() || {};
                    renderizarGradeAgrupada();
                    renderizarAreas();
                    verificarPendentes();
                    if (document.getElementById('pedidos-lista').classList.contains('active')) {
                        const metKey = Object.keys(metodosCompra).find(k => metodosCompra[k].nome === document.getElementById('titulo-pedido-metodo').innerText.replace('Pedidos: ', ''));
                        if (metKey) verPedidoPorMetodo(metKey);
                    }
                } catch(e) { console.error("Erro produtos:", e); }
            }, err => { console.error("Permissão produtos:", err); showToast("Sem permissão para ler produtos.", "error"); });

            db.ref('categorias').on('value', s => { 
                try { 
                    categorias = s.val() || {}; 
                    renderizarPresets(); 
                    renderizarGradeAgrupada(); 
                    if (document.getElementById('detalhe-categoria-admin').classList.contains('active')) renderizarOrdenacaoCategoria();
                } catch(e){} 
            });

            db.ref('metodos').on('value', s => {
                try {
                    metodosCompra = s.val() || {};
                    renderizarMetodosConfig();
                    renderizarPresetsMetodos();
                    renderizarGradeAgrupada();
                    renderizarPedidosMetodos();
                } catch(e) {}
            });

            if (currentRole === 'dono') {
                db.ref('historico_timeline').on('value', s => {
                    const val = s.val();
                    if (val) {
                        eventosTimeline = Object.keys(val).map(k => ({ id: k, ...val[k] }));
                        eventosTimeline.sort((a, b) => b.timestamp - a.timestamp);
                    } else {
                        eventosTimeline = [];
                    }
                    if (document.getElementById('timeline-estoque') && document.getElementById('timeline-estoque').classList.contains('active')) renderizarTimeline();
                });
            }

            db.ref('reservas').on('value', s => {
                try {
                    reservasApp = s.val() || {};
                    if (document.getElementById('agenda-view').classList.contains('active')) renderizarCalendario();
                    if (document.getElementById('agenda-detalhe').classList.contains('active')) renderizarReservasDia();
                    if (document.getElementById('mapa-salao').classList.contains('active')) carregarReservasMapa();
                } catch(e) {}
            });

            db.ref('mapas').on('value', s => {
                try {
                    mapasApp = s.val() || {};
                    if (document.getElementById('mapa-salao').classList.contains('active')) {
                        carregarMapa();
                        carregarReservasMapa();
                    }
                } catch(e) {}
            });

            db.ref('receitas').on('value', s => {
                try {
                    receitasDB = s.val() || {};
                    if (document.getElementById('receitas-lista').classList.contains('active')) renderizarReceitas();
                    if (document.getElementById('detalhe-receita').classList.contains('active')) verDetalhesReceita(receitaAtualKey);
                } catch(e) {}
            });
        }

        // ==========================================
        // SISTEMA DE MAPA DE SALÃO
        // ==========================================
        const macroAreas = { "Brinquedão": { top: "80px", left: "60px", w: 600, h: 220 }, "Parede": { top: "340px", left: "60px", w: 110, h: 500 }, "Meio": { top: "340px", left: "210px", w: 110, h: 500 }, "Mesas Redondas": { top: "360px", left: "370px", w: 120, h: 180 }, "Corrimão": { top: "560px", left: "370px", w: 120, h: 250 }, "Bistrôs": { top: "620px", left: "550px", w: 110, h: 200 } };
        const configMapa = { "Brinq1": { macro: "Brinquedão", max: 6, chairsL: 10, chairsR: 10, top: "90px", left: "80px", tipo: "normal" }, "Brinq2": { macro: "Brinquedão", max: 5, chairsL: 8, chairsR: 8, top: "90px", left: "245px", tipo: "normal" }, "Brinq3": { macro: "Brinquedão", max: 4, chairsL: 7, chairsR: 7, top: "90px", left: "410px", tipo: "normal" }, "Brinq4": { macro: "Brinquedão", max: 4, chairsL: 6, chairsT: 2, chairsB: 2, top: "90px", left: "580px", tipo: "parede-direita" }, "Parede": { macro: "Parede", max: 13, chairsL: 20, chairsR: 20, top: "350px", left: "80px", tipo: "normal" }, "Meio": { macro: "Meio", max: 13, chairsL: 20, chairsR: 20, top: "350px", left: "230px", tipo: "normal" }, "Mesas Redondas": { macro: "Mesas Redondas", max: 3, top: "380px", left: "410px", tipo: "redonda" }, "Corrimão": { macro: "Corrimão", max: 6, chairsL: 10, chairsR: 10, top: "580px", left: "390px", tipo: "normal" }, "Bistrôs": { macro: "Bistrôs", max: 3, top: "640px", left: "580px", tipo: "bistro" } };
        function abrirMapaComFiltro() {
            const dt = document.getElementById('setup-mapa-data').value;
            const tn = document.getElementById('setup-mapa-turno').value;
            if(!dt) { alert("Selecione uma data para o mapa."); return; }
            
            mapaAtualData = dt;
            mapaAtualTurno = tn;
            const [y, m, d] = dt.split('-');
            const turnoStr = tn === 'dia' ? 'Dia (Almoço)' : 'Tarde/Noite';
            document.getElementById('mapa-header-info').innerText = `${d}/${m}/${y} - ${turnoStr}`;
            
            areaFocadaMapa = null;
            mesasSelecionadasMapa = [];
            document.getElementById('btn-voltar-mapa').style.display = 'none';
            document.getElementById('painel-controles-mapa').style.display = 'none';
            
            navegar('mapa-salao');
            carregarReservasMapa();
            setTimeout(() => { ajustarEscalaMapa(); }, 100);
        }

        function carregarReservasMapa() {
            try {
                const lista = reservasApp[mapaAtualData] || {};
                let resHtml = '';
                for(let k in lista) {
                    const r = lista[k];
                    if(r.periodo === mapaAtualTurno) {
                        let isMontada = false;
                        const layout = (mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno]) ? mapasApp[mapaAtualData][mapaAtualTurno] : {};
                        for(let mId in layout) { if(layout[mId].status === 'reservada' && layout[mId].nome === r.nome) { isMontada = true; break; } }

                        if(!isMontada) {
                             resHtml += `
                             <div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--row-even); display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
                                 <div><strong style="font-size:0.95rem; color:var(--bg-sidebar);">${r.nome}</strong><br><span style="font-size:0.75rem; color:#64748b;">📍 ${r.area} | 👥 ${r.lugares} lug.</span></div>
                                 <button class="btn-submit req-contrib" style="width:auto; margin:0; padding:8px 15px; font-size:0.8rem; background:var(--primary); border-radius:6px;" onclick="montarReservaNoMapa('${r.nome}', '${r.area}')">Montar</button>
                             </div>`;
                        } else {
                             resHtml += `
                             <div style="padding:10px; border:1px solid #10b981; border-radius:8px; background:#f0fdf4; display:flex; justify-content:space-between; align-items:center; opacity:0.8; margin-bottom: 5px;">
                                 <div><strong style="font-size:0.95rem; color:#047857;">${r.nome}</strong><br><span style="font-size:0.75rem; color:#047857;">✅ Já montada no salão</span></div>
                             </div>`;
                        }
                    }
                }
                document.getElementById('lista-reservas-turno-mapa').innerHTML = resHtml || '<p style="font-size:0.85rem; color:#64748b; text-align:center; margin-top:10px;">Nenhuma reserva pendente para este turno.</p>';
            } catch(e) {}
        }

        function montarReservaNoMapa(nome, areaOriginal) {
            let macroNome = "";
            if(areaOriginal.includes("Parede")) macroNome = "Parede";
            else if(areaOriginal.includes("Meio")) macroNome = "Meio";
            else if(areaOriginal.includes("Brinquedão")) macroNome = "Brinquedão";
            else if(areaOriginal.includes("Corrimão")) macroNome = "Corrimão";
            else if(areaOriginal.includes("Redondas")) macroNome = "Mesas Redondas";
            else if(areaOriginal.includes("Bistrôs")) macroNome = "Bistrôs";

            if(!macroNome) { alert("Esta reserva pertence a uma área fora do Salão 2."); return; }
            document.getElementById('mapa-reserva-nome').value = nome;
            focarArea(macroNome);
        }

        function toggleModoLayoutMapa() {
            modoMontagemMapa = !modoMontagemMapa; mesasSelecionadasMapa = [];
            const btn = document.getElementById('btn-edit-layout');
            btn.innerHTML = modoMontagemMapa ? "💾 Sair Montagem" : "✏️ Modo Montagem";
            btn.style.background = modoMontagemMapa ? "#10b981" : "var(--bg-sidebar)";
            atualizarPainelDinamicoMapa(); carregarMapa();
        }

        function focarArea(macroNome) {
            areaFocadaMapa = macroNome; mesasSelecionadasMapa = [];
            document.getElementById('btn-voltar-mapa').style.display = 'block';
            document.getElementById('painel-controles-mapa').style.display = 'block';
            atualizarPainelDinamicoMapa(); ajustarEscalaMapa();
        }

        function desfocarArea() {
            areaFocadaMapa = null; mesasSelecionadasMapa = [];
            document.getElementById('btn-voltar-mapa').style.display = 'none';
            document.getElementById('painel-controles-mapa').style.display = 'none';
            atualizarPainelDinamicoMapa(); ajustarEscalaMapa();
        }

        function ajustarEscalaMapa() {
            const viewport = document.getElementById('mapa-viewport'); const planta = document.getElementById('mapa-container');
            if (!viewport || !planta) return;
            let vw = viewport.clientWidth, vh = viewport.clientHeight;
            if (vw === 0 || vh === 0) return; 

            if (areaFocadaMapa) {
                const macFoco = macroAreas[areaFocadaMapa];
                let scaleX = vw / macFoco.w, scaleY = vh / macFoco.h;
                let zoomScale = Math.min(scaleX, scaleY) * 0.85; 
                if(zoomScale > 2.0) zoomScale = 2.0; if(zoomScale < 0.5) zoomScale = 0.5;
                let tx = (vw / 2) - ((parseInt(macFoco.left) + (macFoco.w / 2)) * zoomScale);
                let ty = (vh / 2) - ((parseInt(macFoco.top) + (macFoco.h / 2)) * zoomScale);
                planta.style.transformOrigin = `0 0`;
                planta.style.transform = `translate(${tx}px, ${ty}px) scale(${zoomScale})`;
            } else {
                let baseScale = Math.min(vw / 750, vh / 950) * 0.95; 
                let tx = (vw - (750 * baseScale)) / 2, ty = (vh - (950 * baseScale)) / 2;
                planta.style.transformOrigin = `0 0`;
                planta.style.transform = `translate(${tx}px, ${ty}px) scale(${baseScale})`;
            }
            carregarMapa();
        }

        window.addEventListener('resize', () => { if(document.getElementById('mapa-salao').classList.contains('active')) ajustarEscalaMapa(); });

        function carregarMapa() {
            let layoutDia = {}; if(mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno]) layoutDia = mapasApp[mapaAtualData][mapaAtualTurno];
            let html = `<div class="bloco-banheiro">BANHEIRO</div><div class="parede-preta-h"></div><div class="parede-preta-v"></div>`;

            for(let macroNome in macroAreas) {
                const mac = macroAreas[macroNome]; let textRot = mac.h > mac.w ? 'transform: rotate(-90deg);' : '';
                if (!areaFocadaMapa) { html += `<div class="bloco-macro" style="top: ${mac.top}; left: ${mac.left}; width: ${mac.w}px; height: ${mac.h}px;" onclick="focarArea('${macroNome}')"><span class="macro-title" style="${textRot}">${macroNome}</span></div>`; continue; }
                if (areaFocadaMapa && macroNome !== areaFocadaMapa) { html += `<div class="bloco-macro unfocused" style="top: ${mac.top}; left: ${mac.left}; width: ${mac.w}px; height: ${mac.h}px;" onclick="focarArea('${macroNome}')"><span class="macro-title" style="${textRot}">${macroNome}</span></div>`; continue; }

                for(let subArea in configMapa) {
                    const conf = configMapa[subArea]; if (conf.macro !== macroNome) continue;

                    let lbl = ''; 
                    if (!areaFocadaMapa) {
                        if(subArea === 'Corrimão') lbl = `<div class="label-vertical" style="top:30px; left:-30px;">CORRIMÃO</div>`; 
                        if(subArea === 'Mesas Redondas') lbl = `<div class="label-vertical" style="top:25px; left:-35px;">REDONDAS</div>`; 
                        if(subArea === 'Bistrôs') lbl = `<div class="label-vertical" style="top:25px; left:-30px;">BISTRÔS</div>`;
                    }

                    let activeCount = 0;
                    for(let i = 1; i <= conf.max; i++) { let st = layoutDia[`${subArea}_${i}`] ? layoutDia[`${subArea}_${i}`].status : 'ativa'; if (st === 'ativa' || st === 'reservada' || st === 'selecionada') activeCount++; }

                    let qtL = conf.chairsL ? Math.round((conf.chairsL / conf.max) * activeCount) : 0; let qtR = conf.chairsR ? Math.round((conf.chairsR / conf.max) * activeCount) : 0; let qtT = conf.chairsT && activeCount > 0 ? conf.chairsT : 0; let qtB = conf.chairsB && activeCount > 0 ? conf.chairsB : 0;
                    let htmlCadeirasL = ''; if(qtL > 0) { for(let c=0; c<qtL; c++) htmlCadeirasL += '<div class="cadeira"></div>'; htmlCadeirasL = `<div class="cadeiras-col">${htmlCadeirasL}</div>`; }
                    let htmlCadeirasR = ''; if(qtR > 0) { for(let c=0; c<qtR; c++) htmlCadeirasR += '<div class="cadeira"></div>'; htmlCadeirasR = `<div class="cadeiras-col">${htmlCadeirasR}</div>`; }
                    let htmlMesas = ''; if(qtT > 0) { htmlMesas += '<div class="cadeiras-row">'; for(let c=0; c<qtT; c++) htmlMesas += '<div class="cadeira"></div>'; htmlMesas += '</div>'; }

                    for(let i = 1; i <= conf.max; i++) {
                        const mesaId = `${subArea}_${i}`; const estado = layoutDia[mesaId] ? layoutDia[mesaId].status : 'ativa'; const nomeRes = layoutDia[mesaId] ? layoutDia[mesaId].nome : '';
                        let cssStatus = 'status-ghost'; if(estado === 'ativa') cssStatus = 'status-ativa'; if(estado === 'reservada') cssStatus = 'status-reservada'; if(mesasSelecionadasMapa.includes(mesaId)) cssStatus = 'status-selecionada';
                        let textoMesa = estado === 'reservada' ? nomeRes.substring(0,3) : i; let classeFormato = (conf.tipo === 'redonda' || conf.tipo === 'bistro') ? 'mesa-redonda' : 'mesa-quadrada';
                        htmlMesas += `<div id="mesa-${mesaId}" class="${classeFormato} ${cssStatus}" onclick="cliqueMesa('${mesaId}')">${textoMesa}</div>`;
                    }

                    if(qtB > 0) { htmlMesas += '<div class="cadeiras-row">'; for(let c=0; c<qtB; c++) htmlMesas += '<div class="cadeira"></div>'; htmlMesas += '</div>'; }
                    html += `<div class="planta-fileira" style="top: ${conf.top}; left: ${conf.left}; ${conf.tipo==='redonda'||conf.tipo==='bistro' ? 'flex-direction:column; gap:10px;' : ''}">${lbl}${htmlCadeirasL}<div class="mesas-col">${htmlMesas}</div>${htmlCadeirasR}</div>`;
                }
            }
            const plantaBox = document.getElementById('mapa-container'); if (plantaBox) plantaBox.innerHTML = html;
        }

        function cliqueMesa(mesaId) {
            if(currentRole === 'visualizador') return;
            let layoutDia = {}; if(mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno]) layoutDia = mapasApp[mapaAtualData][mapaAtualTurno];
            let atual = layoutDia[mesaId] ? layoutDia[mesaId].status : 'ativa';

            if(modoMontagemMapa) {
                if(atual === 'reservada') { alert("Não pode alterar mesa reservada!"); return; }
                db.ref(`mapas/${mapaAtualData}/${mapaAtualTurno}/${mesaId}`).set({status: atual === 'ghost' ? 'ativa' : 'ghost'});
            } else {
                if(atual === 'ghost') { db.ref(`mapas/${mapaAtualData}/${mapaAtualTurno}/${mesaId}`).set({status: 'ativa'}); return; }
                
                if(atual === 'reservada') { 
                    const nomeAlvo = layoutDia[mesaId].nome;
                    if(confirm(`Excluir a reserva de: ${nomeAlvo}? (Isso vai liberar TODAS as mesas vinculadas a esta reserva)`)) {
                        let updates = {};
                        for(let keyMesa in layoutDia) if(layoutDia[keyMesa].status === 'reservada' && layoutDia[keyMesa].nome === nomeAlvo) updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${keyMesa}`] = { status: 'ativa' };
                        db.ref().update(updates).then(() => { mesasSelecionadasMapa = []; atualizarPainelDinamicoMapa(); carregarMapa(); });
                    }
                    return; 
                }

                let partes = mesaId.split('_'); let subAreaAtual = partes[0]; let idxAtual = parseInt(partes[1]); let confMesa = configMapa[subAreaAtual];
                
                if (confMesa.tipo === 'redonda' || confMesa.tipo === 'bistro') {
                    if (mesasSelecionadasMapa.includes(mesaId)) mesasSelecionadasMapa = []; else mesasSelecionadasMapa = [mesaId]; 
                } else {
                    let tinhaEspecial = mesasSelecionadasMapa.some(id => { let a = id.split('_')[0]; return configMapa[a].tipo === 'redonda' || configMapa[a].tipo === 'bistro'; });
                    if (tinhaEspecial) mesasSelecionadasMapa = [];
                    let selectedInSubArea = mesasSelecionadasMapa.filter(id => id.startsWith(subAreaAtual + '_')).map(id => parseInt(id.split('_')[1]));
                    const isSelected = selectedInSubArea.includes(idxAtual);

                    if (isSelected) {
                        mesasSelecionadasMapa = mesasSelecionadasMapa.filter(id => { if (!id.startsWith(subAreaAtual + '_')) return true; return parseInt(id.split('_')[1]) < idxAtual; });
                    } else {
                        if(selectedInSubArea.length > 0) {
                            let min = Math.min(...selectedInSubArea, idxAtual); let max = Math.max(...selectedInSubArea, idxAtual);
                            mesasSelecionadasMapa = mesasSelecionadasMapa.filter(id => !id.startsWith(subAreaAtual + '_'));
                            for(let i = min; i <= max; i++) { let iterId = `${subAreaAtual}_${i}`; let st = layoutDia[iterId] ? layoutDia[iterId].status : 'ativa'; if(st === 'ativa') mesasSelecionadasMapa.push(iterId); }
                        } else { mesasSelecionadasMapa.push(mesaId); }
                    }
                }
                atualizarPainelDinamicoMapa(); carregarMapa(); 
            }
        }

        function atualizarPainelDinamicoMapa() {
            const hasSelection = mesasSelecionadasMapa.length > 0;
            const blockDinamico = document.getElementById('dynamic-selected-controls');
            if(blockDinamico) { blockDinamico.style.display = hasSelection ? 'flex' : 'none'; document.getElementById('qtd-selecionadas').innerText = mesasSelecionadasMapa.length; }
        }

        function obterSubAreaAtual() {
            if (mesasSelecionadasMapa.length > 0) return mesasSelecionadasMapa[0].split('_')[0];
            let subAreas = Object.keys(configMapa).filter(k => configMapa[k].macro === areaFocadaMapa);
            if (subAreas.length === 1) return subAreas[0];
            alert("Selecione pelo menos uma mesa na fileira para o sistema saber qual calcular."); return null;
        }

        function adicionarMesaFileira() {
            if(currentRole === 'visualizador') return; let sub = obterSubAreaAtual(); if(!sub) return;
            let layoutDia = mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno] ? mapasApp[mapaAtualData][mapaAtualTurno] : {};
            let conf = configMapa[sub];
            for(let i = 1; i <= conf.max; i++) {
                let st = layoutDia[`${sub}_${i}`] ? layoutDia[`${sub}_${i}`].status : 'ativa';
                if(st === 'ghost') { db.ref(`mapas/${mapaAtualData}/${mapaAtualTurno}/${sub}_${i}`).set({status: 'ativa'}); return; }
            }
            alert("A fileira já está na capacidade máxima física!");
        }

        function subtrairMesaFileira() {
            if(currentRole === 'visualizador') return; let sub = obterSubAreaAtual(); if(!sub) return;
            let layoutDia = mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno] ? mapasApp[mapaAtualData][mapaAtualTurno] : {};
            let conf = configMapa[sub];
            for(let i = conf.max; i >= 1; i--) {
                let st = layoutDia[`${sub}_${i}`] ? layoutDia[`${sub}_${i}`].status : 'ativa';
                if(st === 'ativa') { db.ref(`mapas/${mapaAtualData}/${mapaAtualTurno}/${sub}_${i}`).set({status: 'ghost'}); return; } 
                else if (st === 'reservada') { alert("A última mesa ativa está reservada, não pode ser removida."); return; }
            }
            alert("A fileira já não possui mesas ativas.");
        }

        function apagarMesasSelecionadas() {
            if(currentRole === 'visualizador' || mesasSelecionadasMapa.length === 0) return;
            let updates = {}; mesasSelecionadasMapa.forEach(id => updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${id}`] = { status: 'ghost' });
            db.ref().update(updates).then(() => { mesasSelecionadasMapa = []; atualizarPainelDinamicoMapa(); });
        }

        function salvarReservaMapa() {
            if(mesasSelecionadasMapa.length === 0) return; let nome = document.getElementById('mapa-reserva-nome').value.trim();
            if(!nome) { alert("Digite o nome para salvar a reserva!"); return; }
            let updates = {}; mesasSelecionadasMapa.forEach(id => updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${id}`] = { status: 'reservada', nome: nome });
            let porArea = {}; mesasSelecionadasMapa.forEach(id => { let partes = id.split('_'); let subArea = partes[0]; let idx = parseInt(partes[1]); if(!porArea[subArea]) porArea[subArea] = []; porArea[subArea].push(idx); });

            // Corte Espacial de Segurança
            for(let subArea in porArea) {
                if(configMapa[subArea].tipo === 'redonda' || configMapa[subArea].tipo === 'bistro') continue; 
                let indices = porArea[subArea]; let min = Math.min(...indices); let max = Math.max(...indices);
                [min - 1, max + 1].forEach(i => { if(i >= 1 && i <= configMapa[subArea].max) updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${subArea}_${i}`] = { status: 'ghost' }; });
            }
            db.ref().update(updates).then(() => { mesasSelecionadasMapa = []; document.getElementById('mapa-reserva-nome').value = ""; atualizarPainelDinamicoMapa(); });
        }

        // ==========================================
        // AGENDA DETALHADA E CALENDÁRIO
        // ==========================================
        function mudarMes(dir) { 
            navDate.setMonth(navDate.getMonth() + dir); 
            renderizarCalendario(); 
        }
        
        function renderizarCalendario() {
            const elMes = document.getElementById('cal-mes-ano'); 
            const elGrid = document.getElementById('cal-grid-dias');
            if(!elMes || !elGrid) return;
            
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            elMes.innerText = `${monthNames[navDate.getMonth()]} ${navDate.getFullYear()}`;
            
            const firstDay = new Date(navDate.getFullYear(), navDate.getMonth(), 1).getDay();
            const daysInMonth = new Date(navDate.getFullYear(), navDate.getMonth() + 1, 0).getDate();
            
            let html = '';
            for(let i=0; i<firstDay; i++) {
                html += `<div class="cal-day empty"></div>`;
            }
            
            for(let i=1; i<=daysInMonth; i++) {
                const dateStr = `${navDate.getFullYear()}-${String(navDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                const dw = new Date(navDate.getFullYear(), navDate.getMonth(), i).getDay();
                
                let classes = 'cal-day';
                if(dw === 1) classes += ' closed-day';
                if(reservasApp[dateStr]) classes += ' has-reserva';
                
                html += `<div class="${classes}" onclick="abrirDia('${dateStr}', ${dw})">${i}</div>`;
            }
            elGrid.innerHTML = html;
        }

        function abrirDia(dateStr, dw) {
            if(dw === 1) return; // Segunda-feira fechado
            
            dataAtualReserva = dateStr; 
            const [y, m, d] = dateStr.split('-'); 
            document.getElementById('titulo-data-reserva').innerText = `Reservas: ${d}/${m}/${y}`;
            
            const selPer = document.getElementById('res-periodo');
            selPer.innerHTML = dw === 0 ? '<option value="dia">Dia</option>' : '<option value="dia">Dia</option><option value="tarde_noite">Tarde/Noite</option>';
            
            atualizarFormReserva(); 
            document.getElementById('res-nome').value = ""; 
            renderizarReservasDia(); 
            navegar('agenda-detalhe');
        }

        function renderizarReservasDia() {
            const lista = reservasApp[dataAtualReserva] || {}; 
            const dw = new Date(dataAtualReserva + 'T12:00:00').getDay();
            let endStr = "- 01:00"; if(dw===2) endStr="- 22:00"; else if(dw===3||dw===4) endStr="- 23:00";
            
            const html = Object.keys(lista).map(k => {
                const r = lista[k]; const hor = r.periodo === 'dia' ? '12:00 - 18:00' : `${r.horario} ${endStr}`;
                const btnExcluir = (currentRole === 'dono' || currentRole === 'contribuidor') ? `<span style="color:red; font-size:0.8rem; cursor:pointer; font-weight:bold;" onclick="excluirReserva('${k}')">Excluir</span>` : '';
                return `<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--row-even); margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:1.05rem; color:var(--bg-sidebar);">${r.nome}</strong>${btnExcluir}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-top:6px; display:flex; flex-direction:column; gap:3px;"><span>📍 ${r.area} <strong>(${r.lugares} lug.)</strong></span><span>⏰ ${hor}</span></div></div>`;
            }).join('') || `<p style="font-size:0.85rem; color:#64748b; text-align:center; margin-top:20px;">Nenhuma reserva para este dia.</p>`;
            
            document.getElementById('lista-reservas-dia').innerHTML = html;
            atualizarFormReserva();
        }

        function calcularCapacidadeRestante() {
            const areaSelecionada = document.getElementById('res-area').value;
            const periodoSelecionado = document.getElementById('res-periodo').value;
            const capTotal = CAPACIDADE_AREAS[areaSelecionada] || 0;
            
            let ocupados = 0;
            const listaReservas = reservasApp[dataAtualReserva] || {};
            for (let k in listaReservas) {
                const r = listaReservas[k];
                if (r.area === areaSelecionada && r.periodo === periodoSelecionado) {
                    ocupados += (parseInt(r.lugares) || 0);
                }
            }
            const restante = capTotal - ocupados;
            return restante > 0 ? restante : 0;
        }

        function atualizarFormReserva() { 
            const per = document.getElementById('res-periodo').value; 
            document.getElementById('res-time-dia').style.display = per === 'dia' ? 'block' : 'none'; 
            document.getElementById('res-time-tarde').style.display = per === 'dia' ? 'none' : 'flex'; 

            // CÁLCULO DE CAPACIDADE INTELIGENTE
            const areaSelecionada = document.getElementById('res-area').value;
            const restante = calcularCapacidadeRestante();
            const isUnidade = areaSelecionada.includes('Redondas') || areaSelecionada.includes('Bistrôs');
            const lblUnidade = isUnidade ? 'unidades' : 'lugares';
            
            document.getElementById('res-capacidade-aviso').innerText = `Restam: ${restante} ${lblUnidade} livres nesta área (Turno: ${per === 'dia' ? 'Dia' : 'Tarde/Noite'}).`;
            document.getElementById('res-lugares').placeholder = isUnidade ? 'Quantidade de mesas' : 'Lugares (Qtd de pessoas)';
        }

        function salvarReserva() {
            if(currentRole === 'visualizador') return; 
            const nome = document.getElementById('res-nome').value.trim(); 
            const per = document.getElementById('res-periodo').value; 
            const hor = per === 'dia' ? '12:00' : document.getElementById('res-horario-tarde').value; 
            const area = document.getElementById('res-area').value; 
            const lug = parseInt(document.getElementById('res-lugares').value) || 0;
            
            if(!nome || lug <= 0) { alert("Preencha corretamente!"); return; } 
            
            // TRAVA DE SEGURANÇA (OVERBOOKING)
            const restante = calcularCapacidadeRestante();
            if (lug > restante) {
                const isUnidade = area.includes('Redondas') || area.includes('Bistrôs');
                alert(`Capacidade excedida! Restam apenas ${restante} ${isUnidade ? 'unidades' : 'lugares'} para esta área.`);
                return;
            }

            db.ref(`reservas/${dataAtualReserva}`).push({ nome, periodo: per, horario: hor, area, lugares: lug }); 
            document.getElementById('res-nome').value = ""; document.getElementById('res-lugares').value = "";
        }

        function excluirReserva(k) { 
            if((currentRole === 'dono' || currentRole === 'contribuidor') && confirm("Excluir esta reserva?")) {
                db.ref(`reservas/${dataAtualReserva}/${k}`).remove(); 
            }
        }

        // ==========================================
        // ORDENAÇÃO DE CATEGORIAS E PRODUTOS (PRIORIDADE MASTER)
        // ==========================================
        function removerAcentos(str) { return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : ""; }
        const mapaEmojis = { "refrigerantes": "<i class='ph ph-drop'></i>", "cervejas": "<i class='ph ph-beer-bottle'></i>", "vinhos bar": "<i class='ph ph-wine'></i>", "camara fria": "<i class='ph ph-thermometer-cold'></i>", "geladeira red bull": "<i class='ph ph-battery-charging'></i>", "chopps bar": "<i class='ph ph-pint-glass'></i>", "laje": "<i class='ph ph-ladder'></i>", "atacadao": "<i class='ph ph-shopping-cart'></i>", "mercado": "<i class='ph ph-storefront'></i>", "distribuidora": "<i class='ph ph-truck'></i>" };
        function obterEmoji(nome) { const limpo = removerAcentos((nome||"").toLowerCase().trim()); for(let key in mapaEmojis) if(limpo.includes(key)) return mapaEmojis[key]; return "<i class='ph ph-package'></i>"; }
        function getCategoriasProduto(p) { if (!p) return []; if (p.categorias) return Array.isArray(p.categorias) ? [...p.categorias] : (typeof p.categorias==='string' ? [p.categorias] : Object.values(p.categorias)); return p.categoria ? [p.categoria] : []; }

        const ORDEM_CATEGORIAS = ["refrigerantes", "energeticos", "cervejas", "cervejas especiais", "frutas congeladas"];
        
        function getPrioridadeCategoria(nomeCat) {
            if(!nomeCat) return 999;
            const limpo = removerAcentos(nomeCat.toLowerCase().trim());
            const idx = ORDEM_CATEGORIAS.indexOf(limpo);
            return idx !== -1 ? idx : 999;
        }

        function getPrioridadeProduto(p) {
            const cats = getCategoriasProduto(p);
            if(!cats || cats.length === 0) return 999;
            let minPrio = 999;
            cats.forEach(c => { const prio = getPrioridadeCategoria(c); if(prio < minPrio) minPrio = prio; });
            return minPrio;
        }

        function getCategoriaPrincipalProduto(p) {
    const cats = getCategoriasProduto(p);
    return cats.length > 0 ? cats[0] : "Sem Categoria";
}

function getCategoriaObjPorNome(nome) {
    return Object.values(categorias).find(c => c && c.nome === nome);
}

function categoriaUsaContagemFracionada(nomeCat) {
    const c = getCategoriaObjPorNome(nomeCat);
    return !!(c && c.contagemFracionada);
}

function produtoUsaContagemFracionada(p) {
    if (!p) return false;
    return getCategoriasProduto(p).some(cn => categoriaUsaContagemFracionada(cn));
}

function getTamFardoProduto(p) {
    let t = 1;
    getCategoriasProduto(p).forEach(cn => {
        const c = getCategoriaObjPorNome(cn);
        if (c && c.unidadesFardo > t) t = Number(c.unidadesFardo);
    });
    return t;
}

function parseQtdValor(val, fracionada) {
    if (val === '' || val === null || val === undefined) return 0;
    const n = fracionada ? parseFloat(String(val).replace(',', '.')) : parseInt(val, 10);
    if (isNaN(n) || n < 0) return 0;
    return fracionada ? Math.round(n * 1000) / 1000 : Math.floor(n);
}

function formatarQtdNumero(n, fracionada) {
    const x = Number(n) || 0;
    if (fracionada) {
        return x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    return String(Math.floor(x));
}

function getUnidadesTotaisEstoque(p, estoqueRef) {
    const est = estoqueRef || (p && p.estoque) || {};
    const fracionada = produtoUsaContagemFracionada(p);
    const t = getTamFardoProduto(p);
    let total = 0;
    Object.keys(est).forEach(loc => {
        if (loc === '_Pendente_') return;
        const v = est[loc];
        if (!v || typeof v !== 'object') return;
        total += parseQtdValor(v.f, fracionada) * t + parseQtdValor(v.u, fracionada);
    });
    return total;
}

function getPrecoPorUnidadeBase(p) {
    if (!p) return 0;
    if (p.detalhesDestilado && Number(p.detalhesDestilado.precoGarrafa) > 0) {
        return Number(p.detalhesDestilado.precoGarrafa);
    }
    return Number(p.precoCusto) || 0;
}

function combinarEstoqueFU(estF, estU, addF, addU, t, fracionada) {
    const total = parseQtdValor(estF, fracionada) * t + parseQtdValor(estU, fracionada)
        + parseQtdValor(addF, fracionada) * t + parseQtdValor(addU, fracionada);
    const arred = Math.round(total * 1000) / 1000;
    if (fracionada || t <= 1) return { f: 0, u: arred };
    return { f: Math.floor(arred / t), u: arred % t };
}

function subtrairEstoqueFU(origF, origU, qtdF, qtdU, t, fracionada) {
    let totalOrig = parseQtdValor(origF, fracionada) * t + parseQtdValor(origU, fracionada);
    let totalSai = parseQtdValor(qtdF, fracionada) * t + parseQtdValor(qtdU, fracionada);
    let restante = Math.max(0, Math.round((totalOrig - totalSai) * 1000) / 1000);
    if (fracionada || t <= 1) return { f: 0, u: restante };
    return { f: Math.floor(restante / t), u: restante % t };
}

function ordenarCategoriasParaArea(nomesCategorias, areaObj) {
    const ordemSalva = areaObj && areaObj.config && areaObj.config.ordemCategorias ? areaObj.config.ordemCategorias : [];

    return [...nomesCategorias].sort((a, b) => {
        const idxA = ordemSalva.indexOf(a);
        const idxB = ordemSalva.indexOf(b);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;

        const prioA = getPrioridadeCategoria(a);
        const prioB = getPrioridadeCategoria(b);
        if (prioA !== prioB) return prioA - prioB;

        return a.localeCompare(b);
    });
}

function compararProdutosDentroDaCategoria(pkA, pkB, nomeCategoria) {
    const catObj = getCategoriaObjPorNome(nomeCategoria);
    const ordemProdutos = catObj && catObj.ordem ? catObj.ordem : [];
    const ordemSubgrupos = catObj && catObj.subgrupos ? catObj.subgrupos : [];

    const subA = produtos[pkA]?.subgrupo || '';
    const subB = produtos[pkB]?.subgrupo || '';

    if (subA !== subB) {
        if (!subA) return 1;
        if (!subB) return -1;

        const idxSubA = ordemSubgrupos.indexOf(subA);
        const idxSubB = ordemSubgrupos.indexOf(subB);

        if (idxSubA !== -1 && idxSubB !== -1) return idxSubA - idxSubB;
        if (idxSubA !== -1) return -1;
        if (idxSubB !== -1) return 1;

        return subA.localeCompare(subB);
    }

    const idxA = ordemProdutos.indexOf(pkA);
    const idxB = ordemProdutos.indexOf(pkB);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return (produtos[pkA]?.nome || "").localeCompare(produtos[pkB]?.nome || "");
}

function compararProdutosPorCategoriaEOrdem(pkA, pkB, areaObj = null) {
    const catA = getCategoriaPrincipalProduto(produtos[pkA]);
    const catB = getCategoriaPrincipalProduto(produtos[pkB]);

    if (catA !== catB) {
        const ordenadas = ordenarCategoriasParaArea([catA, catB], areaObj);
        return ordenadas.indexOf(catA) - ordenadas.indexOf(catB);
    }

    return compararProdutosDentroDaCategoria(pkA, pkB, catA);
}

function atualizarOrdemCategoriasAreaEdit() {
    const container = document.getElementById('area-edit-categorias-ordem');
    if (!container) return;

    const selecionados = Array.from(document.querySelectorAll('.area-prod-checkbox:checked')).map(cb => cb.value);
    const catsSelecionadas = [];

    selecionados.forEach(pk => {
        const p = produtos[pk];
        if (!p) return;
        const cat = getCategoriaPrincipalProduto(p);
        if (!catsSelecionadas.includes(cat)) catsSelecionadas.push(cat);
    });

    areaCatOrderTemp = areaCatOrderTemp.filter(cat => catsSelecionadas.includes(cat));

    catsSelecionadas.forEach(cat => {
        if (!areaCatOrderTemp.includes(cat)) areaCatOrderTemp.push(cat);
    });

    areaCatOrderTemp = ordenarCategoriasParaArea(areaCatOrderTemp, { config: { ordemCategorias: areaCatOrderTemp } });

    if (areaCatOrderTemp.length === 0) {
        container.innerHTML = `<p style="font-size:0.8rem; color:#64748b;">Marque produtos acima para organizar as categorias.</p>`;
        return;
    }

    container.innerHTML = areaCatOrderTemp.map((cat, idx) => `
        <div style="display:flex; align-items:center; background:rgba(0,0,0,0.4); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
            <div class="sort-wrapper">
                <button class="sort-btn-up" onclick="moverCategoriaAreaEdit('${cat}', -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                <button class="sort-btn-down" onclick="moverCategoriaAreaEdit('${cat}', 1)" ${idx === areaCatOrderTemp.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>
            <strong style="font-size:0.95rem; color:var(--text-main);">${cat}</strong>
        </div>
    `).join('');
}

function moverCategoriaAreaEdit(cat, direcao) {
    const idx = areaCatOrderTemp.indexOf(cat);
    const novoIdx = idx + direcao;
    if (idx === -1 || novoIdx < 0 || novoIdx >= areaCatOrderTemp.length) return;

    const temp = areaCatOrderTemp[idx];
    areaCatOrderTemp[idx] = areaCatOrderTemp[novoIdx];
    areaCatOrderTemp[novoIdx] = temp;

    atualizarOrdemCategoriasAreaEdit();
}

        // ==========================================
        // ESTOQUE E GESTÃO DE PRODUTOS
        // ==========================================
        function getQtyHTML(id, val, pk, nomeArea, tam) {
            if(currentRole === 'visualizador') return `<input type="number" class="qty-input" value="${val}" readonly style="width:40px; background:transparent; border:none; text-align:center;">`;
            return `
            <div class="qty-box">
                <input type="number" class="qty-input" id="${id}" value="${val}" onchange="attEst('${pk}','${nomeArea}',${tam})">
                <div class="qty-ctrls">
                    <button class="qty-btn-up" onclick="mudarQtd('${id}', 1, '${pk}','${nomeArea}',${tam})">▲</button>
                    <button class="qty-btn-down" onclick="mudarQtd('${id}', -1, '${pk}','${nomeArea}',${tam})">▼</button>
                </div>
            </div>`;
        }

        function mudarQtd(id, delta, pk, ar, tam) {
            const input = document.getElementById(id);
            if(!input) return;
            let val = parseInt(input.value) || 0;
            val += delta;
            if(val < 0) val = 0;
            input.value = val;
            attEst(pk, ar, tam);
        }

        function renderizarTotalLinhaDupla(total, tam, p) {
            const tf = tam > 1 ? tam : 1;
            const tot = Number(total) || 0;
            const frac = p && produtoUsaContagemFracionada(p);
            if (frac) {
                return `<div class="total-container"><span class="total-fardos" style="color:var(--primary); font-size:1.05rem;">${formatarQtdNumero(tot, true)} Un.</span></div>`;
            }
            if (tam > 1) {
                return `<div class="total-container"><span class="total-fardos">${Math.floor(tot / tf)} Fardos</span><span class="total-unidades">${tot % tf} Un. Soltas</span></div>`;
            }
            return `<div class="total-container"><span class="total-fardos" style="color:var(--primary); font-size:1.05rem;">${Math.floor(tot)} Un.</span></div>`;
        }

        function renderizarAreas() { 
    try { 
        const grid = document.getElementById('grid-areas'); 
        if(!grid) return;

        if (areas.length === 0) {
            grid.innerHTML = `<p style="grid-column:1/-1; color:#64748b; font-size:0.95rem; padding:12px;">${currentUser ? 'Nenhuma área cadastrada ainda.' : 'Faça login para ver as áreas.'}</p>`;
            return;
        }
        
        grid.innerHTML = areas.map(a => {
            let semaforoHTML = '';

            if (a.config && a.config.usaPadrao && a.config.padroes) {
                let somaPercentuais = 0;
                let regrasValidas = 0;

                Object.keys(a.config.padroes).forEach(pk => {
                    const p = produtos[pk];
                    if (!p) return;

                    const produtoEstaNaArea = (p.locais || []).includes(a.nome);
                    const temEstoqueNaArea = p.estoque && p.estoque[a.nome] !== undefined;

                    // Ignora padrões antigos de produtos que não pertencem mais a essa área
                    if (!produtoEstaNaArea && !temEstoqueNaArea) return;

                    const meta = Number(a.config.padroes[pk]) || 0;
                    if (meta <= 0) return;

                    let t = 1; 
                    getCategoriasProduto(p).forEach(cn => { 
                        const c = Object.values(categorias).find(x => x.nome === cn); 
                        if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); 
                    });

                    const v = p.estoque?.[a.nome] || {f:0, u:0};

                    const fAtual = Number(v.f) || 0;
                    const uAtual = Number(v.u) || 0;

                    // Compara tudo em unidades para evitar erro com fardos + unidades soltas
                    const qtdAtualEmUnidades = (fAtual * t) + uAtual;
                    const metaEmUnidades = t > 1 ? meta * t : meta;

                    let pctItem = (qtdAtualEmUnidades / metaEmUnidades) * 100;
                    if (pctItem > 100) pctItem = 100;

                    somaPercentuais += pctItem;
                    regrasValidas++;
                });

                if (regrasValidas > 0) {
                    const pctGeral = Math.floor(somaPercentuais / regrasValidas);
                    
                    let cor = '#ef4444';
                    if (pctGeral >= 100) cor = '#10b981';
                    else if (pctGeral >= 41) cor = '#f59e0b';
                    
                    semaforoHTML = `<div class="status-dot" title="${pctGeral}% do estoque padrão" style="background-color: ${cor};"></div>`;
                }
            }

            return `<div class="card-nav" onclick="verArea('${a.key}', '${a.nome}')">
                ${semaforoHTML}<i>${obterEmoji(a.nome)}</i><h3>${a.nome || 'Área'}</h3>
            </div>`;
        }).join(''); 
    } catch(e){ 
        console.error(e); 
    } 
}
        
        function renderizarGradeAgrupada() { 
            try {
                const g = document.getElementById('grid-produtos-agrupados'); const ts = document.getElementById('tabela-produtos-sem-grupo'); if(!g || !ts) return; 
                const isC = agrupamentoAtual === 'categorias'; document.getElementById('titulo-aba-produtos').innerText = isC ? "Categorias de Produtos" : "Métodos de Compra"; document.getElementById('titulo-sem-grupo').innerText = isC ? "Sem Categoria" : "Sem Método de Compra"; 
                
                const dbFonte = isC ? categorias : metodosCompra; 
                let chavesFonte = Object.keys(dbFonte);
                
                if (isC) {
                    chavesFonte.sort((a, b) => {
                        const prioA = getPrioridadeCategoria(dbFonte[a]?.nome);
                        const prioB = getPrioridadeCategoria(dbFonte[b]?.nome);
                        if (prioA !== prioB) return prioA - prioB;
                        return (dbFonte[a]?.nome || "").localeCompare(dbFonte[b]?.nome || "");
                    });
                } else { chavesFonte.sort((a, b) => (dbFonte[a]?.nome || "").localeCompare(dbFonte[b]?.nome || "")); }

                if(chavesFonte.length === 0) g.innerHTML = `<p style="grid-column: 1 / -1; color:#64748b; font-size: 0.9rem;">Nenhum grupo cadastrado.</p>`;
                else g.innerHTML = chavesFonte.map(k => `<div class="card-nav" onclick="verGrupo('${k}', '${isC?'categoria':'metodo'}')">${isC ? `<i>${obterEmoji(dbFonte[k]?.nome)}</i>` : obterIconeMetodo(dbFonte[k]?.nome, true)}<h3>${dbFonte[k]?.nome}</h3></div>`).join(''); 
                
                const prodsSemGrupo = Object.keys(produtos).filter(k => isC ? getCategoriasProduto(produtos[k]).length === 0 : !produtos[k].metodoCompra);
                if(prodsSemGrupo.length === 0) ts.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#64748b;">Todos os produtos estão agrupados.</td></tr>`;
                else ts.innerHTML = prodsSemGrupo.map(k => { const p = produtos[k]; const t = Object.values(p.estoque||{}).reduce((a,v)=>typeof v==='object'&&v!==null?a+(Number(v.f)||0)+(Number(v.u)||0):a+Number(v||0),0); return `<tr><td><div style="display:flex; align-items:center;"><button class="action-icon edit-btn req-dono" onclick="abrirEdicaoProduto('${k}')">✎</button><button class="action-icon info-btn" onclick="verDetalhesProduto('${k}')">ⓘ</button><span class="col-item">${p.nome||''}</span></div></td><td style="text-align:right">${renderizarTotalLinhaDupla(t,1)}</td></tr>`; }).join('');
            } catch(e) {}
        }

        function verGrupo(key, tipo) { 
            try {
                document.getElementById('busca-categoria').value = '';
                navegar('produtos-lista-filtrada'); 
                const n = tipo === 'categoria' ? categorias[key]?.nome : metodosCompra[key]?.nome; 
                document.getElementById('titulo-categoria-filtrada').innerText = n || 'Grupo'; 
                
                let prodsFiltrados = Object.keys(produtos).filter(k => tipo === 'categoria' ? getCategoriasProduto(produtos[k]).includes(n) : produtos[k].metodoCompra === n);
                
                prodsFiltrados.sort((a, b) => {
                    if (tipo === 'categoria') {
                        const catObj = categorias[key];
                        const customOrder = catObj.ordem || [];
                        const idxA = customOrder.indexOf(a);
                        const idxB = customOrder.indexOf(b);
                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                        if (idxA !== -1) return -1;
                        if (idxB !== -1) return 1;
                    }
                    return (produtos[a].nome || "").localeCompare(produtos[b].nome || "");
                });

                // ABAS DE SUBGRUPOS (ESPECIFICAÇÕES)
                const filtroWrapper = document.getElementById('filtro-subgrupos-wrapper');
                if (tipo === 'categoria' && categorias[key] && categorias[key].subgrupos && categorias[key].subgrupos.length > 0) {
                    filtroWrapper.style.display = 'flex';
                    let htmlTabs = `<div class="sub-tab active" onclick="setSubgroupFilter('Todos', this)">Todos</div>`;
                    categorias[key].subgrupos.forEach(sub => {
                        htmlTabs += `<div class="sub-tab" onclick="setSubgroupFilter('${sub}', this)">${sub}</div>`;
                    });
                    filtroWrapper.innerHTML = htmlTabs;
                } else {
                    filtroWrapper.style.display = 'none';
                }
                activeSubgroupFilter = "Todos";

                if(prodsFiltrados.length === 0) { document.getElementById('tabela-produtos-filtrada').innerHTML = `<tr><td colspan="2" style="text-align:center; color:#64748b;">Nenhum produto neste grupo.</td></tr>`; return; }
                
                document.getElementById('tabela-produtos-filtrada').innerHTML = prodsFiltrados.map(k => { 
                    const p = produtos[k]; 
                    const t = getTamFardoProduto(p);
                    const tot = getUnidadesTotaisEstoque(p);
                    
                    return `<tr data-subgrupo="${p.subgrupo || ''}"><td><div style="display:flex; align-items:center;"><button class="action-icon edit-btn req-dono" onclick="abrirEdicaoProduto('${k}')">✎</button><button class="action-icon info-btn" onclick="verDetalhesProduto('${k}')">ⓘ</button><span class="col-item">
    ${p.nome||''}

    ${p.itemProduzido
        ? `
            <span style="
                background:#f59e0b;
                color:white;
                font-size:0.65rem;
                padding:2px 6px;
                border-radius:999px;
                margin-left:6px;
                font-weight:800;
            ">
                PRODUZIDO
            </span>
        `
        : ''
    }
</span></div></td><td style="text-align:right">${renderizarTotalLinhaDupla(tot,t,p)}</td></tr>`; 
                }).join(''); 
                
                aplicarFiltrosProdutos(); 
            } catch(e){}
        }

        function verArea(key, nome) { 
    try {
        document.getElementById('busca-area').value = '';
        document.getElementById('area-edit-box').style.display = 'none'; 
        areaAtualKey = key; 
        navegar('detalhe-area'); 
        document.getElementById('area-display-name').innerText = nome || 'Área'; 
        
        const areaObj = areas.find(a => a.key === key);
        if (!areaObj) return;

        const usaPadrao = (areaObj.config && areaObj.config.usaPadrao);
        const totalCols = modoContagemAtivo ? 3 : (usaPadrao ? 5 : 4);

        let headHtml = `<tr>
            <th>Item</th>
            ${modoContagemAtivo ? '' : (usaPadrao ? '<th style="text-align:center; color:#10b981;">Pad.</th>' : '')}
            <th style="text-align:center">${modoContagemAtivo ? 'Contar Fds' : 'Estoque Fds'}</th>
            <th style="text-align:center">${modoContagemAtivo ? 'Contar Un.' : 'Estoque Un.'}</th>
            ${modoContagemAtivo ? '' : '<th style="text-align:right;">Total</th>'}
        </tr>`;
        document.getElementById('head-area-itens').innerHTML = headHtml;

        const lista = document.getElementById('tabela-area-itens');
        lista.innerHTML = '';

        const prodsArea = Object.keys(produtos).filter(pk => {
            const p = produtos[pk];
            if (!p) return false;
            const vinculado = p.locais && p.locais.includes(nome);
            const temEstoqueSalvo = p.estoque && p.estoque[nome] !== undefined;
            return vinculado || temEstoqueSalvo;
        });

        if (prodsArea.length === 0) {
            lista.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:20px; color:#64748b;">Nenhum item vinculado a esta área. Clique no ícone de lápis (✎) acima para adicionar.</td></tr>`;
            return;
        }

        const grupos = {};
        prodsArea.forEach(pk => {
            const p = produtos[pk];
            const cats = getCategoriasProduto(p);
            const catNome = cats.length > 0 ? cats[0] : 'Sem Categoria';
            if (!grupos[catNome]) grupos[catNome] = [];
            grupos[catNome].push(pk);
        });

        const nomesCategorias = ordenarCategoriasParaArea(Object.keys(grupos), areaObj);

nomesCategorias.forEach(catNome => {
            lista.innerHTML += `<tr>
                <td colspan="${totalCols}" style="background: rgba(183, 41, 41, 0.22); color:#fbeee3; font-weight:900; text-transform:uppercase; letter-spacing:1px; font-size:0.78rem; padding:10px;">
                    ${catNome}
                </td>
            </tr>`;

            grupos[catNome].sort((a, b) => compararProdutosDentroDaCategoria(a, b, catNome));

            let subgruposDaCategoria = {};
            grupos[catNome].forEach(pkGrupo => {
                const pGrupo = produtos[pkGrupo];
                const subNome = pGrupo && pGrupo.subgrupo ? pGrupo.subgrupo : '';
                const chaveSub = subNome || '_sem_subgrupo_';

                if (!subgruposDaCategoria[chaveSub]) subgruposDaCategoria[chaveSub] = [];
                subgruposDaCategoria[chaveSub].push(pkGrupo);
            });

            const catObjSub = getCategoriaObjPorNome(catNome);
const ordemSalvaSubgrupos = catObjSub && catObjSub.subgrupos ? catObjSub.subgrupos : [];

const ordemSubgrupos = Object.keys(subgruposDaCategoria).sort((a, b) => {
    if (a === '_sem_subgrupo_') return 1;
    if (b === '_sem_subgrupo_') return -1;

    const idxA = ordemSalvaSubgrupos.indexOf(a);
    const idxB = ordemSalvaSubgrupos.indexOf(b);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return a.localeCompare(b);
});

            ordemSubgrupos.forEach(subKey => {
                if (subKey !== '_sem_subgrupo_') {
                    lista.innerHTML += `<tr>
                        <td colspan="${totalCols}" style="background: rgba(0,0,0,0.35); color:#10b981; font-weight:900; text-transform:uppercase; letter-spacing:1px; font-size:0.72rem; padding:8px 10px 8px 22px;">
                            ${subKey}
                        </td>
                    </tr>`;
                }

                subgruposDaCategoria[subKey].forEach(pk => {
                const p = produtos[pk];
                const est = (p.estoque && p.estoque[nome]) ? p.estoque[nome] : { f: 0, u: 0 };
                const frac = produtoUsaContagemFracionada(p);
                const qtdF = parseQtdValor(est.f, frac);
                const qtdU = parseQtdValor(est.u, frac);

                const t = getTamFardoProduto(p);
                const totalUnidades = (qtdF * t) + qtdU;
                const stepCont = frac ? '0.01' : '1';

                let padraoTxt = '-';
                if (usaPadrao && areaObj.config && areaObj.config.padroes && areaObj.config.padroes[pk] !== undefined) {
                    const val = areaObj.config.padroes[pk];
                    padraoTxt = `<span style="color:#10b981; font-weight:900; font-size: 0.95rem;">${val} ${t > 1 ? 'Fds.' : 'Un.'}</span>`;
                } else if (usaPadrao) {
                    padraoTxt = `<span style="color:#64748b;">-</span>`;
                }

                const usaFardoNaArea = t > 1 && !frac;
                let viewFardo = modoContagemAtivo 
                    ? (usaFardoNaArea ? `<div class="qty-box" style="border: 1px solid var(--primary); background: #000; width: 75px;">
                         <input type="number" class="qty-input" id="cont-f-${pk}" value="" step="${stepCont}" style="background: #000; color: #fff;">
                         <div class="qty-ctrls" style="border-left: 1px solid var(--primary);">
                             <button class="qty-btn-up" onclick="document.getElementById('cont-f-${pk}').value=(Number(document.getElementById('cont-f-${pk}').value)||0)+1">▲</button>
                             <button class="qty-btn-down" onclick="document.getElementById('cont-f-${pk}').value=Math.max(0,(Number(document.getElementById('cont-f-${pk}').value)||0)-1)">▼</button>
                         </div>
                       </div>` : `<span style="color:#64748b;">-</span>`)
                    : `<span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${usaFardoNaArea ? formatarQtdNumero(qtdF, false) : '-'}</span>`;

                const incU = frac ? 0.1 : 1;
                let viewUnidade = modoContagemAtivo 
                    ? `<div class="qty-box" style="border: 1px solid var(--primary); background: #000; width: 75px;">
                         <input type="number" class="qty-input" id="cont-u-${pk}" value="" step="${stepCont}" style="background: #000; color: #fff;">
                         <div class="qty-ctrls" style="border-left: 1px solid var(--primary);">
                             <button class="qty-btn-up" onclick="document.getElementById('cont-u-${pk}').value=(Math.round(((Number(document.getElementById('cont-u-${pk}').value)||0)+${incU})*1000)/1000)">▲</button>
                             <button class="qty-btn-down" onclick="document.getElementById('cont-u-${pk}').value=Math.max(0,Math.round(((Number(document.getElementById('cont-u-${pk}').value)||0)-${incU})*1000)/1000)">▼</button>
                         </div>
                       </div>`
                    : `<span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${frac ? formatarQtdNumero(totalUnidades, true) : formatarQtdNumero(qtdU, false)}</span>`;

                let txtTopTotal = frac
                    ? `${formatarQtdNumero(totalUnidades, true)} Un.`
                    : (t > 1 ? `${Math.floor(totalUnidades / t)} Fds | ${totalUnidades % t} Un.` : `${Math.floor(totalUnidades)} Un.`);
                let viewTotal = modoContagemAtivo 
                    ? ''
                    : `<td style="text-align:right; border-left: 1px solid rgba(255,255,255,0.05);">
                         <div style="display:flex; flex-direction:column; line-height:1.2;">
                           <span style="font-weight:900; color:var(--primary); font-size:1.05rem;">${txtTopTotal}</span>
                           ${t > 1 ? `<span style="font-size:0.75rem; color:#64748b; font-weight:700;">${totalUnidades} Un. Totais</span>` : ''}
                         </div>
                       </td>`;

                                lista.innerHTML += `
                    <tr>
                        <td style="font-size: 0.95rem; font-weight:700;"><div style="display:flex; align-items:center; gap:8px;"><button class="action-icon info-btn" style="margin:0; width:24px; height:24px; font-size:0.8rem;" onclick="abrirInfoItem('${pk}')">ⓘ</button> <span>${p.nome}</span></div></td>
                        ${modoContagemAtivo ? '' : (usaPadrao ? `<td style="text-align:center; border-right: 1px solid rgba(255,255,255,0.05);">${padraoTxt}</td>` : '')}
                        <td style="text-align:center">${viewFardo}</td>
                        <td style="text-align:center">${viewUnidade}</td>
                        ${viewTotal}
                    </tr>
                `;
                });
            });
        });

    } catch (e) {
        console.error("Erro ao abrir área:", e);
        showToast("Erro ao carregar detalhes da área.", "error");
    }
}

        function attEst(pk, ar, tam) { 
            if(currentRole === 'visualizador') return; 
            const p = produtos[pk];
            const frac = produtoUsaContagemFracionada(p);
            const elF = document.getElementById(`f-${pk}`);
            const f = elF ? parseQtdValor(elF.value, frac) : 0; 
            const u = parseQtdValor(document.getElementById(`u-${pk}`).value, frac);
            const payload = (frac || tam <= 1) ? { f: 0, u: Math.round((f * tam + u) * 1000) / 1000 } : { f, u };
            db.ref(`produtos/${pk}/estoque/${ar}`).set(payload); 
            document.getElementById(`tot-cell-${pk}`).innerHTML = renderizarTotalLinhaDupla(payload.f * tam + payload.u, tam, p); 
        }

        function verDetalhesProduto(key) { 
            try {
                const p = produtos[key]; if(!p) return; navegar('detalhe-produto'); document.getElementById('span-titulo-prod').innerText = p.nome || 'Produto'; 
                let t = 1; const pC = getCategoriasProduto(p); pC.forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); }); 
                const fracP = produtoUsaContagemFracionada(p);
                let tG = 0; const locaisHtml = (p.locais||[]).map(loc => { const a = areas.find(x => x.nome === loc); const v = p.estoque?.[loc] || {f:0,u:0}; const q = parseQtdValor(v.f, fracP)*t + parseQtdValor(v.u, fracP); tG += q; return `<tr><td><div style="display:flex; align-items:center; gap:8px;"><button class="action-icon info-btn" onclick="verArea('${a?.key}', '${loc}')">ⓘ</button><span>${loc}</span></div></td><td style="text-align:right">${renderizarTotalLinhaDupla(q,t,p)}</td></tr>`; }).join(''); 
                document.getElementById('tabela-locais-produto').innerHTML = locaisHtml || `<tr><td colspan="2" style="text-align:center; color:#64748b;">Não alocado em nenhuma área.</td></tr>`; 
                
                const boxFardosGeral = fracP
                    ? `<div><strong style="color:var(--primary);">Total em unidades:</strong> <span style="color:#64748b;">${formatarQtdNumero(tG, true)} Un. (geral)</span></div>`
                    : (t > 1 ? `<div><strong style="color:var(--primary);">Fardos Fechados:</strong> <span style="color:#64748b;">${Math.floor(tG/t)} Fardos (Geral)</span></div>` : '');

                const precoBase = getPrecoPorUnidadeBase(p);
                const custoParado = Math.round(getUnidadesTotaisEstoque(p) * precoBase * 100) / 100;
                let htmlCustoGeral = podeVerCustos()
                    ? `<p class="req-custo" style="font-size:0.9rem; margin-bottom:5px;"><strong>Preço por unidade/garrafa:</strong> R$ ${precoBase.toFixed(2).replace('.', ',')}</p>
                       <p class="req-custo" style="font-size:0.9rem; margin-bottom:5px;"><strong>Custo parado (estoque total):</strong> R$ ${custoParado.toFixed(2).replace('.', ',')}</p>`
                    : '';

                let htmlInfoDestilado = '';
                if (p.detalhesDestilado && p.detalhesDestilado.ml) {
                    if (podeVerCustos()) {
                        const precoLt = (Number(p.detalhesDestilado.precoGarrafa) / Number(p.detalhesDestilado.ml)) * 1000;
                        htmlInfoDestilado = `<div class="req-custo"><hr style="opacity:0.2; margin: 10px 0;">
                        <p style="font-size:0.9rem; margin-bottom:5px; color:#047857; font-weight:bold;">🍹 Cálculos de Destilado</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Volume:</strong> ${p.detalhesDestilado.ml} ml</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Preço Garrafa:</strong> R$ ${Number(p.detalhesDestilado.precoGarrafa).toFixed(2).replace('.', ',')}</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Preço por Litro (1L):</strong> R$ ${precoLt.toFixed(2).replace('.', ',')}</p></div>`;
                    } else {
                        htmlInfoDestilado = `<p style="font-size:0.85rem; margin-bottom:3px;"><strong>Volume da garrafa:</strong> ${p.detalhesDestilado.ml} ml</p>`;
                    }
                }

                const hrAposCusto = (htmlCustoGeral || htmlInfoDestilado) ? '<hr class="req-custo" style="opacity:0.2; margin: 5px 0;">' : '';

                document.getElementById('info-extra-prod').innerHTML = `
                    <div style="padding:12px; background:var(--row-even); border-radius:8px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                        ${htmlCustoGeral}
                        ${htmlInfoDestilado}
                        ${hrAposCusto}
                        <div><strong style="color:var(--primary);">Categorias:</strong> <span style="color:#64748b;">${pC.length>0?pC.join(', '):'Nenhuma'}</span></div>
                        <div><strong style="color:var(--primary);">Método:</strong> <span style="color:#64748b;">${p.metodoCompra||"Não atribuído"}</span></div>
                        <div><strong style="color:var(--primary);">Especificação (Subgrupo):</strong> <span style="color:#64748b;">${p.subgrupo||"Nenhum"}</span></div>
                        <div><strong style="color:var(--primary);">Estoque Mín.:</strong> <span style="color:#64748b;">${p.estoqueMinimo||0} ${t>1?'Fardos':'Unidades'}</span></div>
                        ${boxFardosGeral}
                    </div>`; 
            } catch(e) {}
        }

        // ==========================================
        // MÉTODOS DE COMPRA E CONFIGURAÇÕES ADMIN
        // ==========================================
        function obterIconeMetodo(nome, isCard = false) { 
            if (!nome) return isCard ? `<i>📦</i>` : `📦`; const limpo = removerAcentos(nome.toLowerCase().trim()); let img = null; 
            if(limpo.includes("rr") || limpo.includes("polpa")) img = "rrpolpas.svg"; else if(limpo.includes("heineken")) img = "heinekendistri.svg"; else if(limpo.includes("coca")) img = "cocacoladistri.svg"; else if(limpo.includes("atento")) img = "atento.svg"; 
            if (img) { if (isCard) return `<img src="${img}" alt="${nome}" style="width:100px; height:100px; object-fit:contain; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">`; return `<img src="${img}" alt="${nome}" style="width:28px; height:28px; object-fit:contain; margin-right:6px; vertical-align:middle; display:inline-block; border-radius:3px;">`; } 
            return isCard ? `<i style="font-size: 3rem;">${obterEmoji(nome)}</i>` : `${obterEmoji(nome)}`; 
        }

        function renderizarMetodosConfig() { 
            try { document.getElementById('lista-metodos-config').innerHTML = Object.keys(metodosCompra).map(k => `<div class="preset-config-item" style="padding:15px 10px; border-bottom:1px solid #e2e8f0; margin-bottom:12px;"><div style="display:flex; align-items:center;"><button class="action-icon edit-btn" onclick="editarMetodo('${k}')">✎</button><button class="action-icon add-btn" onclick="abrirAtribuirMetodo('${k}')">➕</button><strong style="font-size:1.1rem; margin-left:12px;">${metodosCompra[k].nome}</strong><span style="margin-left:auto; color:red; cursor:pointer; font-weight:bold; font-size:0.85rem;" onclick="prepararExclusaoMet('${k}')">Excluir</span></div></div>`).join(''); } catch(e) {}
        }

        function renderizarPedidosMetodos() { 
            try {
                const grid = document.getElementById('grid-pedidos-metodos'); if(!grid) return; const chaves = Object.keys(metodosCompra);
                if(chaves.length === 0) { grid.innerHTML = `<p style="grid-column: 1 / -1; color:#64748b;">Nenhum método cadastrado.</p>`; return; }
                grid.innerHTML = chaves.map(k => `<div class="card-nav" onclick="verPedidoPorMetodo('${k}')">${obterIconeMetodo(metodosCompra[k].nome, true)}<h3 style="margin-top:5px;">${metodosCompra[k].nome}</h3></div>`).join(''); 
            } catch(e) {}
        }

        function verPedidoPorMetodo(key) { 
            try {
                navegar('pedidos-lista'); const met = metodosCompra[key]?.nome || 'Desconhecido'; document.getElementById('titulo-pedido-metodo').innerText = `Pedidos: ${met}`; 
                const prodsFiltrados = Object.keys(produtos).filter(k => produtos[k] && produtos[k].metodoCompra === met).sort((a, b) => compararProdutosPorCategoriaEOrdem(a, b));
                if(prodsFiltrados.length === 0) { document.getElementById('tabela-pedidos-filtrada').innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b;">Nenhum produto usa este método.</td></tr>`; return; }
                document.getElementById('tabela-pedidos-filtrada').innerHTML = prodsFiltrados.map(k => { 
                    const p = produtos[k]; let t = 1; getCategoriasProduto(p).forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); }); 
                    const fAt = Object.values(p.estoque||{}).reduce((ac,v) => typeof v==='object'&&v!==null?ac+((Number(v.f)||0)*t)+(Number(v.u)||0):ac+Number(v||0),0)/t; const m = Number(p.estoqueMinimo||0); const sg = Math.ceil(Math.max(0, m - fAt)); const lb = t > 1 ? 'Fds.' : 'Un.'; 
                    return `<tr><td class="col-item">${p.nome}</td><td style="text-align:center;">${fAt%1===0?fAt:fAt.toFixed(1)} <br><small style="color:#64748b">${lb}</small></td><td style="text-align:center;">${m} <br><small style="color:#64748b">${lb}</small></td><td style="text-align:center; font-weight:800; font-size:1.1rem; color:${sg>0?'var(--primary)':'#10b981'}">${sg} <br><small style="font-weight:normal; font-size:0.75rem">${lb}</small></td></tr>`; 
                }).join(''); 
            } catch(e) {}
        }

        function salvarMetodo() {
            if (currentRole !== 'dono') { showToast("Apenas o dono pode gerenciar métodos.", "error"); return; }
            const id = document.getElementById('edit-met-id').value;
            const n = document.getElementById('met-nome').value;
            if (n) {
                if (id) {
                    const old = metodosCompra[id].nome;
                    db.ref('metodos/' + id).update({ nome: n }).then(() => {
                        if (old !== n) Object.keys(produtos).forEach(pk => {
                            if (produtos[pk] && produtos[pk].metodoCompra === old) db.ref('produtos/' + pk).update({ metodoCompra: n });
                        });
                    });
                } else {
                    db.ref('metodos').push({ nome: n });
                }
                resetarFormMetodo();
            }
        }
        function editarMetodo(k) { document.getElementById('edit-met-id').value=k; document.getElementById('met-nome').value=metodosCompra[k].nome; document.getElementById('btn-salvar-met').innerText="Atualizar"; }
        function resetarFormMetodo() { document.getElementById('edit-met-id').value=""; document.getElementById('met-nome').value=""; document.getElementById('btn-salvar-met').innerText="Salvar"; }
        function renderizarPresetsMetodos() { const vN=document.getElementById('prod-metodo-selecionado').value, vE=document.getElementById('edit-prod-metodo-selecionado').value; document.getElementById('metodos-container').innerHTML=Object.keys(metodosCompra).map(k=>`<div class="chip ${vN===metodosCompra[k].nome?'active-chip':''}" onclick="selecionarMetodo('${k}','novo')">${obterIconeMetodo(metodosCompra[k].nome)} ${metodosCompra[k].nome}</div>`).join(''); document.getElementById('edit-metodos-container').innerHTML=Object.keys(metodosCompra).map(k=>`<div class="chip ${vE===metodosCompra[k].nome?'active-chip':''}" onclick="selecionarMetodo('${k}','edit')">${obterIconeMetodo(metodosCompra[k].nome)} ${metodosCompra[k].nome}</div>`).join(''); }
        function selecionarMetodo(k, ctx) { document.getElementById(ctx==='novo'?'prod-metodo-selecionado':'edit-prod-metodo-selecionado').value=metodosCompra[k].nome; renderizarPresetsMetodos(); }
        
        // ==========================================
        // SISTEMA DE CATEGORIAS E SUBGRUPOS (ESPECIFICAÇÕES)
        // ==========================================
        function toggleSubgrupoInput() {
            document.getElementById('div-subgrupos').style.display = document.getElementById('cat-has-sub').checked ? 'block' : 'none';
        }

        function addCatSub() {
            const v = document.getElementById('cat-new-sub').value.trim();
            if(v && !currentCatSubgrupos.includes(v)) { 
                currentCatSubgrupos.push(v); 
                renderCatSubs(); 
            }
            document.getElementById('cat-new-sub').value = "";
        }

        function removeCatSub(s) { 
            currentCatSubgrupos = currentCatSubgrupos.filter(x => x !== s); 
            renderCatSubs(); 
        }

        function renderCatSubs() {
    const box = document.getElementById('list-cat-subs');

    if (currentCatSubgrupos.length === 0) {
        box.innerHTML = `<p style="font-size:0.8rem; color:#64748b;">Nenhuma especificação adicionada.</p>`;
        return;
    }

    box.innerHTML = currentCatSubgrupos.map((s, idx) => `
        <div style="display:flex; align-items:center; background:rgba(0,0,0,0.4); padding:8px; border-radius:8px; border:1px solid var(--border-color); width:100%;">
            <div class="sort-wrapper" style="height:38px; margin-right:10px;">
                <button class="sort-btn-up" onclick="moverCatSub(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                <button class="sort-btn-down" onclick="moverCatSub(${idx}, 1)" ${idx === currentCatSubgrupos.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>

            <strong style="color:var(--text-main); font-size:0.9rem; flex:1;">${s}</strong>

            <button onclick="removeCatSub('${s}')" style="background:#ef4444; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:900;">×</button>
        </div>
    `).join('');
}

function moverCatSub(index, direcao) {
    const novoIndex = index + direcao;
    if (novoIndex < 0 || novoIndex >= currentCatSubgrupos.length) return;

    const temp = currentCatSubgrupos[index];
    currentCatSubgrupos[index] = currentCatSubgrupos[novoIndex];
    currentCatSubgrupos[novoIndex] = temp;

    renderCatSubs();
}

                function salvarCategoria() { 
            if (currentRole !== 'dono') { showToast("Apenas o dono pode gerenciar categorias.", "error"); return; }
            const id=document.getElementById('edit-cat-id').value;
            const n=document.getElementById('cat-nome').value;
            const u=document.getElementById('cat-uso-fardo').checked;
            const t=u?Number(document.getElementById('cat-qtd-fardo').value):1;
            const sel=Array.from(document.querySelectorAll('#cat-checks-areas input:checked')).map(i=>i.value);
            const hasSub=document.getElementById('cat-has-sub').checked;
            
            if(n && sel.length){ 
                const d = {
                    nome: n,
                    areas: sel,
                    unidadesFardo: t,
                    subgrupos: hasSub ? currentCatSubgrupos : [],
                    contagemFracionada: document.getElementById('cat-contagem-fracionada').checked
                }; 
                if(id) { 
                    const old = categorias[id] ? categorias[id].nome : null; 
                    db.ref('categorias/'+id).update(d).then(()=>{
                        if(old && old!==n) {
                            Object.keys(produtos).forEach(pk=>{
                                if(!produtos[pk]) return;
                                let pc=getCategoriasProduto(produtos[pk]);
                                if(pc.includes(old)) db.ref('produtos/'+pk).update({categorias:pc.map(c=>c===old?n:c),categoria:null});
                            });
                        }
                        resetarFormCategoria();
                        renderizarPresets();
                        renderizarChecksConfig();
                        renderizarGradeAgrupada();
                        showToast("Categoria atualizada!", "success");
                    }).catch(e => {
                        alert("Erro ao atualizar categoria: " + e.message);
                    }); 
                } else {
                    db.ref('categorias').push(d).then(() => {
                        resetarFormCategoria();
                        renderizarPresets();
                        renderizarChecksConfig();
                        renderizarGradeAgrupada();
                        showToast("Categoria criada!", "success");
                    }).catch(e => {
                        alert("Erro ao criar categoria: " + e.message);
                    });
                }
            } else {
                alert("Preencha o nome e selecione pelo menos uma área.");
            }
        }
        
        function renderizarPresets() { 
            document.getElementById('presets-container').innerHTML=Object.keys(categorias).map(k=>`<div class="chip ${catsNovo.includes(categorias[k].nome)?'active-chip':''}" onclick="togglePreset('${k}','novo')">${obterEmoji(categorias[k].nome)} ${categorias[k].nome}</div>`).join(''); 
            document.getElementById('edit-presets-container').innerHTML=Object.keys(categorias).map(k=>`<div class="chip ${catsEdit.includes(categorias[k].nome)?'active-chip':''}" onclick="togglePreset('${k}','edit')">${obterEmoji(categorias[k].nome)} ${categorias[k].nome}</div>`).join(''); 
            
            document.getElementById('lista-categorias-config').innerHTML=Object.keys(categorias).map(k=>{ 
                const c=categorias[k]; 
                const hasSubs = c.subgrupos && c.subgrupos.length > 0;
                return `<div class="preset-config-item" style="padding:12px; border:1px solid #ccc; border-radius:8px; margin-bottom:8px;"><div style="display:flex; align-items:center;"><button class="action-icon edit-btn" onclick="editarCategoria('${k}')">✎</button><button class="action-icon add-btn" onclick="abrirAtribuirCategoria('${k}')">➕</button><button class="action-icon info-btn" onclick="abrirConfigCategoria('${k}')">ⓘ</button><strong style="font-size:1.05rem; margin-left:5px;">${obterEmoji(c.nome)} ${c.nome}</strong><span style="margin-left:auto; color:red; cursor:pointer;" onclick="prepararExclusaoCat('${k}')">Excluir</span></div><div style="margin-top:8px; font-size:0.85rem; color:#64748b;">Áreas: ${(c.areas||[]).join(', ')} <br> Fardo: ${c.unidadesFardo>1?c.unidadesFardo+' un.':'Não'}<br>Contagem fracionada: ${c.contagemFracionada?'Sim':'Não'}<br>Especificações: ${hasSubs?c.subgrupos.join(', '):'Nenhuma'}</div></div>`; 
            }).join(''); 
        }

        function abrirConfigCategoria(k) {
            categoriaFocadaOrdenacao = k;
            const c = categorias[k];
            document.getElementById('titulo-config-cat').innerText = `⚙️ ${c.nome}`;
            
            let htmlInfo = `<p><strong>Unidades por Fardo:</strong> ${c.unidadesFardo}</p><p><strong>Contagem fracionada:</strong> ${c.contagemFracionada ? 'Sim' : 'Não'}</p><p><strong>Áreas Armazenadas:</strong> ${(c.areas||[]).join(', ') || 'Nenhuma'}</p>`;
            
            if (c.subgrupos && c.subgrupos.length > 0) {
                htmlInfo += `<p style="margin-top:10px; margin-bottom: 5px;"><strong>Especificações (Subgrupos):</strong></p>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button class="chip active-chip" data-sub="Todos" onclick="filtrarOrdenacaoSubgrupo('Todos')">Todos</button>
                    ${c.subgrupos.map(sub => `<button class="chip" data-sub="${sub}" onclick="filtrarOrdenacaoSubgrupo('${sub}')" style="display:inline-flex; align-items:center; gap:5px;">${sub} <span style="background:var(--primary); color:white; border-radius:50%; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; font-size:0.7rem; font-style:italic;">i</span></button>`).join('')}
                </div>`;
            }
            
            document.getElementById('info-tecnica-cat').innerHTML = htmlInfo;
            activeAdminSubgroupFilter = "Todos";
            renderizarOrdenacaoCategoria();
            navegar('detalhe-categoria-admin');
        }

        function renderizarOrdenacaoCategoria() {
            const k = categoriaFocadaOrdenacao;
            const c = categorias[k];
            if(!c) return;

            let allProdsInCat = Object.keys(produtos).filter(pk => getCategoriasProduto(produtos[pk]).includes(c.nome));
            const customOrder = c.ordem || [];
            
            allProdsInCat.sort((a, b) => {
                const idxA = customOrder.indexOf(a); const idxB = customOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return (produtos[a].nome || "").localeCompare(produtos[b].nome || "");
            });

            let visibleProds = allProdsInCat.filter(pk => {
                if (activeAdminSubgroupFilter !== 'Todos') {
                    return produtos[pk].subgrupo === activeAdminSubgroupFilter;
                }
                return true;
            });

            document.getElementById('lista-ordenacao-cat').innerHTML = visibleProds.map((pk, index) => {
                const p = produtos[pk];
                return `<div style="display:flex; align-items:center; background:rgba(0,0,0,0.4); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                    <div class="sort-wrapper">
                        <button class="sort-btn-up" onclick="moverProdutoOrdem('${k}', '${pk}', -1)" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                        <button class="sort-btn-down" onclick="moverProdutoOrdem('${k}', '${pk}', 1)" ${index === visibleProds.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
                    </div>
                    <div>
                        <strong style="font-size:0.95rem; color:var(--text-main);">${p.nome}</strong>
                        ${p.subgrupo ? `<br><span style="font-size:0.75rem; color:var(--primary);">${p.subgrupo}</span>` : ''}
                    </div>
                </div>`;
            }).join('') || '<p style="font-size:0.85rem; color:#64748b;">Nenhum produto listado.</p>';
        }

        function moverProdutoOrdem(catKey, prodKey, direction) {
            const c = categorias[catKey];
            
            let allProdsInCat = Object.keys(produtos).filter(pk => getCategoriasProduto(produtos[pk]).includes(c.nome));
            const customOrder = c.ordem || [];
            
            allProdsInCat.sort((a, b) => {
                const idxA = customOrder.indexOf(a); const idxB = customOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return (produtos[a].nome || "").localeCompare(produtos[b].nome || "");
            });

            let visibleProds = allProdsInCat.filter(pk => {
                if (activeAdminSubgroupFilter !== 'Todos') {
                    return produtos[pk].subgrupo === activeAdminSubgroupFilter;
                }
                return true;
            });

            const visibleIndex = visibleProds.indexOf(prodKey);
            if(visibleIndex === -1) return;
            
            const newVisibleIndex = visibleIndex + direction;
            if(newVisibleIndex < 0 || newVisibleIndex >= visibleProds.length) return;

            const targetProdKey = visibleProds[newVisibleIndex];
            
            const idx1 = allProdsInCat.indexOf(prodKey);
            const idx2 = allProdsInCat.indexOf(targetProdKey);

            const temp = allProdsInCat[idx1];
            allProdsInCat[idx1] = allProdsInCat[idx2];
            allProdsInCat[idx2] = temp;

            db.ref(`categorias/${catKey}/ordem`).set(allProdsInCat).then(() => {
                renderizarOrdenacaoCategoria(); 
            });
        }

        // ==========================================
        // ATRIBUIÇÃO EM MASSA
        // ==========================================
        function abrirAtribuirCategoria(k) { const c=categorias[k]; document.getElementById('atribuir-cat-id').value=k; document.getElementById('titulo-atribuir-cat').innerText=`Atribuir: ${c.nome}`; document.getElementById('lista-produtos-atribuir').innerHTML=Object.keys(produtos).filter(pk=>produtos[pk]&&produtos[pk].nome).sort((a,b)=>{const hA=getCategoriasProduto(produtos[a]).includes(c.nome)?1:0; const hB=getCategoriasProduto(produtos[b]).includes(c.nome)?1:0; return hA!==hB?hB-hA:produtos[a].nome.localeCompare(produtos[b].nome);}).map(pk=>{ const p=produtos[pk], has=getCategoriasProduto(p).includes(c.nome), out=getCategoriasProduto(p).filter(x=>x!==c.nome).length; return `<label class="check-item" style="padding:15px 10px; border:1px solid ${has?'var(--primary)':'var(--border-color)'}; border-radius:10px; background:${has?'rgba(183, 41, 41, 0.15)':'rgba(0,0,0,0.4)'}; display:flex; align-items:center; cursor:pointer;"><input type="checkbox" value="${pk}" ${has?'checked':''} style="width:22px; height:22px; margin-right:12px;"><strong style="font-size:1.05rem;">${p.nome}</strong><span style="font-size:0.65rem; background:${out>0||has?'#e2e8f0':'#fee2e2'}; color:${out>0||has?'#64748b':'#b91c1c'}; padding:4px 8px; border-radius:12px; margin-left:auto;">${out>0?`+${out} cat`:(has?'OK':'Vazio')}</span></label>`; }).join(''); navegar('atribuir-categoria'); }
        function salvarAtribuicaoCategoria() { const n=categorias[document.getElementById('atribuir-cat-id').value].nome, u={}; document.querySelectorAll('#lista-produtos-atribuir input:checked, #lista-produtos-atribuir input:not(:checked)').forEach(cb=>{ const p=produtos[cb.value]; if(!p)return; let pc=getCategoriasProduto(p), ch=false; if(cb.checked&&!pc.includes(n)){pc.push(n);ch=true;}else if(!cb.checked&&pc.includes(n)){pc=pc.filter(x=>x!==n);ch=true;} if(ch){u[`produtos/${cb.value}/categorias`]=pc.length?pc:null;u[`produtos/${cb.value}/categoria`]=null;} }); if(Object.keys(u).length) db.ref().update(u).then(()=>navegar('configuracoes')); else navegar('configuracoes'); }
        function abrirAtribuirMetodo(k) { const m=metodosCompra[k]; document.getElementById('atribuir-met-id').value=k; document.getElementById('titulo-atribuir-met').innerText=`Atribuir: ${m.nome}`; document.getElementById('lista-produtos-atribuir-met').innerHTML=Object.keys(produtos).filter(pk=>produtos[pk]&&produtos[pk].nome).sort((a,b)=>{const hA=produtos[a].metodoCompra===m.nome?1:0; const hB=produtos[b].metodoCompra===m.nome?1:0; return hA!==hB?hB-hA:produtos[a].nome.localeCompare(produtos[b].nome);}).map(pk=>{ const p=produtos[pk], has=p.metodoCompra===m.nome, out=p.metodoCompra&&p.metodoCompra!==m.nome; return `<label class="check-item" style="padding:15px 10px; border:1px solid ${has?'var(--primary)':'var(--border-color)'}; border-radius:10px; background:${has?'rgba(183, 41, 41, 0.15)':'rgba(0,0,0,0.4)'}; display:flex; align-items:center; cursor:pointer;"><input type="checkbox" value="${pk}" ${has?'checked':''} style="width:22px; height:22px; margin-right:12px;"><strong style="font-size:1.05rem;">${p.nome}</strong><span style="font-size:0.65rem; background:${out?'#e2e8f0':(has?'#e2e8f0':'#fee2e2')}; color:${out?'#64748b':(has?'#64748b':'#b91c1c')}; padding:4px 8px; border-radius:12px; margin-left:auto;">${out?p.metodoCompra:(has?'OK':'Sem método')}</span></label>`; }).join(''); navegar('atribuir-metodo'); }
        function salvarAtribuicaoMetodo() { const n=metodosCompra[document.getElementById('atribuir-met-id').value].nome, u={}; document.querySelectorAll('#lista-produtos-atribuir-met input').forEach(cb=>{ const p=produtos[cb.value]; if(!p)return; let nm=p.metodoCompra, ch=false; if(cb.checked&&nm!==n){nm=n;ch=true;}else if(!cb.checked&&nm===n){nm=null;ch=true;} if(ch)u[`produtos/${cb.value}/metodoCompra`]=nm; }); if(Object.keys(u).length)db.ref().update(u).then(()=>navegar('configuracoes')); else navegar('configuracoes'); }
        
        function selecionarSubgrupoProduto(s, ctx) {
            if(ctx === 'novo') prodSubNovo = s;
            else prodSubEdit = s;
            renderSubgrupos(ctx);
        }

        function renderSubgrupos(ctx) {
            const catName = ctx === 'novo' ? catsNovo[0] : catsEdit[0];
            const cObj = Object.values(categorias).find(x => x.nome === catName);
            const wrapId = ctx === 'novo' ? 'wrap-subgrupo-novo' : 'wrap-subgrupo-edit';
            const contId = ctx === 'novo' ? 'prod-subgrupo-container' : 'edit-prod-subgrupo-container';
            const currentSub = ctx === 'novo' ? prodSubNovo : prodSubEdit;

            if(cObj && cObj.subgrupos && cObj.subgrupos.length > 0) {
                document.getElementById(wrapId).style.display = 'block';
                document.getElementById(contId).innerHTML = cObj.subgrupos.map(s => 
                    `<div class="chip ${currentSub === s ? 'active-chip' : ''}" onclick="selecionarSubgrupoProduto('${s}', '${ctx}')">${s}</div>`
                ).join('');
            } else {
                document.getElementById(wrapId).style.display = 'none';
                if(ctx === 'novo') prodSubNovo = ""; else prodSubEdit = "";
            }
        }

        // ==========================================
        // CHECAGEM DE DESTILADOS (NOVO/EDIT)
        // ==========================================
        function checarDestilado(ctx) {
            const arr = ctx === 'novo' ? catsNovo : catsEdit;
            const isDestilado = arr.some(c => c.toLowerCase().includes('destilado'));
            const wrapId = ctx === 'novo' ? 'wrap-destilados-novo' : 'wrap-destilados-edit';
            document.getElementById(wrapId).style.display = isDestilado ? 'block' : 'none';
        }

        function checarItemProduzido(ctx) {

    const cats = ctx === 'novo'
        ? catsNovo
        : catsEdit;

    const wrap = document.getElementById(
        ctx === 'novo'
            ? 'wrap-item-produzido-novo'
            : 'wrap-item-produzido-edit'
    );

    if(!wrap) return;

    const ehIngrediente = cats.some(c =>
        c.toLowerCase().includes('ingrediente')
    );

    wrap.style.display =
        ehIngrediente
            ? 'block'
            : 'none';
}

function toggleItemProduzido() {

    document.getElementById('box-composicao').style.display =
        document.getElementById('check-item-produzido').checked
            ? 'block'
            : 'none';
}

        function togglePreset(k, ctx) { 
            const n=categorias[k].nome;
            const t=ctx==='novo'?'checks-areas':'edit-checks-areas';
            const a=ctx==='novo'?catsNovo:catsEdit;
            
            document.querySelectorAll('#'+t+' input').forEach(cb=>cb.checked=false); 
            if(a.includes(n)) { 
                a.length=0; 
            } else { 
                a.length=0; a.push(n); 
                document.querySelectorAll('#'+t+' input').forEach(cb=>{if(categorias[k].areas?.includes(cb.value))cb.checked=true;}); 
            } 
            
            atualizarLabelEstoqueMinimo(ctx, a); 
            renderizarPresets(); 
            renderSubgrupos(ctx);
            checarDestilado(ctx);
        }

        function editarCategoria(k) { 
            const c=categorias[k]; 
            document.getElementById('edit-cat-id').value=k; 
            document.getElementById('cat-nome').value=c.nome; 
            document.getElementById('cat-uso-fardo').checked=c.unidadesFardo>1; 
            document.getElementById('cat-qtd-fardo').value=c.unidadesFardo; 
            toggleFardoInput(); 
            
            currentCatSubgrupos = c.subgrupos || [];
            document.getElementById('cat-has-sub').checked = currentCatSubgrupos.length > 0;
            document.getElementById('cat-contagem-fracionada').checked = !!c.contagemFracionada;
            toggleSubgrupoInput();
            renderCatSubs();

            document.querySelectorAll('#cat-checks-areas input').forEach(cb=>cb.checked=c.areas?.includes(cb.value)); 
            document.getElementById('btn-salvar-cat').innerText="Atualizar"; 
            window.scrollTo({top:0}); 
        }

        function resetarFormCategoria() { 
            document.getElementById('edit-cat-id').value=""; 
            document.getElementById('cat-nome').value=""; 
            document.getElementById('cat-uso-fardo').checked=false; 
            document.getElementById('cat-qtd-fardo').value=""; 
            toggleFardoInput(); 
            
            currentCatSubgrupos = [];
            document.getElementById('cat-has-sub').checked = false;
            document.getElementById('cat-contagem-fracionada').checked = false;
            toggleSubgrupoInput();
            renderCatSubs();

            document.querySelectorAll('#cat-checks-areas input').forEach(cb=>cb.checked=false); 
            document.getElementById('btn-salvar-cat').innerText="Criar"; 
        }

        function toggleFardoInput() { document.getElementById('div-unidades-fardo').style.display = document.getElementById('cat-uso-fardo').checked ? 'block' : 'none'; }
        function renderizarChecksConfig() { document.getElementById('cat-checks-areas').innerHTML=areas.map(a=>`<label class="check-item"><input type="checkbox" value="${a.nome}"> <span>${a.nome}</span></label>`).join(''); }
        function atualizarLabelEstoqueMinimo(ctx, selectedCats) { let maxFardo=1; selectedCats.forEach(cn=>{ const c = Object.values(categorias).find(x=>x.nome===cn); if(c && c.unidadesFardo>maxFardo) maxFardo=Number(c.unidadesFardo); }); document.getElementById(ctx==='novo'?'lbl-estoque-minimo-novo':'lbl-estoque-minimo-edit').innerText=maxFardo>1?"(Fardos)":"(Un.)"; }
        
        // ==========================================
        // CADASTRO ÁREAS E PRODUTOS (ABRIR/SALVAR/EXCLUIR)
        // ==========================================
        function abrirCadastro(id) { navegar(id); }
        function abrirCadastroProduto() { 
            const checksHTML = areas.length ? areas.map(a=>`<label class="check-item"><input type="checkbox" value="${a.nome}"> <span>${a.nome}</span></label>`).join('') : '<span style="color:#64748b; font-size:0.85rem;">Nenhuma área cadastrada. Cadastre uma área primeiro.</span>';
            document.getElementById('checks-areas').innerHTML=checksHTML; 
            document.getElementById('prod-nome').value=""; 
            document.getElementById('prod-preco-custo').value="";
            document.getElementById('prod-metodo-selecionado').value=""; 
            document.getElementById('prod-estoque-minimo').value="0"; 
            document.getElementById('prod-ml-garrafa').value="";
            document.getElementById('prod-preco-garrafa').value="";
            catsNovo=[]; 
            prodSubNovo="";
            atualizarLabelEstoqueMinimo('novo',catsNovo); 
            renderizarPresets(); 
            renderizarPresetsMetodos(); 
            renderSubgrupos('novo');
            checarDestilado('novo');
            checarItemProduzido('novo');
            navegar('novo-produto'); 
        }

                function salvarArea() {
    if (currentRole !== 'dono') { showToast("Apenas o dono pode criar áreas.", "error"); return; }
    const n = document.getElementById('area-nome').value;
    if (n) {
        db.ref('areas').push({
            nome: n,
            config: { usaPadrao: false, padroes: {} }
        });
        document.getElementById('area-nome').value = "";
        navegar('areas-lista');
    }
}

function salvarProduto() {
    if (currentRole !== 'dono') { showToast("Apenas o dono pode cadastrar produtos.", "error"); return; }
    const n = document.getElementById('prod-nome').value;
    const pCusto = Number(document.getElementById('prod-preco-custo').value) || 0;
    const met = document.getElementById('prod-metodo-selecionado').value;
    const min = Number(document.getElementById('prod-estoque-minimo').value) || 0;

    if (!met) {
        alert("Selecione um Método.");
        return;
    }

    const s = Array.from(document.querySelectorAll('#checks-areas input:checked')).map(i => i.value);

    if (!n || s.length === 0) {
        alert("Assinale área vinculada.");
        return;
    }

    const e = {};
    s.forEach(x => e[x] = { f: 0, u: 0 });

    let detDestilado = null;
    if (catsNovo.some(c => c.toLowerCase().includes('destilado'))) {
        detDestilado = {
            ml: Number(document.getElementById('prod-ml-garrafa').value) || 0,
            precoGarrafa: Number(document.getElementById('prod-preco-garrafa').value) || 0
        };
    }

    const isProduzido = document.getElementById('check-item-produzido')?.checked || false;
    const custoFinal = isProduzido ? calcularCustoComposicao() : pCusto;

    db.ref('produtos').push({
        nome: n,
        precoCusto: custoFinal,
        categorias: catsNovo.length ? catsNovo : null,
        subgrupo: prodSubNovo || null,
        detalhesDestilado: detDestilado,
        metodoCompra: met,
        estoqueMinimo: min,
        locais: s,
        estoque: e,
        itemProduzido: isProduzido,
        rendimentoFinal: Number(document.getElementById('prod-rendimento-final')?.value) || 0,
        composicao: Array.from(document.querySelectorAll('#lista-composicao > div')).map(linha => ({
            produtoId: linha.querySelector('.comp-prod').value,
            quantidade: Number(linha.querySelector('.comp-qtd').value) || 0
        })),
        custoCalculado: custoFinal
    });

    document.getElementById('prod-nome').value = "";
    document.getElementById('prod-metodo-selecionado').value = "";
    document.getElementById('prod-estoque-minimo').value = "0";
    document.getElementById('prod-preco-custo').value = "";

    navegar('produtos-categorias');
}

        function abrirEdicaoProduto(k) { 
            const p=produtos[k]; 
            document.getElementById('edit-prod-id').value=k; 
            document.getElementById('edit-prod-nome').value=p.nome; 
            document.getElementById('edit-prod-preco-custo').value = p.precoCusto || "";
            document.getElementById('edit-prod-metodo-selecionado').value=p.metodoCompra||""; 
            document.getElementById('edit-prod-estoque-minimo').value=p.estoqueMinimo||0; 
            catsEdit=getCategoriasProduto(p); 
            prodSubEdit = p.subgrupo || "";
            
            if(p.detalhesDestilado) {
                document.getElementById('edit-prod-ml-garrafa').value = p.detalhesDestilado.ml || "";
                document.getElementById('edit-prod-preco-garrafa').value = p.detalhesDestilado.precoGarrafa || "";
            } else {
                document.getElementById('edit-prod-ml-garrafa').value = "";
                document.getElementById('edit-prod-preco-garrafa').value = "";
            }

            atualizarLabelEstoqueMinimo('edit',catsEdit); 
            renderizarPresets(); 
            renderizarPresetsMetodos(); 
            renderSubgrupos('edit');
            checarDestilado('edit');
            checarItemProduzido('edit');
            
            const checksHTML = areas.length ? areas.map(a=>`<label class="check-item"><input type="checkbox" value="${a.nome}" ${(p.locais||[]).includes(a.nome)?'checked':''}> <span>${a.nome}</span></label>`).join('') : '<span style="color:#64748b; font-size:0.85rem;">Nenhuma área cadastrada. Cadastre uma área primeiro.</span>';
            document.getElementById('edit-checks-areas').innerHTML=checksHTML; 
            navegar('editar-produto'); 
        }

                function salvarEdicaoProduto() { 
            if (currentRole !== 'dono') { showToast("Apenas o dono pode editar produtos.", "error"); return; }
            const id=document.getElementById('edit-prod-id').value;
            const n=document.getElementById('edit-prod-nome').value;
            const pCusto = Number(document.getElementById('edit-prod-preco-custo').value) || 0;
            const met=document.getElementById('edit-prod-metodo-selecionado').value;
            const min=Number(document.getElementById('edit-prod-estoque-minimo').value)||0; 
            
            if(!met){alert("Selecione um Método.");return;} 
            const l=Array.from(document.querySelectorAll('#edit-checks-areas input:checked')).map(i=>i.value); 
            
            let detDestilado = null;
            if(catsEdit.some(c => c.toLowerCase().includes('destilado'))) {
                detDestilado = {
                    ml: Number(document.getElementById('edit-prod-ml-garrafa').value) || 0,
                    precoGarrafa: Number(document.getElementById('edit-prod-preco-garrafa').value) || 0
                };
            }

            db.ref('produtos/'+id).update({
                nome:n, 
                precoCusto: pCusto,
                categorias:catsEdit.length?catsEdit:null, 
                categoria:null, 
                subgrupo: prodSubEdit || null,
                detalhesDestilado: detDestilado,
                metodoCompra:met, 
                estoqueMinimo:min, 
                locais:l.length?l:null
            }); 
            navegar('produtos-categorias'); 
        }

        function toggleConfigEstoquePadrao() {
            const isChecked = document.getElementById('area-usar-padrao').checked;
            const painel = document.getElementById('div-config-estoque-padrao');
            painel.style.display = isChecked ? 'block' : 'none';
            
            if(isChecked) {
                const areaObj = areas.find(a => a.key === areaAtualKey);
                if (!areaObj) return;
                
                // Puxa baseado no que o usuário marcou AGORA na tela de edição
                const checkedKeys = Array.from(document.querySelectorAll('.area-prod-checkbox:checked')).map(cb => cb.value);
                let iA = checkedKeys.filter(pk => produtos[pk]); 
                
                iA.sort((a, b) => {
                    const prioA = getPrioridadeProduto(produtos[a]);
                    const prioB = getPrioridadeProduto(produtos[b]);
                    if (prioA !== prioB) return prioA - prioB;
                    return (produtos[a].nome || "").localeCompare(produtos[b].nome || "");
                });
                
                document.getElementById('lista-itens-padrao-area').innerHTML = iA.map(pk => {
                    const p = produtos[pk];
                    let t = 1; getCategoriasProduto(p).forEach(cn => { const c = Object.values(categorias).find(x => x.nome === cn); if(c && c.unidadesFardo > t) t = Number(c.unidadesFardo); }); 
                    const labelQtd = t > 1 ? 'Fds.' : 'Un.';
                    const valAtual = (areaObj.config && areaObj.config.padroes && areaObj.config.padroes[pk]) ? areaObj.config.padroes[pk] : 0;
                    return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding:8px 0;">
                        <span style="font-size:0.85rem; font-weight:bold; color: var(--text-main);">${p.nome} <small style="color:#64748b;">(${labelQtd})</small></span>
                        <input type="number" id="padrao-${pk}" value="${valAtual}" style="width:65px; padding:5px; text-align:center; margin:0;" min="0">
                    </div>`;
                }).join('') || '<p style="font-size:0.8rem; color:#64748b; padding:10px;">Marque os produtos acima primeiro.</p>';
            }
        }
        function habilitarEdicaoArea() { 
            const a = areas.find(x => x.key === areaAtualKey);
            document.getElementById('edit-area-input').value = a.nome;
            
            // Renderiza lista de produtos para vincular à área
            let htmlProds = Object.keys(produtos).sort((pa, pb) => (produtos[pa].nome || "").localeCompare(produtos[pb].nome || "")).map(pk => {
                const p = produtos[pk];
                const checked = (p.locais || []).includes(a.nome) ? 'checked' : '';
                return `<label class="check-item" style="font-size:0.85rem; margin-bottom:5px;"><input type="checkbox" value="${pk}" class="area-prod-checkbox" ${checked} onchange="atualizarOrdemCategoriasAreaEdit(); if(document.getElementById('area-usar-padrao').checked) toggleConfigEstoquePadrao()"> <span>${p.nome}</span></label>`;
            }).join('');
            document.getElementById('area-edit-produtos-list').innerHTML = htmlProds || '<p style="font-size:0.8rem; color:#64748b;">Nenhum produto cadastrado.</p>';

            areaCatOrderTemp = (a.config && a.config.ordemCategorias) ? [...a.config.ordemCategorias] : [];
document.getElementById('area-usar-padrao').checked = (a.config && a.config.usaPadrao) ? true : false;
atualizarOrdemCategoriasAreaEdit();
toggleConfigEstoquePadrao();
document.getElementById('area-edit-box').style.display='block';
        }

        function salvarNovoNomeArea() { 
            const nv = document.getElementById('edit-area-input').value.trim(); 
            const ant = document.getElementById('area-display-name').innerText.trim(); 
            const usaPadrao = document.getElementById('area-usar-padrao').checked;
            
            if(!nv) { alert("O nome da área não pode estar vazio."); return; }

            const prodsSelecionados = Array.from(document.querySelectorAll('.area-prod-checkbox:checked')).map(cb => cb.value);

            let padroes = {};
            if(usaPadrao) {
                prodsSelecionados.forEach(pk => {
                    const input = document.getElementById(`padrao-${pk}`);
                    if(input) padroes[pk] = Number(input.value) || 0;
                });
            }

            // 1. Atualiza a Área no Banco
            db.ref('areas/' + areaAtualKey).set({ nome: nv, config: { usaPadrao, padroes, ordemCategorias: areaCatOrderTemp } }).then(() => { 
                
                // 2. Sincroniza todos os produtos
                const updatesGerais = {};
                
                Object.keys(produtos).forEach(pk => {
                    const p = produtos[pk];
                    if(!p) return;

                    let locais = p.locais ? [...p.locais] : [];
                    let estoque = p.estoque ? {...p.estoque} : {};
                    let mudou = false;

                    const deveEstarNaArea = prodsSelecionados.includes(pk);
                    const estavaComNomeAntigo = locais.includes(ant);
                    const jaEstaComNomeNovo = locais.includes(nv);

                    if (deveEstarNaArea) {
                        // Se o nome mudou, atualiza o nome no array e no objeto de estoque
                        if (estavaComNomeAntigo && nv !== ant) {
                            locais = locais.map(x => x === ant ? nv : x);
                            if (estoque[ant] !== undefined) {
                                estoque[nv] = estoque[ant];
                                delete estoque[ant];
                            }
                            mudou = true;
                        } 
                        // Se não estava na lista (novo vínculo), adiciona
                        else if (!estavaComNomeAntigo && !jaEstaComNomeNovo) {
                            locais.push(nv);
                            estoque[nv] = { f: 0, u: 0 };
                            mudou = true;
                        }
                    } else {
                        // Se não deve estar na área mas o nome antigo ou novo consta lá, remove
                        if (estavaComNomeAntigo || jaEstaComNomeNovo) {
                            locais = locais.filter(x => x !== ant && x !== nv);
                            delete estoque[ant];
                            delete estoque[nv];
                            mudou = true;
                        }
                    }

                    if (mudou) {
                        updatesGerais[`produtos/${pk}/locais`] = locais;
                        updatesGerais[`produtos/${pk}/estoque`] = estoque;
                    }
                });

                // Executa todas as atualizações de produtos de uma vez
                if (Object.keys(updatesGerais).length > 0) {
                    db.ref().update(updatesGerais).then(() => {
                        finalizarEdicaoArea();
                    });
                } else {
                    finalizarEdicaoArea();
                }
            });
        }

        function finalizarEdicaoArea() {
            document.getElementById('area-edit-box').style.display = 'none'; 
            document.getElementById('edit-area-input').value = ""; 
            navegar('areas-lista');
        }
        
        function prepararExclusaoArea() { document.getElementById('modalMsg').innerHTML=`Excluir área <strong>${document.getElementById('area-display-name').innerText}</strong>?`; document.getElementById('modalDelete').style.display='flex'; document.getElementById('confirmDeleteBtn').onclick=()=>{db.ref('areas/'+areaAtualKey).remove();fecharModal();navegar('areas-lista');}; }
        function prepararExclusaoProd() { document.getElementById('modalMsg').innerHTML=`Excluir <strong>${document.getElementById('edit-prod-nome').value}</strong>?`; document.getElementById('modalDelete').style.display='flex'; document.getElementById('confirmDeleteBtn').onclick=()=>{db.ref('produtos/'+document.getElementById('edit-prod-id').value).remove();fecharModal();navegar('produtos-categorias');}; }
        function prepararExclusaoCat(k) { document.getElementById('modalMsg').innerHTML=`Excluir preset <strong>${categorias[k].nome}</strong>?`; document.getElementById('modalDelete').style.display='flex'; document.getElementById('confirmDeleteBtn').onclick=()=>{db.ref('categorias/'+k).remove();fecharModal();}; }
        function prepararExclusaoMet(k) { document.getElementById('modalMsg').innerHTML=`Excluir método <strong>${metodosCompra[k].nome}</strong>?`; document.getElementById('modalDelete').style.display='flex'; document.getElementById('confirmDeleteBtn').onclick=()=>{db.ref('metodos/'+k).remove();fecharModal();}; }

        // ==========================================
        // SISTEMA DE RECEITAS
        // ==========================================
        function toggleReceitaInfo() {
            const panel = document.getElementById('receita-info-painel');
            if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }

        function previewReceitaFoto(event, ctx) {
            const file = event.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if(ctx === 'novo') {
                        base64ReceitaFoto = e.target.result;
                        const preview = document.getElementById('receita-foto-preview-novo');
                        preview.src = base64ReceitaFoto;
                        preview.style.display = 'block';
                        document.getElementById('crop-wrapper-novo').style.display = 'flex';
                        document.getElementById('wrap-slider-novo').style.display = 'block';
                        
                        configEnquadramentoNovo = { x: 50, y: 50, scale: 1 };
                        document.getElementById('receita-foto-zoom-novo').value = 1;
                        document.getElementById('receita-foto-posx-novo').value = 50;
                        document.getElementById('receita-foto-posy-novo').value = 50;
                        aplicarEnquadramentoVisual(preview, configEnquadramentoNovo);
                    } else {
                        base64ReceitaFotoEdit = e.target.result;
                        const preview = document.getElementById('receita-foto-preview-edit');
                        preview.src = base64ReceitaFotoEdit;
                        preview.style.display = 'block';
                        document.getElementById('crop-wrapper-edit').style.display = 'flex';
                        document.getElementById('wrap-slider-edit').style.display = 'block';
                        
                        configEnquadramentoEdit = { x: 50, y: 50, scale: 1 };
                        document.getElementById('receita-foto-zoom-edit').value = 1;
                        document.getElementById('receita-foto-posx-edit').value = 50;
                        document.getElementById('receita-foto-posy-edit').value = 50;
                        aplicarEnquadramentoVisual(preview, configEnquadramentoEdit);
                    }
                }
                reader.readAsDataURL(file);
            }
        }
        
        function ajustarEnquadramento(ctx) {
            if(ctx === 'novo') {
                configEnquadramentoNovo.scale = document.getElementById('receita-foto-zoom-novo').value;
                configEnquadramentoNovo.x = document.getElementById('receita-foto-posx-novo').value;
                configEnquadramentoNovo.y = document.getElementById('receita-foto-posy-novo').value;
                aplicarEnquadramentoVisual(document.getElementById('receita-foto-preview-novo'), configEnquadramentoNovo);
            } else {
                configEnquadramentoEdit.scale = document.getElementById('receita-foto-zoom-edit').value;
                configEnquadramentoEdit.x = document.getElementById('receita-foto-posx-edit').value;
                configEnquadramentoEdit.y = document.getElementById('receita-foto-posy-edit').value;
                aplicarEnquadramentoVisual(document.getElementById('receita-foto-preview-edit'), configEnquadramentoEdit);
            }
        }

        function aplicarEnquadramentoVisual(imgElement, config) {
            // O object-position move a textura da foto dentro da borda
            imgElement.style.objectPosition = `${config.x}% ${config.y}%`;
            // O transform-origin garante que o zoom vá para a direção correta
            imgElement.style.transformOrigin = `${config.x}% ${config.y}%`;
            imgElement.style.transform = `scale(${config.scale})`;
        }

        function abrirReceitas() {
            navegar('receitas-lista');
            renderizarReceitas();
        }

        let receitasCarregadasFirstTime = false; // Controle de animação
        
        function renderizarReceitas() {
            const grid = document.getElementById('grid-receitas');
            const chaves = Object.keys(receitasDB);
            
            if(chaves.length === 0) {
                // Se for a primeira vez que abre, espera 1.2 segundos "Buscando dados"
                if (!receitasCarregadasFirstTime) {
                    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 30px;"><p style="color:var(--primary); font-size:1.2rem; font-weight:bold; letter-spacing:1px; animation: pulse 1s infinite;">⏳ Sincronizando com o servidor...</p></div>`;
                    setTimeout(() => { 
                        receitasCarregadasFirstTime = true; 
                        renderizarReceitas(); // Tenta desenhar de novo
                    }, 1200);
                    return;
                }
                // Se passou o tempo e continua vazio, é porque não tem mesmo.
                grid.innerHTML = `<p style="color:#64748b; font-size:0.9rem; text-align:center; grid-column:1/-1;">Nenhuma receita cadastrada ainda.</p>`;
                return;
            }
            
            receitasCarregadasFirstTime = true; // Se achou dados na hora, cancela a espera
            
            grid.innerHTML = chaves.map(k => {
                const r = Object.assign({ ingredientes: [], foto: "", configEnquadramento: { x: 50, y: 50, scale: 1 } }, receitasDB[k]);
                
                let custoHtml = '';
                if (podeVerCustos()) {
                    let custoTotal = 0;
                    r.ingredientes.forEach(ing => {
                        let p = produtos[ing.idProduto];
                        if (p) {
                            if (ing.unidade === 'ml' && p.detalhesDestilado && p.detalhesDestilado.ml) {
                                custoTotal += (Number(p.detalhesDestilado.precoGarrafa) / Number(p.detalhesDestilado.ml)) * Number(ing.qtd);
                            } else {
                                custoTotal += Number(p.precoCusto || 0) * Number(ing.qtd);
                            }
                        }
                    });
                    custoHtml = `<span class="req-custo custo-receita" style="font-size:0.85rem; color:#10b981; font-weight:800;">R$ ${custoTotal.toFixed(2).replace('.', ',')}</span>`;
                }

                let imgHtml = '';
                if(r.foto) {
                    const cfg = r.configEnquadramento || { x: 50, y: 50, scale: 1 };
                    imgHtml = `<div style="width:60px; height:60px; border-radius:10px; overflow:hidden; flex-shrink:0; border:1px solid rgba(255,255,255,0.1); display:block !important;">
                                    <img src="${r.foto}" style="width:100%; height:100%; object-fit:cover; object-position: ${cfg.x}% ${cfg.y}%; transform-origin: ${cfg.x}% ${cfg.y}%; transform: scale(${cfg.scale}); display:block !important;">
                               </div>`;
                } else {
                    imgHtml = `<div style="width:60px; height:60px; border-radius:10px; background:rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); display:flex !important; align-items:center; justify-content:center; color:var(--primary); font-size:1.5rem; flex-shrink:0;"><i class="ph ph-martini"></i></div>`;
                }

                return `
                <div class="card-nav" onclick="verDetalhesReceita('${k}')" style="display:flex !important; align-items:center; gap:12px; padding: 15px; flex-direction: row; justify-content:flex-start;">
                    ${imgHtml}
                    <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                        <h3 style="font-size:1.05rem; color:var(--text-main); margin:0; display:block !important;">${r.nome}</h3>
                        ${custoHtml}
                    </div>
                </div>`;
            }).join('');
        }

        function verDetalhesReceita(k) {
            receitaAtualKey = k;
            const r = receitasDB[k];
            if(!r) return;
            
            document.getElementById('detalhe-receita-titulo').innerText = r.nome;
            
            let custoTotal = 0;
            let ingredientesHtml = (r.ingredientes || []).map(ing => {
                let p = produtos[ing.idProduto];
                let custoIngHtml = '';
                if (podeVerCustos() && p) {
                    let custoIng = 0;
                    if (ing.unidade === 'ml' && p.detalhesDestilado && p.detalhesDestilado.ml) {
                        custoIng = (Number(p.detalhesDestilado.precoGarrafa) / Number(p.detalhesDestilado.ml)) * Number(ing.qtd);
                    } else {
                        custoIng = Number(p.precoCusto || 0) * Number(ing.qtd);
                    }
                    custoTotal += custoIng;
                    custoIngHtml = `<span class="req-custo custo-receita" style="color:#10b981; font-weight:800; font-size:0.85rem;">R$ ${custoIng.toFixed(2).replace('.', ',')}</span>`;
                }
                return `<li style="margin-bottom:8px; color:var(--text-main); font-size:0.95rem; list-style:none; border-bottom:1px solid rgba(251, 238, 227, 0.1); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span><strong>${ing.qtd} ${ing.unidade}</strong> de ${ing.nome}</span>
                            ${custoIngHtml}
                        </li>`;
            }).join('');

            if (ingredientesHtml === '') {
                ingredientesHtml = '<li style="color:#64748b; font-style:italic; list-style:none;">Nenhum ingrediente cadastrado.</li>';
            }

            let fotoHtml = '';
            if(r.foto) {
                const cfg = r.configEnquadramento || { x: 50, y: 50, scale: 1 };
                fotoHtml = `<div style="width:135px; height:240px; border-radius:16px; overflow:hidden; flex-shrink:0; border:2px solid var(--primary); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                                <img src="${r.foto}" style="width:100%; height:100%; object-fit:cover; object-position: ${cfg.x}% ${cfg.y}%; transform-origin: ${cfg.x}% ${cfg.y}%; transform: scale(${cfg.scale});">
                            </div>`;
            }

            // Força o fundo da receita a ficar mais redondo e espaçoso
            const container = document.getElementById('detalhe-receita-content');
            container.style.borderRadius = "24px";
            container.style.padding = "20px";

            const painelCustoHtml = podeVerCustos()
                ? `<div id="receita-info-painel" class="req-custo custo-receita" style="background:rgba(16, 185, 129, 0.1); border:1px solid #10b981; border-radius:12px; padding:15px; margin-bottom:15px;">
                            <h3 style="color:#10b981; margin:0; font-size:1.15rem; font-weight:800;">Custo Total: R$ ${custoTotal.toFixed(2).replace('.', ',')}</h3>
                        </div>`
                : '';

            container.innerHTML = `
                <div style="display:flex; gap:15px; align-items:flex-start;">
                    <div style="flex:1;">
                        ${painelCustoHtml}
                        <h3 style="color:var(--primary); font-size:1.1rem; margin-bottom:12px;">Ingredientes:</h3>
                        <ul style="padding:0; margin:0;">${ingredientesHtml}</ul>
                    </div>
                    
                    ${fotoHtml}
                </div>

                ${r.preparo ? `
                <div style="margin-top:25px; padding:18px; background:rgba(0,0,0,0.4); border-radius:16px; border:1px solid var(--border-color);">
                    <strong style="display:block; margin-bottom:10px; color:var(--primary); font-size:1.05rem;"><i class="ph ph-book-open"></i> Modo de Preparo:</strong>
                    <p style="margin:0; font-size:0.95rem; line-height:1.6; color:var(--text-main); white-space:pre-wrap;">${r.preparo}</p>
                </div>` : ''}
            `;
            
            navegar('detalhe-receita');
        }

        function abrirNovaReceita() {
            receitaEmConstrucao = { nome: "", ingredientes: [], preparo: "", foto: "", configEnquadramento: { x: 50, y: 50, scale: 1 } };
            document.getElementById('receita-nome-input').value = "";
            document.getElementById('receita-preparo-input').value = "";
            document.getElementById('receita-foto-input').value = "";
            document.getElementById('crop-wrapper-novo').style.display = 'none';
            document.getElementById('wrap-slider-novo').style.display = 'none';
            document.getElementById('receita-foto-preview-novo').style.display = 'none';
            base64ReceitaFoto = "";
            configEnquadramentoNovo = { x: 50, y: 50, scale: 1 };
            renderIngredientesReceita();
            navegar('nova-receita');
        }

        function abrirEdicaoReceita() {
            const k = receitaAtualKey;
            const r = receitasDB[k];
            if(!r) return;
            
            document.getElementById('edit-receita-id').value = k;
            document.getElementById('edit-receita-nome-input').value = r.nome || "";
            document.getElementById('edit-receita-preparo-input').value = r.preparo || "";
            
            base64ReceitaFotoEdit = r.foto || "";
            configEnquadramentoEdit = r.configEnquadramento ? {...r.configEnquadramento} : { x: 50, y: 50, scale: 1 };
            
            const cropWrapper = document.getElementById('crop-wrapper-edit');
            const preview = document.getElementById('receita-foto-preview-edit');
            const wrapSlider = document.getElementById('wrap-slider-edit');
            
            if(r.foto) {
                cropWrapper.style.display = 'flex';
                preview.src = r.foto;
                preview.style.display = 'block';
                wrapSlider.style.display = 'block';
                
                document.getElementById('receita-foto-zoom-edit').value = configEnquadramentoEdit.scale;
                document.getElementById('receita-foto-posx-edit').value = configEnquadramentoEdit.x;
                document.getElementById('receita-foto-posy-edit').value = configEnquadramentoEdit.y;
                aplicarEnquadramentoVisual(preview, configEnquadramentoEdit);
            } else {
                cropWrapper.style.display = 'none';
                wrapSlider.style.display = 'none';
                preview.style.display = 'none';
            }
            
            receitaEmEdicao.ingredientes = r.ingredientes ? [...r.ingredientes] : [];
            renderIngredientesReceitaEdit();
            navegar('editar-receita');
        }

        function renderIngredientesReceita() {
            const lista = document.getElementById('lista-ingredientes-receita');
            if(receitaEmConstrucao.ingredientes.length === 0) {
                lista.innerHTML = `<p style="color:#94a3b8; font-size:0.85rem; font-style:italic;">Nenhum ingrediente adicionado.</p>`;
                return;
            }
            lista.innerHTML = receitaEmConstrucao.ingredientes.map((ing, idx) => `
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.4); border:1px solid var(--border-color); padding:10px; border-radius:6px; align-items:center;">
                    <span style="font-size:0.9rem;"><strong>${ing.qtd} ${ing.unidade}</strong> de ${ing.nome}</span>
                    <button style="background:red; color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="removerIngrediente(${idx})">×</button>
                </div>
            `).join('');
        }
        
        function renderIngredientesReceitaEdit() {
            const lista = document.getElementById('edit-lista-ingredientes-receita');
            if(receitaEmEdicao.ingredientes.length === 0) {
                lista.innerHTML = `<p style="color:#94a3b8; font-size:0.85rem; font-style:italic;">Nenhum ingrediente adicionado.</p>`;
                return;
            }
            lista.innerHTML = receitaEmEdicao.ingredientes.map((ing, idx) => `
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.4); border:1px solid var(--border-color); padding:10px; border-radius:6px; align-items:center;">
                    <span style="font-size:0.9rem;"><strong>${ing.qtd} ${ing.unidade}</strong> de ${ing.nome}</span>
                    <button style="background:red; color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="removerIngredienteEdit(${idx})">×</button>
                </div>
            `).join('');
        }

        function adicionarLinhaComposicao() {

    const container =
        document.getElementById('lista-composicao');

    const options =
        Object.keys(produtos)
            .map(k => `
                <option value="${k}">
                    ${produtos[k].nome}
                </option>
            `)
            .join('');

    const div = document.createElement('div');

    div.style =
        'display:flex; gap:10px; align-items:center;';

    div.innerHTML = `
        <select class="comp-prod" style="flex:1;">
            ${options}
        </select>

        <input
            type="number"
            class="comp-qtd"
            placeholder="Qtd"
            style="width:100px;"
        >

        <button
            type="button"
            onclick="
                this.parentElement.remove();
                calcularCustoComposicao();
            "
            style="
                background:red;
                color:white;
                border:none;
                border-radius:50%;
                width:28px;
                height:28px;
                cursor:pointer;
            "
        >
            ×
        </button>
    `;

    container.appendChild(div);

    div.querySelector('.comp-prod')
        .addEventListener(
            'change',
            calcularCustoComposicao
        );

    div.querySelector('.comp-qtd')
        .addEventListener(
            'input',
            calcularCustoComposicao
        );
}

function calcularCustoComposicao() {

    let total = 0;

    document
        .querySelectorAll('#lista-composicao > div')
        .forEach(linha => {

            const prodId =
                linha.querySelector('.comp-prod').value;

            const qtd =
                Number(
                    linha.querySelector('.comp-qtd').value
                ) || 0;

            const prod = produtos[prodId];

            if(!prod) return;

            const custo =
                Number(prod.precoCusto) || 0;

            total += custo * qtd;
        });

    const rendimento =
        Number(
            document.getElementById(
                'prod-rendimento-final'
            ).value
        ) || 1;

    const final = total / rendimento;

    document.getElementById(
        'custo-composicao'
    ).innerText =
        final.toLocaleString('pt-BR', {
            style:'currency',
            currency:'BRL'
        });

    return final;
}

        function removerIngrediente(idx) {
            receitaEmConstrucao.ingredientes.splice(idx, 1);
            renderIngredientesReceita();
        }
        
        function removerIngredienteEdit(idx) {
            receitaEmEdicao.ingredientes.splice(idx, 1);
            renderIngredientesReceitaEdit();
        }

        function irParaSelecionarIngrediente(ctx) {
            ctxIngredienteTemp = ctx;
            document.getElementById('busca-ingrediente').value = "";
            const tbody = document.getElementById('tabela-ingredientes');
            const chaves = Object.keys(produtos).sort((a,b) => produtos[a].nome.localeCompare(produtos[b].nome));
            
            tbody.innerHTML = chaves.map(k => `
                <tr style="cursor:pointer;" onclick="escolherIngrediente('${k}')">
                    <td class="col-item" style="padding:15px 10px;">${produtos[k].nome}</td>
                    <td style="text-align:right; font-size:1.2rem; color:var(--primary);">+</td>
                </tr>
            `).join('');
            
            navegar('selecionar-ingrediente');
        }

        function escolherIngrediente(pk) {
            ingredienteSelecionadoTemp = pk;
            const p = produtos[pk];
            const isDestilado = getCategoriasProduto(p).some(c => c.toLowerCase().includes('destilado'));
            
            document.getElementById('ingrediente-modal-nome').innerText = p.nome;
            document.getElementById('ingrediente-modal-lbl').innerText = isDestilado ? "Quantos ml?" : "Quantidade:";
            document.getElementById('ingrediente-modal-qtd').value = "";
            
            document.getElementById('modalIngredienteQtd').style.display = 'flex';
        }

        function confirmarIngredienteQtd() {
            const qtd = document.getElementById('ingrediente-modal-qtd').value;
            if(!qtd || Number(qtd) <= 0) { alert("Informe uma quantidade válida."); return; }
            
            const p = produtos[ingredienteSelecionadoTemp];
            const isDestilado = getCategoriasProduto(p).some(c => c.toLowerCase().includes('destilado'));
            
            const novoIngrediente = { 
                idProduto: ingredienteSelecionadoTemp, 
                nome: p.nome, 
                qtd: qtd, 
                unidade: isDestilado ? 'ml' : 'un' 
            };
            
            if(ctxIngredienteTemp === 'novo') {
                receitaEmConstrucao.ingredientes.push(novoIngrediente);
                navegar('nova-receita');
                renderIngredientesReceita();
            } else {
                receitaEmEdicao.ingredientes.push(novoIngrediente);
                navegar('editar-receita');
                renderIngredientesReceitaEdit();
            }
            
            document.getElementById('modalIngredienteQtd').style.display = 'none';
        }

        function salvarReceita() {
            const nome = document.getElementById('receita-nome-input').value.trim();
            const preparo = document.getElementById('receita-preparo-input').value.trim();
            if(!nome) { alert("Dê um nome para a receita!"); return; }
            if(receitaEmConstrucao.ingredientes.length === 0) { alert("Adicione pelo menos um ingrediente!"); return; }
            
            db.ref('receitas').push({
                nome: nome,
                ingredientes: receitaEmConstrucao.ingredientes,
                preparo: preparo,
                foto: base64ReceitaFoto,
                configEnquadramento: configEnquadramentoNovo
            }).then(() => {
                abrirReceitas();
            });
        }
        
        function salvarEdicaoReceita() {
            const k = document.getElementById('edit-receita-id').value;
            const nome = document.getElementById('edit-receita-nome-input').value.trim();
            const preparo = document.getElementById('edit-receita-preparo-input').value.trim();
            
            if(!nome) { alert("Dê um nome para a receita!"); return; }
            if(receitaEmEdicao.ingredientes.length === 0) { alert("Adicione pelo menos um ingrediente!"); return; }
            
            db.ref('receitas/' + k).update({
                nome: nome,
                ingredientes: receitaEmEdicao.ingredientes,
                preparo: preparo,
                foto: base64ReceitaFotoEdit,
                configEnquadramento: configEnquadramentoEdit
            }).then(() => {
                verDetalhesReceita(k);
            });
        }

        function prepararExclusaoReceita() {
            const k = document.getElementById('edit-receita-id').value;
            document.getElementById('modalMsg').innerHTML=`Excluir a receita <strong>${document.getElementById('edit-receita-nome-input').value}</strong>?`; 
            document.getElementById('modalDelete').style.display='flex'; 
            document.getElementById('confirmDeleteBtn').onclick=() => {
                db.ref('receitas/'+k).remove();
                fecharModal();
                abrirReceitas();
            }; 
        }

        function fecharModal() {
            document.getElementById('modalDelete').style.display = 'none';
        }
        // --- CONTROLE DO BOTÃO DE VOLTAR NATIVO (MOBILE/MOUSE) ---
        window.addEventListener('popstate', function(event) {
            if (event.state && event.state.tela) {
                // Navega para a tela anterior sem criar um loop no histórico
                navegar(event.state.tela, null, true);
            } else {
                // Se não tiver histórico, volta pro Início por segurança
                navegar('inicio', document.getElementById('nav-inicio'), true);
            }
        });
        
        // ==========================================
        // INFORMAÇÕES GLOBAIS DO ITEM NO ESTOQUE (i)
        // ==========================================
        // ==========================================
        // INFORMAÇÕES GLOBAIS DO ITEM NO ESTOQUE (i)
        // ==========================================
        function abrirInfoItem(pk) {
            const p = produtos[pk];
            if(!p) return;

            document.getElementById('titulo-info-item').innerText = p.nome;
            const containerLista = document.getElementById('lista-locais-item');
            containerLista.innerHTML = '';
            let totalGeralUnidades = 0;

            const frac = produtoUsaContagemFracionada(p);
            const t = getTamFardoProduto(p);

            if (p.estoque) {
                // Ordenar para ficar mais bonito na tela
                const locaisOrdem = Object.keys(p.estoque).sort();
                
                locaisOrdem.forEach(loc => {
                    if (loc === '_Pendente_') return;
                    const v = p.estoque[loc];
                    if (!v) return;

                    const qtdF = parseQtdValor(v.f, frac);
                    const qtdU = parseQtdValor(v.u, frac);
                    const totalUnidadesNaArea = (qtdF * t) + qtdU;

                    if (totalUnidadesNaArea > 0) {
                        // Soma pro total geral
                        totalGeralUnidades += totalUnidadesNaArea;

                        let txtQtd = frac 
                            ? `${formatarQtdNumero(totalUnidadesNaArea, true)} Un.` 
                            : (t > 1 ? `${Math.floor(totalUnidadesNaArea / t)} Fds | ${totalUnidadesNaArea % t} Un.` : `${totalUnidadesNaArea} Un.`);

                        // Acha a KEY da área no banco de dados para poder navegar
                        const areaObj = areas.find(a => a.nome === loc);
                        let clickComando = "";
                        let styleHover = "";
                        let linkStyle = "";
                        
                        if (areaObj) {
                            // Se achou, prepara a linha para ser um botão
                            clickComando = `onclick="document.getElementById('modalInfoItem').style.display='none'; verArea('${areaObj.key}', '${loc}')"`;
                            styleHover = "cursor: pointer;";
                            linkStyle = "text-decoration: underline; text-decoration-color: var(--primary); text-underline-offset: 4px;";
                        }

                        containerLista.innerHTML += `
                            <div ${clickComando} style="display: flex; justify-content: space-between; padding: 12px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; ${styleHover}">
                                <span style="color: white; font-weight: 600; ${linkStyle}">${loc}</span>
                                <span style="color: var(--primary); font-weight: 800;">${txtQtd}</span>
                            </div>
                        `;
                    }
                });
            }

            if (containerLista.innerHTML === '') {
                containerLista.innerHTML = '<div style="color: #64748b; text-align: center; padding: 10px;">Item zerado em todas as áreas físicas.</div>';
            }

            let txtTotalGeral = frac 
                ? `${formatarQtdNumero(totalGeralUnidades, true)} Un.` 
                : (t > 1 ? `${Math.floor(totalGeralUnidades / t)} Fds | ${totalGeralUnidades % t} Un.` : `${totalGeralUnidades} Un.`);

            document.getElementById('total-info-item').innerText = txtTotalGeral;
            document.getElementById('modalInfoItem').style.display = 'flex';
        }
        // Registra a tela inicial quando o sistema abre
        history.replaceState({ tela: 'inicio' }, "", "#inicio");