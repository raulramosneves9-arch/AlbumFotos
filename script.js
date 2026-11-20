/* =====================================================
   LÓGICA DO ÁLBUM
   Aqui ficam as ações: guardar, mostrar, editar e excluir.
   As fotos são guardadas no próprio navegador (IndexedDB),
   por isso não precisam de servidor.
   ===================================================== */


/* ---------- 1. VARIÁVEIS DO PROGRAMA ---------- */

let banco = null;       // conexão com o "armário" onde as fotos ficam guardadas
let lembrancas = [];    // lista com todas as lembranças carregadas
let emEdicao = null;    // guarda a lembrança que está sendo editada (ou null se for nova)
let fotoAtual = null;   // foto escolhida no formulário (em formato de texto/base64)
let bancoPronto = false;

// Atalho: $("meu-id") é o mesmo que document.getElementById("meu-id")
const $ = (id) => document.getElementById(id);

// Ícones (SVG) usados nas lembranças
const ICONE_PINO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
const SEPARADOR = '<div class="separador"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="url(#gradiente-coracao)" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 6 5c2.1 0 3.4 1.1 4.2 2.4.3.5.9.5 1.2 0C12.2 6.1 13.9 5 16 5c3.4 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg></div>';


/* ---------- 2. BANCO DE DADOS DO NAVEGADOR ---------- */
/* IMPORTANTE: não mude os nomes "album-casal", "entries" e "meta",
   senão as fotos já guardadas deixam de aparecer. */

// Abre (ou cria) o banco de dados
function abrirBanco() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Este navegador não permite salvar dados neste álbum."));
      return;
    }

    let pedido;
    try {
      pedido = indexedDB.open("album-casal", 1);
    } catch (erro) {
      reject(new Error("Não foi possível abrir o armazenamento do álbum."));
      return;
    }

    pedido.onupgradeneeded = () => {
      const armazenamento = pedido.result;
      if (!armazenamento.objectStoreNames.contains("entries")) {
        armazenamento.createObjectStore("entries", { keyPath: "id" });
      }
      if (!armazenamento.objectStoreNames.contains("meta")) {
        armazenamento.createObjectStore("meta");
      }
    };
    pedido.onsuccess = () => {
      banco = pedido.result;
      banco.onversionchange = () => banco.close();
      resolve();
    };
    pedido.onerror = () => reject(new Error("Não foi possível abrir o armazenamento do álbum."));
    pedido.onblocked = () => atualizarStatus("Feche outras abas deste álbum para terminar de carregar.", true);
  });
}

// Função ajudante: faz uma operação (ler, gravar, apagar) em uma gaveta
function usarBanco(gaveta, modo, acao) {
  return new Promise((resolve, reject) => {
    if (!banco) {
      reject(new Error("O armazenamento do álbum ainda não está disponível."));
      return;
    }

    try {
      const transacao = banco.transaction(gaveta, modo);
      const pedido = acao(transacao.objectStore(gaveta));
      transacao.oncomplete = () => resolve(pedido ? pedido.result : null);
      transacao.onerror = () => reject(new Error("O navegador não conseguiu salvar os dados do álbum."));
      transacao.onabort = () => reject(new Error("O salvamento foi interrompido. Tente novamente."));
    } catch (erro) {
      reject(new Error("O navegador não conseguiu acessar os dados do álbum."));
    }
  });
}

function atualizarStatus(mensagem, erro) {
  $("status").textContent = mensagem;
  $("status").classList.toggle("status-erro", Boolean(erro));
}


/* ---------- 3. FUNÇÕES AUXILIARES ---------- */

// Evita que textos digitados quebrem a página (segurança básica)
function proteger(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

// Transforma "2026-11-20" em "20 de novembro de 2026"
function formatarData(data) {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-");
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric"
  });
}

// Diminui a foto (máx. 1400px) para não ocupar muito espaço no navegador
function reduzirFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = reject;
    leitor.onload = () => {
      const imagem = new Image();
      imagem.onerror = reject;
      imagem.onload = () => {
        const maximo = 1400;
        const escala = Math.min(1, maximo / Math.max(imagem.width, imagem.height));
        const tela = document.createElement("canvas");
        tela.width = Math.round(imagem.width * escala);
        tela.height = Math.round(imagem.height * escala);
        tela.getContext("2d").drawImage(imagem, 0, 0, tela.width, tela.height);
        resolve(tela.toDataURL("image/jpeg", 0.82)); // 0.82 = qualidade da compressão
      };
      imagem.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}


/* ---------- 4. MOSTRAR AS LEMBRANÇAS NA TELA ---------- */

function mostrarLembrancas() {
  // Coloca em ordem de data (da mais antiga para a mais nova)
  lembrancas.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  // Atualiza o contador do topo
  const total = lembrancas.length;
  $("contador").textContent = total === 0 ? ""
    : total === 1 ? "1 momento guardado"
    : total + " momentos guardados";

  // Álbum vazio: mostra um convite para começar
  if (total === 0) {
    $("lista").innerHTML =
      '<div class="vazio">Ainda não há nenhum momento guardado. Toque em “Guardar um momento” e comece a contar a história de vocês.</div>';
    return;
  }

  // Monta o HTML de cada lembrança e junta com um coração entre elas
  $("lista").innerHTML = lembrancas.map((item) => {

    // Bloco com data, local e mini local
    const informacoes =
      '<div class="info">' +
        '<span class="data">' + proteger(formatarData(item.date)) + '</span>' +
        '<h2 class="local">' + proteger(item.local) + '</h2>' +
        (item.mini ? '<p class="mini-local">' + ICONE_PINO + proteger(item.mini) + '</p>' : '') +
      '</div>';

    // Se tem foto, as informações ficam por cima dela
    const topo = item.photo
      ? '<div class="foto"><img src="' + item.photo + '" alt="Foto em ' + proteger(item.local) + '">' + informacoes + '</div>'
      : '<div class="sem-foto">' + informacoes + '</div>';

    return '<article class="cartao">' + topo +
      '<div class="conteudo">' +
        (item.text ? '<p class="texto">' + proteger(item.text) + '</p>' : '') +
        '<div class="acoes">' +
          '<button data-editar="' + item.id + '">Editar</button>' +
          '<button data-excluir="' + item.id + '">Excluir</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join(SEPARADOR);
}


/* ---------- 5. FORMULÁRIO (ADICIONAR / EDITAR) ---------- */

// Abre a janela. Se receber uma lembrança, é edição; se não, é uma nova.
function abrirFormulario(item) {
  emEdicao = item || null;
  fotoAtual = item ? item.photo : null;
  $("erro").textContent = "";
  $("titulo-janela").textContent = item ? "Editar este momento" : "Um novo momento";

  // Preenche os campos (com os dados antigos, ou vazios se for nova)
  $("campo-data").value  = item ? item.date  : new Date().toISOString().slice(0, 10);
  $("campo-local").value = item ? item.local : "";
  $("campo-mini").value  = item ? item.mini  : "";
  $("campo-texto").value = item ? item.text  : "";
  $("campo-foto").value  = "";

  // Mostra a miniatura da foto, se existir
  $("previa").style.display = fotoAtual ? "block" : "none";
  if (fotoAtual) $("previa").src = fotoAtual;

  $("janela").showModal();
}

// Quando escolhem uma foto: reduz o tamanho e mostra a prévia
$("campo-foto").onchange = function () {
  const arquivo = this.files[0];
  if (!arquivo) return;

  reduzirFoto(arquivo)
    .then((foto) => {
      fotoAtual = foto;
      $("previa").src = foto;
      $("previa").style.display = "block";
    })
    .catch(() => {
      $("erro").textContent = "Não consegui abrir essa imagem. Tente outra foto.";
    });
};

// Quando clicam em "Guardar"
$("formulario").onsubmit = async function (evento) {
  evento.preventDefault(); // impede a página de recarregar

  if (!bancoPronto) {
    $("erro").textContent = "O álbum ainda não terminou de carregar. Tente novamente.";
    return;
  }

  // Monta a lembrança. Se for edição, mantém o mesmo id.
  const item = {
    id:    emEdicao ? emEdicao.id : Date.now(), // Date.now() gera um número único
    date:  $("campo-data").value,
    local: $("campo-local").value.trim(),
    mini:  $("campo-mini").value.trim(),
    text:  $("campo-texto").value.trim(),
    photo: fotoAtual
  };

  // Data e local são obrigatórios
  if (!item.date || !item.local) {
    $("erro").textContent = "Informe a data e o local para guardar este momento.";
    return;
  }

  try {
    await usarBanco("entries", "readwrite", (gaveta) => gaveta.put(item));
  } catch (erro) {
    $("erro").textContent = erro.message;
    return;
  }

  // Atualiza a tela somente depois que o navegador confirmar a gravação.
  const posicao = lembrancas.findIndex((x) => x.id === item.id);
  if (posicao >= 0) lembrancas[posicao] = item;
  else lembrancas.push(item);
  mostrarLembrancas();
  $("janela").close();
  atualizarStatus("Momento salvo neste navegador.");
};


/* ---------- 6. BOTÕES DA PÁGINA ---------- */

$("botao-adicionar").onclick = () => abrirFormulario();
$("botao-cancelar").onclick  = () => $("janela").close();

// Um único "ouvinte" cuida dos botões Editar e Excluir de todas as lembranças
$("lista").onclick = function (evento) {
  const botao = evento.target;

  // --- EDITAR ---
  if (botao.dataset.editar) {
    const item = lembrancas.find((x) => x.id == botao.dataset.editar);
    abrirFormulario(item);
  }

  // --- EXCLUIR (com confirmação em 2 toques) ---
  if (botao.dataset.excluir) {
    // 1º toque: pede confirmação no próprio botão
    // (não usamos confirm() porque alguns ambientes bloqueiam essa janelinha)
    if (botao.dataset.confirmar !== "sim") {
      botao.dataset.confirmar = "sim";
      botao.textContent = "Toque de novo para excluir";
      botao.style.color = "#e0457f";

      // Se não tocar de novo em 3 segundos, o botão volta ao normal
      setTimeout(() => {
        botao.dataset.confirmar = "";
        botao.textContent = "Excluir";
        botao.style.color = "";
      }, 3000);
      return;
    }

    // 2º toque: apaga de verdade
    const id = Number(botao.dataset.excluir);
    usarBanco("entries", "readwrite", (gaveta) => gaveta.delete(id))
      .then(() => {
        lembrancas = lembrancas.filter((x) => x.id !== id);
        mostrarLembrancas();
        atualizarStatus("Momento excluído.");
      })
      .catch((erro) => atualizarStatus(erro.message, true));
  }
};

// Atualiza o título da aba enquanto digita; grava no banco ao sair do campo.
$("titulo").oninput = function () {
  const nome = this.textContent.trim() || "Nosso álbum";
  document.title = nome;
};
$("titulo").onblur = function () {
  const nome = this.textContent.trim() || "Nosso álbum";
  this.textContent = nome;
  document.title = nome;
  if (bancoPronto) {
    usarBanco("meta", "readwrite", (gaveta) => gaveta.put(nome, "titulo"))
      .then(() => atualizarStatus("Título salvo neste navegador."))
      .catch((erro) => atualizarStatus(erro.message, true));
  }
};
// Apertar Enter no título confirma (em vez de pular linha)
$("titulo").onkeydown = function (evento) {
  if (evento.key === "Enter") {
    evento.preventDefault();
    this.blur();
  }
};


/* ---------- 7. INÍCIO: O QUE ACONTECE AO ABRIR A PÁGINA ---------- */

abrirBanco()
  .then(() => Promise.all([
    usarBanco("entries", "readonly", (gaveta) => gaveta.getAll()),
    usarBanco("meta", "readonly", (gaveta) => gaveta.get("titulo"))
  ]))
  .then(([salvas, nome]) => {
    lembrancas = salvas || [];
    if (nome) {
      $("titulo").textContent = nome;
      document.title = nome;
    }
    bancoPronto = true;
    $("botao-adicionar").disabled = false;
    mostrarLembrancas();
    atualizarStatus("Álbum salvo neste navegador. Evite limpar os dados do navegador para não perder as fotos.");
  })
  .catch((erro) => {
    atualizarStatus(erro.message + " Não feche esta página se quiser manter as alterações.", true);
    $("botao-adicionar").disabled = true;
  });
