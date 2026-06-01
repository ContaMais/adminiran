window.addEventListener('load', function() {
            // 1. Inicia o movimento após o brilho da logo (2.2s)
            setTimeout(() => {
                const bands = document.getElementById('splash-bands');
                if(bands) bands.classList.add('bands-animate');
            }, 2200);

            // 2. A MÁGICA: Some com o fundo exatamente aos 3.1s 
            // (Neste exato milissegundo, a sanfona estará no auge da expansão, cobrindo tudo)
            setTimeout(() => {
                const bg = document.getElementById('splash-bg');
                if(bg) bg.style.display = 'none';
            }, 3100); 

            // 3. Libera a tela aos 4.1s quando as linhas já sumiram por cima
            setTimeout(() => {
                const bands = document.getElementById('splash-bands');
                if(bands) bands.style.display = 'none';
            }, 4100);
        });
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

            // O sistema tenta "relogar" silenciosamente para checar se a senha bate com a do dono atual
            auth.signInWithEmailAndPassword(currentUser.email, senhaDigitada)
                .then(() => {
                    // Senha validada com sucesso pelo banco de dados!
                    document.getElementById('modalZerarEstoque').style.display = 'none';
                    executarLimpezaEstoque();
                })
                .catch(error => {
                    // A senha está errada
                    document.getElementById('input-confirm-zerar').value = '';
                    showToast("Senha incorreta. Ação cancelada por segurança.", "error");
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
        function abrirDashboard() {
            navegar('financeiro-dashboard');
            let totalGeral = 0;
            let custosPorArea = {};
            let detalhesPorArea = {}; // NOVO: Guarda os itens de cada área para a gaveta

            // Proteção: garante que o sistema não trave se as áreas ainda não carregaram
            if (!areas || areas.length === 0) {
                document.getElementById('grid-custos-areas').innerHTML = '<p style="padding:20px; color:#64748b;">Carregando dados das áreas...</p>';
                return;
            }

            areas.forEach(a => { 
                if(a.nome) {
                    custosPorArea[a.nome] = 0; 
                    detalhesPorArea[a.nome] = [];
                }
            });

            Object.keys(produtos).forEach(pk => {
                const p = produtos[pk];
                if (!p) return;

                const precoBase = getPrecoPorUnidadeBase(p);
                const frac = produtoUsaContagemFracionada(p);
                const t = getTamFardoProduto(p);

                Object.keys(p.estoque || {}).forEach(loc => {
                    if(loc === '_Pendente_') return;
                    const v = p.estoque[loc];
                    const qtdTotal = parseQtdValor(v.f, frac) * t + parseQtdValor(v.u, frac);

                    if (qtdTotal > 0) {
                        const valorNaArea = Math.round(qtdTotal * precoBase * 100) / 100;

                        if(custosPorArea[loc] !== undefined) {
                            custosPorArea[loc] += valorNaArea;
                            totalGeral += valorNaArea;

                            detalhesPorArea[loc].push({
                                id: pk,
                                nome: p.nome,
                                f: frac ? 0 : Math.floor(qtdTotal / t),
                                u: frac ? qtdTotal : qtdTotal % t,
                                t: t,
                                frac: frac,
                                valor: valorNaArea
                            });
                        }
                    }
                });
            });

            document.getElementById('txt-custo-total-geral').innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
            
            const htmlGrid = areas.filter(a => a.nome).map(a => {
                const loc = a.nome;
                const safeId = a.key; // ID seguro para fazer a gaveta abrir sem erro
                
                // Ordena os itens dentro da gaveta do mais CARO para o mais barato
                const areaObjFin = areas.find(x => x.nome === loc);
                detalhesPorArea[loc].sort((itemA, itemB) => compararProdutosPorCategoriaEOrdem(itemA.id, itemB.id, areaObjFin));
                
                let detalhesHtml = detalhesPorArea[loc].map(d => {
                    let txtQtd = d.frac
                        ? `${formatarQtdNumero(d.u, true)} Un.`
                        : (d.t > 1 ? `${d.f} Fds e ${d.u} Un.` : `${d.u} Un.`);
                    return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding:8px 0;">
                                <span style="color:var(--text-main); font-size:0.85rem; flex:1;">${d.nome} <br><small style="color:#64748b;">${txtQtd}</small></span>
                                <span style="color:#10b981; font-weight:bold; font-size:0.85rem;">R$ ${d.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                            </div>`;
                }).join('');
                
                if(!detalhesHtml) detalhesHtml = '<p style="font-size:0.8rem; color:#64748b;">Nenhum produto com valor registrado nesta área.</p>';

                return `
                <div class="card" style="margin-bottom:10px; padding: 0; overflow:hidden; border: 1px solid var(--border-color); background: rgba(0,0,0,0.4);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button class="action-icon info-btn" onclick="toggleDetFin('${safeId}')">ⓘ</button>
                            <strong style="color:var(--text-main); font-size:1.05rem;">${loc}</strong>
                        </div>
                        <span style="color:#10b981; font-weight:800; font-size:1.1rem;">R$ ${custosPorArea[loc].toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div id="det-fin-${safeId}" style="display:none; padding: 0 15px 15px 15px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05);">
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
    navegar('timeline-estoque');
    renderizarTimeline();
}

let timelineNodesGlobais = [];

        function renderizarTimeline() {
            const container = document.getElementById('container-timeline');
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
                    contagensPorData[ev.dataFormatada].areas[ev.area] = ev.itens;
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
                let titulo = isContagem ? `Contagem de Estoque` : `Carga: ${ev.fornecedor}`;
                
                // Cores de distinção: Contagem (Vermelho AdmiNiran) | Recebimento (Verde Sucesso)
                let corBase = isContagem ? 'var(--primary)' : '#10b981';
                let bgCard = isContagem ? 'rgba(183, 41, 41, 0.1)' : 'rgba(16, 185, 129, 0.1)';
                let borderColor = isContagem ? 'rgba(183, 41, 41, 0.3)' : 'rgba(16, 185, 129, 0.3)';
                let nomeOperador = isContagem ? "Equipe" : (ev.usuario || "Equipe");

                html += `
                <div style="position:relative; margin-bottom: 25px; padding-left: 20px;">
                    <div style="position:absolute; left: -14px; top: 15px; width:26px; height:26px; border-radius:50%; background:${corBase}; display:flex; align-items:center; justify-content:center; font-size:12px; border:4px solid var(--bg-body); z-index:2; color:white;">${icone}</div>
                    
                    <div class="card" style="margin:0; padding:15px; background:${bgCard}; border: 1px solid ${borderColor}; border-left: 4px solid ${corBase};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:var(--text-main); font-size:1.05rem;">${titulo}</strong><br>
                                <span style="font-size:0.85rem; color:#cbd5e1; font-weight:bold;">Dia ${ev.dataFormatada} <span style="color:#64748b; font-weight:normal;">• ${nomeOperador}</span></span>
                            </div>
                            <button class="action-icon info-btn" style="background:${corBase};" onclick="abrirDetalheTimeline('${ev.id}')">ⓘ</button>
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
                            const safeAreaId = nomeArea.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                            const divAreaId = `area-${id}-${safeAreaId}`;
                            
                            html += `
                            <div style="margin-bottom:8px;">
                                <div style="background:rgba(0,0,0,0.5); padding:10px 15px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);" onclick="document.getElementById('${divAreaId}').style.display = document.getElementById('${divAreaId}').style.display === 'none' ? 'block' : 'none'">
                                    <strong style="color:var(--primary); font-size:0.95rem;">📍 ${nomeArea}</strong>
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

        // Função auxiliar blindada contra dados antigos ou corrompidos do Firebase
        function renderItensHistorico(itensObj, isRecebimento = false) {
            // Se o dado não existir, devolve um texto de segurança em vez de travar o sistema
            if (!itensObj || typeof itensObj !== 'object') {
                return '<p style="font-size:0.8rem; color:#64748b; font-style:italic;">Itens não detalhados neste registro antigo.</p>';
            }

            let html = '';
            let porCategoria = {};
            
            Object.keys(itensObj).forEach(pk => {
                const item = itensObj[pk];
                const p = produtos[pk];
                let catName = "Sem Categoria";
                if (p) {
                    const cats = getCategoriasProduto(p);
                    if (cats.length > 0) catName = cats[0];
                }
                if(!porCategoria[catName]) porCategoria[catName] = [];
                porCategoria[catName].push(item);
            });

            Object.keys(porCategoria).sort().forEach(cat => {
                html += `<p style="color:#cbd5e1; font-size:0.85rem; font-weight:bold; margin: 10px 0 5px 0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:3px; text-transform:uppercase;">${cat}</p>`;
                porCategoria[cat].forEach(i => {
                    let sinal = isRecebimento ? '+' : '';
                    let corNum = isRecebimento ? '#10b981' : 'var(--text-main)';
                    // Puxa o nome salvo, ou se for tão antigo que não tem, avisa
                    let nomeExibicao = i.nome || "Produto Antigo"; 
                    let f = i.f || 0;
                    let u = i.u || 0;

                    html += `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:0.85rem;">
                        <span style="color:#94a3b8;">${nomeExibicao}</span>
                        <span style="color:${corNum}; font-weight:bold; letter-spacing: 0.5px;">${sinal} ${f}f | ${u}u</span>
                    </div>`;
                });
            });
            return html || '<p style="font-size:0.8rem; color:#64748b;">Nenhum item válido lido.</p>';
        }

function ativarModoContagem() {
    modoContagemAtivo = true;
    document.getElementById('btn-modo-contagem').style.display = 'none';
    document.getElementById('btn-cancelar-contagem').style.display = 'block';
    document.getElementById('btn-salvar-contagem-geral').style.display = 'block';
    document.getElementById('btn-excluir-area-texto').style.display = 'none';
    const btnTr = document.getElementById('btn-transferir-area');
    if (btnTr) btnTr.style.display = 'none';
    
    const area = areas.find(a => a.key === areaAtualKey);
    if(area) verArea(area.key, area.nome); 
    showToast("Modo contagem ativado! Campos zerados.", "success");
}

function cancelarModoContagem() {
            modoContagemAtivo = false;
            
            // Usar '' em vez de 'block' limpa o JS e deixa o CSS controlar a visibilidade e o layout com perfeição!
            if(document.getElementById('btn-modo-contagem')) document.getElementById('btn-modo-contagem').style.display = '';
            if(document.getElementById('btn-cancelar-contagem')) document.getElementById('btn-cancelar-contagem').style.display = 'none';
            if(document.getElementById('btn-salvar-contagem-geral')) document.getElementById('btn-salvar-contagem-geral').style.display = 'none';
            if(document.getElementById('btn-excluir-area-texto')) document.getElementById('btn-excluir-area-texto').style.display = '';
            const btnTr = document.getElementById('btn-transferir-area');
            if (btnTr) btnTr.style.display = '';
            
            if(document.getElementById('detalhe-area').classList.contains('active')) {
                const area = areas.find(a => a.key === areaAtualKey);
                if(area) verArea(area.key, area.nome);
            }
        }

// Essa função será chamada quando você clicar no botão verde de salvar a contagem
function salvarContagemAuditoria() {
    if(currentRole === 'visualizador') return;
    const areaObj = areas.find(a => a.key === areaAtualKey);
    if(!areaObj) return;

    let updates = {};
    let contagemRealizada = false;
    let itensContadosHist = {};

    const inputsUnidade = document.querySelectorAll('input[id^="cont-u-"]');
    inputsUnidade.forEach(inputU => {
        const pk = inputU.id.replace('cont-u-', '');
        const inputF = document.getElementById(`cont-f-${pk}`);
        const p = produtos[pk];

        const frac = produtoUsaContagemFracionada(p);
        const t = getTamFardoProduto(p);
        let f = inputF && inputF.value !== "" ? parseQtdValor(inputF.value, frac) : 0;
        let u = inputU.value !== "" ? parseQtdValor(inputU.value, frac) : 0;

        if (frac || t <= 1) {
            updates[`produtos/${pk}/estoque/${areaObj.nome}`] = { f: 0, u: Math.round((f * t + u) * 1000) / 1000 };
        } else {
            updates[`produtos/${pk}/estoque/${areaObj.nome}`] = { f: f, u: u };
        }
        itensContadosHist[pk] = { f: f, u: u, nome: p ? p.nome : "Desconhecido" };
        contagemRealizada = true;
    });

    if (contagemRealizada) {
        document.getElementById('btn-salvar-contagem-geral').innerText = "SALVANDO...";
        db.ref().update(updates).then(() => {
            const data = new Date();
            db.ref('historico_timeline').push({
                timestamp: data.getTime(),
                dataFormatada: data.toLocaleDateString('pt-BR'),
                tipo: 'contagem',
                area: areaObj.nome,
                itens: itensContadosHist,
                usuario: currentUserName || "Equipe"
            });

            showToast("Contagem salva com sucesso!", "success");
            document.getElementById('btn-salvar-contagem-geral').innerText = "CONCLUIR CONTAGEM E SALVAR";
            cancelarModoContagem();
        });
    } else {
        cancelarModoContagem();
    }
}