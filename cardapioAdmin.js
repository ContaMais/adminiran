// ESTADOS GLOBAIS DO CARDÁPIO DIGITAL
let cardapioGrupos = {};
let cardapioItens = {};
let grupoAtualEdicao = null;
let produtoAtualEdicao = null;
let fotoBase64Miniatura = "";
let fotoBase64Exibicao = "";

// 1. LISTENERS DO FIREBASE (Sincronização em tempo real)
db.ref('cardapio/grupos').on('value', snapshot => {
    cardapioGrupos = snapshot.val() || {};
    renderizarCardapioDigital();
});

db.ref('cardapio/itens').on('value', snapshot => {
    cardapioItens = snapshot.val() || {};
    renderizarCardapioDigital();
});

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
function editarGrupoCardapio(key, nomeAtual, event) {
    if(event) event.stopPropagation(); // Trava crucial: impede a gaveta de abrir/fechar
    grupoAtualEdicao = key;
    document.getElementById('input-editar-grupo-nome').value = nomeAtual;
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

// 3.2 GRUPOS: MOVER PARA CIMA OU PARA BAIXO
function moverGrupoCardapio(key, direcao, event) {
    if(event) event.stopPropagation(); // Impede de abrir a gaveta ao clicar na seta
    
    // 1. Pega todos os grupos e ordena como estão na tela
    let chaves = Object.keys(cardapioGrupos).sort((a,b) => {
        let ordemA = cardapioGrupos[a].ordem || 0;
        let ordemB = cardapioGrupos[b].ordem || 0;
        if (ordemA === ordemB) return cardapioGrupos[a].nome.localeCompare(cardapioGrupos[b].nome);
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

// 4. PRODUTOS: CARREGAR E CONVERTER FOTO PARA TEXTO (BASE64)
function carregarFotoProduto(event, previewId, variavelAlvo) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (variavelAlvo === 'fotoBase64Miniatura') fotoBase64Miniatura = e.target.result;
            else fotoBase64Exibicao = e.target.result;
            
            const preview = document.getElementById(previewId);
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
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
    document.getElementById('input-prod-nome').value = item.nome;
    document.getElementById('input-prod-preco').value = item.preco;
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

    if (!nome.trim() || !preco.trim()) {
        alert("O nome e o preço são obrigatórios!");
        return;
    }

    const dadosProduto = {
        idGrupo: grupoAtualEdicao,
        nome: nome.trim(),
        preco: parseFloat(preco),
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
    document.getElementById('modalMsg').innerHTML = `Excluir <strong>${item.nome || ''}</strong>?`;
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
        if (ordemA === ordemB) return cardapioItens[a].nome.localeCompare(cardapioItens[b].nome);
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
    container.innerHTML = '';

    const chavesGrupos = Object.keys(cardapioGrupos);

    if (chavesGrupos.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#64748b; font-style:italic;">Nenhum grupo cadastrado. Clique em 'Criar Novo Grupo' para iniciar.</p>`;
        return;
    }

    // Renderiza e organiza os grupos pela ORDEM definida nas setinhas
    chavesGrupos.sort((a,b) => {
        let ordemA = cardapioGrupos[a].ordem || 0;
        let ordemB = cardapioGrupos[b].ordem || 0;
        if (ordemA === ordemB) return cardapioGrupos[a].nome.localeCompare(cardapioGrupos[b].nome);
        return ordemA - ordemB;
    }).forEach((gk, index) => {
        const grupo = cardapioGrupos[gk];
        
        const itensDoGrupo = Object.keys(cardapioItens).filter(ik => cardapioItens[ik].idGrupo === gk);
        const qtdItens = itensDoGrupo.length;

        // Setas Coloridas do GRUPO
        let btnSubir = index > 0 
            ? `<button class="sort-btn-up" onclick="moverGrupoCardapio('${gk}', -1, event)">▲</button>` 
            : `<button class="sort-btn-up" disabled style="opacity:0.3">▲</button>`;
        
        let btnDescer = index < chavesGrupos.length - 1 
            ? `<button class="sort-btn-down" onclick="moverGrupoCardapio('${gk}', 1, event)">▼</button>`
            : `<button class="sort-btn-down" disabled style="opacity:0.3">▼</button>`;

        let divGrupoWrapper = document.createElement('div');
        divGrupoWrapper.className = 'card';
        divGrupoWrapper.style.display = 'flex';
        divGrupoWrapper.style.flexDirection = 'column';
        divGrupoWrapper.style.padding = '0';
        divGrupoWrapper.style.overflow = 'hidden';
        divGrupoWrapper.style.background = 'var(--card-bg)';
        divGrupoWrapper.style.border = '1px solid var(--border-color)';

        // LÊ A MEMÓRIA: Verifica se este grupo estava aberto antes da tela atualizar
        const estaAberto = typeof gruposAbertosCardapio !== 'undefined' && gruposAbertosCardapio.includes(gk);
        const rotacao = estaAberto ? 'rotate(180deg)' : 'rotate(0deg)';

        divGrupoWrapper.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; cursor: pointer;" onclick="toggleGrupoCardapio('${gk}')">
                <div style="display:flex; align-items:center; gap:12px;">
                    
                    <div class="sort-wrapper" style="margin-right: 5px;" onclick="event.stopPropagation()">
                        ${btnSubir}
                        ${btnDescer}
                    </div>

                    <i id="seta-grupo-${gk}" class="ph ph-caret-down" style="color:var(--primary); font-size:1.1rem; transition: transform 0.3s ease; transform: ${rotacao};"></i>
                    <span style="font-size:1.15rem; font-weight:800; color:var(--text-main);">${grupo.nome}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-left:5px;">(${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'})</span>
                </div>
                <button class="action-icon edit-btn" onclick="editarGrupoCardapio('${gk}', '${grupo.nome.replace(/'/g, "\\'")}', event)" style="margin:0; width:28px; height:28px;">✎</button>
            </div>
        `;

        let divGavetaItens = document.createElement('div');
        divGavetaItens.id = `itens-grupo-${gk}`;
        
        // Aplica a regra da memória no CSS da gaveta
        divGavetaItens.style.display = estaAberto ? 'flex' : 'none';
        
        divGavetaItens.style.flexDirection = 'column';
        divGavetaItens.style.gap = '6px';
        divGavetaItens.style.padding = '0 15px 15px 15px';
        divGavetaItens.style.background = 'rgba(0, 0, 0, 0.15)';

        if (qtdItens === 0) {
            divGavetaItens.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); font-style:italic; padding: 5px 10px;">Nenhum produto cadastrado neste grupo ainda.</p>`;
        } else {
            // Renderiza e organiza os ITENS pela ORDEM definida nas setinhas
            itensDoGrupo.sort((a,b) => {
                let ordemA = cardapioItens[a].ordem || 0;
                let ordemB = cardapioItens[b].ordem || 0;
                if(ordemA === ordemB) return cardapioItens[a].nome.localeCompare(cardapioItens[b].nome);
                return ordemA - ordemB;
            }).forEach((ik, idxItem) => {
                const item = cardapioItens[ik];
                
                // Setas Coloridas do PRODUTO
                let btnSubirItem = idxItem > 0 
                    ? `<button class="sort-btn-up" onclick="moverItemCardapio('${ik}', '${gk}', -1, event)">▲</button>` 
                    : `<button class="sort-btn-up" disabled style="opacity:0.3">▲</button>`;
                
                let btnDescerItem = idxItem < itensDoGrupo.length - 1 
                    ? `<button class="sort-btn-down" onclick="moverItemCardapio('${ik}', '${gk}', 1, event)">▼</button>`
                    : `<button class="sort-btn-down" disabled style="opacity:0.3">▼</button>`;

                let divItemRow = document.createElement('div');
                divItemRow.style.display = 'flex';
                divItemRow.style.justifyContent = 'space-between';
                divItemRow.style.alignItems = 'center';
                divItemRow.style.padding = '8px 12px';
                divItemRow.style.background = 'rgba(255, 255, 255, 0.02)';
                divItemRow.style.borderRadius = '8px';
                divItemRow.style.border = '1px solid var(--border-color)';

                let fotoHTML = item.foto ? `<img src="${item.foto}" style="width:30px; height:30px; object-fit:cover; border-radius:4px; border: 1px solid var(--border-color);">` : '';

                divItemRow.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        
                        <div class="sort-wrapper" style="margin-right: 5px;" onclick="event.stopPropagation()">
                            ${btnSubirItem}
                            ${btnDescerItem}
                        </div>

                        <button class="action-icon edit-btn" onclick="editarProdutoCardapio('${ik}', event)" style="margin:0; width:24px; height:24px; font-size:0.7rem;">✎</button>
                        ${fotoHTML}
                        <span style="font-size:0.95rem; font-weight:700; color:var(--text-main);">${item.nome}</span>
                        ${item.oculto ? `<span class="item-hidden-label">Oculto</span>` : ''}
                    </div>
                    <span style="color:var(--text-main); font-weight:800; font-size:0.95rem;">R$ ${Number(item.preco).toFixed(2).replace('.', ',')}</span>
                `;
                divGavetaItens.appendChild(divItemRow);
            });
        }

        divGrupoWrapper.appendChild(divGavetaItens);
        container.appendChild(divGrupoWrapper);
    });
}