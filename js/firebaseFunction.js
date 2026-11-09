        // CONFIGURAÇÕES FIREBASE
        const firebaseConfig = { apiKey: "AIzaSyC3cAzrTMwCUxDcMvl68XxrcGLkmeANtSg", authDomain: "contamais-411llp.firebaseapp.com", databaseURL: "https://contamais-411llp-default-rtdb.firebaseio.com", projectId: "contamais-411llp", storageBucket: "contamais-411llp.firebasestorage.app", messagingSenderId: "691691378209", appId: "1:691691378209:web:6191b84e88ee3281b17560" };
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        const auth = firebase.auth();

        // ==========================================
        // UTILITÁRIOS GERAIS
        // ==========================================

        // Escapa texto digitado pelo usuário antes de colocar no HTML.
        // Sem isso, nomes como "Bar do Zé <3" ou "D'Ávila" quebravam a tela ou os botões.
        function esc(v) {
            return String(v === undefined || v === null ? '' : v)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // Gera um argumento seguro para usar dentro de onclick="funcao(...)".
        // Ex.: onclick="verArea(${jsArg(key)}, ${jsArg(nome)})"
        function jsArg(v) { return esc(JSON.stringify(v === undefined ? null : v)); }

        // Data local (fuso do aparelho) no formato AAAA-MM-DD.
        // toISOString() usa UTC: depois das 21h no Brasil devolvia o dia seguinte.
        function dataLocalISO(d) {
            d = d || new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        // Junta várias atualizações de tela num único redesenho por quadro.
        // Quando chegam vários eventos do Firebase seguidos, a tela é refeita uma vez só.
        const _rendersPendentes = new Map();
        function agendarRender(nome, fn) {
            if (_rendersPendentes.has(nome)) { _rendersPendentes.set(nome, fn); return; }
            _rendersPendentes.set(nome, fn);
            requestAnimationFrame(() => {
                const f = _rendersPendentes.get(nome);
                _rendersPendentes.delete(nome);
                try { f(); } catch (e) { console.error('Erro ao redesenhar ' + nome + ':', e); }
            });
        }

        function telaAtiva(id) {
            const el = document.getElementById(id);
            return !!(el && el.classList.contains('active'));
        }

        // Trava um botão enquanto uma gravação está em andamento (evita gravar duas vezes com toque duplo).
        function travarBotao(btn, textoTemporario) {
            if (!btn) return () => {};
            if (btn.dataset.travado === '1') return null;
            btn.dataset.travado = '1';
            const original = btn.innerHTML;
            btn.disabled = true;
            if (textoTemporario) btn.innerHTML = textoTemporario;
            return () => { btn.disabled = false; btn.dataset.travado = ''; btn.innerHTML = original; };
        }

        // Reduz uma foto antes de salvar no banco.
        // Fotos de celular têm 3–7 MB; gravadas cruas, todo mundo baixava todas a cada login.
        // Agora ficam com ~100–200 KB, sem diferença visível na tela do app.
        function comprimirImagem(arquivoOuDataUrl, maxLado = 1080, qualidade = 0.8) {
            return new Promise((resolve, reject) => {
                const carregar = (src) => {
                    const img = new Image();
                    img.onload = () => {
                        let { width: w, height: h } = img;
                        const escala = Math.min(1, maxLado / Math.max(w, h));
                        w = Math.round(w * escala); h = Math.round(h * escala);
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff'; // JPEG não tem transparência
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', qualidade));
                    };
                    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
                    img.src = src;
                };
                if (typeof arquivoOuDataUrl === 'string') { carregar(arquivoOuDataUrl); return; }
                const reader = new FileReader();
                reader.onload = e => carregar(e.target.result);
                reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
                reader.readAsDataURL(arquivoOuDataUrl);
            });
        }

        // Nomes de área viram chaves no Firebase, que não aceita estes caracteres.
        function nomeAreaInvalido(nome) { return /[.#$\[\]\/]/.test(nome); }

        // ESTADOS GLOBAIS
        const DONO_EMAIL = "pedrosoaresctt@gmail.com";
        let currentUser = null;
        let currentRole = 'visualizador'; 
        let currentUserName = '';
        
        // CAPACIDADE DAS ÁREAS
        const CAPACIDADE_AREAS = { "Varanda": 20, "Salão 1 - Frente": 30, "Salão 1 - Corredor": 30, "Salão 2 - Parede": 40, "Salão 2 - Meio": 40, "Salão 2 - Corrimão": 15, "Salão 2 - Mesas Redondas": 3, "Salão 2 - Bistrôs": 3, "Salão 2 - Brinquedão": 60, "Laje": 60 };

        let areas = [], produtos = {}, categorias = {}, metodosCompra = {}, reservasApp = {}, receitasDB = {};
        let categoriasPorNome = {};       // índice nome -> categoria (evita varrer todas as categorias para cada produto)
        let receitasCarregadas = false;   // true depois que o Firebase respondeu pela 1ª vez
        let pedidoMetodoAtualKey = '';    // método aberto na tela de Pedidos

        function reindexarCategorias() {
            categoriasPorNome = {};
            Object.keys(categorias).forEach(k => {
                const c = categorias[k];
                if (c && c.nome && !categoriasPorNome[c.nome]) categoriasPorNome[c.nome] = c;
            });
        }
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
            if(currentUser) {
                // Pergunta antes de sair (no celular o avatar é fácil de tocar sem querer)
                if (typeof modoContagemAtivo !== 'undefined' && modoContagemAtivo && !confirm('Você está no meio de uma contagem. Sair da conta mesmo assim? Os números digitados serão perdidos.')) return;
                else if (!(typeof modoContagemAtivo !== 'undefined' && modoContagemAtivo) && !confirm('Sair da conta?')) return;
                if (typeof encerrarModoContagem === 'function') encerrarModoContagem();
                auth.signOut();
                return;
            }
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
                const btnAuth = document.getElementById('btn-submit-auth');
                const liberarAuth = travarBotao(btnAuth, 'Entrando...');
                if (liberarAuth === null) return;
                auth.signInWithEmailAndPassword(email, senha)
                    .then(() => { liberarAuth(); fecharModalAuth(); })
                    .catch(e => {
                        liberarAuth();
                        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-login-credentials') alert("🚨 E-mail ou senha incorretos. Se ainda não tem conta, toque em 'Cadastre-se'.");
                        else if (e.code === 'auth/too-many-requests') alert("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
                        else if (e.code === 'auth/network-request-failed') alert("Sem conexão com a internet.");
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
                currentRole = (user.email === DONO_EMAIL) ? 'dono' : 'visualizador';
                currentUserName = user.email ? user.email.split('@')[0] : '';
                aplicarPermissoes();
                iniciarListenersFirebase();

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
                });
            } else {
                currentUser = null;
                currentRole = 'visualizador';
                currentUserName = '';
                aplicarPermissoes();
            }
        });

        function aplicarPermissoes() {
            document.body.classList.remove('role-dono', 'role-contribuidor', 'role-visualizador');
            document.body.classList.add('role-' + currentRole);
            document.body.classList.toggle('logado', !!currentUser);
            const avisoLogin = document.getElementById('aviso-login');
            if (avisoLogin) avisoLogin.style.display = currentUser ? 'none' : '';

            const btnLogin = document.getElementById('btn-login-sidebar');
            const btnRole = document.getElementById('btn-top-role');
            
            if(currentUser) {
                btnLogin.innerHTML = '<i class="ph ph-sign-out"></i><span>Sair da conta</span>';
            } else {
                btnLogin.innerHTML = '<i class="ph ph-user"></i><span>Entrar / Cadastrar</span>';
            }
            
            const nomesCargo = { dono: 'Dono', contribuidor: 'Contribuidor', visualizador: 'Visualizador' };
            const cargoTxt = currentUser ? (nomesCargo[currentRole] || 'Visualizador') : 'Visitante';
            if (currentRole === 'dono') { btnRole.innerHTML = '<i class="ph ph-gear-six"></i>'; btnRole.title = 'Configurações'; }
            else if (currentRole === 'contribuidor') { btnRole.innerHTML = '<i class="ph ph-pencil-simple"></i>'; btnRole.title = 'Você pode editar o estoque e as reservas'; }
            else { btnRole.innerHTML = '<i class="ph ph-eye"></i>'; btnRole.title = 'Somente visualização'; }

            // Avatar e nome na barra superior; cartão no rodapé do menu
            const nomeExib = currentUser ? (currentUserName || (currentUser.email || '').split('@')[0]) : 'Entrar';
            const iniciais = currentUser ? (nomeExib.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?') : '?';
            const elAv = document.getElementById('user-avatar'); if (elAv) elAv.textContent = iniciais;
            const elNome = document.getElementById('user-nome'); if (elNome) elNome.textContent = nomeExib;
            const elCargo = document.getElementById('user-cargo'); if (elCargo) elCargo.textContent = cargoTxt;
            const elChip = document.getElementById('user-chip'); if (elChip) elChip.title = currentUser ? 'Sair da conta' : 'Entrar';
            const elFoot = document.getElementById('side-foot-role'); if (elFoot) elFoot.textContent = currentUser ? `${nomeExib} · ${cargoTxt}` : 'Visitante';
            const elFootSub = document.getElementById('side-foot-sub'); if (elFootSub) elFootSub.textContent = currentUser ? (currentUser.email || '') : 'Faça login para usar o sistema';

            if(currentRole !== 'dono' && document.getElementById('configuracoes').classList.contains('active')) navegar('inicio');
            
            if(document.getElementById('agenda-view').classList.contains('active')) renderizarCalendario();
            if(document.getElementById('agenda-detalhe').classList.contains('active')) renderizarReservasDia();
            if(document.getElementById('mapa-salao').classList.contains('active')) carregarReservasMapa();

            if (document.getElementById('receitas-lista').classList.contains('active')) renderizarReceitas();
            if (telaAtiva('inicio')) if (typeof renderizarInicio === 'function') renderizarInicio();
            if (document.getElementById('detalhe-receita').classList.contains('active') && receitaAtualKey) {
                verDetalhesReceita(receitaAtualKey, true);
            }
            if (typeof atualizarBadges === 'function') atualizarBadges();
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
            lista.innerHTML = '<p style="color:var(--muted); font-size:0.9rem;">Carregando equipe...</p>';

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
                    ? `<span style="font-size:0.75rem; color:var(--muted); font-weight:normal; display:block;">${esc(email)}</span>`
                    : `<span style="font-size:0.75rem; color:var(--muted); font-weight:normal; display:block;">Sem e-mail no cadastro</span>`;
                const nomeExibicao = `${esc(nome)}${emailLinha}`;

                let roleAtual = u.role || 'visualizador';
                if (roleAtual === 'vizualizador') roleAtual = 'visualizador';

                let selectHtml = '';
                if (email === DONO_EMAIL) {
                    selectHtml = `<div style="font-weight:bold; color:var(--primary); font-size:0.85rem; padding-right:5px;">👑 Dono</div>`;
                } else {
                    selectHtml = `<select onchange="atualizarCargoUsuario(${jsArg(uid)}, this.value)" style="width:auto; padding:6px; margin:0; font-weight:bold; border-radius:6px; font-size:0.85rem; border:1px solid var(--line); background:var(--surface-2); color:var(--text-main);">
                        <option value="contribuidor" ${roleAtual==='contribuidor'?'selected':''}>✏️ Contribuidor</option>
                        <option value="visualizador" ${roleAtual==='visualizador'?'selected':''}>👁️ Visualizador</option>
                    </select>`;
                }
                html += `<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); margin-bottom:8px; gap:10px; flex-wrap:wrap;">
                    <div style="font-weight:bold; font-size:0.9rem; color:var(--text-main); line-height:1.2; flex:1; min-width:180px;">${nomeExibicao}</div>
                    ${selectHtml}
                </div>`;
            });

            if (!html) {
                html = `<p style="color:var(--muted); font-size:0.9rem;">Nenhum usuário em <strong>users</strong> ainda. Peça para a equipe criar conta pelo botão Entrar no app.</p>`;
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
        let recebimentoMetodoAtual = '';

        function abrirRecebimentos() {
            navegar('recebimentos-lista');
            const grid = document.getElementById('grid-recebimentos-metodos');
            const chaves = Object.keys(metodosCompra);
            if(chaves.length === 0) { grid.innerHTML = `<p style="color:var(--muted); grid-column:1/-1;">Nenhum método de compra cadastrado.</p>`; return; }
            grid.innerHTML = chaves.map(k => `<div class="card-nav" onclick="iniciarRecebimento(${jsArg(k)})">${obterIconeMetodo(metodosCompra[k].nome, true)}<h3 style="margin-top:5px;">${esc(metodosCompra[k].nome)}</h3></div>`).join('');
        }

        function iniciarRecebimento(keyMetodo) {
            if (!metodosCompra[keyMetodo]) return;
            const met = metodosCompra[keyMetodo].nome;
            recebimentoMetodoAtual = met;
            document.getElementById('titulo-recebimento-metodo').innerText = `Carga: ${met}`;
            recebimentoTemp = {};
            
            let prods = Object.keys(produtos).filter(k => produtos[k].metodoCompra === met);
            prods.sort((a,b) => compararProdutosPorCategoriaEOrdem(a, b));
            
            if(prods.length === 0) {
                document.getElementById('tabela-recebimento-itens').innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--muted);">Fornecedor não tem produtos vinculados.</td></tr>`;
            } else {
                let maxF = 1;
                prods.forEach(pk => {
                    let t = getTamFardoProduto(produtos[pk]);
                    if(t > maxF) maxF = t;
                });
                
                let htmlHead = `<tr><th>Item</th><th style="text-align:center">${maxF>1?'Fds.':' '}</th><th style="text-align:center">Un.</th></tr>`;
                document.getElementById('head-recebimento').innerHTML = htmlHead;
                
                let currentCategoria = '';
                let currentSubgrupo = '';
                const linhasHtml = [];

                prods.forEach(pk => {
                    const p = produtos[pk];
                    const categoria = getCategoriaPrincipalProduto(p);
                    const subgrupo = p.subgrupo ? p.subgrupo : '';
                    if (categoria !== currentCategoria) {
                        linhasHtml.push(`<tr><td colspan="3" style="padding:12px 0 6px 12px; color:var(--text-main); font-weight:bold; border-bottom:1px solid var(--line); text-transform:uppercase;">${esc(categoria)}</td></tr>`);
                        currentCategoria = categoria;
                        currentSubgrupo = '';
                    }
                    if (subgrupo !== currentSubgrupo) {
                        linhasHtml.push(`<tr><td colspan="3" style="padding:10px 0 8px 20px; color:var(--text-main); font-size:0.9rem; font-weight:700;">${esc(subgrupo || 'Sem especificação')}</td></tr>`);
                        currentSubgrupo = subgrupo;
                    }
                    let t = getTamFardoProduto(p);
                    
                    recebimentoTemp[pk] = { f: 0, u: 0, t: t };
                    const fardoInput = t > 1 ? `<div class="qty-box" style="background:var(--surface-2);"><input type="number" class="qty-input" style="background:var(--surface-2);" id="rec-f-${pk}" value="0" onchange="atualizarRecTemp('${pk}')"><div class="qty-ctrls"><button class="qty-btn-up" onclick="mudarRecQtd('${pk}','f',1)">▲</button><button class="qty-btn-down" onclick="mudarRecQtd('${pk}','f',-1)">▼</button></div></div>` : '';
                    const unInput = `<div class="qty-box" style="background:var(--surface-2);"><input type="number" class="qty-input" style="background:var(--surface-2);" id="rec-u-${pk}" value="0" onchange="atualizarRecTemp('${pk}')"><div class="qty-ctrls"><button class="qty-btn-up" onclick="mudarRecQtd('${pk}','u',1)">▲</button><button class="qty-btn-down" onclick="mudarRecQtd('${pk}','u',-1)">▼</button></div></div>`;
                    
                    linhasHtml.push(`<tr><td class="col-item">${esc(p.nome)}</td><td style="text-align:center">${fardoInput}</td><td style="text-align:center">${unInput}</td></tr>`);
                });

                document.getElementById('tabela-recebimento-itens').innerHTML = linhasHtml.join('');
            }
            navegar('recebimento-entrada');
        }

        function mudarRecQtd(pk, tipo, delta) {
            const el = document.getElementById(`rec-${tipo}-${pk}`);
            if (!el) return;
            let v = (parseInt(el.value)||0) + delta; if(v < 0) v = 0;
            el.value = v; atualizarRecTemp(pk);
        }

        function atualizarRecTemp(pk) {
            if (!recebimentoTemp[pk]) return;
            const elF = document.getElementById(`rec-f-${pk}`);
            recebimentoTemp[pk].f = elF ? Math.max(0, parseInt(elF.value)||0) : 0;
            recebimentoTemp[pk].u = Math.max(0, parseInt(document.getElementById(`rec-u-${pk}`).value)||0);
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
            // Relê os campos (o "onchange" só dispara ao sair do campo; se a pessoa digitou e tocou
            // direto em CONFIRMAR, o último valor podia se perder).
            Object.keys(recebimentoTemp).forEach(pk => atualizarRecTemp(pk));

            let updates = {}; let qtdRecebida = 0;
            let itensRecebidosHist = {}; // Para a Linha do Tempo
            const met = recebimentoMetodoAtual;
            
            for(let pk in recebimentoTemp) {
                const r = recebimentoTemp[pk];
                const p = produtos[pk];
                if(!p) continue;
                if(r.f > 0 || r.u > 0) {
                    qtdRecebida++;
                    itensRecebidosHist[pk] = { f: r.f, u: r.u, nome: p.nome };
                    
                    let estAntigo = p.estoque && p.estoque['_Pendente_'] ? p.estoque['_Pendente_'] : {f:0, u:0};
                    let novoF = (Number(estAntigo.f)||0) + r.f; let novoU = (Number(estAntigo.u)||0) + r.u;
                    if(r.t > 1 && novoU >= r.t) { novoF += Math.floor(novoU / r.t); novoU = novoU % r.t; }
                    updates[`produtos/${pk}/estoque/_Pendente_`] = { f: novoF, u: novoU };
                }
            }
            if(qtdRecebida === 0) { alert("Informe pelo menos a quantidade de 1 produto."); return; }

            const btn = document.querySelector('#recebimento-entrada .btn-submit');
            const liberar = travarBotao(btn, 'SALVANDO...');
            if (liberar === null) return;
            const data = new Date();
            // Estoque e histórico gravados juntos: ou salva tudo, ou nada.
            const histKey = db.ref('historico_timeline').push().key;
            updates[`historico_timeline/${histKey}`] = {
                timestamp: data.getTime(), dataFormatada: data.toLocaleDateString('pt-BR'),
                tipo: 'recebimento', fornecedor: met, itens: itensRecebidosHist, usuario: currentUserName || "Equipe"
            };
            db.ref().update(updates).then(() => {
                liberar();
                recebimentoTemp = {};
                showToast("Entrada registrada! Itens no pátio aguardando armazenagem.", "success");
                navegar('produtos-hub');
            }).catch(err => {
                liberar();
                console.error(err);
                showToast("Erro ao salvar a entrada. Verifique a internet e tente de novo.", "error");
            });
        }

        function verificarPendentes() {
            let qtdItens = 0; const blocos = []; const assinaturaPend = [];
            
            for(let pk in produtos) {
                const p = produtos[pk];
                if(!p || !p.estoque || !p.estoque['_Pendente_']) continue;
                const pend = p.estoque['_Pendente_'];
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);
                let totalF = parseQtdValor(pend.f, frac);
                let totalU = parseQtdValor(pend.u, frac);
                if (totalF <= 0 && totalU <= 0) continue;
                qtdItens++;
                assinaturaPend.push(`${pk}:${totalF}:${totalU}:${(p.locais || []).join(',')}`);

                if (!frac && t === 1 && totalF > 0) { totalU += totalF; totalF = 0; }

                const totalUnPend = totalF * t + totalU;
                const txtQtd = frac
                    ? `${formatarQtdNumero(totalUnPend, true)} Un.`
                    : (t > 1 ? `${formatarQtdNumero(totalF, false)} Fds e ${formatarQtdNumero(totalU, false)} Un.` : `${formatarQtdNumero(totalU, false)} Unidade(s)`);

                let optionsArea = (p.locais || []).filter(l => l && l !== '_Pendente_').map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('');
                if(!optionsArea) optionsArea = `<option value="">⚠️ Sem área física assinalada!</option>`;

                const stepP = frac ? '0.01' : '1';
                let inputsQtd = '';
                if (frac || t <= 1) {
                    inputsQtd = `
                    <div style="flex:1;"><label style="font-size:0.7rem; color:var(--muted);">Qtd. (máx. ${formatarQtdNumero(totalUnPend, frac)})</label><input type="number" inputmode="decimal" id="transf-u-${pk}" value="${totalUnPend}" min="0" max="${totalUnPend}" step="${stepP}" style="margin:0; text-align:center; background:var(--surface-strong); color:var(--text-main); font-weight:bold;"></div>`;
                } else {
                    inputsQtd = `
                    <div style="display:flex; gap:8px; flex:1;">
                        <div style="flex:1;"><label style="font-size:0.7rem; color:var(--muted);">Fardos (MÁX: ${totalF})</label><input type="number" inputmode="numeric" id="transf-f-${pk}" value="${totalF}" min="0" max="${totalF}" step="1" style="margin:0; text-align:center; background:var(--surface-strong); color:var(--text-main); font-weight:bold;"></div>
                        <div style="flex:1;"><label style="font-size:0.7rem; color:var(--muted);">Un. (MÁX: ${totalU})</label><input type="number" inputmode="numeric" id="transf-u-${pk}" value="${totalU}" min="0" max="${totalU}" step="1" style="margin:0; text-align:center; background:var(--surface-strong); color:var(--text-main); font-weight:bold;"></div>
                    </div>`;
                }

                blocos.push(`
                <div style="padding:15px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:flex-start;">
                        <strong style="color:var(--text-main); font-size:1.05rem;">${esc(p.nome)}</strong>
                        <span style="color:var(--primary); font-weight:800; font-size:0.85rem; text-align:right;">Disponível:<br>${txtQtd}</span>
                    </div>
                    <div style="display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap;">
                        <div style="flex:1; min-width: 160px;">
                            <label style="font-size:0.7rem; color:var(--muted);">Área de Destino</label>
                            <select id="aloc-area-${pk}" style="margin:0; background:var(--surface-2); color:var(--text-main); font-weight:bold; border-color:var(--line);">${optionsArea}</select>
                        </div>
                        ${inputsQtd}
                        <button class="btn-submit req-contrib" style="margin:0; background:var(--dark); width:auto; padding:10px 15px;" onclick="prepararEfetivacaoAlocacao(${jsArg(pk)})">Transferir</button>
                    </div>
                </div>`);
            }
            
            const banner = document.getElementById('banner-pendentes'); const listaAlocar = document.getElementById('lista-pendentes-alocar');
            if(banner && listaAlocar) {
                if(qtdItens > 0 && currentRole !== 'visualizador') {
                    banner.style.display = 'flex';
                    document.getElementById('txt-qtd-pendentes').innerText = `Contém ${qtdItens} ${qtdItens === 1 ? 'item pendente' : 'itens pendentes'}.`;
                    // Não refaz a lista enquanto a janela está aberta e a pessoa digita (perderia o que foi digitado),
                    // a não ser que as quantidades pendentes tenham mudado.
                    const modalAberto = document.getElementById('modalAlocar').style.display === 'flex';
                    const assinatura = assinaturaPend.join('|');
                    if (!modalAberto || listaAlocar.dataset.assin !== assinatura) listaAlocar.innerHTML = blocos.join('');
                    listaAlocar.dataset.assin = assinatura;
                } else {
                    banner.style.display = 'none';
                    listaAlocar.innerHTML = '<p style="color:var(--muted);">Nenhum item aguardando armazenagem.</p>';
                    listaAlocar.dataset.assin = '';
                }
            }
        }

        function abrirAlocacaoModal() { verificarPendentes(); document.getElementById('modalAlocar').style.display = 'flex'; }

        // Transferência aguardando confirmação no pop-up
        let transferenciaPendente = null;

        function lerPendenteAtual(p) {
            const frac = produtoUsaContagemFracionada(p);
            const t = getTamFardoProduto(p);
            const pend = (p.estoque && p.estoque['_Pendente_']) || { f: 0, u: 0 };
            let f = parseQtdValor(pend.f, frac), u = parseQtdValor(pend.u, frac);
            if (frac || t <= 1) { u = f * t + u; f = 0; }
            return { f, u, t, frac };
        }

        function prepararEfetivacaoAlocacao(pk) {
            const p = produtos[pk];
            if (!p) return;
            const areaSel = document.getElementById(`aloc-area-${pk}`).value;
            if(!areaSel) { alert("Este produto não possui área assinalada para guardar."); return; }

            const elF = document.getElementById(`transf-f-${pk}`);
            const elU = document.getElementById(`transf-u-${pk}`);
            const atual = lerPendenteAtual(p);
            let f = elF ? parseQtdValor(elF.value, atual.frac) : 0;
            let u = elU ? parseQtdValor(elU.value, atual.frac) : 0;

            if(f > atual.f) f = atual.f; if(u > atual.u) u = atual.u;
            
            if(f === 0 && u === 0) { 
                showToast("Digite uma quantidade maior que zero.", "error"); 
                return; 
            }

            let msgArr = [];
            if(f > 0) msgArr.push(`${formatarQtdNumero(f, false)} ${f === 1 ? 'fardo' : 'fardos'}`);
            if(u > 0) msgArr.push(`${formatarQtdNumero(u, atual.frac)} ${u === 1 ? 'unidade' : 'unidades'}`);

            document.getElementById('msgConfirmTransfer').innerHTML = `Você está transferindo <strong style="color:var(--primary);">${msgArr.join(' e ')} de ${esc(p.nome)}</strong> para a área <strong style="color:var(--primary);">${esc(areaSel)}</strong>.<br><br>Confirmar operação?`;
            
            transferenciaPendente = { tipo: 'patio', pk, f, u, t: atual.t, areaSel, fracionada: atual.frac };
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
                lista.innerHTML = '<p style="color:var(--muted);">Nenhum item com estoque nesta área para transferir.</p>';
                return;
            }

            // Preserva o que já foi digitado se a lista for redesenhada por uma atualização do banco
            const digitado = {};
            lista.querySelectorAll('input, select').forEach(el => { if (el.id) digitado[el.id] = el.value; });

            const areaObj = areas.find(a => a.nome === origem) || null;
            prods.sort((a, b) => compararProdutosPorCategoriaEOrdem(a, b, areaObj));

            let currentCategoria = null;
            let currentSubgrupo = null;
            const itensHtml = [];

            // (Bug corrigido: antes usava forEach(...).join(''), que travava a tela com erro e nunca mostrava os itens.)
            prods.forEach(pk => {
                const p = produtos[pk];
                const categoria = getCategoriaPrincipalProduto(p);
                const subgrupo = p.subgrupo ? p.subgrupo : '';
                if (categoria !== currentCategoria) {
                    itensHtml.push(`<div style="padding:12px 0 4px 0; color:var(--text-main); font-weight:bold; border-bottom:1px solid var(--line); text-transform:uppercase;">${esc(categoria)}</div>`);
                    currentCategoria = categoria;
                    currentSubgrupo = null;
                }
                if (subgrupo !== currentSubgrupo) {
                    if (subgrupo) itensHtml.push(`<div style="padding:10px 0 8px 20px; color:var(--text-main); font-size:0.9rem; font-weight:700;">${esc(subgrupo)}</div>`);
                    currentSubgrupo = subgrupo;
                }
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);
                const est = p.estoque[origem];
                let maxF = parseQtdValor(est.f, frac);
                let maxU = parseQtdValor(est.u, frac);
                if (frac || t <= 1) { maxU = maxF * t + maxU; maxF = 0; }
                const totalUn = maxF * t + maxU;
                const txtDisp = t > 1 && !frac
                    ? `${formatarQtdNumero(maxF, false)} Fds e ${formatarQtdNumero(maxU, frac)} Un.`
                    : `${formatarQtdNumero(totalUn, frac)} Un.`;

                const destinos = (p.locais || []).filter(l => l && l !== origem && l !== '_Pendente_');
                if (destinos.length === 0) {
                    itensHtml.push(`<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:10px;">
                        <strong>${esc(p.nome)}</strong><br><span style="color:var(--muted); font-size:0.85rem;">Sem outra área vinculada.</span></div>`);
                    return;
                }

                const opts = destinos.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
                const step = frac ? '0.01' : '1';
                const inputF = t > 1 && !frac ? `
                    <div style="flex:1;"><label style="font-size:0.7rem; color:var(--muted);">Fardos (máx. ${formatarQtdNumero(maxF, false)})</label>
                    <input type="number" inputmode="numeric" id="tr-area-f-${pk}" value="0" min="0" max="${maxF}" step="${step}" style="margin:0; text-align:center;"></div>` : '';
                const inputU = `
                    <div style="flex:1;"><label style="font-size:0.7rem; color:var(--muted);">${t > 1 && !frac ? 'Un.' : 'Qtd.'} (máx. ${formatarQtdNumero(maxU, frac)})</label>
                    <input type="number" inputmode="decimal" id="tr-area-u-${pk}" value="0" min="0" max="${maxU}" step="${step}" style="margin:0; text-align:center;"></div>`;

                itensHtml.push(`<div style="padding:15px; border:1px solid var(--line); border-radius:10px; margin-bottom:10px; background:var(--surface-2);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                        <strong style="color:var(--text-main);">${esc(p.nome)}</strong>
                        <span style="color:var(--primary); font-weight:800; font-size:0.85rem;">Disponível: ${txtDisp}</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                        <div style="flex:1; min-width:140px;">
                            <label style="font-size:0.7rem; color:var(--muted);">Destino</label>
                            <select id="tr-area-dest-${pk}" style="margin:0;">${opts}</select>
                        </div>
                        ${inputF}
                        ${inputU}
                        <button class="btn-submit req-contrib" style="margin:0; width:auto; padding:10px 14px; background:var(--dark);" onclick="prepararTransferenciaArea(${jsArg(pk)})">Transferir</button>
                    </div>
                </div>`);
            });
            lista.innerHTML = itensHtml.join('');
            Object.keys(digitado).forEach(id => { const el = document.getElementById(id); if (el) el.value = digitado[id]; });
        }

        function lerEstoqueArea(p, area) {
            const frac = produtoUsaContagemFracionada(p);
            const t = getTamFardoProduto(p);
            const est = (p.estoque && p.estoque[area]) || { f: 0, u: 0 };
            let f = parseQtdValor(est.f, frac), u = parseQtdValor(est.u, frac);
            if (frac || t <= 1) { u = f * t + u; f = 0; }
            return { f, u, t, frac };
        }

        function prepararTransferenciaArea(pk) {
            const p = produtos[pk];
            if (!p) return;
            const destino = document.getElementById(`tr-area-dest-${pk}`).value;
            if (!destino) { showToast("Selecione o estoque de destino.", "error"); return; }

            const atual = lerEstoqueArea(p, transferenciaOrigemNome);
            const elF = document.getElementById(`tr-area-f-${pk}`);
            let f = elF ? parseQtdValor(elF.value, atual.frac) : 0;
            let u = parseQtdValor(document.getElementById(`tr-area-u-${pk}`).value, atual.frac);

            // Permite tirar unidades "quebrando" fardos, desde que o total caiba no que existe na área
            const totalOrig = atual.f * atual.t + atual.u;
            if (f > atual.f) f = atual.f;
            if (f * atual.t + u > totalOrig) u = Math.max(0, totalOrig - f * atual.t);
            if (f <= 0 && u <= 0) {
                showToast("Informe uma quantidade maior que zero.", "error");
                return;
            }

            let msgArr = [];
            if (atual.t > 1 && !atual.frac && f > 0) msgArr.push(`${formatarQtdNumero(f, false)} ${f === 1 ? 'fardo' : 'fardos'}`);
            if (u > 0) msgArr.push(`${formatarQtdNumero(u, atual.frac)} ${u === 1 ? 'unidade' : 'unidades'}`);

            document.getElementById('msgConfirmTransfer').innerHTML =
                `Transferir <strong style="color:var(--primary);">${msgArr.join(' e ')} de ${esc(p.nome)}</strong><br>
                De <strong>${esc(transferenciaOrigemNome)}</strong> para <strong>${esc(destino)}</strong>?`;

            transferenciaPendente = { tipo: 'area', pk, f, u, t: atual.t, origem: transferenciaOrigemNome, destino, fracionada: atual.frac };
            document.getElementById('modalConfirmTransfer').style.display = 'flex';
        }

        // Disparada ao tocar em "Sim, Transferir"
        document.getElementById('btnConfirmTransferAction').onclick = function() {
            if(!transferenciaPendente) return;
            const tp = transferenciaPendente;
            const p = produtos[tp.pk];
            if (!p) return;
            const liberar = travarBotao(this, 'Salvando...');
            if (liberar === null) return;

            // Usa o estoque ATUAL do banco (não o valor de quando a tela foi desenhada),
            // para não sobrescrever uma mudança feita por outra pessoa nesse meio tempo.
            let updates = {};
            if (tp.tipo === 'area') {
                const estOrig = (p.estoque && p.estoque[tp.origem]) || { f: 0, u: 0 };
                const estDest = (p.estoque && p.estoque[tp.destino]) || { f: 0, u: 0 };
                updates[`produtos/${tp.pk}/estoque/${tp.origem}`] = subtrairEstoqueFU(estOrig.f, estOrig.u, tp.f, tp.u, tp.t, tp.fracionada);
                updates[`produtos/${tp.pk}/estoque/${tp.destino}`] = combinarEstoqueFU(estDest.f, estDest.u, tp.f, tp.u, tp.t, tp.fracionada);
            } else {
                const estAtualArea = (p.estoque && p.estoque[tp.areaSel]) || { f: 0, u: 0 };
                const pend = (p.estoque && p.estoque['_Pendente_']) || { f: 0, u: 0 };
                const novoPend = subtrairEstoqueFU(pend.f, pend.u, tp.f, tp.u, tp.t, tp.fracionada);
                updates[`produtos/${tp.pk}/estoque/${tp.areaSel}`] = combinarEstoqueFU(estAtualArea.f, estAtualArea.u, tp.f, tp.u, tp.t, tp.fracionada);
                updates[`produtos/${tp.pk}/estoque/_Pendente_`] = (novoPend.u <= 0 && novoPend.f <= 0) ? null : novoPend;
            }

            db.ref().update(updates).then(() => {
                liberar();
                document.getElementById('modalConfirmTransfer').style.display = 'none';
                transferenciaPendente = null;
                showToast(tp.tipo === 'area' ? "Transferência entre áreas concluída!" : "Transferência efetuada com sucesso!", "success");
            }).catch(err => {
                liberar();
                console.error(err);
                showToast("Erro ao transferir. Verifique a internet e tente de novo.", "error");
            });
        };
        function navegar(id, btn, doHistorico = false) { 
            // Saindo da área no meio de uma contagem: confirma antes de descartar o que foi digitado.
            // (Antes o modo contagem ficava "preso" e a próxima área já abria com os campos vazios.)
            if (typeof modoContagemAtivo !== 'undefined' && modoContagemAtivo && id !== 'detalhe-area') {
                if (!confirm('Sair sem salvar a contagem? Os números digitados serão perdidos.')) {
                    if (doHistorico) history.pushState({ tela: 'detalhe-area' }, "", "#detalhe-area");
                    return;
                }
                encerrarModoContagem();
            }

            // Remove a aura/brilho de qualquer botão que tenha sido clicado
            if (document.activeElement) document.activeElement.blur();

            const fabOverlay = document.getElementById('fab-overlay');
            const fabOptions = document.getElementById('fabOptions');
            if (fabOverlay && fabOverlay.classList.contains('active')) {
                fabOverlay.classList.remove('active');
            }
            if (fabOptions && fabOptions.classList.contains('active')) {
                fabOptions.classList.remove('active');
            }

            const telaAtual = history.state && history.state.tela;
            if (!doHistorico && telaAtual !== id) { history.pushState({ tela: id }, "", "#" + id); }
            
            const alvo = document.getElementById(id);
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); 
            if(alvo) alvo.classList.add('active');

            // Mantém o menu lateral e a barra inferior sincronizados com a tela aberta
            document.querySelectorAll('.nav-btn[data-telas], .tab-btn[data-telas]').forEach(b => {
                b.classList.toggle('active', b.dataset.telas.split(' ').includes(id));
            });
            if (typeof fecharMenuLateral === 'function') fecharMenuLateral();
            
            window.scrollTo(0, 0); 
            
            // Ao entrar nas Configurações, todos os cards começam retraídos.
            // (Antes um "observador" fechava os cards a cada atualização do banco, inclusive o card
            //  em que a pessoa estava digitando.)
            if (id === 'configuracoes' && !doHistorico) collapseConfigCards();

            if(id === 'mapa-salao') requestAnimationFrame(ajustarEscalaMapa);
            if(id === 'agenda-view') renderizarCalendario();
            if(id === 'timeline-estoque') { garantirListenerTimeline(); renderizarTimeline(); }
            if(id === 'cardapio-digital' && typeof iniciarListenersCardapio === 'function') iniciarListenersCardapio();
            if(id === 'receitas-lista') renderizarReceitas();
            if(id === 'financeiro-dashboard' && doHistorico) abrirDashboard(true);
            if(id === 'inicio') if (typeof renderizarInicio === 'function') renderizarInicio();
            if(id === 'cadastros') if (typeof renderizarCadastros === 'function') renderizarCadastros();
        }

        function irParaAgenda() {
            navegar('agenda-view');
        }

        function toggleFab(event) { 
            if(event) event.stopPropagation();
            const options = document.getElementById('fabOptions');
            const overlay = document.getElementById('fab-overlay');
            
            const abrir = !options.classList.contains('active');
            options.classList.toggle('active', abrir);
            overlay.classList.toggle('active', abrir);
        }

        function collapseConfigCards() {
            document.querySelectorAll('.config-card').forEach(card => {
                card.classList.remove('open');
                const body = card.querySelector('.config-card-body');
                if(body) body.style.display = 'none';
                const header = card.querySelector('.config-card-header');
                if(header) header.setAttribute('aria-expanded', 'false');
            });
        }

        function toggleConfigCard(button) {
            const card = button.closest('.config-card');
            if(!card) return;
            const isOpen = card.classList.toggle('open');
            const body = card.querySelector('.config-card-body');
            if(body) body.style.display = isOpen ? 'block' : 'none';
            button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }

        // Fecha o menu "Novo" ao tocar fora dele (fecha também a camada invisível de fundo)
        document.addEventListener('click', function(event) {
            const fabOptions = document.getElementById('fabOptions');
            if (fabOptions && fabOptions.classList.contains('active') && !event.target.closest('.fab-container')) toggleFab();
        });

        // ==========================================
        // PESQUISA E FILTROS DINÂMICOS
        // ==========================================
        // Busca sem diferenciar maiúsculas nem acentos ("acai" encontra "Açaí").
        function normalizarBusca(t) { return removerAcentos(String(t || '').toLowerCase()).trim(); }

        function filtrarTabela(inputId, tabelaId) {
            const termo = normalizarBusca(document.getElementById(inputId).value);
            const linhas = document.querySelectorAll(`#${tabelaId} tr`);
            linhas.forEach(linha => {
                const item = linha.querySelector('.col-item');
                if (item) {
                    linha.style.display = normalizarBusca(item.textContent).includes(termo) ? '' : 'none';
                } else if (linha.classList.contains('linha-grupo')) {
                    // Títulos de categoria/especificação somem durante a busca
                    linha.style.display = termo ? 'none' : '';
                }
            });
        }

        let produtosVisualizacao = 'list'; // Estado atual da visualização: 'list' ou 'grid'

        function aplicarFiltrosProdutos() {
            const termo = normalizarBusca(document.getElementById('busca-categoria').value);
            const linhas = document.querySelectorAll(`#tabela-produtos-filtrada tr`);
            
            linhas.forEach(linha => {
                const item = linha.querySelector('.col-item');
                if (!item) return;
                
                const txt = normalizarBusca(item.textContent);
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
                                <div style="aspect-ratio:1; display:flex; align-items:center; justify-content:center; font-size:3rem; color:var(--primary); background:var(--surface-2);"><i class="ph ph-package"></i></div>
                            </div>
                            <div class="card-body">
                                <p class="product-title">${esc(nome)}</p>
                                <strong class="product-price">${esc(preco)}</strong>
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
        document.addEventListener('DOMContentLoaded', () => {
            const campoData = document.getElementById('setup-mapa-data');
            if (campoData) campoData.value = dataLocalISO();
            renderizarCalendario();
        });

        let eventosTimeline = [];
        let timelineCarregada = false;
        let timelineSemPermissao = false;

        // Todos os listeners ativos ficam aqui para poderem ser desligados no logout.
        let _listenersAtivos = [];
        function escutar(refOuQuery, nome, onValue, onErro) {
            const cb = refOuQuery.on('value', snap => {
                try { onValue(snap); } catch (e) { console.error('Erro ' + nome + ':', e); }
            }, err => {
                console.error('Permissão ' + nome + ':', err);
                if (onErro) onErro(err);
            });
            const item = { ref: refOuQuery, cb, nome };
            _listenersAtivos.push(item);
            return item;
        }
        function desligar(item) {
            if (!item) return;
            try { item.ref.off('value', item.cb); } catch (e) {}
            _listenersAtivos = _listenersAtivos.filter(x => x !== item);
        }

        // Reservas: antes o app baixava TODAS as reservas desde o primeiro dia (a lista só cresce).
        // Agora baixa a partir de ~2 meses atrás; se você voltar o calendário para antes disso,
        // o período é ampliado automaticamente.
        let reservasDesde = '';
        let _listenerReservas = null;
        function garantirReservasDesde(dataStr) {
            if (!currentUser) return;
            if (_listenerReservas && reservasDesde && dataStr >= reservasDesde) return;
            desligar(_listenerReservas);
            reservasDesde = dataStr;
            _listenerReservas = escutar(db.ref('reservas').orderByKey().startAt(dataStr), 'reservas', s => {
                reservasApp = s.val() || {};
                agendarRender('reservas', () => {
                    if (typeof atualizarBadges === 'function') atualizarBadges();
                    if (telaAtiva('inicio')) if (typeof renderizarInicio === 'function') renderizarInicio();
                    if (telaAtiva('agenda-view')) renderizarCalendario();
                    if (telaAtiva('agenda-detalhe')) renderizarReservasDia();
                    if (telaAtiva('mapa-salao')) carregarReservasMapa();
                });
            });
        }
        function inicioPadraoReservas() {
            const d = new Date();
            d.setMonth(d.getMonth() - 2);
            d.setDate(1);
            return dataLocalISO(d);
        }

        // Mapa do salão: antes baixava os mapas de TODOS os dias já montados.
        // Agora escuta só o dia aberto na tela.
        let _listenerMapa = null;
        let _mapaEscutandoData = '';
        let _mapaCarregadoData = '';   // só libera os toques nas mesas depois que o mapa do dia chegou
        function escutarMapaDoDia(dataStr) {
            if (_listenerMapa && _mapaEscutandoData === dataStr) return;
            desligar(_listenerMapa);
            _mapaEscutandoData = dataStr;
            _mapaCarregadoData = '';
            mapasApp = {};
            _listenerMapa = escutar(db.ref('mapas/' + dataStr), 'mapa', s => {
                mapasApp = { [dataStr]: s.val() || {} };
                _mapaCarregadoData = dataStr;
                agendarRender('mapa', () => {
                    if (telaAtiva('mapa-salao')) { carregarMapa(); carregarReservasMapa(); }
                });
            });
        }

        // Histórico: só é baixado quando o dono abre a tela, e só os 300 registros mais recentes.
        let _listenerTimeline = null;
        function garantirListenerTimeline() {
            if (_listenerTimeline || !currentUser) return;
            timelineSemPermissao = false;
            _listenerTimeline = escutar(db.ref('historico_timeline').limitToLast(300), 'histórico', s => {
                const val = s.val();
                eventosTimeline = val ? Object.keys(val).map(k => ({ id: k, ...val[k] })) : [];
                eventosTimeline.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                timelineCarregada = true;
                agendarRender('timeline', () => { if (telaAtiva('timeline-estoque')) renderizarTimeline(); });
            }, () => {
                timelineCarregada = true;
                timelineSemPermissao = true;
                desligar(_listenerTimeline);
                _listenerTimeline = null; // permite tentar de novo na próxima abertura
                agendarRender('timeline', () => { if (telaAtiva('timeline-estoque')) renderizarTimeline(); });
            });
        }

        function pararListenersFirebase() {
            _listenersAtivos.slice().forEach(desligar);
            _listenerReservas = null; reservasDesde = '';
            _listenerMapa = null; _mapaEscutandoData = ''; _mapaCarregadoData = '';
            _listenerTimeline = null; timelineCarregada = false;
            if (typeof pararListenersCardapio === 'function') pararListenersCardapio();
            if (!listenersFirebaseAtivos) return;
            listenersFirebaseAtivos = false;
            receitasCarregadas = false;
            areas = [];
            produtos = {};
            categorias = {};
            categoriasPorNome = {};
            metodosCompra = {};
            reservasApp = {};
            mapasApp = {};
            receitasDB = {};
            eventosTimeline = [];
            try {
                if (typeof atualizarBadges === 'function') atualizarBadges();
                if (typeof renderizarInicio === 'function') renderizarInicio();
                renderizarAreas();
                renderizarGradeAgrupada();
                renderizarPedidosMetodos();
                renderizarReceitas();
                renderizarCalendario();
            } catch (e) {}
        }

        function atualizarTelasDeProdutos() {
            renderizarGradeAgrupada();
            renderizarAreas();
            verificarPendentes();
            if (telaAtiva('pedidos-lista') && pedidoMetodoAtualKey) verPedidoPorMetodo(pedidoMetodoAtualKey, true);
            if (telaAtiva('financeiro-dashboard')) abrirDashboard(true);
            if (telaAtiva('detalhe-area') && !modoContagemAtivo) {
                const a = areas.find(x => x.key === areaAtualKey);
                if (a) verArea(a.key, a.nome, true);
            }
            if (telaAtiva('transferencia-area')) renderizarTransferenciaArea();
            if (telaAtiva('produtos-lista-filtrada') && grupoAtualLista) verGrupo(grupoAtualLista.key, grupoAtualLista.tipo, true);
            if (typeof atualizarBadges === 'function') atualizarBadges();
            if (telaAtiva('inicio')) if (typeof renderizarInicio === 'function') renderizarInicio();
            if (telaAtiva('detalhe-produto') && produtoDetalheAtual) verDetalhesProduto(produtoDetalheAtual, true);
            if (typeof atualizarPainelCadastros === 'function') atualizarPainelCadastros(); 
        }

        function iniciarListenersFirebase() {
            if (listenersFirebaseAtivos || !currentUser) return;
            listenersFirebaseAtivos = true;

            escutar(db.ref('areas'), 'áreas', s => {
                const val = s.val();
                areas = val ? Object.entries(val).map(([key, v]) => {
                    if (typeof v === 'object' && v !== null) {
                        return { key, nome: v.nome || "Área Recuperada", config: v.config || { usaPadrao: false, padroes: {} } };
                    }
                    return { key, nome: v || "Área Recuperada", config: { usaPadrao: false, padroes: {} } };
                }) : [];
                agendarRender('areas', () => { renderizarAreas(); renderizarChecksConfig(); if (typeof atualizarPainelCadastros === 'function') atualizarPainelCadastros(); if (telaAtiva('inicio')) if (typeof renderizarInicio === 'function') renderizarInicio(); });
            }, () => showToast("Sem permissão para ler áreas.", "error"));

            escutar(db.ref('produtos'), 'produtos', s => {
                produtos = s.val() || {};
                agendarRender('produtos', atualizarTelasDeProdutos);
            }, () => showToast("Sem permissão para ler produtos.", "error"));

            escutar(db.ref('categorias'), 'categorias', s => {
                categorias = s.val() || {};
                reindexarCategorias();
                agendarRender('categorias', () => {
                    renderizarPresets();
                    atualizarTelasDeProdutos();
                    if (telaAtiva('detalhe-categoria-admin')) renderizarOrdenacaoCategoria();
                });
            });

            escutar(db.ref('metodos'), 'métodos', s => {
                metodosCompra = s.val() || {};
                agendarRender('metodos', () => {
                    renderizarMetodosConfig();
                    renderizarPresetsMetodos();
                    renderizarGradeAgrupada();
                    renderizarPedidosMetodos();
                    if (typeof atualizarPainelCadastros === 'function') atualizarPainelCadastros(); 
                });
            });

            garantirReservasDesde(inicioPadraoReservas());

            escutar(db.ref('receitas'), 'receitas', s => {
                receitasDB = s.val() || {};
                receitasCarregadas = true;
                agendarRender('receitas', () => {
                    if (telaAtiva('inicio')) if (typeof renderizarInicio === 'function') renderizarInicio();
                    if (telaAtiva('receitas-lista')) renderizarReceitas();
                    if (telaAtiva('detalhe-receita') && receitaAtualKey) verDetalhesReceita(receitaAtualKey, true);
                });
            });

            // Se o usuário já estava em telas que dependem de listeners sob demanda, reativa.
            if (telaAtiva('timeline-estoque')) garantirListenerTimeline();
            if (telaAtiva('mapa-salao') && mapaAtualData) escutarMapaDoDia(mapaAtualData);
            if (telaAtiva('cardapio-digital') && typeof iniciarListenersCardapio === 'function') iniciarListenersCardapio();
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
            escutarMapaDoDia(dt);
            garantirReservasDesde(dt);
            const [y, m, d] = dt.split('-');
            const turnoStr = tn === 'dia' ? 'Dia (Almoço)' : 'Tarde/Noite';
            document.getElementById('mapa-header-info').innerText = `${d}/${m}/${y} - ${turnoStr}`;
            
            areaFocadaMapa = null;
            mesasSelecionadasMapa = [];
            document.getElementById('btn-voltar-mapa').style.display = 'none';
            document.getElementById('painel-controles-mapa').style.display = 'none';
            
            navegar('mapa-salao');
            carregarReservasMapa();
        }

        function carregarReservasMapa() {
            const box = document.getElementById('lista-reservas-turno-mapa');
            if (!box) return;
            const lista = reservasApp[mapaAtualData] || {};
            const layout = (mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno]) ? mapasApp[mapaAtualData][mapaAtualTurno] : {};
            // Nomes já montados no mapa (calculado uma vez, não para cada reserva)
            const montadas = new Set(Object.keys(layout).filter(m => layout[m] && layout[m].status === 'reservada').map(m => layout[m].nome));
            let resHtml = '';
            Object.keys(lista).forEach(k => {
                const r = lista[k];
                if (!r || r.periodo !== mapaAtualTurno) return;
                if (!montadas.has(r.nome)) {
                    resHtml += `
                    <div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--row-even); display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
                        <div><strong style="font-size:0.95rem; color:var(--text-main);">${esc(r.nome)}</strong><br><span style="font-size:0.75rem; color:var(--muted);">📍 ${esc(r.area)} | 👥 ${esc(r.lugares)} lug.</span></div>
                        <button class="btn-submit req-contrib" style="width:auto; margin:0; padding:8px 15px; font-size:0.8rem; background:var(--primary); border-radius:6px;" onclick="montarReservaNoMapa(${jsArg(k)})">Montar</button>
                    </div>`;
                } else {
                    resHtml += `
                    <div style="padding:10px; border:1px solid var(--line-strong); border-radius:8px; background:var(--surface-2); display:flex; justify-content:space-between; align-items:center; opacity:0.8; margin-bottom: 5px;">
                        <div><strong style="font-size:0.95rem; color:var(--ink);">${esc(r.nome)}</strong><br><span style="font-size:0.75rem; color:var(--ink);">✅ Já montada no salão</span></div>
                    </div>`;
                }
            });
            box.innerHTML = resHtml || '<p style="font-size:0.85rem; color:var(--muted); text-align:center; margin-top:10px;">Nenhuma reserva pendente para este turno.</p>';
        }

        function montarReservaNoMapa(resKey) {
            const r = (reservasApp[mapaAtualData] || {})[resKey];
            if (!r) return;
            const areaOriginal = r.area || '';
            let macroNome = "";
            if(areaOriginal.includes("Parede")) macroNome = "Parede";
            else if(areaOriginal.includes("Meio")) macroNome = "Meio";
            else if(areaOriginal.includes("Brinquedão")) macroNome = "Brinquedão";
            else if(areaOriginal.includes("Corrimão")) macroNome = "Corrimão";
            else if(areaOriginal.includes("Redondas")) macroNome = "Mesas Redondas";
            else if(areaOriginal.includes("Bistrôs")) macroNome = "Bistrôs";

            if(!macroNome) { alert("Esta reserva pertence a uma área fora do Salão 2."); return; }
            document.getElementById('mapa-reserva-nome').value = r.nome;
            focarArea(macroNome);
        }

        function toggleModoLayoutMapa() {
            modoMontagemMapa = !modoMontagemMapa; mesasSelecionadasMapa = [];
            const btn = document.getElementById('btn-edit-layout');
            btn.innerHTML = modoMontagemMapa ? "💾 Sair Montagem" : "✏️ Modo Montagem";
            btn.style.background = modoMontagemMapa ? "#5a3a28" : "var(--bg-sidebar)";
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

        window.addEventListener('resize', () => { if (telaAtiva('mapa-salao')) agendarRender('escala-mapa', ajustarEscalaMapa); });

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
                        let textoMesa = estado === 'reservada' ? esc(String(nomeRes || '').substring(0,3)) : i; let classeFormato = (conf.tipo === 'redonda' || conf.tipo === 'bistro') ? 'mesa-redonda' : 'mesa-quadrada';
                        htmlMesas += `<div id="mesa-${mesaId}" class="${classeFormato} ${cssStatus}" onclick="cliqueMesa('${mesaId}')">${textoMesa}</div>`;
                    }

                    if(qtB > 0) { htmlMesas += '<div class="cadeiras-row">'; for(let c=0; c<qtB; c++) htmlMesas += '<div class="cadeira"></div>'; htmlMesas += '</div>'; }
                    html += `<div class="planta-fileira" style="top: ${conf.top}; left: ${conf.left}; ${conf.tipo==='redonda'||conf.tipo==='bistro' ? 'flex-direction:column; gap:10px;' : ''}">${lbl}${htmlCadeirasL}<div class="mesas-col">${htmlMesas}</div>${htmlCadeirasR}</div>`;
                }
            }
            const plantaBox = document.getElementById('mapa-container'); if (plantaBox) plantaBox.innerHTML = html;
        }

        // Evita gravar no mapa antes de ele carregar (as mesas pareceriam todas livres)
        function mapaPronto() {
            if (_mapaCarregadoData === mapaAtualData) return true;
            showToast("Carregando o mapa... tente de novo em instantes.", "error");
            return false;
        }

        function cliqueMesa(mesaId) {
            if(currentRole === 'visualizador' || !mapaPronto()) return;
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
            if(currentRole === 'visualizador' || !mapaPronto()) return; let sub = obterSubAreaAtual(); if(!sub) return;
            let layoutDia = mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno] ? mapasApp[mapaAtualData][mapaAtualTurno] : {};
            let conf = configMapa[sub];
            for(let i = 1; i <= conf.max; i++) {
                let st = layoutDia[`${sub}_${i}`] ? layoutDia[`${sub}_${i}`].status : 'ativa';
                if(st === 'ghost') { db.ref(`mapas/${mapaAtualData}/${mapaAtualTurno}/${sub}_${i}`).set({status: 'ativa'}); return; }
            }
            alert("A fileira já está na capacidade máxima física!");
        }

        function subtrairMesaFileira() {
            if(currentRole === 'visualizador' || !mapaPronto()) return; let sub = obterSubAreaAtual(); if(!sub) return;
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
            if(currentRole === 'visualizador' || mesasSelecionadasMapa.length === 0 || !mapaPronto()) return;
            let updates = {}; mesasSelecionadasMapa.forEach(id => updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${id}`] = { status: 'ghost' });
            db.ref().update(updates).then(() => { mesasSelecionadasMapa = []; atualizarPainelDinamicoMapa(); });
        }

        function salvarReservaMapa() {
            if(mesasSelecionadasMapa.length === 0 || !mapaPronto()) return; let nome = document.getElementById('mapa-reserva-nome').value.trim();
            if(!nome) { alert("Digite o nome para salvar a reserva!"); return; }
            let updates = {}; mesasSelecionadasMapa.forEach(id => updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${id}`] = { status: 'reservada', nome: nome });
            let porArea = {}; mesasSelecionadasMapa.forEach(id => { let partes = id.split('_'); let subArea = partes[0]; let idx = parseInt(partes[1]); if(!porArea[subArea]) porArea[subArea] = []; porArea[subArea].push(idx); });

            // Corte Espacial de Segurança
            for(let subArea in porArea) {
                if(configMapa[subArea].tipo === 'redonda' || configMapa[subArea].tipo === 'bistro') continue; 
                let indices = porArea[subArea]; let min = Math.min(...indices); let max = Math.max(...indices);
                // Só "corta" a mesa vizinha se ela estiver livre — antes apagava a mesa de OUTRA reserva encostada.
                const layoutAtual = (mapasApp[mapaAtualData] && mapasApp[mapaAtualData][mapaAtualTurno]) || {};
                [min - 1, max + 1].forEach(i => {
                    if (i < 1 || i > configMapa[subArea].max) return;
                    const idViz = `${subArea}_${i}`;
                    if (mesasSelecionadasMapa.includes(idViz)) return;
                    const stViz = layoutAtual[idViz] ? layoutAtual[idViz].status : 'ativa';
                    if (stViz === 'ativa') updates[`mapas/${mapaAtualData}/${mapaAtualTurno}/${idViz}`] = { status: 'ghost' };
                });
            }
            db.ref().update(updates).then(() => { mesasSelecionadasMapa = []; document.getElementById('mapa-reserva-nome').value = ""; atualizarPainelDinamicoMapa(); });
        }

        // ==========================================
        // AGENDA DETALHADA E CALENDÁRIO
        // ==========================================
        function mudarMes(dir) { 
            navDate.setDate(1); // evita pular mês (ex.: 31/jan + 1 mês = 3/mar)
            navDate.setMonth(navDate.getMonth() + dir); 
            garantirReservasDesde(dataLocalISO(new Date(navDate.getFullYear(), navDate.getMonth(), 1)));
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
                const ehHoje = dateStr === dataLocalISO();
                
                html += `<div class="${classes}" onclick="abrirDia('${dateStr}', ${dw})"${ehHoje ? ' style="outline:2px solid var(--primary); outline-offset:-2px; font-weight:900;"' : ''}>${i}</div>`;
            }
            elGrid.innerHTML = html;
        }

        function abrirDia(dateStr, dw) {
            if(dw === 1) return; // Segunda-feira fechado
            
 
            dataAtualReserva = dateStr; 
            garantirReservasDesde(dateStr);
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
            
            // Ordena: almoço primeiro, depois por horário
            const chaves = Object.keys(lista).filter(k => lista[k]).sort((a, b) => {
                const ra = lista[a], rb = lista[b];
                if (ra.periodo !== rb.periodo) return ra.periodo === 'dia' ? -1 : 1;
                return String(ra.horario || '').localeCompare(String(rb.horario || ''));
            });
            const html = chaves.map(k => {
                const r = lista[k]; const hor = r.periodo === 'dia' ? '12:00 - 18:00' : `${r.horario || '—'} ${endStr}`;
                const btnExcluir = (currentRole === 'dono' || currentRole === 'contribuidor') ? `<span style="color:red; font-size:0.8rem; cursor:pointer; font-weight:bold;" onclick="excluirReserva(${jsArg(k)})">Excluir</span>` : '';
                return `<div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; background:var(--row-even); margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:1.05rem; color:var(--text-main);">${esc(r.nome)}</strong>${btnExcluir}</div>
                    <div style="font-size:0.85rem; color:var(--muted); margin-top:6px; display:flex; flex-direction:column; gap:3px;"><span>📍 ${esc(r.area)} <strong>(${esc(r.lugares)} lug.)</strong></span><span>⏰ ${esc(hor)}</span></div></div>`;
            }).join('') || `<p style="font-size:0.85rem; color:var(--muted); text-align:center; margin-top:20px;">Nenhuma reserva para este dia.</p>`;
            
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
            
 
            if(!nome || lug <= 0) { alert("Preencha o nome e a quantidade de lugares."); return; } 
            if(per !== 'dia' && !/^\d{1,2}:\d{2}$/.test(String(hor).trim())) { alert("Informe o horário da reserva (ex.: 19:30)."); return; }
            
            // TRAVA DE SEGURANÇA (OVERBOOKING)
            const restante = calcularCapacidadeRestante();
            if (lug > restante) {
                const isUnidade = area.includes('Redondas') || area.includes('Bistrôs');
                alert(`Capacidade excedida! Restam apenas ${restante} ${isUnidade ? 'unidades' : 'lugares'} para esta área.`);
                return;
            }

            const btn = document.querySelector('#agenda-detalhe .req-contrib .btn-submit');
            const liberar = travarBotao(btn, 'SALVANDO...');
            if (liberar === null) return;
            db.ref(`reservas/${dataAtualReserva}`).push({ nome, periodo: per, horario: String(hor).trim(), area, lugares: lug })
                .then(() => {
                    liberar();
                    document.getElementById('res-nome').value = ""; document.getElementById('res-lugares').value = "";
                    showToast("Reserva cadastrada!", "success");
                })
                .catch(err => { liberar(); console.error(err); showToast("Erro ao salvar a reserva.", "error"); });
        }

        function excluirReserva(k) { 
            if((currentRole === 'dono' || currentRole === 'contribuidor') && confirm("Excluir esta reserva?")) {
 
                db.ref(`reservas/${dataAtualReserva}/${k}`).remove().catch(() => showToast("Erro ao excluir a reserva.", "error")); 
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
    return categoriasPorNome[nome];
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
        container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted);">Marque produtos acima para organizar as categorias.</p>`;
        return;
    }

    container.innerHTML = areaCatOrderTemp.map((cat, idx) => `
        <div style="display:flex; align-items:center; background:var(--surface-2); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
            <div class="sort-wrapper">
                <button class="sort-btn-up" onclick="moverCategoriaAreaEdit(${jsArg(cat)}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                <button class="sort-btn-down" onclick="moverCategoriaAreaEdit(${jsArg(cat)}, 1)" ${idx === areaCatOrderTemp.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>
            <strong style="font-size:0.95rem; color:var(--text-main);">${esc(cat)}</strong>
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
            grid.innerHTML = `<p style="grid-column:1/-1; color:var(--muted); font-size:0.95rem; padding:12px;">${currentUser ? 'Nenhuma área cadastrada ainda.' : 'Faça login para ver as áreas.'}</p>`;
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

                    const t = getTamFardoProduto(p);
                    const frac = produtoUsaContagemFracionada(p);
                    const v = p.estoque?.[a.nome] || {f:0, u:0};

                    const fAtual = parseQtdValor(v.f, frac);
                    const uAtual = parseQtdValor(v.u, frac);

                    // Compara tudo em unidades para evitar erro com fardos + unidades soltas
                    const qtdAtualEmUnidades = (fAtual * t) + uAtual;
                    const metaEmUnidades = (t > 1 && !frac) ? meta * t : meta;

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

            return `<div class="card-nav" onclick="verArea(${jsArg(a.key)}, ${jsArg(a.nome)})">
                ${semaforoHTML}<i>${obterEmoji(a.nome)}</i><h3>${esc(a.nome || 'Área')}</h3>
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

                if(chavesFonte.length === 0) g.innerHTML = `<p style="grid-column: 1 / -1; color:var(--muted); font-size: 0.9rem;">Nenhum grupo cadastrado.</p>`;
                else g.innerHTML = chavesFonte.map(k => `<div class="card-nav" onclick="verGrupo(${jsArg(k)}, '${isC?'categoria':'metodo'}')">${isC ? `<i>${obterEmoji(dbFonte[k]?.nome)}</i>` : obterIconeMetodo(dbFonte[k]?.nome, true)}<h3>${esc(dbFonte[k]?.nome)}</h3></div>`).join(''); 
                
                const prodsSemGrupo = Object.keys(produtos).filter(k => isC ? getCategoriasProduto(produtos[k]).length === 0 : !produtos[k].metodoCompra);
                if(prodsSemGrupo.length === 0) ts.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--muted);">Todos os produtos estão agrupados.</td></tr>`;
                else ts.innerHTML = prodsSemGrupo.map(k => { const p = produtos[k]; const t = getTamFardoProduto(p); const tot = getUnidadesTotaisEstoque(p); return `<tr><td><div style="display:flex; align-items:center;"><button class="action-icon edit-btn req-dono" onclick="abrirEdicaoProduto(${jsArg(k)})">✎</button><button class="action-icon info-btn" onclick="verDetalhesProduto(${jsArg(k)})">ⓘ</button><span class="col-item">${esc(p.nome||'')}</span></div></td><td style="text-align:right">${renderizarTotalLinhaDupla(tot,t,p)}</td></tr>`; }).join('');
            } catch(e) {}
        }

        let grupoAtualLista = null; // { key, tipo } da lista de produtos aberta

        function verGrupo(key, tipo, semNavegar = false) { 
            try {
                const n = tipo === 'categoria' ? categorias[key]?.nome : metodosCompra[key]?.nome; 
                if (!n) { if (semNavegar) navegar('produtos-categorias'); return; }
                grupoAtualLista = { key, tipo };
                if (!semNavegar) {
                    document.getElementById('busca-categoria').value = '';
                    activeSubgroupFilter = "Todos";
                    navegar('produtos-lista-filtrada'); 
                }
                document.getElementById('titulo-categoria-filtrada').innerText = n; 
                
                let prodsFiltrados = Object.keys(produtos).filter(k => produtos[k] && (tipo === 'categoria' ? getCategoriasProduto(produtos[k]).includes(n) : produtos[k].metodoCompra === n));
                if (tipo === 'categoria') prodsFiltrados.sort((a, b) => compararProdutosDentroDaCategoria(a, b, n));
                else prodsFiltrados.sort((a, b) => compararProdutosPorCategoriaEOrdem(a, b));

                // ABAS DE SUBGRUPOS (ESPECIFICAÇÕES)
                const filtroWrapper = document.getElementById('filtro-subgrupos-wrapper');
                const subs = (tipo === 'categoria' && categorias[key] && Array.isArray(categorias[key].subgrupos)) ? categorias[key].subgrupos : [];
                if (subs.length > 0) {
                    if (activeSubgroupFilter !== 'Todos' && !subs.includes(activeSubgroupFilter)) activeSubgroupFilter = 'Todos';
                    filtroWrapper.style.display = 'flex';
                    let htmlTabs = `<div class="sub-tab ${activeSubgroupFilter === 'Todos' ? 'active' : ''}" onclick="setSubgroupFilter('Todos', this)">Todos</div>`;
                    subs.forEach(sub => {
                        htmlTabs += `<div class="sub-tab ${activeSubgroupFilter === sub ? 'active' : ''}" onclick="setSubgroupFilter(${jsArg(sub)}, this)">${esc(sub)}</div>`;
                    });
                    filtroWrapper.innerHTML = htmlTabs;
                } else {
                    filtroWrapper.style.display = 'none';
                    activeSubgroupFilter = "Todos";
                }

                const tabela = document.getElementById('tabela-produtos-filtrada');
                if(prodsFiltrados.length === 0) { tabela.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--muted);">Nenhum produto neste grupo.</td></tr>`; renderizarProdutosEmCards(); return; }
                
                tabela.innerHTML = prodsFiltrados.map(k => { 
                    const p = produtos[k]; 
                    const t = getTamFardoProduto(p);
                    const tot = getUnidadesTotaisEstoque(p);
                    const selo = p.itemProduzido
                        ? `<span style="background:var(--dark); color:white; font-size:0.65rem; padding:2px 6px; border-radius:999px; margin-left:6px; font-weight:800;">PRODUZIDO</span>`
                        : '';
                    return `<tr data-subgrupo="${esc(p.subgrupo || '')}"><td><div style="display:flex; align-items:center;"><button class="action-icon edit-btn req-dono" onclick="abrirEdicaoProduto(${jsArg(k)})">✎</button><button class="action-icon info-btn" onclick="verDetalhesProduto(${jsArg(k)})">ⓘ</button><span class="col-item">${esc(p.nome||'')}</span>${selo}</div></td><td style="text-align:right">${renderizarTotalLinhaDupla(tot,t,p)}</td></tr>`; 
                }).join(''); 
                
                aplicarFiltrosProdutos(); 
            } catch(e){ console.error('Erro ao abrir grupo:', e); }
        }

        // Tela de uma área: monta todo o HTML numa string e grava UMA vez.
        // (Antes fazia "innerHTML +=" para cada produto: com 100 itens o navegador
        //  redesenhava a tabela 100 vezes — principal causa da demora ao abrir uma área.)
        function verArea(key, nome, semNavegar = false) { 
            // No meio de uma contagem: não redesenha a mesma área (apagaria o que foi digitado)
            // e pede confirmação antes de ir para outra.
            if (!semNavegar && typeof modoContagemAtivo !== 'undefined' && modoContagemAtivo) {
                if (key === areaAtualKey) return;
                if (!confirm('Sair sem salvar a contagem? Os números digitados serão perdidos.')) return;
                encerrarModoContagem();
            }
            try {
                const areaObj = areas.find(a => a.key === key);
                if (!areaObj) { if (!semNavegar) showToast("Área não encontrada.", "error"); return; }
                nome = areaObj.nome;
                areaAtualKey = key; 
                if (!semNavegar) {
                    document.getElementById('busca-area').value = '';
                    document.getElementById('area-edit-box').style.display = 'none'; 
                    navegar('detalhe-area'); 
                }
                document.getElementById('area-display-name').innerText = nome || 'Área'; 

                const usaPadrao = !!(areaObj.config && areaObj.config.usaPadrao);
                const totalCols = modoContagemAtivo ? 3 : (usaPadrao ? 5 : 4);

                document.getElementById('head-area-itens').innerHTML = `<tr>
                    <th>Item</th>
                    ${modoContagemAtivo ? '' : (usaPadrao ? '<th style="text-align:center; color:var(--ink);">Pad.</th>' : '')}
                    <th style="text-align:center">${modoContagemAtivo ? 'Contar Fds' : 'Estoque Fds'}</th>
                    <th style="text-align:center">${modoContagemAtivo ? 'Contar Un.' : 'Estoque Un.'}</th>
                    ${modoContagemAtivo ? '' : '<th style="text-align:right;">Total</th>'}
                </tr>`;

                const lista = document.getElementById('tabela-area-itens');

                const prodsArea = Object.keys(produtos).filter(pk => {
                    const p = produtos[pk];
                    if (!p) return false;
                    const vinculado = Array.isArray(p.locais) && p.locais.includes(nome);
                    const temEstoqueSalvo = p.estoque && p.estoque[nome] !== undefined;
                    return vinculado || temEstoqueSalvo;
                });

                if (prodsArea.length === 0) {
                    lista.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:20px; color:var(--muted);">Nenhum item vinculado a esta área. Clique no ícone de lápis (✎) acima para adicionar.</td></tr>`;
                    return;
                }

                const grupos = {};
                prodsArea.forEach(pk => {
                    const catNome = getCategoriaPrincipalProduto(produtos[pk]);
                    (grupos[catNome] = grupos[catNome] || []).push(pk);
                });

                const nomesCategorias = ordenarCategoriasParaArea(Object.keys(grupos), areaObj);
                const html = [];

                nomesCategorias.forEach(catNome => {
                    html.push(`<tr class="linha-grupo"><td colspan="${totalCols}" style="background:var(--group-bg); color:var(--text-main); font-weight:900; text-transform:uppercase; letter-spacing:1px; font-size:0.78rem; padding:10px;">${esc(catNome)}</td></tr>`);

                    grupos[catNome].sort((a, b) => compararProdutosDentroDaCategoria(a, b, catNome));

                    const subgruposDaCategoria = {};
                    grupos[catNome].forEach(pk => {
                        const sub = produtos[pk].subgrupo || '_sem_subgrupo_';
                        (subgruposDaCategoria[sub] = subgruposDaCategoria[sub] || []).push(pk);
                    });

                    const catObjSub = getCategoriaObjPorNome(catNome);
                    const ordemSalvaSubgrupos = catObjSub && Array.isArray(catObjSub.subgrupos) ? catObjSub.subgrupos : [];
                    const ordemSubgrupos = Object.keys(subgruposDaCategoria).sort((a, b) => {
                        if (a === '_sem_subgrupo_') return 1;
                        if (b === '_sem_subgrupo_') return -1;
                        const idxA = ordemSalvaSubgrupos.indexOf(a), idxB = ordemSalvaSubgrupos.indexOf(b);
                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                        if (idxA !== -1) return -1;
                        if (idxB !== -1) return 1;
                        return a.localeCompare(b);
                    });

                    ordemSubgrupos.forEach(subKey => {
                        if (subKey !== '_sem_subgrupo_') {
                            html.push(`<tr class="linha-grupo"><td colspan="${totalCols}" style="background:var(--surface-2); color:var(--ink); font-weight:900; text-transform:uppercase; letter-spacing:1px; font-size:0.72rem; padding:8px 10px 8px 22px;">${esc(subKey)}</td></tr>`);
                        }

                        subgruposDaCategoria[subKey].forEach(pk => {
                            const p = produtos[pk];
                            const est = (p.estoque && p.estoque[nome]) ? p.estoque[nome] : { f: 0, u: 0 };
                            const frac = produtoUsaContagemFracionada(p);
                            const t = getTamFardoProduto(p);
                            let qtdF = parseQtdValor(est.f, frac);
                            let qtdU = parseQtdValor(est.u, frac);
                            const totalUnidades = Math.round(((qtdF * t) + qtdU) * 1000) / 1000;
                            const usaFardoNaArea = t > 1 && !frac;
                            if (usaFardoNaArea) { qtdF = Math.floor(totalUnidades / t); qtdU = Math.round((totalUnidades % t) * 1000) / 1000; }
                            const stepCont = frac ? '0.01' : '1';

                            let padraoTxt = '-';
                            if (usaPadrao && areaObj.config.padroes && areaObj.config.padroes[pk] !== undefined) {
                                padraoTxt = `<span style="color:var(--ink); font-weight:900; font-size: 0.95rem;">${esc(areaObj.config.padroes[pk])} ${usaFardoNaArea ? 'Fds.' : 'Un.'}</span>`;
                            } else if (usaPadrao) {
                                padraoTxt = `<span style="color:var(--muted);">-</span>`;
                            }

                            const incU = frac ? 0.1 : 1;
                            const viewFardo = modoContagemAtivo 
                                ? (usaFardoNaArea ? `<div class="qty-box" style="border: 1px solid var(--primary); background:var(--surface-strong); width: 75px;">
                                     <input type="number" inputmode="numeric" class="qty-input" id="cont-f-${pk}" value="" step="1" min="0" >
                                     <div class="qty-ctrls" style="border-left: 1px solid var(--primary);">
                                         <button class="qty-btn-up" onclick="passoContagem('cont-f-${pk}', 1, 1)">▲</button>
                                         <button class="qty-btn-down" onclick="passoContagem('cont-f-${pk}', -1, 1)">▼</button>
                                     </div>
                                   </div>` : `<span style="color:var(--muted);">-</span>`)
                                : `<span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${usaFardoNaArea ? formatarQtdNumero(qtdF, false) : '-'}</span>`;

                            const viewUnidade = modoContagemAtivo 
                                ? `<div class="qty-box" style="border: 1px solid var(--primary); background:var(--surface-strong); width: 75px;">
                                     <input type="number" inputmode="decimal" class="qty-input" id="cont-u-${pk}" value="" step="${stepCont}" min="0" >
                                     <div class="qty-ctrls" style="border-left: 1px solid var(--primary);">
                                         <button class="qty-btn-up" onclick="passoContagem('cont-u-${pk}', 1, ${incU})">▲</button>
                                         <button class="qty-btn-down" onclick="passoContagem('cont-u-${pk}', -1, ${incU})">▼</button>
                                     </div>
                                   </div>`
                                : `<span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${usaFardoNaArea ? formatarQtdNumero(qtdU, false) : formatarQtdNumero(totalUnidades, frac)}</span>`;

                            const txtTopTotal = frac
                                ? `${formatarQtdNumero(totalUnidades, true)} Un.`
                                : (t > 1 ? `${Math.floor(totalUnidades / t)} Fds | ${formatarQtdNumero(totalUnidades % t, false)} Un.` : `${Math.floor(totalUnidades)} Un.`);
                            const viewTotal = modoContagemAtivo 
                                ? ''
                                : `<td style="text-align:right; border-left: 1px solid var(--line);">
                                     <div style="display:flex; flex-direction:column; line-height:1.2;">
                                       <span style="font-weight:900; color:var(--primary); font-size:1.05rem;">${txtTopTotal}</span>
                                       ${usaFardoNaArea ? `<span style="font-size:0.75rem; color:var(--muted); font-weight:700;">${formatarQtdNumero(totalUnidades, false)} Un. Totais</span>` : ''}
                                     </div>
                                   </td>`;

                            html.push(`<tr>
                                <td style="font-size: 0.95rem; font-weight:700;"><div style="display:flex; align-items:center; gap:8px;"><button class="action-icon info-btn" style="margin:0; width:24px; height:24px; font-size:0.8rem;" onclick="abrirInfoItem(${jsArg(pk)})">ⓘ</button> <span class="col-item">${esc(p.nome)}</span></div></td>
                                ${modoContagemAtivo ? '' : (usaPadrao ? `<td style="text-align:center; border-right: 1px solid var(--line);">${padraoTxt}</td>` : '')}
                                <td style="text-align:center">${viewFardo}</td>
                                <td style="text-align:center">${viewUnidade}</td>
                                ${viewTotal}
                            </tr>`);
                        });
                    });
                });

                lista.innerHTML = html.join('');
                // Mantém a busca aplicada quando a tela é atualizada sozinha
                if (document.getElementById('busca-area').value) filtrarTabela('busca-area', 'tabela-area-itens');

            } catch (e) {
                console.error("Erro ao abrir área:", e);
                showToast("Erro ao carregar detalhes da área.", "error");
            }
        }

        // Botões ▲/▼ do modo contagem
        function passoContagem(id, dir, inc) {
            const el = document.getElementById(id);
            if (!el) return;
            const atual = Number(String(el.value).replace(',', '.')) || 0;
            el.value = Math.max(0, Math.round((atual + dir * inc) * 1000) / 1000);
        }

        let produtoDetalheAtual = '';

        function verDetalhesProduto(key, semNavegar = false) { 
            try {
                const p = produtos[key]; if(!p) return;
                produtoDetalheAtual = key;
                if (!semNavegar) navegar('detalhe-produto');
                document.getElementById('span-titulo-prod').innerText = p.nome || 'Produto'; 
                const t = getTamFardoProduto(p); const pC = getCategoriasProduto(p); 
                const fracP = produtoUsaContagemFracionada(p);
                let tG = 0;
                const locaisHtml = (p.locais||[]).map(loc => {
                    const a = areas.find(x => x.nome === loc);
                    const v = p.estoque?.[loc] || {f:0,u:0};
                    const q = parseQtdValor(v.f, fracP)*t + parseQtdValor(v.u, fracP);
                    tG += q;
                    const btn = a ? `<button class="action-icon info-btn" onclick="verArea(${jsArg(a.key)}, ${jsArg(loc)})">ⓘ</button>` : '';
                    return `<tr><td><div style="display:flex; align-items:center; gap:8px;">${btn}<span>${esc(loc)}</span></div></td><td style="text-align:right">${renderizarTotalLinhaDupla(q,t,p)}</td></tr>`;
                }).join(''); 
                document.getElementById('tabela-locais-produto').innerHTML = locaisHtml || `<tr><td colspan="2" style="text-align:center; color:var(--muted);">Não alocado em nenhuma área.</td></tr>`; 
                
                const boxFardosGeral = fracP
                    ? `<div><strong style="color:var(--primary);">Total em unidades:</strong> <span style="color:var(--muted);">${formatarQtdNumero(tG, true)} Un. (geral)</span></div>`
                    : (t > 1 ? `<div><strong style="color:var(--primary);">Fardos Fechados:</strong> <span style="color:var(--muted);">${Math.floor(tG/t)} Fardos (Geral)</span></div>` : '');

                const precoBase = getPrecoPorUnidadeBase(p);
                const custoParado = Math.round(getUnidadesTotaisEstoque(p) * precoBase * 100) / 100;
                const htmlCustoGeral = podeVerCustos()
                    ? `<p class="req-custo" style="font-size:0.9rem; margin-bottom:5px;"><strong>Preço por unidade/garrafa:</strong> ${formatarReais(precoBase)}</p>
                       <p class="req-custo" style="font-size:0.9rem; margin-bottom:5px;"><strong>Custo parado (estoque total):</strong> ${formatarReais(custoParado)}</p>`
                    : '';

                let htmlInfoDestilado = '';
                if (p.detalhesDestilado && Number(p.detalhesDestilado.ml) > 0) {
                    const ml = Number(p.detalhesDestilado.ml);
                    if (podeVerCustos()) {
                        const precoLt = (Number(p.detalhesDestilado.precoGarrafa) / ml) * 1000;
                        htmlInfoDestilado = `<div class="req-custo"><hr style="opacity:0.2; margin: 10px 0;">
                        <p style="font-size:0.9rem; margin-bottom:5px; color:var(--ink); font-weight:bold;">🍹 Cálculos de Destilado</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Volume:</strong> ${ml} ml</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Preço Garrafa:</strong> ${formatarReais(p.detalhesDestilado.precoGarrafa)}</p>
                        <p style="font-size:0.85rem; margin-bottom:3px;"><strong>Preço por Litro (1L):</strong> ${formatarReais(precoLt)}</p></div>`;
                    } else {
                        htmlInfoDestilado = `<p style="font-size:0.85rem; margin-bottom:3px;"><strong>Volume da garrafa:</strong> ${ml} ml</p>`;
                    }
                }

                const hrAposCusto = (htmlCustoGeral || htmlInfoDestilado) ? '<hr class="req-custo" style="opacity:0.2; margin: 5px 0;">' : '';

                document.getElementById('info-extra-prod').innerHTML = `
                    <div style="padding:12px; background:var(--row-even); border-radius:8px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                        ${htmlCustoGeral}
                        ${htmlInfoDestilado}
                        ${hrAposCusto}
                        <div><strong style="color:var(--primary);">Categorias:</strong> <span style="color:var(--muted);">${pC.length>0?esc(pC.join(', ')):'Nenhuma'}</span></div>
                        <div><strong style="color:var(--primary);">Método:</strong> <span style="color:var(--muted);">${esc(p.metodoCompra||"Não atribuído")}</span></div>
                        <div><strong style="color:var(--primary);">Especificação (Subgrupo):</strong> <span style="color:var(--muted);">${esc(p.subgrupo||"Nenhum")}</span></div>
                        <div><strong style="color:var(--primary);">Estoque Mín.:</strong> <span style="color:var(--muted);">${esc(p.estoqueMinimo||0)} ${t>1 && !fracP?'Fardos':'Unidades'}</span></div>
                        ${boxFardosGeral}
                    </div>`; 
            } catch(e) { console.error('Erro ao abrir produto:', e); }
        }

        function formatarReais(v) {
            return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        // ==========================================
        // MÉTODOS DE COMPRA E CONFIGURAÇÕES ADMIN
        // ==========================================
        // Logos de fornecedores: se o arquivo não existir no site, mostra o ícone padrão no lugar
        // (antes aparecia o símbolo de imagem quebrada).
        function obterIconeMetodo(nome, isCard = false) { 
            if (!nome) return isCard ? `<i>📦</i>` : `📦`;
            const limpo = removerAcentos(nome.toLowerCase().trim()); let img = null; 
            if(limpo.includes("rr") || limpo.includes("polpa")) img = "rrpolpas.svg"; else if(limpo.includes("heineken")) img = "heinekendistri.svg"; else if(limpo.includes("coca")) img = "cocacoladistri.svg"; else if(limpo.includes("atento")) img = "atento.svg"; 
            const icone = obterEmoji(nome);
            if (img) {
                const fallback = esc(isCard ? `<i style="font-size: 3rem;">${icone}</i>` : icone);
                const onerr = `this.outerHTML=this.dataset.fb`;
                if (isCard) return `<img src="${img}" alt="${esc(nome)}" data-fb="${fallback}" onerror="${onerr}" style="width:100px; height:100px; object-fit:contain; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">`;
                return `<img src="${img}" alt="${esc(nome)}" data-fb="${fallback}" onerror="${onerr}" style="width:28px; height:28px; object-fit:contain; margin-right:6px; vertical-align:middle; display:inline-block; border-radius:3px;">`;
            } 
            return isCard ? `<i style="font-size: 3rem;">${icone}</i>` : icone; 
        }

        function renderizarMetodosConfig() { 
            const el = document.getElementById('lista-metodos-config'); if (!el) return;
            el.innerHTML = Object.keys(metodosCompra).map(k => `<div class="preset-config-item" style="padding:15px 10px; border-bottom:1px solid var(--line); margin-bottom:12px;"><div style="display:flex; align-items:center;"><button class="action-icon edit-btn" onclick="editarMetodo(${jsArg(k)})">✎</button><button class="action-icon add-btn" onclick="abrirAtribuirMetodo(${jsArg(k)})">➕</button><strong style="font-size:1.1rem; margin-left:12px;">${esc(metodosCompra[k].nome)}</strong><span style="margin-left:auto; color:red; cursor:pointer; font-weight:bold; font-size:0.85rem;" onclick="prepararExclusaoMet(${jsArg(k)})">Excluir</span></div></div>`).join('') || '<p style="font-size:0.85rem; color:var(--muted);">Nenhum método cadastrado.</p>';
        }

        function renderizarPedidosMetodos() { 
            const grid = document.getElementById('grid-pedidos-metodos'); if(!grid) return; const chaves = Object.keys(metodosCompra);
            if(chaves.length === 0) { grid.innerHTML = `<p style="grid-column: 1 / -1; color:var(--muted);">Nenhum método cadastrado.</p>`; return; }
            chaves.sort((a, b) => (metodosCompra[a].nome || '').localeCompare(metodosCompra[b].nome || ''));
            grid.innerHTML = chaves.map(k => `<div class="card-nav" onclick="verPedidoPorMetodo(${jsArg(k)})">${obterIconeMetodo(metodosCompra[k].nome, true)}<h3 style="margin-top:5px;">${esc(metodosCompra[k].nome)}</h3></div>`).join(''); 
        }

        function verPedidoPorMetodo(key, semNavegar = false) { 
            try {
                if (!metodosCompra[key]) { if (semNavegar) navegar('pedidos-metodos'); return; }
                pedidoMetodoAtualKey = key;
                if (!semNavegar) navegar('pedidos-lista');
                const met = metodosCompra[key].nome; document.getElementById('titulo-pedido-metodo').innerText = `Pedidos: ${met}`; 
                const prodsFiltrados = Object.keys(produtos).filter(k => produtos[k] && produtos[k].metodoCompra === met).sort((a, b) => compararProdutosPorCategoriaEOrdem(a, b));
                if(prodsFiltrados.length === 0) { document.getElementById('tabela-pedidos-filtrada').innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted);">Nenhum produto usa este método.</td></tr>`; return; }

                let currentCategoria = null;
                let currentSubgrupo = '';
                const htmlRows = [];

                prodsFiltrados.forEach(k => {
                    const p = produtos[k];
                    const cat = getCategoriaPrincipalProduto(p);
                    const sub = p.subgrupo ? p.subgrupo : '';
                    const catObj = getCategoriaObjPorNome(cat);

                    if (cat !== currentCategoria) {
                        htmlRows.push(`<tr><td colspan="4" style="padding:12px 0 6px 12px; color:var(--ink-2); font-weight:bold; border-bottom:1px solid var(--line); text-transform:uppercase;">${esc(cat)}</td></tr>`);
                        currentCategoria = cat;
                        currentSubgrupo = '';
                    }

                    if (sub !== currentSubgrupo && (sub || (catObj && Array.isArray(catObj.subgrupos) && catObj.subgrupos.length > 0) || currentSubgrupo !== '')) {
                        htmlRows.push(`<tr><td colspan="4" style="padding:8px 0 8px 20px; color:var(--text-main); font-size:0.9rem; font-weight:700; text-transform:none;">${esc(sub || 'Sem especificação')}</td></tr>`);
                        currentSubgrupo = sub;
                    }

                    const frac = produtoUsaContagemFracionada(p);
                    const t = getTamFardoProduto(p);
                    const emFardos = t > 1 && !frac;
                    // Estoque em todas as áreas + o que está no pátio aguardando armazenagem
                    const pend = (p.estoque && p.estoque['_Pendente_']) || { f: 0, u: 0 };
                    const totalUn = getUnidadesTotaisEstoque(p) + parseQtdValor(pend.f, frac) * t + parseQtdValor(pend.u, frac);
                    const fAt = emFardos ? totalUn / t : totalUn;
                    const m = Number(p.estoqueMinimo||0);
                    const sg = Math.ceil(Math.max(0, Math.round((m - fAt) * 1000) / 1000));
                    const lb = emFardos ? 'Fds.' : 'Un.';
                    const atualTxt = Number.isInteger(fAt) ? fAt : fAt.toFixed(1).replace('.', ',');
                    htmlRows.push(`<tr><td class="col-item">${esc(p.nome)}</td><td style="text-align:center;">${atualTxt} <br><small style="color:var(--muted)">${lb}</small></td><td style="text-align:center;">${m} <br><small style="color:var(--muted)">${lb}</small></td><td style="text-align:center; font-weight:800; font-size:1.1rem; color:${sg>0?'var(--danger)':'#10b981'}">${sg} <br><small style="font-weight:normal; font-size:0.75rem">${lb}</small></td></tr>`);
                });

                document.getElementById('tabela-pedidos-filtrada').innerHTML = htmlRows.join(''); 
            } catch(e) { console.error('Erro nos pedidos:', e); }
        }

        function salvarMetodo() {
            if (currentRole !== 'dono') { showToast("Apenas o dono pode gerenciar métodos.", "error"); return; }
            const id = document.getElementById('edit-met-id').value;
            const n = document.getElementById('met-nome').value.trim();
            if (!n) { alert("Digite o nome do método."); return; }
            const repetido = Object.keys(metodosCompra).some(k => k !== id && (metodosCompra[k].nome || '').trim().toLowerCase() === n.toLowerCase());
            if (repetido) { alert("Já existe um método com esse nome."); return; }
            if (id && metodosCompra[id]) {
                const old = metodosCompra[id].nome;
                // Renomeia o método e os produtos ligados a ele numa gravação só
                const updates = { [`metodos/${id}/nome`]: n };
                if (old !== n) Object.keys(produtos).forEach(pk => {
                    if (produtos[pk] && produtos[pk].metodoCompra === old) updates[`produtos/${pk}/metodoCompra`] = n;
                });
                db.ref().update(updates).then(() => showToast("Método atualizado!", "success")).catch(() => showToast("Erro ao salvar o método.", "error"));
            } else {
                db.ref('metodos').push({ nome: n }).then(() => showToast("Método criado!", "success")).catch(() => showToast("Erro ao salvar o método.", "error"));
            }
            resetarFormMetodo();
        }
        function editarMetodo(k) { if(!metodosCompra[k]) return; document.getElementById('edit-met-id').value=k; document.getElementById('met-nome').value=metodosCompra[k].nome; document.getElementById('btn-salvar-met').innerText="Atualizar"; }
        function resetarFormMetodo() { document.getElementById('edit-met-id').value=""; document.getElementById('met-nome').value=""; document.getElementById('btn-salvar-met').innerText="Salvar"; }
        function renderizarPresetsMetodos() {
            const vN=document.getElementById('prod-metodo-selecionado').value, vE=document.getElementById('edit-prod-metodo-selecionado').value;
            const add = ctx => currentRole === 'dono' ? `<button type="button" class="chip chip-add" onclick="cadastroRapido('metodo','${ctx}')"><i class="ph ph-plus"></i> Novo método</button>` : '';
            const ordem = Object.keys(metodosCompra).sort((a, b) => String(metodosCompra[a].nome || '').localeCompare(String(metodosCompra[b].nome || ''), 'pt-BR'));
            document.getElementById('metodos-container').innerHTML=ordem.map(k=>`<div class="chip ${vN===metodosCompra[k].nome?'active-chip':''}" onclick="selecionarMetodo(${jsArg(k)},'novo')">${obterIconeMetodo(metodosCompra[k].nome)} ${esc(metodosCompra[k].nome)}</div>`).join('') + add('novo');
            document.getElementById('edit-metodos-container').innerHTML=ordem.map(k=>`<div class="chip ${vE===metodosCompra[k].nome?'active-chip':''}" onclick="selecionarMetodo(${jsArg(k)},'edit')">${obterIconeMetodo(metodosCompra[k].nome)} ${esc(metodosCompra[k].nome)}</div>`).join('') + add('edit');
        }
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

        function removeCatSubIdx(idx) { 
            currentCatSubgrupos.splice(idx, 1); 
            renderCatSubs(); 
        }

        function renderCatSubs() {
    const box = document.getElementById('list-cat-subs');

    if (currentCatSubgrupos.length === 0) {
        box.innerHTML = `<p style="font-size:0.8rem; color:var(--muted);">Nenhuma especificação adicionada.</p>`;
        return;
    }

    box.innerHTML = currentCatSubgrupos.map((s, idx) => `
        <div style="display:flex; align-items:center; background:var(--surface-2); padding:8px; border-radius:8px; border:1px solid var(--border-color); width:100%;">
            <div class="sort-wrapper" style="height:38px; margin-right:10px;">
                <button class="sort-btn-up" onclick="moverCatSub(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                <button class="sort-btn-down" onclick="moverCatSub(${idx}, 1)" ${idx === currentCatSubgrupos.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>

 
            <strong style="color:var(--text-main); font-size:0.9rem; flex:1;">${esc(s)}</strong>

            <button onclick="removeCatSubIdx(${idx})" style="background:#ef4444; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:900;">×</button>
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
            const n=document.getElementById('cat-nome').value.trim();
            const u=document.getElementById('cat-uso-fardo').checked;
            const t=u?Math.max(1, parseInt(document.getElementById('cat-qtd-fardo').value) || 0):1;
            const sel=Array.from(document.querySelectorAll('#cat-checks-areas input:checked')).map(i=>i.value);
            const hasSub=document.getElementById('cat-has-sub').checked;
            
            if(!n || !sel.length) { alert("Preencha o nome e selecione pelo menos uma área."); return; }
            if(u && t < 2) { alert("Informe quantas unidades vêm em cada fardo (2 ou mais)."); return; }
            const repetida = Object.keys(categorias).some(k => k !== id && (categorias[k].nome || '').trim().toLowerCase() === n.toLowerCase());
            if (repetida) { alert("Já existe uma categoria com esse nome."); return; }

            const d = {
                nome: n,
                areas: sel,
                unidadesFardo: t,
                subgrupos: hasSub ? [...currentCatSubgrupos] : [],
                contagemFracionada: document.getElementById('cat-contagem-fracionada').checked
            }; 
            if(id && categorias[id]) { 
                const old=categorias[id].nome; 
                // Categoria e produtos renomeados numa gravação só
                const updates = {};
                Object.keys(d).forEach(campo => updates[`categorias/${id}/${campo}`] = d[campo]);
                if(old!==n) {
                    Object.keys(produtos).forEach(pk=>{
                        if(!produtos[pk]) return;
                        const pc=getCategoriasProduto(produtos[pk]);
                        if(pc.includes(old)) { updates[`produtos/${pk}/categorias`] = pc.map(c=>c===old?n:c); updates[`produtos/${pk}/categoria`] = null; }
                    });
                }
                db.ref().update(updates).then(() => showToast("Categoria atualizada!", "success")).catch(() => showToast("Erro ao salvar a categoria.", "error"));
            } else {
                db.ref('categorias').push(d).then(() => showToast("Categoria criada!", "success")).catch(() => showToast("Erro ao salvar a categoria.", "error"));
            }
            resetarFormCategoria(); 
        }
        
        function renderizarPresets() { 
            const chipNovaCat = ctx => currentRole === 'dono' ? `<button type="button" class="chip chip-add" onclick="cadastroRapido('categoria','${ctx}')"><i class="ph ph-plus"></i> Nova categoria</button>` : '';
            const ordemCats = Object.keys(categorias).sort((a, b) => String(categorias[a].nome || '').localeCompare(String(categorias[b].nome || ''), 'pt-BR'));
            document.getElementById('presets-container').innerHTML=ordemCats.map(k=>`<div class="chip ${catsNovo.includes(categorias[k].nome)?'active-chip':''}" onclick="togglePreset(${jsArg(k)},'novo')">${obterEmoji(categorias[k].nome)} ${esc(categorias[k].nome)}</div>`).join('') + chipNovaCat('novo'); 
            document.getElementById('edit-presets-container').innerHTML=ordemCats.map(k=>`<div class="chip ${catsEdit.includes(categorias[k].nome)?'active-chip':''}" onclick="togglePreset(${jsArg(k)},'edit')">${obterEmoji(categorias[k].nome)} ${esc(categorias[k].nome)}</div>`).join('') + chipNovaCat('edit'); 
            
            document.getElementById('lista-categorias-config').innerHTML=Object.keys(categorias).map(k=>{ 
                const c=categorias[k]; 
                const hasSubs = c.subgrupos && c.subgrupos.length > 0;
                return `<div class="preset-config-item" style="padding:12px; border:1px solid var(--line); border-radius:8px; margin-bottom:8px;"><div style="display:flex; align-items:center;"><button class="action-icon edit-btn" onclick="editarCategoria(${jsArg(k)})">✎</button><button class="action-icon add-btn" onclick="abrirAtribuirCategoria(${jsArg(k)})">➕</button><button class="action-icon info-btn" onclick="abrirConfigCategoria(${jsArg(k)})">ⓘ</button><strong style="font-size:1.05rem; margin-left:5px;">${obterEmoji(c.nome)} ${esc(c.nome)}</strong><span style="margin-left:auto; color:red; cursor:pointer;" onclick="prepararExclusaoCat(${jsArg(k)})">Excluir</span></div><div style="margin-top:8px; font-size:0.85rem; color:var(--muted);">Áreas: ${esc((c.areas||[]).join(', '))} <br> Fardo: ${c.unidadesFardo>1?esc(c.unidadesFardo)+' un.':'Não'}<br>Contagem fracionada: ${c.contagemFracionada?'Sim':'Não'}<br>Especificações: ${hasSubs?esc(c.subgrupos.join(', ')):'Nenhuma'}</div></div>`; 
            }).join(''); 
        }

        function abrirConfigCategoria(k) {
            categoriaFocadaOrdenacao = k;
            const c = categorias[k];
            document.getElementById('titulo-config-cat').innerText = `⚙️ ${c.nome}`;
            
            if (!c) return;
            let htmlInfo = `<p><strong>Unidades por Fardo:</strong> ${esc(c.unidadesFardo)}</p><p><strong>Contagem fracionada:</strong> ${c.contagemFracionada ? 'Sim' : 'Não'}</p><p><strong>Áreas Armazenadas:</strong> ${esc((c.areas||[]).join(', ') || 'Nenhuma')}</p>`;
            
            if (c.subgrupos && c.subgrupos.length > 0) {
                htmlInfo += `<p style="margin-top:10px; margin-bottom: 5px;"><strong>Especificações (Subgrupos):</strong></p>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button class="chip active-chip" data-sub="Todos" onclick="filtrarOrdenacaoSubgrupo('Todos')">Todos</button>
                    ${c.subgrupos.map(sub => `<button class="chip" data-sub="${esc(sub)}" onclick="filtrarOrdenacaoSubgrupo(${jsArg(sub)})" style="display:inline-flex; align-items:center; gap:5px;">${esc(sub)} <span style="background:var(--primary); color:white; border-radius:50%; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; font-size:0.7rem; font-style:italic;">i</span></button>`).join('')}
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
                return `<div style="display:flex; align-items:center; background:var(--surface-2); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                    <div class="sort-wrapper">
                        <button class="sort-btn-up" onclick="moverProdutoOrdem(${jsArg(k)}, ${jsArg(pk)}, -1)" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                        <button class="sort-btn-down" onclick="moverProdutoOrdem(${jsArg(k)}, ${jsArg(pk)}, 1)" ${index === visibleProds.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
                    </div>
                    <div>
                        <strong style="font-size:0.95rem; color:var(--text-main);">${esc(p.nome)}</strong>
                        ${p.subgrupo ? `<br><span style="font-size:0.75rem; color:var(--primary);">${esc(p.subgrupo)}</span>` : ''}
                    </div>
                </div>`;
            }).join('') || '<p style="font-size:0.85rem; color:var(--muted);">Nenhum produto listado.</p>';
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
        function abrirAtribuirCategoria(k) { const c=categorias[k]; document.getElementById('atribuir-cat-id').value=k; document.getElementById('titulo-atribuir-cat').innerText=`Atribuir: ${c.nome}`; document.getElementById('lista-produtos-atribuir').innerHTML=Object.keys(produtos).filter(pk=>produtos[pk]&&produtos[pk].nome).sort((a,b)=>{const hA=getCategoriasProduto(produtos[a]).includes(c.nome)?1:0; const hB=getCategoriasProduto(produtos[b]).includes(c.nome)?1:0; return hA!==hB?hB-hA:produtos[a].nome.localeCompare(produtos[b].nome);}).map(pk=>{ const p=produtos[pk], has=getCategoriasProduto(p).includes(c.nome), out=getCategoriasProduto(p).filter(x=>x!==c.nome).length; return `<label class="check-item" style="padding:15px 10px; border:1px solid ${has?'var(--primary)':'var(--border-color)'}; border-radius:10px; background:${has?'rgba(183, 41, 41, 0.15)':'rgba(0,0,0,0.4)'}; display:flex; align-items:center; cursor:pointer;"><input type="checkbox" value="${pk}" ${has?'checked':''} style="width:22px; height:22px; margin-right:12px;"><strong style="font-size:1.05rem;">${esc(p.nome)}</strong><span style="font-size:0.65rem; background:${out>0||has?'#f1e4d2':'#fee2e2'}; color:${out>0||has?'#6e5246':'#b91c1c'}; padding:4px 8px; border-radius:12px; margin-left:auto;">${out>0?`+${out} cat`:(has?'OK':'Vazio')}</span></label>`; }).join(''); navegar('atribuir-categoria'); }
        function salvarAtribuicaoCategoria() { const n=categorias[document.getElementById('atribuir-cat-id').value].nome, u={}; document.querySelectorAll('#lista-produtos-atribuir input:checked, #lista-produtos-atribuir input:not(:checked)').forEach(cb=>{ const p=produtos[cb.value]; if(!p)return; let pc=getCategoriasProduto(p), ch=false; if(cb.checked&&!pc.includes(n)){pc.push(n);ch=true;}else if(!cb.checked&&pc.includes(n)){pc=pc.filter(x=>x!==n);ch=true;} if(ch){u[`produtos/${cb.value}/categorias`]=pc.length?pc:null;u[`produtos/${cb.value}/categoria`]=null;} }); if(Object.keys(u).length) db.ref().update(u).then(()=>navegar('configuracoes')); else navegar('configuracoes'); }
        function abrirAtribuirMetodo(k) { const m=metodosCompra[k]; document.getElementById('atribuir-met-id').value=k; document.getElementById('titulo-atribuir-met').innerText=`Atribuir: ${m.nome}`; document.getElementById('lista-produtos-atribuir-met').innerHTML=Object.keys(produtos).filter(pk=>produtos[pk]&&produtos[pk].nome).sort((a,b)=>{const hA=produtos[a].metodoCompra===m.nome?1:0; const hB=produtos[b].metodoCompra===m.nome?1:0; return hA!==hB?hB-hA:produtos[a].nome.localeCompare(produtos[b].nome);}).map(pk=>{ const p=produtos[pk], has=p.metodoCompra===m.nome, out=p.metodoCompra&&p.metodoCompra!==m.nome; return `<label class="check-item" style="padding:15px 10px; border:1px solid ${has?'var(--primary)':'var(--border-color)'}; border-radius:10px; background:${has?'rgba(183, 41, 41, 0.15)':'rgba(0,0,0,0.4)'}; display:flex; align-items:center; cursor:pointer;"><input type="checkbox" value="${pk}" ${has?'checked':''} style="width:22px; height:22px; margin-right:12px;"><strong style="font-size:1.05rem;">${esc(p.nome)}</strong><span style="font-size:0.65rem; background:${out?'#f1e4d2':(has?'#f1e4d2':'#fee2e2')}; color:${out?'#6e5246':(has?'#6e5246':'#b91c1c')}; padding:4px 8px; border-radius:12px; margin-left:auto;">${out?esc(p.metodoCompra):(has?'OK':'Sem método')}</span></label>`; }).join(''); navegar('atribuir-metodo'); }
        function salvarAtribuicaoMetodo() { const n=metodosCompra[document.getElementById('atribuir-met-id').value].nome, u={}; document.querySelectorAll('#lista-produtos-atribuir-met input').forEach(cb=>{ const p=produtos[cb.value]; if(!p)return; let nm=p.metodoCompra, ch=false; if(cb.checked&&nm!==n){nm=n;ch=true;}else if(!cb.checked&&nm===n){nm=null;ch=true;} if(ch)u[`produtos/${cb.value}/metodoCompra`]=nm; }); if(Object.keys(u).length)db.ref().update(u).then(()=>navegar('configuracoes')); else navegar('configuracoes'); }
        
        function selecionarSubgrupoProduto(s, ctx) {
            if(ctx === 'novo') prodSubNovo = s;
            else prodSubEdit = s;
            renderSubgrupos(ctx);
        }

        function renderSubgrupos(ctx) {
            const catName = ctx === 'novo' ? catsNovo[0] : catsEdit[0];
            const cObj = getCategoriaObjPorNome(catName);
            const wrapId = ctx === 'novo' ? 'wrap-subgrupo-novo' : 'wrap-subgrupo-edit';
            const contId = ctx === 'novo' ? 'prod-subgrupo-container' : 'edit-prod-subgrupo-container';
            const currentSub = ctx === 'novo' ? prodSubNovo : prodSubEdit;

            if(cObj && cObj.subgrupos && cObj.subgrupos.length > 0) {
                document.getElementById(wrapId).style.display = 'block';
                document.getElementById(contId).innerHTML = cObj.subgrupos.map(s => 
                    `<div class="chip ${currentSub === s ? 'active-chip' : ''}" onclick="selecionarSubgrupoProduto(${jsArg(s)}, '${ctx}')">${esc(s)}</div>`
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
            
            // Novo produto: as áreas seguem a categoria escolhida.
            // Edição: só acrescenta as áreas da categoria (antes apagava as áreas do produto).
            if (ctx === 'novo') document.querySelectorAll('#'+t+' input').forEach(cb=>cb.checked=false); 
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
            
            currentCatSubgrupos = Array.isArray(c.subgrupos) ? [...c.subgrupos] : [];
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
        function renderizarChecksConfig() {
            // Preserva o que estava marcado (antes, qualquer mudança nas áreas desmarcava tudo no meio da edição)
            const box = document.getElementById('cat-checks-areas'); if (!box) return;
            const marcados = new Set(Array.from(box.querySelectorAll('input:checked')).map(i => i.value));
            box.innerHTML = areas.map(a=>`<label class="check-item"><input type="checkbox" value="${esc(a.nome)}" ${marcados.has(a.nome)?'checked':''}> <span>${esc(a.nome)}</span></label>`).join('');
        }
        function atualizarLabelEstoqueMinimo(ctx, selectedCats) { let maxFardo=1; selectedCats.forEach(cn=>{ const c = getCategoriaObjPorNome(cn); if(c && c.unidadesFardo>maxFardo) maxFardo=Number(c.unidadesFardo); }); document.getElementById(ctx==='novo'?'lbl-estoque-minimo-novo':'lbl-estoque-minimo-edit').innerText=maxFardo>1?"(Fardos)":"(Un.)"; }
        
        // ==========================================
        // CADASTRO ÁREAS E PRODUTOS (ABRIR/SALVAR/EXCLUIR)
        // ==========================================
        function abrirCadastro(id) { navegar(id); }
        function abrirCadastroProduto() { 
            const checksHTML = areas.length ? areas.map(a=>`<label class="check-item"><input type="checkbox" value="${esc(a.nome)}"> <span>${esc(a.nome)}</span></label>`).join('') : '<span style="color:var(--muted); font-size:0.85rem;">Nenhuma área cadastrada. Cadastre uma área primeiro.</span>';
            document.getElementById('checks-areas').innerHTML=checksHTML; 
            document.getElementById('prod-nome').value=""; 
            document.getElementById('prod-preco-custo').value="";
            document.getElementById('prod-metodo-selecionado').value=""; 
            document.getElementById('prod-estoque-minimo').value="0"; 
            document.getElementById('prod-ml-garrafa').value="";
            document.getElementById('prod-preco-garrafa').value="";
            // Limpa a composição de "item produzido" (antes o próximo produto herdava a do anterior)
            const chkProd = document.getElementById('check-item-produzido'); if (chkProd) chkProd.checked = false;
            const boxComp = document.getElementById('box-composicao'); if (boxComp) boxComp.style.display = 'none';
            const listaComp = document.getElementById('lista-composicao'); if (listaComp) listaComp.innerHTML = '';
            const rend = document.getElementById('prod-rendimento-final'); if (rend) rend.value = '';
            const custoComp = document.getElementById('custo-composicao'); if (custoComp) custoComp.innerText = 'R$ 0,00';
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

        async function salvarArea() {
            if (currentRole !== 'dono') { showToast("Apenas o dono pode criar áreas.", "error"); return; }
            const nomes = nomesDasLinhas(document.getElementById('area-nome').value);
            try {
                const ok = await criarAreas(nomes);
                if (!ok) return;
                document.getElementById('area-nome').value = "";
                navegar('areas-lista');
            } catch (e) { console.error(e); showToast("Erro ao criar a área.", "error"); }
        }

        function salvarProduto(continuar = false) {
            if (currentRole !== 'dono') { showToast("Apenas o dono pode cadastrar produtos.", "error"); return; }
            const n = document.getElementById('prod-nome').value.trim();
            const pCusto = lerPreco(document.getElementById('prod-preco-custo').value);
            const met = document.getElementById('prod-metodo-selecionado').value;
            const min = Number(document.getElementById('prod-estoque-minimo').value) || 0;

            if (!n) { alert("Digite o nome do produto."); return; }
            if (!met) { alert("Selecione um Método."); return; }

            const s = Array.from(document.querySelectorAll('#checks-areas input:checked')).map(i => i.value);
            if (s.length === 0) { alert("Assinale pelo menos uma área onde o produto fica."); return; }

            const existe = Object.values(produtos).some(p => p && (p.nome || '').trim().toLowerCase() === n.toLowerCase());
            if (existe && !confirm(`Já existe um produto chamado "${n}". Cadastrar mesmo assim?`)) return;

            const e = {};
            s.forEach(x => e[x] = { f: 0, u: 0 });

            let detDestilado = null;
            if (catsNovo.some(c => c.toLowerCase().includes('destilado'))) {
                detDestilado = {
                    ml: Number(document.getElementById('prod-ml-garrafa').value) || 0,
                    precoGarrafa: lerPreco(document.getElementById('prod-preco-garrafa').value)
                };
            }

            const isProduzido = !!(document.getElementById('check-item-produzido') && document.getElementById('check-item-produzido').checked && document.getElementById('wrap-item-produzido-novo').style.display !== 'none');
            const custoFinal = isProduzido ? calcularCustoComposicao() : pCusto;
            const composicao = isProduzido
                ? Array.from(document.querySelectorAll('#lista-composicao > div')).map(linha => ({
                    produtoId: linha.querySelector('.comp-prod').value,
                    quantidade: Number(linha.querySelector('.comp-qtd').value) || 0
                })).filter(c => c.produtoId && c.quantidade > 0)
                : null;

            db.ref('produtos').push({
                nome: n,
                precoCusto: custoFinal,
                categorias: catsNovo.length ? [...catsNovo] : null,
                subgrupo: prodSubNovo || null,
                detalhesDestilado: detDestilado,
                metodoCompra: met,
                estoqueMinimo: min,
                locais: s,
                estoque: e,
                itemProduzido: isProduzido,
                rendimentoFinal: isProduzido ? (Number(document.getElementById('prod-rendimento-final')?.value) || 0) : null,
                composicao: composicao && composicao.length ? composicao : null,
                custoCalculado: isProduzido ? custoFinal : null
            }).then(() => showToast("Produto cadastrado!", "success"))
              .catch(() => showToast("Erro ao cadastrar o produto.", "error"));

            document.getElementById('prod-nome').value = "";
            document.getElementById('prod-preco-custo').value = "";
            document.getElementById('prod-ml-garrafa').value = "";
            document.getElementById('prod-preco-garrafa').value = "";

            if (continuar) {
                // Mantém categoria, método, áreas e mínimo para cadastrar o próximo mais rápido
                const nomeEl = document.getElementById('prod-nome');
                nomeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => nomeEl.focus(), 150);
                return;
            }
            document.getElementById('prod-metodo-selecionado').value = "";
            document.getElementById('prod-estoque-minimo').value = "0";
            navegar('produtos-categorias');
        }

        function abrirEdicaoProduto(k) { 
            const p=produtos[k]; 
            if (!p) return;
            document.getElementById('edit-prod-id').value=k; 
            document.getElementById('edit-prod-nome').value=p.nome || ''; 
            document.getElementById('edit-prod-preco-custo').value = precoParaCampo(p.precoCusto);
            document.getElementById('edit-prod-metodo-selecionado').value=p.metodoCompra||""; 
            document.getElementById('edit-prod-estoque-minimo').value=p.estoqueMinimo||0; 
            catsEdit=getCategoriasProduto(p); 
            prodSubEdit = p.subgrupo || "";
            
            if(p.detalhesDestilado) {
                document.getElementById('edit-prod-ml-garrafa').value = p.detalhesDestilado.ml || "";
                document.getElementById('edit-prod-preco-garrafa').value = precoParaCampo(p.detalhesDestilado.precoGarrafa);
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
            
            const checksHTML = areas.length ? areas.map(a=>`<label class="check-item"><input type="checkbox" value="${esc(a.nome)}" ${(p.locais||[]).includes(a.nome)?'checked':''}> <span>${esc(a.nome)}</span></label>`).join('') : '<span style="color:var(--muted); font-size:0.85rem;">Nenhuma área cadastrada. Cadastre uma área primeiro.</span>';
            document.getElementById('edit-checks-areas').innerHTML=checksHTML; 
            navegar('editar-produto'); 
        }

        function salvarEdicaoProduto() { 
            if (currentRole !== 'dono') { showToast("Apenas o dono pode editar produtos.", "error"); return; }
            const id=document.getElementById('edit-prod-id').value;
            const p = produtos[id];
            if (!p) { showToast("Produto não encontrado (pode ter sido excluído).", "error"); return; }
            const n=document.getElementById('edit-prod-nome').value.trim();
            const pCusto = lerPreco(document.getElementById('edit-prod-preco-custo').value);
            const met=document.getElementById('edit-prod-metodo-selecionado').value;
            const min=Number(document.getElementById('edit-prod-estoque-minimo').value)||0; 
            
            if(!n){alert("Digite o nome do produto.");return;} 
            if(!met){alert("Selecione um Método.");return;} 
            const l=Array.from(document.querySelectorAll('#edit-checks-areas input:checked')).map(i=>i.value); 
            
            let detDestilado = null;
            if(catsEdit.some(c => c.toLowerCase().includes('destilado'))) {
                detDestilado = {
                    ml: Number(document.getElementById('edit-prod-ml-garrafa').value) || 0,
                    precoGarrafa: lerPreco(document.getElementById('edit-prod-preco-garrafa').value)
                };
            }

            // Áreas desmarcadas: o estoque daquela área também sai do produto
            // (antes ficava "fantasma": o item continuava aparecendo na área e no financeiro).
            const removidas = (p.locais || []).filter(loc => !l.includes(loc));
            const comEstoque = removidas.filter(loc => {
                const v = p.estoque && p.estoque[loc];
                return v && (Number(v.f) > 0 || Number(v.u) > 0);
            });
            if (comEstoque.length && !confirm(`O produto ainda tem estoque em: ${comEstoque.join(', ')}.\nAo desmarcar, esse estoque será apagado. Continuar?`)) return;

            const updates = {};
            const base = `produtos/${id}/`;
            Object.assign(updates, {
                [base+'nome']: n,
                [base+'precoCusto']: p.itemProduzido ? (p.precoCusto || 0) : pCusto,
                [base+'categorias']: catsEdit.length ? [...catsEdit] : null,
                [base+'categoria']: null,
                [base+'subgrupo']: prodSubEdit || null,
                [base+'detalhesDestilado']: detDestilado,
                [base+'metodoCompra']: met,
                [base+'estoqueMinimo']: min,
                [base+'locais']: l.length ? l : null
            });
            removidas.forEach(loc => { updates[`${base}estoque/${loc}`] = null; });
            l.forEach(loc => { if (!p.estoque || p.estoque[loc] === undefined) updates[`${base}estoque/${loc}`] = { f: 0, u: 0 }; });

            db.ref().update(updates)
                .then(() => showToast("Produto atualizado!", "success"))
                .catch(() => showToast("Erro ao salvar o produto.", "error"));
            navegar('produtos-categorias'); 
        }

        function toggleConfigEstoquePadrao() {
            const isChecked = document.getElementById('area-usar-padrao').checked;
            const painel = document.getElementById('div-config-estoque-padrao');
            painel.style.display = isChecked ? 'block' : 'none';
            if(!isChecked) return;

            const areaObj = areas.find(a => a.key === areaAtualKey);
            if (!areaObj) return;

            // Guarda o que já foi digitado para não perder ao marcar/desmarcar produtos
            const digitados = {};
            document.querySelectorAll('#lista-itens-padrao-area input[id^="padrao-"]').forEach(inp => { digitados[inp.id] = inp.value; });
            
            const checkedKeys = Array.from(document.querySelectorAll('.area-prod-checkbox:checked')).map(cb => cb.value);
            const iA = checkedKeys.filter(pk => produtos[pk]); 
            iA.sort((a, b) => compararProdutosPorCategoriaEOrdem(a, b, areaObj));
            
            document.getElementById('lista-itens-padrao-area').innerHTML = iA.map(pk => {
                const p = produtos[pk];
                const t = getTamFardoProduto(p);
                const labelQtd = (t > 1 && !produtoUsaContagemFracionada(p)) ? 'Fds.' : 'Un.';
                const salvo = (areaObj.config && areaObj.config.padroes && areaObj.config.padroes[pk]) ? areaObj.config.padroes[pk] : 0;
                const valAtual = digitados[`padrao-${pk}`] !== undefined ? digitados[`padrao-${pk}`] : salvo;
                return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding:8px 0;">
                    <span style="font-size:0.85rem; font-weight:bold; color: var(--text-main);">${esc(p.nome)} <small style="color:var(--muted);">(${labelQtd})</small></span>
                    <input type="number" inputmode="decimal" id="padrao-${pk}" value="${esc(valAtual)}" style="width:65px; padding:5px; text-align:center; margin:0;" min="0">
                </div>`;
            }).join('') || '<p style="font-size:0.8rem; color:var(--muted); padding:10px;">Marque os produtos acima primeiro.</p>';
        }

        function habilitarEdicaoArea() { 
            const a = areas.find(x => x.key === areaAtualKey);
            if (!a) return;
            document.getElementById('edit-area-input').value = a.nome;
            
            // Lista de produtos para vincular à área
            const htmlProds = Object.keys(produtos).filter(pk => produtos[pk]).sort((pa, pb) => (produtos[pa].nome || "").localeCompare(produtos[pb].nome || "")).map(pk => {
                const p = produtos[pk];
                const checked = (p.locais || []).includes(a.nome) ? 'checked' : '';
                return `<label class="check-item" style="font-size:0.85rem; margin-bottom:5px;"><input type="checkbox" value="${pk}" class="area-prod-checkbox" ${checked} onchange="atualizarOrdemCategoriasAreaEdit(); if(document.getElementById('area-usar-padrao').checked) toggleConfigEstoquePadrao()"> <span>${esc(p.nome)}</span></label>`;
            }).join('');
            document.getElementById('area-edit-produtos-list').innerHTML = htmlProds || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum produto cadastrado.</p>';
            document.getElementById('lista-itens-padrao-area').innerHTML = '';

            areaCatOrderTemp = (a.config && a.config.ordemCategorias) ? [...a.config.ordemCategorias] : [];
            document.getElementById('area-usar-padrao').checked = !!(a.config && a.config.usaPadrao);
            atualizarOrdemCategoriasAreaEdit();
            toggleConfigEstoquePadrao();
            document.getElementById('area-edit-box').style.display='block';
        }

        function salvarNovoNomeArea() { 
            if (currentRole !== 'dono') { showToast("Apenas o dono pode editar áreas.", "error"); return; }
            const areaObj = areas.find(a => a.key === areaAtualKey);
            if (!areaObj) return;
            const nv = document.getElementById('edit-area-input').value.trim(); 
            const ant = areaObj.nome;
            const usaPadrao = document.getElementById('area-usar-padrao').checked;
            
            if(!nv) { alert("O nome da área não pode estar vazio."); return; }
            if (nomeAreaInvalido(nv)) { alert('O nome da área não pode ter os caracteres  . # $ [ ] /'); return; }
            if (nv !== ant && areas.some(a => a.key !== areaAtualKey && (a.nome || '').trim().toLowerCase() === nv.toLowerCase())) { alert("Já existe uma área com esse nome."); return; }

            const prodsSelecionados = Array.from(document.querySelectorAll('.area-prod-checkbox:checked')).map(cb => cb.value);

            // Produtos que serão desvinculados e ainda têm estoque nesta área
            const perdendoEstoque = Object.keys(produtos).filter(pk => {
                const p = produtos[pk];
                if (!p || prodsSelecionados.includes(pk)) return false;
                const v = p.estoque && p.estoque[ant];
                return v && (Number(v.f) > 0 || Number(v.u) > 0);
            });
            if (perdendoEstoque.length && !confirm(`${perdendoEstoque.length} produto(s) desmarcado(s) ainda têm estoque nesta área. Esse estoque será apagado. Continuar?`)) return;

            let padroes = {};
            if(usaPadrao) {
                prodsSelecionados.forEach(pk => {
                    const input = document.getElementById(`padrao-${pk}`);
                    if(input) padroes[pk] = Number(String(input.value).replace(',', '.')) || 0;
                });
            }

            // Tudo numa gravação só: área, produtos e categorias que citam o nome da área
            const updates = {};
            updates[`areas/${areaAtualKey}`] = { nome: nv, config: { usaPadrao, padroes, ordemCategorias: areaCatOrderTemp } };

            Object.keys(produtos).forEach(pk => {
                const p = produtos[pk];
                if(!p) return;
                let locais = Array.isArray(p.locais) ? [...p.locais] : [];
                const estoque = p.estoque ? {...p.estoque} : {};
                let mudou = false;
                const deveEstarNaArea = prodsSelecionados.includes(pk);
                const estavaNaArea = locais.includes(ant) || estoque[ant] !== undefined;

                if (deveEstarNaArea) {
                    if (nv !== ant) {
                        if (locais.includes(ant)) { locais = locais.map(x => x === ant ? nv : x); mudou = true; }
                        if (estoque[ant] !== undefined) { estoque[nv] = estoque[ant]; delete estoque[ant]; mudou = true; }
                    }
                    if (!locais.includes(nv)) { locais.push(nv); mudou = true; }
                    if (estoque[nv] === undefined) { estoque[nv] = { f: 0, u: 0 }; mudou = true; }
                } else if (estavaNaArea || locais.includes(nv)) {
                    locais = locais.filter(x => x !== ant && x !== nv);
                    delete estoque[ant];
                    delete estoque[nv];
                    mudou = true;
                }

                if (mudou) {
                    updates[`produtos/${pk}/locais`] = locais.length ? locais : null;
                    updates[`produtos/${pk}/estoque`] = estoque;
                }
            });

            if (nv !== ant) {
                Object.keys(categorias).forEach(ck => {
                    const c = categorias[ck];
                    if (c && Array.isArray(c.areas) && c.areas.includes(ant)) updates[`categorias/${ck}/areas`] = c.areas.map(x => x === ant ? nv : x);
                });
            }

            const btn = document.querySelector('#area-edit-box .btn-submit');
            const liberar = travarBotao(btn, 'Salvando...');
            if (liberar === null) return;
            db.ref().update(updates).then(() => {
                liberar();
                showToast("Área atualizada!", "success");
                finalizarEdicaoArea();
            }).catch(err => {
                liberar();
                console.error(err);
                showToast("Erro ao salvar a área.", "error");
            });
        }

        function finalizarEdicaoArea() {
            document.getElementById('area-edit-box').style.display = 'none'; 
            document.getElementById('edit-area-input').value = ""; 
            navegar('areas-lista');
        }

        function abrirModalExclusao(msgHtml, acao) {
            document.getElementById('modalMsg').innerHTML = msgHtml;
            document.getElementById('modalDelete').style.display = 'flex';
            document.getElementById('confirmDeleteBtn').onclick = acao;
        }

        function prepararExclusaoArea() {
            const a = areas.find(x => x.key === areaAtualKey);
            if (!a) return;
            abrirModalExclusao(`Excluir área <strong>${esc(a.nome)}</strong>?<br><small style="font-weight:normal;">Os produtos deixam de ficar nela e o estoque registrado nesta área é apagado.</small>`, () => {
                const updates = { [`areas/${a.key}`]: null };
                Object.keys(produtos).forEach(pk => {
                    const p = produtos[pk]; if (!p) return;
                    if (Array.isArray(p.locais) && p.locais.includes(a.nome)) {
                        const l = p.locais.filter(x => x !== a.nome);
                        updates[`produtos/${pk}/locais`] = l.length ? l : null;
                    }
                    if (p.estoque && p.estoque[a.nome] !== undefined) updates[`produtos/${pk}/estoque/${a.nome}`] = null;
                });
                Object.keys(categorias).forEach(ck => {
                    const c = categorias[ck];
                    if (c && Array.isArray(c.areas) && c.areas.includes(a.nome)) updates[`categorias/${ck}/areas`] = c.areas.filter(x => x !== a.nome);
                });
                db.ref().update(updates).then(() => showToast("Área excluída.", "success")).catch(() => showToast("Erro ao excluir a área.", "error"));
                fecharModal(); navegar('areas-lista');
            });
        }
        function prepararExclusaoProd() {
            const id = document.getElementById('edit-prod-id').value;
            const p = produtos[id]; if (!p) return;
            abrirModalExclusao(`Excluir <strong>${esc(p.nome)}</strong>?`, () => {
                db.ref('produtos/'+id).remove().then(() => showToast("Produto excluído.", "success")).catch(() => showToast("Erro ao excluir.", "error"));
                fecharModal(); navegar('produtos-categorias');
            });
        }
        function prepararExclusaoCat(k) {
            const c = categorias[k]; if (!c) return;
            abrirModalExclusao(`Excluir categoria <strong>${esc(c.nome)}</strong>?<br><small style="font-weight:normal;">Os produtos dela ficam "Sem Categoria".</small>`, () => {
                const updates = { [`categorias/${k}`]: null };
                Object.keys(produtos).forEach(pk => {
                    const pc = getCategoriasProduto(produtos[pk]);
                    if (pc.includes(c.nome)) { const nova = pc.filter(x => x !== c.nome); updates[`produtos/${pk}/categorias`] = nova.length ? nova : null; updates[`produtos/${pk}/categoria`] = null; }
                });
                db.ref().update(updates).then(() => showToast("Categoria excluída.", "success")).catch(() => showToast("Erro ao excluir.", "error"));
                fecharModal();
            });
        }
        function prepararExclusaoMet(k) {
            const m = metodosCompra[k]; if (!m) return;
            abrirModalExclusao(`Excluir método <strong>${esc(m.nome)}</strong>?<br><small style="font-weight:normal;">Os produtos dele ficam "Sem Método de Compra".</small>`, () => {
                const updates = { [`metodos/${k}`]: null };
                Object.keys(produtos).forEach(pk => { if (produtos[pk] && produtos[pk].metodoCompra === m.nome) updates[`produtos/${pk}/metodoCompra`] = null; });
                db.ref().update(updates).then(() => showToast("Método excluído.", "success")).catch(() => showToast("Erro ao excluir.", "error"));
                fecharModal();
            });
        }

        // ==========================================
        // SISTEMA DE RECEITAS
        // ==========================================
        function toggleReceitaInfo() {
            const panel = document.getElementById('receita-info-painel');
            if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }

        function previewReceitaFoto(event, ctx) {
            const file = event.target.files[0];
            if(!file) return;
            showToast("Preparando foto...", "success");
            comprimirImagem(file, 1080, 0.8).then(dataUrl => {
                const preview = document.getElementById(ctx === 'novo' ? 'receita-foto-preview-novo' : 'receita-foto-preview-edit');
                if(ctx === 'novo') base64ReceitaFoto = dataUrl; else base64ReceitaFotoEdit = dataUrl;
                preview.src = dataUrl;
                preview.style.display = 'block';
                document.getElementById(ctx === 'novo' ? 'crop-wrapper-novo' : 'crop-wrapper-edit').style.display = 'flex';
                document.getElementById(ctx === 'novo' ? 'wrap-slider-novo' : 'wrap-slider-edit').style.display = 'block';
                const cfg = { x: 50, y: 50, scale: 1 };
                if (ctx === 'novo') configEnquadramentoNovo = cfg; else configEnquadramentoEdit = cfg;
                const suf = ctx === 'novo' ? 'novo' : 'edit';
                document.getElementById(`receita-foto-zoom-${suf}`).value = 1;
                document.getElementById(`receita-foto-posx-${suf}`).value = 50;
                document.getElementById(`receita-foto-posy-${suf}`).value = 50;
                aplicarEnquadramentoVisual(preview, cfg);
            }).catch(() => showToast("Não foi possível ler essa foto.", "error"));
        }
        
        function ajustarEnquadramento(ctx) {
            if(ctx === 'novo') {
                configEnquadramentoNovo.scale = Number(document.getElementById('receita-foto-zoom-novo').value);
                configEnquadramentoNovo.x = Number(document.getElementById('receita-foto-posx-novo').value);
                configEnquadramentoNovo.y = Number(document.getElementById('receita-foto-posy-novo').value);
                aplicarEnquadramentoVisual(document.getElementById('receita-foto-preview-novo'), configEnquadramentoNovo);
            } else {
                configEnquadramentoEdit.scale = Number(document.getElementById('receita-foto-zoom-edit').value);
                configEnquadramentoEdit.x = Number(document.getElementById('receita-foto-posx-edit').value);
                configEnquadramentoEdit.y = Number(document.getElementById('receita-foto-posy-edit').value);
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

        function custoIngrediente(ing) {
            const p = produtos[ing.idProduto];
            if (!p) return 0;
            const qtd = Number(String(ing.qtd).replace(',', '.')) || 0;
            if (ing.unidade === 'ml' && p.detalhesDestilado && Number(p.detalhesDestilado.ml) > 0) {
                return (Number(p.detalhesDestilado.precoGarrafa) / Number(p.detalhesDestilado.ml)) * qtd;
            }
            return Number(p.precoCusto || 0) * qtd;
        }

        function estiloEnquadramento(cfg) {
            cfg = cfg || { x: 50, y: 50, scale: 1 };
            const x = Number(cfg.x) || 50, y = Number(cfg.y) || 50, sc = Number(cfg.scale) || 1;
            return `object-position: ${x}% ${y}%; transform-origin: ${x}% ${y}%; transform: scale(${sc});`;
        }
        
        function renderizarReceitas() {
            const grid = document.getElementById('grid-receitas');
            if (!grid) return;
            const chaves = Object.keys(receitasDB).sort((a, b) => (receitasDB[a].nome || '').localeCompare(receitasDB[b].nome || ''));
            
            if(chaves.length === 0) {
                // Mostra "carregando" só enquanto o Firebase ainda não respondeu (antes era uma espera fixa de 1,2 s)
                grid.innerHTML = (currentUser && !receitasCarregadas)
                    ? `<div style="grid-column: 1/-1; text-align:center; padding: 30px;"><p style="color:var(--primary); font-size:1.2rem; font-weight:bold; letter-spacing:1px; animation: pulse 1s infinite;">⏳ Sincronizando com o servidor...</p></div>`
                    : `<p style="color:var(--muted); font-size:0.9rem; text-align:center; grid-column:1/-1;">${currentUser ? 'Nenhuma receita cadastrada ainda.' : 'Faça login para ver as receitas.'}</p>`;
                return;
            }
            
            grid.innerHTML = chaves.map(k => {
                const r = Object.assign({ ingredientes: [], foto: "", configEnquadramento: { x: 50, y: 50, scale: 1 } }, receitasDB[k]);
                
                let custoHtml = '';
                if (podeVerCustos()) {
                    const custoTotal = (r.ingredientes || []).reduce((acc, ing) => acc + custoIngrediente(ing), 0);
                    custoHtml = `<span class="req-custo custo-receita" style="font-size:0.85rem; color:var(--ink); font-weight:800;">${formatarReais(custoTotal)}</span>`;
                }

                const imgHtml = r.foto
                    ? `<div style="width:60px; height:60px; border-radius:10px; overflow:hidden; flex-shrink:0; border:1px solid var(--line); display:block !important;">
                            <img src="${esc(r.foto)}" loading="lazy" decoding="async" style="width:100%; height:100%; object-fit:cover; ${estiloEnquadramento(r.configEnquadramento)} display:block !important;">
                       </div>`
                    : `<div style="width:60px; height:60px; border-radius:10px; background:var(--surface-2); border: 1px solid var(--line); display:flex !important; align-items:center; justify-content:center; color:var(--primary); font-size:1.5rem; flex-shrink:0;"><i class="ph ph-martini"></i></div>`;

                return `
                <div class="card-nav" onclick="verDetalhesReceita(${jsArg(k)})" style="display:flex !important; align-items:center; gap:12px; padding: 15px; flex-direction: row; justify-content:flex-start;">
                    ${imgHtml}
                    <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                        <h3 style="font-size:1.05rem; color:var(--text-main); margin:0; display:block !important;">${esc(r.nome)}</h3>
                        ${custoHtml}
                    </div>
                </div>`;
            }).join('');
        }

        function verDetalhesReceita(k, semNavegar = false) {
            receitaAtualKey = k;
            const r = receitasDB[k];
            if(!r) { if (semNavegar) navegar('receitas-lista'); return; }
            
            document.getElementById('detalhe-receita-titulo').innerText = r.nome || 'Receita';
            
            let custoTotal = 0;
            let ingredientesHtml = (r.ingredientes || []).map(ing => {
                const p = produtos[ing.idProduto];
                let custoIngHtml = '';
                if (podeVerCustos() && p) {
                    const custoIng = custoIngrediente(ing);
                    custoTotal += custoIng;
                    custoIngHtml = `<span class="req-custo custo-receita" style="color:var(--ink); font-weight:800; font-size:0.85rem;">${formatarReais(custoIng)}</span>`;
                }
                return `<li style="margin-bottom:8px; color:var(--text-main); font-size:0.95rem; list-style:none; border-bottom:1px solid var(--line); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span><strong>${esc(ing.qtd)} ${esc(ing.unidade)}</strong> de ${esc(ing.nome)}</span>
                            ${custoIngHtml}
                        </li>`;
            }).join('');

            if (ingredientesHtml === '') {
                ingredientesHtml = '<li style="color:var(--muted); font-style:italic; list-style:none;">Nenhum ingrediente cadastrado.</li>';
            }

            const fotoHtml = r.foto
                ? `<div style="width:135px; height:240px; border-radius:16px; overflow:hidden; flex-shrink:0; border:2px solid var(--primary); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                        <img src="${esc(r.foto)}" decoding="async" style="width:100%; height:100%; object-fit:cover; ${estiloEnquadramento(r.configEnquadramento)}">
                   </div>`
                : '';

            const container = document.getElementById('detalhe-receita-content');
            container.style.borderRadius = "24px";
            container.style.padding = "20px";

            const painelCustoHtml = podeVerCustos()
                ? `<div id="receita-info-painel" class="req-custo custo-receita" style="background:var(--surface-2); border:1px solid var(--line-strong); border-radius:12px; padding:15px; margin-bottom:15px;">
                            <h3 style="color:var(--ink); margin:0; font-size:1.15rem; font-weight:800;">Custo Total: ${formatarReais(custoTotal)}</h3>
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
                <div style="margin-top:25px; padding:18px; background:var(--surface-2); border-radius:16px; border:1px solid var(--border-color);">
                    <strong style="display:block; margin-bottom:10px; color:var(--primary); font-size:1.05rem;"><i class="ph ph-book-open"></i> Modo de Preparo:</strong>
                    <p style="margin:0; font-size:0.95rem; line-height:1.6; color:var(--text-main); white-space:pre-wrap;">${esc(r.preparo)}</p>
                </div>` : ''}
            `;
            
            if (!semNavegar) navegar('detalhe-receita');
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
            const inpFotoEdit = document.getElementById('edit-receita-foto-input'); if (inpFotoEdit) inpFotoEdit.value = '';
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
                lista.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">Nenhum ingrediente adicionado.</p>`;
                return;
            }
            lista.innerHTML = receitaEmConstrucao.ingredientes.map((ing, idx) => `
                <div style="display:flex; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border-color); padding:10px; border-radius:6px; align-items:center;">
                    <span style="font-size:0.9rem;"><strong>${esc(ing.qtd)} ${esc(ing.unidade)}</strong> de ${esc(ing.nome)}</span>
                    <button style="background:red; color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="removerIngrediente(${idx})">×</button>
                </div>
            `).join('');
        }
        
        function renderIngredientesReceitaEdit() {
            const lista = document.getElementById('edit-lista-ingredientes-receita');
            if(receitaEmEdicao.ingredientes.length === 0) {
                lista.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">Nenhum ingrediente adicionado.</p>`;
                return;
            }
            lista.innerHTML = receitaEmEdicao.ingredientes.map((ing, idx) => `
                <div style="display:flex; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border-color); padding:10px; border-radius:6px; align-items:center;">
                    <span style="font-size:0.9rem;"><strong>${esc(ing.qtd)} ${esc(ing.unidade)}</strong> de ${esc(ing.nome)}</span>
                    <button style="background:red; color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="removerIngredienteEdit(${idx})">×</button>
                </div>
            `).join('');
        }

        function adicionarLinhaComposicao() {

    const container =
        document.getElementById('lista-composicao');

    const options =
        Object.keys(produtos)
            .filter(k => produtos[k])
            .sort((a, b) => (produtos[a].nome || '').localeCompare(produtos[b].nome || ''))
            .map(k => `<option value="${k}">${esc(produtos[k].nome)}</option>`)
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
            const chaves = Object.keys(produtos).filter(k => produtos[k]).sort((a,b) => (produtos[a].nome || '').localeCompare(produtos[b].nome || ''));
            
            tbody.innerHTML = chaves.map(k => `
                <tr style="cursor:pointer;" onclick="escolherIngrediente(${jsArg(k)})">
                    <td class="col-item" style="padding:15px 10px;">${esc(produtos[k].nome)}</td>
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
            const qtd = Number(String(document.getElementById('ingrediente-modal-qtd').value).replace(',', '.'));
            if(!qtd || qtd <= 0) { alert("Informe uma quantidade válida."); return; }
            
            const p = produtos[ingredienteSelecionadoTemp];
            if (!p) return;
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
            
            const liberar = travarBotao(document.querySelector('#nova-receita .btn-submit:last-of-type'), 'SALVANDO...');
            if (liberar === null) return;
            db.ref('receitas').push({
                nome: nome,
                ingredientes: receitaEmConstrucao.ingredientes,
                preparo: preparo,
                foto: base64ReceitaFoto,
                configEnquadramento: configEnquadramentoNovo
            }).then(() => {
                liberar();
                showToast("Receita salva!", "success");
                abrirReceitas();
            }).catch(() => { liberar(); showToast("Erro ao salvar a receita.", "error"); });
        }
        
        function salvarEdicaoReceita() {
            const k = document.getElementById('edit-receita-id').value;
            const nome = document.getElementById('edit-receita-nome-input').value.trim();
            const preparo = document.getElementById('edit-receita-preparo-input').value.trim();
            
            if(!nome) { alert("Dê um nome para a receita!"); return; }
            if(receitaEmEdicao.ingredientes.length === 0) { alert("Adicione pelo menos um ingrediente!"); return; }
            
            const liberar = travarBotao(document.querySelector('#editar-receita .btn-submit:last-of-type'), 'SALVANDO...');
            if (liberar === null) return;
            db.ref('receitas/' + k).update({
                nome: nome,
                ingredientes: receitaEmEdicao.ingredientes,
                preparo: preparo,
                foto: base64ReceitaFotoEdit,
                configEnquadramento: configEnquadramentoEdit
            }).then(() => {
                liberar();
                showToast("Receita atualizada!", "success");
                verDetalhesReceita(k);
            }).catch(() => { liberar(); showToast("Erro ao salvar a receita.", "error"); });
        }

        function prepararExclusaoReceita() {
            const k = document.getElementById('edit-receita-id').value;
            document.getElementById('modalMsg').innerHTML=`Excluir a receita <strong>${esc(document.getElementById('edit-receita-nome-input').value)}</strong>?`; 
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
            let totalGeralUnidades = 0;
            const frac = produtoUsaContagemFracionada(p);
            const t = getTamFardoProduto(p);
            const linhas = [];

            Object.keys(p.estoque || {}).sort().forEach(loc => {
                if (loc === '_Pendente_') return;
                const v = p.estoque[loc];
                if (!v) return;
                const totalArea = parseQtdValor(v.f, frac) * t + parseQtdValor(v.u, frac);
                if (totalArea <= 0) return;
                totalGeralUnidades += totalArea;
                const txtQtd = frac 
                    ? `${formatarQtdNumero(totalArea, true)} Un.` 
                    : (t > 1 ? `${Math.floor(totalArea / t)} Fds | ${totalArea % t} Un.` : `${totalArea} Un.`);
                const areaObj = areas.find(a => a.nome === loc);
                const click = areaObj ? `onclick="document.getElementById('modalInfoItem').style.display='none'; verArea(${jsArg(areaObj.key)}, ${jsArg(loc)})"` : '';
                linhas.push(`
                    <div ${click} style="display: flex; justify-content: space-between; padding: 12px 10px; background:var(--surface-2); border: 1px solid var(--line); border-radius: 8px; ${areaObj ? 'cursor: pointer;' : ''}">
                        <span style="color: var(--text-main); font-weight: 600; ${areaObj ? 'text-decoration: underline; text-decoration-color: var(--primary); text-underline-offset: 4px;' : ''}">${esc(loc)}</span>
                        <span style="color: var(--primary); font-weight: 800;">${txtQtd}</span>
                    </div>`);
            });

            containerLista.innerHTML = linhas.join('') || '<div style="color:var(--muted); text-align: center; padding: 10px;">Item zerado em todas as áreas físicas.</div>';

            const txtTotalGeral = frac 
                ? `${formatarQtdNumero(totalGeralUnidades, true)} Un.` 
                : (t > 1 ? `${Math.floor(totalGeralUnidades / t)} Fds | ${totalGeralUnidades % t} Un.` : `${totalGeralUnidades} Un.`);

            document.getElementById('total-info-item').innerText = txtTotalGeral;
            document.getElementById('modalInfoItem').style.display = 'flex';
        }
        // ==========================================
        // OTIMIZAR FOTOS JÁ SALVAS (receitas e cardápio)
        // ==========================================
        // As fotos antigas foram gravadas no tamanho original do celular (vários MB cada),
        // e são baixadas por todos a cada login. Esta ferramenta:
        //  1) baixa um BACKUP (.json) com as fotos originais no aparelho do dono;
        //  2) reduz só as fotos grandes (acima de ~250 KB) e grava de volta.
        async function otimizarFotosSalvas() {
            if (currentRole !== 'dono') { showToast("Apenas o dono pode fazer isso.", "error"); return; }
            if (!confirm("Isso vai reduzir as fotos grandes das receitas e do cardápio para deixar o app mais rápido.\n\nAntes, um arquivo de BACKUP com as fotos originais será baixado neste aparelho.\n\nContinuar?")) return;
            const btn = document.getElementById('btn-otimizar-fotos');
            const liberar = travarBotao(btn, 'Otimizando...');
            if (liberar === null) return;
            const status = document.getElementById('status-otimizar-fotos');
            const info = (t) => { if (status) status.innerText = t; };
            try {
                info('Baixando dados...');
                const [snapRec, snapCard] = await Promise.all([db.ref('receitas').once('value'), db.ref('cardapio/itens').once('value')]);
                const rec = snapRec.val() || {}, card = snapCard.val() || {};

                // 1) Backup
                const backup = { geradoEm: new Date().toISOString(), receitas: rec, cardapioItens: card };
                const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const aEl = document.createElement('a');
                aEl.href = url; aEl.download = `backup-fotos-adminiran-${dataLocalISO()}.json`;
                document.body.appendChild(aEl); aEl.click(); aEl.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10000);

                // 2) Lista as fotos grandes
                const LIMITE = 250 * 1024; // tamanho do texto base64
                const tarefas = [];
                Object.keys(rec).forEach(k => { const f = rec[k] && rec[k].foto; if (typeof f === 'string' && f.startsWith('data:image') && f.length > LIMITE) tarefas.push({ caminho: `receitas/${k}/foto`, foto: f, max: 1080 }); });
                Object.keys(card).forEach(k => {
                    const it = card[k] || {};
                    if (typeof it.foto === 'string' && it.foto.startsWith('data:image') && it.foto.length > 120 * 1024) tarefas.push({ caminho: `cardapio/itens/${k}/foto`, foto: it.foto, max: 400 });
                    if (typeof it.fotoExibicao === 'string' && it.fotoExibicao.startsWith('data:image') && it.fotoExibicao.length > LIMITE) tarefas.push({ caminho: `cardapio/itens/${k}/fotoExibicao`, foto: it.fotoExibicao, max: 1080 });
                });
                if (tarefas.length === 0) { info('Todas as fotos já estão otimizadas.'); showToast("Nenhuma foto grande encontrada.", "success"); liberar(); return; }

                // 3) Reduz e grava (uma por vez, para não travar o celular)
                let antes = 0, depois = 0, feitas = 0;
                for (const t of tarefas) {
                    info(`Otimizando foto ${feitas + 1} de ${tarefas.length}...`);
                    try {
                        const nova = await comprimirImagem(t.foto, t.max, 0.8);
                        if (nova.length < t.foto.length) {
                            await db.ref(t.caminho).set(nova);
                            antes += t.foto.length; depois += nova.length;
                        }
                    } catch (e) { console.warn('Falha ao otimizar', t.caminho, e); }
                    feitas++;
                }
                const mb = n => (n * 0.75 / 1048576).toFixed(1).replace('.', ',');
                info(`Pronto: ${feitas} foto(s). De ${mb(antes)} MB para ${mb(depois)} MB.`);
                showToast("Fotos otimizadas!", "success");
            } catch (e) {
                console.error(e);
                info('Erro: ' + (e.message || e));
                showToast("Erro ao otimizar as fotos.", "error");
            }
            liberar();
        }

        // Registra a tela inicial quando o sistema abre
        history.replaceState({ tela: 'inicio' }, "", "#inicio");