window.hideSplash = function() {
            const bg = document.getElementById('splash-bg');
            const bands = document.getElementById('splash-bands');
            if (bg) bg.style.display = 'none';
            if (bands) bands.style.display = 'none';
        };

        // Splash: antes esperava TODAS as imagens carregarem (evento 'load', inclusive o fundo de 5,8 MB)
        // e depois ainda segurava a tela por mais 4,1 s. Agora começa assim que o HTML está pronto,
        // dura ~1,5 s e só aparece na primeira abertura da sessão (recarregar a página não repete).
        (function iniciarSplash() {
            let jaViu = false;
            try { jaViu = sessionStorage.getItem('splashVisto') === '1'; sessionStorage.setItem('splashVisto', '1'); } catch (e) {}
            const rodar = () => {
                if (jaViu) { window.hideSplash(); return; }
                // 1. Logo aparece (0,5 s) e a sanfona começa logo em seguida
                setTimeout(() => {
                    const bands = document.getElementById('splash-bands');
                    if (bands) bands.classList.add('bands-animate');
                }, 550);
                // 2. Some com o fundo quando a sanfona cobre a tela inteira (40%–60% da animação de 1 s)
                setTimeout(() => {
                    const bg = document.getElementById('splash-bg');
                    if (bg) bg.style.display = 'none';
                }, 1050);
                // 3. Libera a tela quando as faixas terminam de recolher
                setTimeout(() => {
                    const bands = document.getElementById('splash-bands');
                    if (bands) bands.style.display = 'none';
                }, 1600);
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rodar);
            else rodar();
        })();
        function confirmarLimpezaGeral() {
            if (currentRole !== 'dono') return;
            // Abre o nosso Pop-up customizado com o design escuro e borda vermelha
            document.getElementById('input-confirm-zerar').value = '';
            document.getElementById('modalZerarEstoque').style.display = 'flex';
        }

        function validarLimpezaGeral() {
            const senhaDigitada = document.getElementById('input-confirm-zerar').value;
            
            if (!senhaDigitada) {
                showToast("Digite sua senha para confirmar.", "error");
                return;
            }

            if (!currentUser) return;
            // Confere a senha com "reautenticação" (forma correta do Firebase; antes fazia um novo login,
            // o que reiniciava a sessão e todos os carregamentos do app).
            const credencial = firebase.auth.EmailAuthProvider.credential(currentUser.email, senhaDigitada);
            currentUser.reauthenticateWithCredential(credencial)
                .then(() => {
                    // Senha validada com sucesso pelo banco de dados!
                    document.getElementById('modalZerarEstoque').style.display = 'none';
                    executarLimpezaEstoque();
                })
                .catch(error => {
                    document.getElementById('input-confirm-zerar').value = '';
                    showToast(error && error.code === 'auth/network-request-failed' ? "Sem internet. Ação cancelada." : "Senha incorreta. Ação cancelada por segurança.", "error");
                    document.getElementById('modalZerarEstoque').style.display = 'none';
                });
        }

        function executarLimpezaEstoque() {
            let updates = {};
            let totalProds = 0;

            Object.keys(produtos).forEach(pk => {
                totalProds++;
                updates[`produtos/${pk}/estoque`] = null;
            });

            if (totalProds > 0) {
                db.ref().update(updates).then(() => {
                    // Notificação chique do nosso sistema (Toast) de Sucesso
                    showToast(`Sucesso! Estoque de ${totalProds} itens resetado.`, "success");
                    navegar('inicio');
                }).catch(err => {
                    console.error(err);
                    showToast("Erro ao tentar limpar o banco de dados.", "error");
                });
            } else {
                showToast("Nenhum produto cadastrado para limpar.", "error");
            }
        }
        function abrirDashboard(semNavegar = false) {
            if (!semNavegar) navegar('financeiro-dashboard');
            let totalGeral = 0;
            let custosPorArea = {};
            let detalhesPorArea = {}; // NOVO: Guarda os itens de cada área para a gaveta

            // Proteção: garante que o sistema não trave se as áreas ainda não carregaram
            if (!areas || areas.length === 0) {
                document.getElementById('grid-custos-areas').innerHTML = '<p style="padding:20px; color:#64748b;">Carregando dados das áreas...</p>';
                return;
            }

            const PATIO_LABEL = 'Pátio';
            areas.forEach(a => { 
                if(a.nome) {
                    custosPorArea[a.nome] = 0; 
                    detalhesPorArea[a.nome] = [];
                }
            });
            custosPorArea[PATIO_LABEL] = 0;
            detalhesPorArea[PATIO_LABEL] = [];

            Object.keys(produtos).forEach(pk => {
                const p = produtos[pk];
                if (!p) return;

                const precoBase = getPrecoPorUnidadeBase(p);
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);

                Object.keys(p.estoque || {}).forEach(loc => {
                    const v = p.estoque[loc];
                    const areaKey = loc === '_Pendente_' ? PATIO_LABEL : loc;
                        if (!v || typeof v !== 'object') return;
                    const qtdTotal = parseQtdValor(v.f, frac) * t + parseQtdValor(v.u, frac);

                    if (qtdTotal > 0) {
                        const valorNaArea = Math.round(qtdTotal * precoBase * 100) / 100;

                        if(custosPorArea[areaKey] !== undefined) {
                            custosPorArea[areaKey] += valorNaArea;
                            totalGeral += valorNaArea;

                            detalhesPorArea[areaKey].push({
                                id: pk,
                                nome: p.nome,
                                f: frac ? 0 : Math.floor(qtdTotal / t),
                                u: frac ? qtdTotal : Math.round((qtdTotal % t) * 1000) / 1000,
                                t: t,
                                frac: frac,
                                valor: valorNaArea
                            });
                        }
                    }
                });
            });

            document.getElementById('txt-custo-total-geral').innerText = formatarReais(totalGeral);
            
            let financeiroAreas = areas.filter(a => a.nome).map(a => a.nome);
            if (detalhesPorArea['Pátio'] && detalhesPorArea['Pátio'].length > 0) {
                financeiroAreas.push('Pátio');
            }

            const htmlGrid = financeiroAreas.map(loc => {
                const a = areas.find(x => x.nome === loc) || {};
                const safeId = loc === 'Pátio' ? 'patio' : (a.key || String(loc).replace(/[^a-zA-Z0-9_-]/g, '_'));
                const estavaAberto = (document.getElementById(`det-fin-${safeId}`) || {}).style;
                
                // Ordena os itens dentro da gaveta do mais CARO para o mais barato
                const areaObjFin = areas.find(x => x.nome === loc) || {};
                detalhesPorArea[loc].sort((itemA, itemB) => compararProdutosPorCategoriaEOrdem(itemA.id, itemB.id, areaObjFin));
                
                let detalhesHtml = detalhesPorArea[loc].map(d => {
                    let txtQtd = d.frac
                        ? `${formatarQtdNumero(d.u, true)} Un.`
                        : (d.t > 1 ? `${d.f} Fds e ${d.u} Un.` : `${d.u} Un.`);
                    return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding:8px 0;">
                                <span style="color:var(--text-main); font-size:0.85rem; flex:1;">${esc(d.nome)} <br><small style="color:#64748b;">${txtQtd}</small></span>
                                <span style="color:#10b981; font-weight:bold; font-size:0.85rem;">${formatarReais(d.valor)}</span>
                            </div>`;
                }).join('');
                
                if(!detalhesHtml) detalhesHtml = '<p style="font-size:0.8rem; color:#64748b;">Nenhum produto com valor registrado nesta área.</p>';

                return `
                <div class="card" style="margin-bottom:10px; padding: 0; overflow:hidden; border: 1px solid var(--border-color); background: rgba(0,0,0,0.4);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px;">
                        <div style="display:flex; align-items:center; gap:10px;">
 
                            <button class="action-icon info-btn" onclick="toggleDetFin('${safeId}')">ⓘ</button>
                            <strong style="color:var(--text-main); font-size:1.05rem;">${esc(loc)}</strong>
                        </div>
                        <span style="color:#10b981; font-weight:800; font-size:1.1rem;">${formatarReais(custosPorArea[loc])}</span>
                    </div>
                    <div id="det-fin-${safeId}" style="display:${estavaAberto && estavaAberto.display === 'block' ? 'block' : 'none'}; padding: 0 15px 15px 15px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05);">
                        <p style="font-size:0.85rem; color:var(--primary); margin: 5px 0 10px 0; font-weight:bold;">Itens e Custos no Local:</p>
                        <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                            ${detalhesHtml}
                        </div>
                    </div>
                </div>`;
            }).join('');

            document.getElementById('grid-custos-areas').innerHTML = htmlGrid || '<p style="color:#64748b; font-size:0.9rem;">Nenhum valor calculado. Seu estoque está vazio.</p>';
        }

        // Nova função para abrir e fechar a gaveta do Financeiro
        function toggleDetFin(safeId) {
            const el = document.getElementById(`det-fin-${safeId}`);
            if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }

let modoContagemAtivo = false;

function abrirTimeline() {
    navegar('timeline-estoque'); // navegar() liga o carregamento do histórico sob demanda
}

let timelineNodesGlobais = [];

        function renderizarTimeline() {
            const container = document.getElementById('container-timeline');
            if (!container) return;
            if (timelineSemPermissao) {
                container.innerHTML = `<p style="padding:20px; color:#64748b;">Sem permissão para ver o histórico.</p>`;
                return;
            }
            if (!timelineCarregada) {
                container.innerHTML = `<div style="padding:20px; color:#64748b; text-align:center;"><p>⏳ Carregando histórico...</p></div>`;
                return;
            }
            if(eventosTimeline.length === 0) {
                container.innerHTML = `
                    <div style="padding:20px; color:#64748b; text-align:center;">
                        <i class="ph ph-clock-counter-clockwise" style="font-size:2rem;"></i>
                        <p>Nenhuma movimentação registrada ainda.<br>Faça uma contagem ou um recebimento.</p>
                    </div>`;
                return;
            }

            let timelineNodes = [];
            let contagensPorData = {};

            // Agrupa todas as contagens do mesmo dia e mantém os recebimentos avulsos
            eventosTimeline.forEach(ev => {
                if (ev.tipo === 'contagem') {
                    const dia = ev.dataFormatada || new Date(ev.timestamp || 0).toLocaleDateString('pt-BR');
                    ev = Object.assign({}, ev, { dataFormatada: dia });
                    if (!contagensPorData[ev.dataFormatada]) {
                        contagensPorData[ev.dataFormatada] = {
                            id: 'cont_' + ev.dataFormatada.replace(/\//g, ''),
                            tipo: 'contagem_agrupada',
                            dataFormatada: ev.dataFormatada,
                            timestamp: ev.timestamp,
                            areas: {}
                        };
                    }
                    // Adiciona a área e seus itens dentro desse "dia"
                    // Duas contagens da mesma área no mesmo dia: mantém a mais recente
                    const jaTem = contagensPorData[ev.dataFormatada].areasTs || (contagensPorData[ev.dataFormatada].areasTs = {});
                    if (!jaTem[ev.area] || (ev.timestamp || 0) >= jaTem[ev.area]) {
                        contagensPorData[ev.dataFormatada].areas[ev.area] = ev.itens;
                        jaTem[ev.area] = ev.timestamp || 0;
                    }
                    // Mantém o timestamp da última contagem desse dia para ordenação
                    if (ev.timestamp > contagensPorData[ev.dataFormatada].timestamp) {
                        contagensPorData[ev.dataFormatada].timestamp = ev.timestamp;
                    }
                } else {
                    timelineNodes.push(ev); // Recebimentos entram soltos
                }
            });

            // Junta os grupos de contagem com os recebimentos
            Object.values(contagensPorData).forEach(agrupado => timelineNodes.push(agrupado));

            // ORDENAÇÃO: Mais recentes no TOPO
            timelineNodes.sort((a, b) => b.timestamp - a.timestamp);
            timelineNodesGlobais = timelineNodes; // Salva pra gente poder puxar as gavetas

            let html = '';
            timelineNodes.forEach(ev => {
                let isContagem = ev.tipo === 'contagem_agrupada';
                let icone = isContagem ? '📋' : '📦';
                let titulo = isContagem ? `Contagem de Estoque` : `Carga: ${esc(ev.fornecedor || '')}`;
                
                // Cores de distinção: Contagem (Vermelho AdmiNiran) | Recebimento (Verde Sucesso)
                let corBase = isContagem ? 'var(--primary)' : '#10b981';
                let bgCard = isContagem ? 'rgba(183, 41, 41, 0.1)' : 'rgba(16, 185, 129, 0.1)';
                let borderColor = isContagem ? 'rgba(183, 41, 41, 0.3)' : 'rgba(16, 185, 129, 0.3)';
                let nomeOperador = esc(isContagem ? "Equipe" : (ev.usuario || "Equipe"));

                html += `
                <div style="position:relative; margin-bottom: 25px; padding-left: 20px;">
                    <div style="position:absolute; left: -14px; top: 15px; width:26px; height:26px; border-radius:50%; background:${corBase}; display:flex; align-items:center; justify-content:center; font-size:12px; border:4px solid var(--bg-body); z-index:2; color:white;">${icone}</div>
                    
                    <div class="card" style="margin:0; padding:15px; background:${bgCard}; border: 1px solid ${borderColor}; border-left: 4px solid ${corBase};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:var(--text-main); font-size:1.05rem;">${titulo}</strong><br>
                                <span style="font-size:0.85rem; color:#cbd5e1; font-weight:bold;">Dia ${esc(ev.dataFormatada)} <span style="color:#64748b; font-weight:normal;">• ${nomeOperador}</span></span>
                            </div>
                            <button class="action-icon info-btn" style="background:${corBase};" onclick="abrirDetalheTimeline(${jsArg(ev.id)})">ⓘ</button>
                        </div>
                        
                        <div id="detalhe-tl-${ev.id}" style="display:none; margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;"></div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        function abrirDetalheTimeline(id) {
            try {
                const div = document.getElementById(`detalhe-tl-${id}`);
                if(!div) return;
                
                // Se já estiver aberto, fecha
                if(div.style.display === 'block') { div.style.display = 'none'; return; }
                
                const ev = timelineNodesGlobais.find(e => e.id === id);
                if(!ev) return;

                let html = '';
                
                if (ev.tipo === 'contagem_agrupada') {
                    if(ev.areas) {
                        Object.keys(ev.areas).sort().forEach(nomeArea => {
                            const safeAreaId = String(nomeArea).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '_' + Object.keys(ev.areas).indexOf(nomeArea);
                            const divAreaId = `area-${id}-${safeAreaId}`;
                            
                            html += `
                            <div style="margin-bottom:8px;">
                                <div style="background:rgba(0,0,0,0.5); padding:10px 15px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);" onclick="document.getElementById('${divAreaId}').style.display = document.getElementById('${divAreaId}').style.display === 'none' ? 'block' : 'none'">
                                    <strong style="color:var(--primary); font-size:0.95rem;">📍 ${esc(nomeArea)}</strong>
                                    <span style="color:#64748b; font-size:0.8rem;">Ver itens ▼</span>
                                </div>
                                <div id="${divAreaId}" style="display:none; padding:10px; border:1px dashed rgba(255,255,255,0.1); border-top:none; border-radius: 0 0 8px 8px; background:rgba(0,0,0,0.2);">
                                    ${renderItensHistorico(ev.areas[nomeArea])}
                                </div>
                            </div>`;
                        });
                    } else {
                        html = '<p style="font-size:0.8rem; color:#64748b; padding: 10px;">Sem áreas registradas (Registro Antigo).</p>';
                    }
                } else {
                    // Recebimento mostra direto os itens (Tenta ler itens novos ou detalhes antigos)
                    html += renderItensHistorico(ev.itens || ev.detalhes, true);
                }

                div.innerHTML = html;
                div.style.display = 'block';
            } catch (e) {
                console.error("Erro ao abrir gaveta da timeline:", e);
            }
        }

        function getSubgrupoLabel(subgrupo) {
            return subgrupo && String(subgrupo).trim() ? String(subgrupo).trim() : 'Sem especificação';
        }

        function ordenarSubgruposDaCategoria(catName, subA, subB) {
            const catObj = getCategoriaObjPorNome(catName);
            const ordemSubgrupos = catObj && Array.isArray(catObj.subgrupos) ? catObj.subgrupos : [];
            const nomeA = subA || '';
            const nomeB = subB || '';
            const idxA = ordemSubgrupos.indexOf(nomeA);
            const idxB = ordemSubgrupos.indexOf(nomeB);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            if (!nomeA && nomeB) return 1;
            if (!nomeB && nomeA) return -1;
            return nomeA.localeCompare(nomeB);
        }

        // Função auxiliar blindada contra dados antigos ou corrompidos do Firebase
        function renderItensHistorico(itensObj, isRecebimento = false) {
            // Se o dado não existir, devolve um texto de segurança em vez de travar o sistema
            if (!itensObj || typeof itensObj !== 'object') {
                return '<p style="font-size:0.8rem; color:#64748b; font-style:italic;">Itens não detalhados neste registro antigo.</p>';
            }

            let html = '';
            const itensOrdenados = Object.keys(itensObj).map(pk => ({ pk, item: itensObj[pk], produto: produtos[pk] })).sort((a, b) => compararProdutosPorCategoriaEOrdem(a.pk, b.pk));
            const porCategoria = {};

            itensOrdenados.forEach(({ pk, item, produto }) => {
                let catName = "Sem Categoria";
                let subgrupo = "";
                if (produto) {
                    const cats = getCategoriasProduto(produto);
                    if (cats.length > 0) catName = cats[0];
                    subgrupo = produto.subgrupo || "";
                }
                porCategoria[catName] = porCategoria[catName] || {};
                porCategoria[catName][subgrupo] = porCategoria[catName][subgrupo] || [];
                porCategoria[catName][subgrupo].push({ pk, item, produto });
            });

            const categorias = Object.keys(porCategoria).sort((a, b) => {
                const ordenadas = ordenarCategoriasParaArea([a, b], null);
                return ordenadas.indexOf(a) - ordenadas.indexOf(b);
            });

            categorias.forEach(cat => {
                html += `<p style="color:#cbd5e1; font-size:0.85rem; font-weight:bold; margin: 10px 0 5px 0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:3px; text-transform:uppercase;">${esc(cat)}</p>`;
                const subgrupos = Object.keys(porCategoria[cat]).sort((a, b) => ordenarSubgruposDaCategoria(cat, a, b));
                subgrupos.forEach(sub => {
                    if (sub || subgrupos.length > 1) {
                        html += `<p style="color:#94a3b8; font-size:0.8rem; font-weight:700; margin: 8px 0 4px 0; padding-left: 10px;">${esc(getSubgrupoLabel(sub))}</p>`;
                    }

                    porCategoria[cat][sub].forEach(({ item, produto }) => {
                        let sinal = isRecebimento ? '+' : '';
                        let corNum = isRecebimento ? '#10b981' : 'var(--text-main)';
                        let nomeExibicao = item.nome || produto?.nome || "Produto Antigo";
                        let f = item.f || 0;
                        let u = item.u || 0;

                        html += `<div style="display:flex; justify-content:space-between; padding:4px 0 4px 10px; font-size:0.85rem;">
                            <span style="color:#94a3b8;">${esc(nomeExibicao)}</span>
                            <span style="color:${corNum}; font-weight:bold; letter-spacing: 0.5px;">${sinal} ${esc(f)}f | ${esc(u)}u</span>
                        </div>`;
                    });
                });
            });

            return html || '<p style="font-size:0.8rem; color:#64748b;">Nenhum item válido lido.</p>';
        }

function ativarModoContagem() {
    if (currentRole === 'visualizador') return;
    modoContagemAtivo = true;
    document.getElementById('btn-modo-contagem').style.display = 'none';
    document.getElementById('btn-cancelar-contagem').style.display = 'block';
    document.getElementById('btn-salvar-contagem-geral').style.display = 'block';
    document.getElementById('btn-excluir-area-texto').style.display = 'none';
    const btnTr = document.getElementById('btn-transferir-area');
    if (btnTr) btnTr.style.display = 'none';
    
    const area = areas.find(a => a.key === areaAtualKey);
    if(area) verArea(area.key, area.nome, true); 
    showToast("Modo contagem ativado! Campos zerados.", "success");
}

// Sai do modo contagem só restaurando os botões (sem redesenhar a tela)
function encerrarModoContagem() {
    modoContagemAtivo = false;
    const mostrar = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
    // '' devolve o controle de visibilidade para o CSS
    mostrar('btn-modo-contagem', '');
    mostrar('btn-cancelar-contagem', 'none');
    mostrar('btn-salvar-contagem-geral', 'none');
    mostrar('btn-excluir-area-texto', '');
    mostrar('btn-transferir-area', '');
}

function cancelarModoContagem() {
    const estavaContando = modoContagemAtivo;
    encerrarModoContagem();
    if(estavaContando && telaAtiva('detalhe-area')) {
        const area = areas.find(a => a.key === areaAtualKey);
        if(area) verArea(area.key, area.nome, true);
    }
}

// Botão verde "CONCLUIR CONTAGEM E SALVAR"
function salvarContagemAuditoria() {
    if(currentRole === 'visualizador') return;
    const areaObj = areas.find(a => a.key === areaAtualKey);
    if(!areaObj) return;

    let updates = {};
    let itensContadosHist = {};
    let emBranco = [];

    const inputsUnidade = document.querySelectorAll('#tabela-area-itens input[id^="cont-u-"]');
    inputsUnidade.forEach(inputU => {
        const pk = inputU.id.replace('cont-u-', '');
        const p = produtos[pk];
        if (!p) return; // produto excluído enquanto contava
        const inputF = document.getElementById(`cont-f-${pk}`);

        const frac = produtoUsaContagemFracionada(p);
        const t = getTamFardoProduto(p);
        const vazioF = !inputF || String(inputF.value).trim() === '';
        const vazioU = String(inputU.value).trim() === '';
        if (vazioF && vazioU) emBranco.push(p.nome);
        let f = !vazioF ? parseQtdValor(String(inputF.value).replace(',', '.'), frac) : 0;
        let u = !vazioU ? parseQtdValor(String(inputU.value).replace(',', '.'), frac) : 0;

        let gravado;
        if (frac || t <= 1) gravado = { f: 0, u: Math.round((f * t + u) * 1000) / 1000 };
        else {
            // Normaliza unidades soltas que completam fardos (ex.: 0 fd + 14 un com fardo de 12 = 1 fd + 2 un)
            const total = f * t + u;
            gravado = { f: Math.floor(total / t), u: total % t };
        }
        updates[`produtos/${pk}/estoque/${areaObj.nome}`] = gravado;
        itensContadosHist[pk] = { f: gravado.f, u: gravado.u, nome: p.nome };
    });

    if (Object.keys(updates).length === 0) { cancelarModoContagem(); return; }

    // Antes, qualquer item esquecido em branco virava ZERO sem aviso.
    if (emBranco.length > 0) {
        const lista = emBranco.slice(0, 8).join(', ') + (emBranco.length > 8 ? ` e mais ${emBranco.length - 8}` : '');
        if (!confirm(`${emBranco.length} item(ns) ficaram em branco e serão gravados como ZERO:\n${lista}\n\nSalvar mesmo assim?`)) return;
    }

    const btn = document.getElementById('btn-salvar-contagem-geral');
    const liberar = travarBotao(btn, 'SALVANDO...');
    if (liberar === null) return;

    // Contagem e histórico gravados juntos
    const data = new Date();
    const histKey = db.ref('historico_timeline').push().key;
    updates[`historico_timeline/${histKey}`] = {
        timestamp: data.getTime(),
        dataFormatada: data.toLocaleDateString('pt-BR'),
        tipo: 'contagem',
        area: areaObj.nome,
        itens: itensContadosHist,
        usuario: currentUserName || "Equipe"
    };

    db.ref().update(updates).then(() => {
        liberar();
        showToast("Contagem salva com sucesso!", "success");
        cancelarModoContagem();
    }).catch(err => {
        liberar();
        console.error(err);
        showToast("Erro ao salvar a contagem. Nada foi perdido: confira a internet e toque em salvar de novo.", "error");
    });
}
