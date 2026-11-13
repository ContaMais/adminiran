// ESTADOS GLOBAIS DO CARDÁPIO DIGITAL
let cardapioGrupos = {};
let cardapioItens = {};
let grupoAtualEdicao = null;
let produtoAtualEdicao = null;
let fotoBase64Miniatura = "";
let fotoBase64Exibicao = "";

// 1. LISTENERS DO FIREBASE
// Antes eram ligados assim que o app abria — para TODO mundo, até sem login — e baixavam
// todas as fotos do cardápio. Agora só ligam quando o dono abre a tela do Cardápio Digital.
let _listenersCardapio = null;
let cardapioCarregado = false;

function iniciarListenersCardapio() {
    if (_listenersCardapio || !currentUser) return;
    _listenersCardapio = [
        escutar(db.ref('cardapio/grupos'), 'cardápio (grupos)', snapshot => {
            cardapioGrupos = snapshot.val() || {};
            agendarRender('cardapio', renderizarCardapioDigital);
        }),
        escutar(db.ref('cardapio/itens'), 'cardápio (itens)', snapshot => {
            cardapioItens = snapshot.val() || {};
            cardapioCarregado = true;
            agendarRender('cardapio', renderizarCardapioDigital);
        })
    ];
    renderizarCardapioDigital();
}

function pararListenersCardapio() {
    if (_listenersCardapio) _listenersCardapio.forEach(desligar);
    _listenersCardapio = null;
    cardapioCarregado = false;
    cardapioGrupos = {};
    cardapioItens = {};
}

function abrirCardapioDigital() {
    navegar('cardapio-digital'); // navegar() liga os listeners
}

// 2. GRUPOS: ABRIR MODAL NOVO GRUPO
function criarNovoGrupoCardapio() {
    document.getElementById('input-novo-grupo-cardapio').value = '';
    document.getElementById('modalNovoGrupoCardapio').style.display = 'flex';
    setTimeout(() => document.getElementById('input-novo-grupo-cardapio').focus(), 100);
}

// 2.1 GRUPOS: CONFIRMAR E SALVAR NO BANCO (Mantém letras maiúsculas/minúsculas originais)
// 2.1 GRUPOS: CONFIRMAR E SALVAR NO BANCO (Com sistema de Ordenação)
function confirmarNovoGrupoCardapio() {
    let nome = document.getElementById('input-novo-grupo-cardapio').value;
    
    if (nome && nome.trim() !== "") {
        db.ref('cardapio/grupos').push({
            nome: nome.trim(),
            ordem: Date.now() // Define a ordem inicial jogando pro final
        }).then(() => {
            document.getElementById('modalNovoGrupoCardapio').style.display = 'none';
            showToast("Grupo criado com sucesso!", "success");
        }).catch(e => {
            alert("Erro ao salvar no banco: " + e.message);
        });
    } else {
        alert("Por favor, digite um nome válido.");
    }
}

// 3. GRUPOS: ABRIR MODAL DE EDIÇÃO DO GRUPO
function editarGrupoCardapio(key, event) {
    if(event) event.stopPropagation(); // Trava crucial: impede a gaveta de abrir/fechar
    if (!cardapioGrupos[key]) return;
    grupoAtualEdicao = key;
    document.getElementById('input-editar-grupo-nome').value = cardapioGrupos[key].nome || '';
    document.getElementById('modalEditarGrupoCardapio').style.display = 'flex';
}

// 3.1 GRUPOS: SALVAR EDICAO DE NOME DO GRUPO
function salvarEdicaoGrupo() {
    let novoNome = document.getElementById('input-editar-grupo-nome').value;
    if (novoNome && novoNome.trim() !== "") {
        db.ref(`cardapio/grupos/${grupoAtualEdicao}`).update({
            nome: novoNome.trim()
        }).then(() => {
            document.getElementById('modalEditarGrupoCardapio').style.display = 'none';
            showToast("Nome do grupo atualizado!", "success");
        });
    }
}

// 3.1.1 GRUPOS: PREPARAR EXCLUSÃO (Abre modal de confirmação)
function prepararExclusaoGrupoCardapio() {
    if (!grupoAtualEdicao) return;
    const grupo = cardapioGrupos[grupoAtualEdicao];
    if (!grupo) return;
    
    document.getElementById('modalMsg').innerHTML = `Excluir <strong>${esc(grupo.nome || '')}</strong>? Todos os produtos deste grupo também serão removidos.`;
    document.getElementById('modalDelete').style.display = 'flex';
    document.getElementById('confirmDeleteBtn').onclick = () => {
        excluirGrupoCardapio(grupoAtualEdicao);
    };
}

// 3.1.2 GRUPOS: EXCLUIR GRUPO (Remove o grupo e todos seus produtos)
function excluirGrupoCardapio(key) {
    if (!key) return;
    
    // 1. Deletar todos os produtos deste grupo
    const itensDoGrupo = Object.keys(cardapioItens).filter(ik => cardapioItens[ik].idGrupo === key);
    let updates = {};
    
    itensDoGrupo.forEach(itemKey => {
        updates[`cardapio/itens/${itemKey}`] = null;
    });
    
    // 2. Deletar o grupo
    updates[`cardapio/grupos/${key}`] = null;
    
    // 3. Aplicar tudo de uma vez
    db.ref().update(updates).then(() => {
        grupoAtualEdicao = null;
        document.getElementById('modalEditarGrupoCardapio').style.display = 'none';
        document.getElementById('modalDelete').style.display = 'none';
        showToast("Grupo excluído com sucesso!", "success");
    }).catch(e => {
        alert("Erro ao excluir: " + e.message);
    });
}

// 3.2 GRUPOS: MOVER PARA CIMA OU PARA BAIXO
function moverGrupoCardapio(key, direcao, event) {
    if(event) event.stopPropagation(); // Impede de abrir a gaveta ao clicar na seta
    
    // 1. Pega todos os grupos e ordena como estão na tela
    let chaves = Object.keys(cardapioGrupos).sort((a,b) => {
        let ordemA = cardapioGrupos[a].ordem || 0;
        let ordemB = cardapioGrupos[b].ordem || 0;
        if (ordemA === ordemB) return (cardapioGrupos[a].nome || '').localeCompare(cardapioGrupos[b].nome || '');
        return ordemA - ordemB;
    });

    let indexAtual = chaves.indexOf(key);
    let indexAlvo = indexAtual + direcao;

    // Se tentar subir o primeiro ou descer o último, ignora
    if (indexAlvo < 0 || indexAlvo >= chaves.length) return;

    // Troca os dois de posição na lista
    let chaveTrocada = chaves[indexAlvo];
    chaves[indexAlvo] = key;
    chaves[indexAtual] = chaveTrocada;

    // Atualiza o banco de dados com a nova ordem limpa (0, 1, 2, 3...)
    let updates = {};
    chaves.forEach((k, i) => {
        updates[`${k}/ordem`] = i;
    });

    db.ref('cardapio/grupos').update(updates);
}

// 4. PRODUTOS: CARREGAR FOTO (já reduzida para não pesar no banco)
// Miniatura: até 400 px. Exibição: até 1080 px.
function carregarFotoProduto(event, previewId, variavelAlvo) {
    const file = event.target.files[0];
    if (!file) return;
    const ehMini = variavelAlvo === 'fotoBase64Miniatura';
    comprimirImagem(file, ehMini ? 400 : 1080, ehMini ? 0.82 : 0.8).then(dataUrl => {
        if (ehMini) fotoBase64Miniatura = dataUrl;
        else fotoBase64Exibicao = dataUrl;
        const preview = document.getElementById(previewId);
        preview.src = dataUrl;
        preview.style.display = 'block';
    }).catch(() => showToast("Não foi possível ler essa foto.", "error"));
    event.target.value = '';
}

// 4.1 PRODUTOS: ABRIR MODAL (MODO CRIAÇÃO NOVO)
function abrirModalNovoProduto() {
    produtoAtualEdicao = null;
    fotoBase64Miniatura = "";
    fotoBase64Exibicao = "";
    
    document.getElementById('modalEditarGrupoCardapio').style.display = 'none'; // Fecha o de grupo
    document.getElementById('titulo-modal-produto').innerText = "Novo Produto";
    
    document.getElementById('input-prod-nome').value = '';
    document.getElementById('input-prod-preco').value = '';
    document.getElementById('input-prod-desc').value = '';
    document.getElementById('input-prod-oculto').checked = false;
    
    document.getElementById('preview-prod-foto').style.display = 'none';
    document.getElementById('preview-prod-foto').src = '';
    // (antes a foto de exibição do último produto editado continuava aparecendo aqui)
    document.getElementById('preview-prod-exibicao').style.display = 'none';
    document.getElementById('preview-prod-exibicao').src = '';
    
    document.getElementById('acao-item-cardapio').style.display = 'none';
    document.getElementById('modalNovoProdutoCardapio').style.display = 'flex';
}

// 4.2 PRODUTOS: ABRIR MODAL (MODO EDIÇÃO EXISTENTE)
function editarProdutoCardapio(key, event) {
    if(event) event.stopPropagation(); // Impede a gaveta de fechar ao clicar no lápis do item
    
    const item = cardapioItens[key];
    if(!item) return;

    produtoAtualEdicao = key;
    grupoAtualEdicao = item.idGrupo; // Preserva o vínculo de categoria do item
    
    // Carrega as duas fotos
    fotoBase64Miniatura = item.foto || "";
    fotoBase64Exibicao = item.fotoExibicao || "";

    document.getElementById('titulo-modal-produto').innerText = "Editar Produto";
    document.getElementById('input-prod-nome').value = item.nome || '';
    document.getElementById('input-prod-preco').value = (item.preco !== undefined && item.preco !== null) ? item.preco : '';
    document.getElementById('input-prod-desc').value = item.descricao || '';
    
    // Preview da Miniatura
    const preview1 = document.getElementById('preview-prod-foto');
    if (fotoBase64Miniatura) {
        preview1.src = fotoBase64Miniatura;
        preview1.style.display = 'block';
    } else {
        preview1.style.display = 'none';
        preview1.src = '';
    }

    // Preview da Exibição
    const preview2 = document.getElementById('preview-prod-exibicao');
    if (fotoBase64Exibicao) {
        preview2.src = fotoBase64Exibicao;
        preview2.style.display = 'block';
    } else {
        preview2.style.display = 'none';
        preview2.src = '';
    }
    
    document.getElementById('input-prod-oculto').checked = !!item.oculto;
    document.getElementById('acao-item-cardapio').style.display = 'flex';
    document.getElementById('modalNovoProdutoCardapio').style.display = 'flex';
}

// 4.3 PRODUTOS: SALVAR OU ATUALIZAR ITEM NO BANCO
// 4.3 PRODUTOS: SALVAR OU ATUALIZAR ITEM NO BANCO
function salvarProdutoCardapio() {
    let nome = document.getElementById('input-prod-nome').value;
    let preco = document.getElementById('input-prod-preco').value;
    let desc = document.getElementById('input-prod-desc').value;

    // Aceita "25,90" e "25.90"
    const precoNum = parseFloat(String(preco).trim().replace(/\s/g, '').replace(',', '.'));
    if (!nome.trim() || isNaN(precoNum) || precoNum < 0) {
        alert("O nome e o preço são obrigatórios! (ex.: 25,90)");
        return;
    }
    if (!grupoAtualEdicao || !cardapioGrupos[grupoAtualEdicao]) { alert("Grupo do cardápio não encontrado."); return; }

    const dadosProduto = {
        idGrupo: grupoAtualEdicao,
        nome: nome.trim(),
        preco: Math.round(precoNum * 100) / 100,
        descricao: desc.trim(),
        foto: fotoBase64Miniatura,     // Miniatura
        fotoExibicao: fotoBase64Exibicao, // Nova foto maior
        oculto: document.getElementById('input-prod-oculto').checked ? true : false
    };

    if (produtoAtualEdicao) {
        db.ref(`cardapio/itens/${produtoAtualEdicao}`).update(dadosProduto).then(() => {
            document.getElementById('modalNovoProdutoCardapio').style.display = 'none';
            showToast("Produto atualizado!", "success");
        });
    } else {
        // Se é novo, joga ele para o final da fila da ordem
        dadosProduto.ordem = Date.now();
        db.ref('cardapio/itens').push(dadosProduto).then(() => {
            document.getElementById('modalNovoProdutoCardapio').style.display = 'none';
            showToast("Produto adicionado com sucesso!", "success");
        });
    }
}

function prepararExclusaoProdutoCardapio() {
    if (!produtoAtualEdicao) return;
    const item = cardapioItens[produtoAtualEdicao];
    if (!item) return;
    document.getElementById('modalMsg').innerHTML = `Excluir <strong>${esc(item.nome || '')}</strong>?`;
    document.getElementById('modalDelete').style.display = 'flex';
    document.getElementById('confirmDeleteBtn').onclick = () => {
        excluirProdutoCardapio(produtoAtualEdicao);
    };
}

function excluirProdutoCardapio(key) {
    if (!key) return;
    db.ref(`cardapio/itens/${key}`).remove().then(() => {
        produtoAtualEdicao = null;
        document.getElementById('modalNovoProdutoCardapio').style.display = 'none';
        document.getElementById('modalDelete').style.display = 'none';
        showToast("Produto excluído!", "success");
    });
}

function duplicarProdutoCardapio(key) {
    const original = cardapioItens[key];
    if (!original) return;

    let nomeBase = original.nome || 'Cópia de item';
    const copiaRegex = /(.*) - CÓPIA(?: (\d+))?$/i;
    let novoNome = nomeBase;

    if (copiaRegex.test(nomeBase)) {
        const match = nomeBase.match(copiaRegex);
        const base = match[1];
        const numero = Number(match[2] || 1) + 1;
        novoNome = `${base} - CÓPIA ${numero}`;
    } else {
        novoNome = `${nomeBase} - CÓPIA`;
    }

    const novoItem = {
        ...original,
        nome: novoNome,
        ordem: Date.now(),
        oculto: false
    };

    db.ref('cardapio/itens').push(novoItem).then(() => {
        showToast("Produto duplicado!", "success");
    });
}

// 4.4 PRODUTOS: MOVER PARA CIMA OU PARA BAIXO
function moverItemCardapio(key, idGrupo, direcao, event) {
    if(event) event.stopPropagation();

    let chaves = Object.keys(cardapioItens).filter(ik => cardapioItens[ik].idGrupo === idGrupo).sort((a,b) => {
        let ordemA = cardapioItens[a].ordem || 0;
        let ordemB = cardapioItens[b].ordem || 0;
        if (ordemA === ordemB) return (cardapioItens[a].nome || '').localeCompare(cardapioItens[b].nome || '');
        return ordemA - ordemB;
    });

    let indexAtual = chaves.indexOf(key);
    let indexAlvo = indexAtual + direcao;

    if (indexAlvo < 0 || indexAlvo >= chaves.length) return;

    let chaveTrocada = chaves[indexAlvo];
    chaves[indexAlvo] = key;
    chaves[indexAtual] = chaveTrocada;

    let updates = {};
    chaves.forEach((k, i) => {
        updates[`${k}/ordem`] = i;
    });

    db.ref('cardapio/itens').update(updates);
}

// 5. GAVETA: EFEITO EXTENDER (Abre e fecha a lista de itens)
// 5. GAVETA: EFEITO EXTENDER (Abre e fecha a lista de itens)
let gruposAbertosCardapio = []; // Memória de quais grupos estão abertos

function toggleGrupoCardapio(key) {
    const painel = document.getElementById(`itens-grupo-${key}`);
    const icone = document.getElementById(`seta-grupo-${key}`);
    if (!painel) return;
    
    const estaFechado = painel.style.display === 'none';
    painel.style.display = estaFechado ? 'flex' : 'none';
    
    if(icone) {
        icone.style.transform = estaFechado ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    // Grava na memória para não fechar quando a tela atualizar
    if (estaFechado) {
        if (!gruposAbertosCardapio.includes(key)) gruposAbertosCardapio.push(key);
    } else {
        gruposAbertosCardapio = gruposAbertosCardapio.filter(k => k !== key);
    }
}

// 6. MOTOR DE RENDERIZAÇÃO MASTER DO CARDÁPIO
// 6. MOTOR DE RENDERIZAÇÃO MASTER DO CARDÁPIO
// 6. MOTOR DE RENDERIZAÇÃO MASTER DO CARDÁPIO
// 6. MOTOR DE RENDERIZAÇÃO MASTER DO CARDÁPIO
function renderizarCardapioDigital() {
    const container = document.getElementById('lista-grupos-cardapio');
    if (!container) return;

    const chavesGrupos = Object.keys(cardapioGrupos);

    if (chavesGrupos.length === 0) {
        container.innerHTML = (currentUser && !cardapioCarregado)
            ? `<p style="text-align:center; padding:20px; color:var(--primary); font-weight:bold;">⏳ Carregando cardápio...</p>`
            : `<p style="text-align:center; padding:20px; color:var(--muted); font-style:italic;">Nenhum grupo cadastrado. Clique em 'Criar Novo Grupo' para iniciar.</p>`;
        return;
    }

    const ordenar = (obj) => (a, b) => {
        const ordemA = obj[a].ordem || 0, ordemB = obj[b].ordem || 0;
        if (ordemA === ordemB) return (obj[a].nome || '').localeCompare(obj[b].nome || '');
        return ordemA - ordemB;
    };

    // Agrupa os itens por grupo uma única vez (antes varria todos os itens para cada grupo)
    const itensPorGrupo = {};
    Object.keys(cardapioItens).forEach(ik => {
        const it = cardapioItens[ik];
        if (!it) return;
        (itensPorGrupo[it.idGrupo] = itensPorGrupo[it.idGrupo] || []).push(ik);
    });

    chavesGrupos.sort(ordenar(cardapioGrupos));
    const html = chavesGrupos.map((gk, index) => {
        const grupo = cardapioGrupos[gk];
        const itensDoGrupo = (itensPorGrupo[gk] || []).sort(ordenar(cardapioItens));
        const qtdItens = itensDoGrupo.length;

        const btnSubir = index > 0 
            ? `<button class="sort-btn-up" onclick="moverGrupoCardapio(${jsArg(gk)}, -1, event)">▲</button>` 
            : `<button class="sort-btn-up" disabled style="opacity:0.3">▲</button>`;
        const btnDescer = index < chavesGrupos.length - 1 
            ? `<button class="sort-btn-down" onclick="moverGrupoCardapio(${jsArg(gk)}, 1, event)">▼</button>`
            : `<button class="sort-btn-down" disabled style="opacity:0.3">▼</button>`;

        // Mantém aberto o grupo que já estava aberto antes da tela atualizar
        const estaAberto = gruposAbertosCardapio.includes(gk);
        const rotacao = estaAberto ? 'rotate(180deg)' : 'rotate(0deg)';

        let itensHtml;
        if (qtdItens === 0) {
            itensHtml = `<p style="font-size:0.8rem; color:var(--text-muted); font-style:italic; padding: 5px 10px;">Nenhum produto cadastrado neste grupo ainda.</p>`;
        } else {
            itensHtml = itensDoGrupo.map((ik, idxItem) => {
                const item = cardapioItens[ik];
                const btnSubirItem = idxItem > 0 
                    ? `<button class="sort-btn-up" onclick="moverItemCardapio(${jsArg(ik)}, ${jsArg(gk)}, -1, event)">▲</button>` 
                    : `<button class="sort-btn-up" disabled style="opacity:0.3">▲</button>`;
                const btnDescerItem = idxItem < qtdItens - 1 
                    ? `<button class="sort-btn-down" onclick="moverItemCardapio(${jsArg(ik)}, ${jsArg(gk)}, 1, event)">▼</button>`
                    : `<button class="sort-btn-down" disabled style="opacity:0.3">▼</button>`;
                // Foto só é carregada quando o grupo é aberto (loading="lazy")
                const fotoHTML = item.foto ? `<img src="${esc(item.foto)}" loading="lazy" decoding="async" style="width:30px; height:30px; object-fit:cover; border-radius:4px; border: 1px solid var(--border-color);">` : '';
                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--surface-2); border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="sort-wrapper" style="margin-right: 5px;" onclick="event.stopPropagation()">${btnSubirItem}${btnDescerItem}</div>
                        <button class="action-icon edit-btn" onclick="editarProdutoCardapio(${jsArg(ik)}, event)" style="margin:0; width:24px; height:24px; font-size:0.7rem;">✎</button>
                        ${fotoHTML}
                        <span style="font-size:0.95rem; font-weight:700; color:var(--text-main);">${esc(item.nome)}</span>
                        ${item.oculto ? `<span class="item-hidden-label">Oculto</span>` : ''}
                    </div>
                    <span style="color:var(--text-main); font-weight:800; font-size:0.95rem;">R$ ${(Number(item.preco) || 0).toFixed(2).replace('.', ',')}</span>
                </div>`;
            }).join('');
        }

        return `<div class="card" style="display:flex; flex-direction:column; padding:0; overflow:hidden; background:var(--card-bg); border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; cursor: pointer;" onclick="toggleGrupoCardapio(${jsArg(gk)})">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="sort-wrapper" style="margin-right: 5px;" onclick="event.stopPropagation()">${btnSubir}${btnDescer}</div>
                    <i id="seta-grupo-${gk}" class="ph ph-caret-down" style="color:var(--primary); font-size:1.1rem; transition: transform 0.3s ease; transform: ${rotacao};"></i>
                    <span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${esc(grupo.nome)}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-left:5px;">(${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'})</span>
                </div>
                <button class="action-icon edit-btn" onclick="editarGrupoCardapio(${jsArg(gk)}, event)" style="margin:0; width:28px; height:28px;">✎</button>
            </div>
            <div id="itens-grupo-${gk}" style="display:${estaAberto ? 'flex' : 'none'}; flex-direction:column; gap:6px; padding:0 15px 15px 15px; background:var(--surface-2);">${itensHtml}</div>
        </div>`;
    }).join('');

    container.innerHTML = html;
}
